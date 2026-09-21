const { app, BrowserWindow, dialog, ipcMain, shell, protocol, net, Menu, screen } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const iconv = require('iconv-lite');
const { isSupported, SUPPORTED_EXTENSIONS } = require('./file-types.cjs');
const workspace = require('./workspace.cjs');
const { isLite, appName, dataDirectory, updateChannel } = require('./edition.cjs');
const {
  registerFileAssociations,
  unregisterFileAssociations,
  getAssociationStatus,
} = require('./registry.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'qingyue-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
const unpackedPortableDir = path.dirname(process.execPath);
const unpackedPortableMarker = path.join(unpackedPortableDir, 'QingYue-Portable.txt');
const installedUpdateConfig = app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
const legacyUnpackedPortable = app.isPackaged && fs.existsSync(unpackedPortableMarker) && !installedUpdateConfig;
const isPortableRuntime = Boolean(portableDir || process.env.PORTABLE_EXECUTABLE_FILE || legacyUnpackedPortable);
if (portableDir) app.setPath('userData', path.join(portableDir, dataDirectory));
else if (legacyUnpackedPortable) app.setPath('userData', path.join(unpackedPortableDir, dataDirectory));
else if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), dataDirectory));

let mainWindow;
let rendererReady = false;
let pendingFiles = [];
let isDirty = false;
let allowClose = false;
let officeModule;
let sessionWriteQueue = Promise.resolve();
let updaterModule;
let windowStateTimer;
let lastNormalBounds;
const updateState = { status: 'idle', version: null, percent: 0, transferred: 0, total: 0, message: '' };

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')); } catch { /* First launch or invalid state. */ }
  const candidate = saved.bounds || {};
  const initial = {
    x: Number.isFinite(candidate.x) ? candidate.x : undefined,
    y: Number.isFinite(candidate.y) ? candidate.y : undefined,
    width: Math.max(900, Number(candidate.width) || 1440),
    height: Math.max(600, Number(candidate.height) || 900),
  };
  const display = screen.getDisplayMatching({ x: initial.x || 0, y: initial.y || 0, width: initial.width, height: initial.height });
  const area = display.workArea;
  initial.width = Math.min(initial.width, area.width);
  initial.height = Math.min(initial.height, area.height);
  if (initial.x !== undefined) initial.x = Math.min(area.x + area.width - 180, Math.max(area.x, initial.x));
  if (initial.y !== undefined) initial.y = Math.min(area.y + area.height - 120, Math.max(area.y, initial.y));
  return { bounds: initial, maximized: Boolean(saved.maximized) };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) lastNormalBounds = mainWindow.getBounds();
  const target = windowStateFile();
  const temporary = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ bounds: lastNormalBounds || mainWindow.getBounds(), maximized: mainWindow.isMaximized() }));
    fs.renameSync(temporary, target);
  } catch { try { fs.rmSync(temporary, { force: true }); } catch { /* Best effort only. */ } }
}

function scheduleWindowStateSave() {
  clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(saveWindowState, 450);
}

function canUseInstalledUpdater() {
  return process.platform === 'win32' && app.isPackaged && !isPortableRuntime;
}

function publicUpdateState() {
  return {
    ...updateState,
    supported: canUseInstalledUpdater(),
    channel: updateChannel,
    installDirectory: path.dirname(process.execPath),
  };
}

function publishUpdateState(patch) {
  Object.assign(updateState, patch);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:state', publicUpdateState());
  return publicUpdateState();
}

function installedUpdater() {
  if (!canUseInstalledUpdater()) throw new Error('便携版不会自动覆盖自身，请下载新版便携包后替换。');
  if (updaterModule) return updaterModule;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableDifferentialDownload = false;
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', percent: 0, message: '正在检查更新…' }));
  autoUpdater.on('update-available', (info) => publishUpdateState({ status: 'available', version: info.version, percent: 0, message: `发现 ${info.version}，可增量下载` }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current', version: app.getVersion(), percent: 100, message: '当前已经是最新版本' }));
  autoUpdater.on('download-progress', (progress) => publishUpdateState({
    status: 'downloading', percent: Math.max(0, Math.min(100, progress.percent || 0)),
    transferred: progress.transferred || 0, total: progress.total || 0, message: `正在下载 ${Math.round(progress.percent || 0)}%`,
  }));
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({ status: 'ready', version: info.version, percent: 100, message: '更新已下载，重启后覆盖当前安装' }));
  autoUpdater.on('error', (error) => publishUpdateState({ status: 'error', message: error?.message || String(error) }));
  updaterModule = autoUpdater;
  return updaterModule;
}

function office() {
  if (isLite) throw new Error('轻量版不包含 Office 模块，请使用完整版。');
  if (!officeModule) officeModule = require('./office.cjs');
  return officeModule;
}

function executablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function extractFilePaths(argv) {
  return [...new Set(argv
    .filter((arg) => typeof arg === 'string' && !arg.startsWith('--'))
    .map((arg) => path.resolve(arg))
    .filter((candidate) => {
      try { return fs.statSync(candidate).isFile() && isSupported(candidate); } catch { return false; }
    }))];
}

function queueFiles(paths) {
  if (!paths.length) return;
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:open-files', paths);
  } else {
    pendingFiles.push(...paths);
  }
}

function decodeText(buffer) {
  if (buffer.includes(0) && !buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    throw new Error('该文件看起来是二进制文件，轻阅仅支持文本类文件。');
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { content: buffer.subarray(3).toString('utf8'), encoding: 'utf8-bom' };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { content: iconv.decode(buffer.subarray(2), 'utf16-le'), encoding: 'utf16-le' };
  }
  try {
    return { content: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf8' };
  } catch {
    return { content: iconv.decode(buffer, 'gb18030'), encoding: 'gb18030' };
  }
}

function encodeText(content, encoding) {
  if (encoding === 'utf8-bom') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')]);
  if (encoding === 'utf16-le') return Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(content, 'utf16-le')]);
  if (encoding === 'gb18030') return iconv.encode(content, 'gb18030');
  return Buffer.from(content, 'utf8');
}

function createWindow() {
  const savedWindow = loadWindowState();
  lastNormalBounds = savedWindow.bounds;
  mainWindow = new BrowserWindow({
    ...savedWindow.bounds,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f5f6f8',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: true,
    autoHideMenuBar: true,
    title: appName,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-start-loading', () => { rendererReady = false; });
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.once('ready-to-show', () => { if (savedWindow.maximized) mainWindow.maximize(); });
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:fullscreen-changed', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:fullscreen-changed', false));
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (allowClose || !rendererReady) return;
    event.preventDefault();
    mainWindow.webContents.send('app:request-close');
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', isLite && !app.isPackaged ? 'dist-lite' : 'dist', 'index.html'));
}

const initialFiles = extractFilePaths(process.argv);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    queueFiles(extractFilePaths(argv));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('qingyue-file', (request) => {
      try {
        const url = new URL(request.url);
        const localPath = decodeURIComponent(url.pathname.slice(1));
        return net.fetch(pathToFileURL(localPath).toString());
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    pendingFiles.push(...initialFiles);
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());

function takePendingFiles() {
  const files = [...new Set(pendingFiles)];
  pendingFiles = [];
  return files;
}
ipcMain.handle('app:take-startup-files', () => takePendingFiles());
ipcMain.handle('app:renderer-ready', () => { rendererReady = true; return takePendingFiles(); });

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开文本文件',
    properties: ['openFile'],
    filters: [
      { name: `${appName}支持的文件`, extensions: SUPPORTED_EXTENSIONS.filter(ext => isSupported(`file${ext}`)).map(ext => ext.slice(1)) },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: '打开文件夹', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:save-as', async (_event, suggestedName = '未命名.md') => {
  const extension = path.extname(suggestedName).toLowerCase();
  const primaryFilter = extension === '.docx'
    ? { name: 'Word 文档', extensions: ['docx'] }
    : extension === '.xlsx'
      ? { name: 'Excel 工作簿', extensions: ['xlsx'] }
      : extension === '.pdf'
        ? { name: 'PDF 文档', extensions: ['pdf'] }
        : extension === '.html'
          ? { name: 'HTML 网页', extensions: ['html'] }
          : extension === '.rtf'
            ? { name: '富文本文档', extensions: ['rtf'] }
            : extension === '.csv'
              ? { name: 'CSV 表格', extensions: ['csv'] }
              : extension === '.md'
                ? { name: 'Markdown', extensions: ['md'] }
          : extension === '.json'
        ? { name: 'JSON', extensions: ['json'] }
        : extension === '.txt'
          ? { name: '文本文件', extensions: ['txt'] }
          : extension === '.excalidraw'
            ? { name: 'Excalidraw 白板', extensions: ['excalidraw'] }
            : ['.mindmap', '.smm'].includes(extension)
              ? { name: '轻阅思维导图', extensions: ['mindmap', 'smm'] }
              : extension === '.xmind'
                ? { name: 'XMind 思维导图', extensions: ['xmind'] }
                : ['.png', '.jpg', '.jpeg'].includes(extension)
                  ? { name: '图片', extensions: [extension.slice(1)] }
                  : { name: 'Markdown', extensions: ['md'] };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '另存为',
    defaultPath: suggestedName,
    filters: [
      primaryFilter,
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:read', async (_event, input) => {
  const filePath = typeof input === 'string' ? input : input.path;
  const allowLarge = typeof input === 'object' && Boolean(input.allowLarge);
  const resolved = path.resolve(filePath);
  const stats = await fsp.stat(resolved);
  if (!stats.isFile()) throw new Error('所选路径不是文件。');
  const limit = allowLarge && !isLite ? 256 : 32;
  if (stats.size > limit * 1024 * 1024) throw new Error(`文件超过 ${limit} MB，为避免卡顿暂不打开。`);
  const buffer = await fsp.readFile(resolved);
  const decoded = decodeText(buffer);
  return {
    path: resolved,
    name: path.basename(resolved),
    content: decoded.content,
    encoding: decoded.encoding,
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    largeMode: stats.size > 8 * 1024 * 1024,
  };
});

ipcMain.handle('file:write', async (_event, payload) => {
  const resolved = path.resolve(payload.path);
  await fsp.writeFile(resolved, encodeText(payload.content, payload.encoding || 'utf8'));
  const stats = await fsp.stat(resolved);
  return { path: resolved, name: path.basename(resolved), size: stats.size, modifiedAt: stats.mtimeMs };
});

ipcMain.handle('file:stat', async (_event, filePath) => {
  const resolved = path.resolve(filePath);
  const stats = await fsp.stat(resolved);
  return { path: resolved, name: path.basename(resolved), size: stats.size, modifiedAt: stats.mtimeMs, isFile: stats.isFile() };
});

ipcMain.handle('file:read-binary', async (_event, filePath) => {
  const resolved = path.resolve(filePath);
  const stats = await fsp.stat(resolved);
  if (!stats.isFile()) throw new Error('所选路径不是文件。');
  if (stats.size > 64 * 1024 * 1024) throw new Error('二进制文件超过 64 MB，为避免内存溢出暂不载入编辑器。');
  return new Uint8Array(await fsp.readFile(resolved));
});

ipcMain.handle('file:write-binary', async (_event, payload) => {
  const resolved = path.resolve(payload.path);
  await fsp.writeFile(resolved, Buffer.from(payload.data));
  return { path: resolved, name: path.basename(resolved), size: (await fsp.stat(resolved)).size };
});

ipcMain.handle('file:attach', async (_event, payload) => {
  const source = path.resolve(payload.source);
  const documentPath = path.resolve(payload.documentPath);
  const stats = await fsp.stat(source);
  if (!stats.isFile()) throw new Error('附件来源不是文件。');
  if (stats.size > 128 * 1024 * 1024) throw new Error('附件超过 128 MB，请手动复制后再插入链接。');
  const stem = path.basename(documentPath, path.extname(documentPath));
  const assetDirectory = path.join(path.dirname(documentPath), `${stem}.assets`);
  await fsp.mkdir(assetDirectory, { recursive: true });
  const extension = path.extname(source);
  const base = path.basename(source, extension).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'attachment';
  let destination = path.join(assetDirectory, `${base}${extension}`);
  let suffix = 2;
  while (true) {
    try { await fsp.access(destination); destination = path.join(assetDirectory, `${base}-${suffix++}${extension}`); }
    catch { break; }
  }
  await fsp.copyFile(source, destination);
  return { path: destination, name: path.basename(destination), relative: `${stem}.assets/${path.basename(destination)}` };
});

ipcMain.handle('office:read-docx', async (_event, filePath) => {
  return office().readDocx(filePath);
});

ipcMain.handle('office:write-docx', async (_event, payload) => {
  return office().writeDocx(payload.path, payload.blocks);
});

ipcMain.handle('office:read-xlsx', async (_event, filePath) => {
  return office().readXlsx(filePath);
});

ipcMain.handle('office:write-xlsx', async (_event, payload) => {
  return office().writeXlsx(payload.path, payload.sourcePath, payload.changes);
});

ipcMain.handle('workspace:tree', (_event, root) => workspace.walk(path.resolve(root)));
ipcMain.handle('workspace:search', (_event, payload) => workspace.searchFolder(
  path.resolve(payload.root), payload.query, payload.matchCase,
  isLite ? undefined : (filePath, query, matchCase, limit) => office().searchOffice(filePath, query, matchCase, limit),
));
ipcMain.handle('workspace:replace', (_event, payload) => workspace.replaceFolder(path.resolve(payload.root), payload.search, payload.replacement, payload.matchCase));
ipcMain.handle('session:save', (_event, payload) => {
  // A close-time flush must finish after, not race with, the debounced autosave.
  sessionWriteQueue = sessionWriteQueue.catch(() => undefined).then(() => workspace.saveSession(app.getPath('userData'), payload));
  return sessionWriteQueue;
});
ipcMain.handle('session:load', () => workspace.loadSession(app.getPath('userData')));
ipcMain.handle('session:archive', () => workspace.archiveSession(app.getPath('userData')));
ipcMain.handle('session:archived', () => workspace.loadArchivedSession(app.getPath('userData')));
ipcMain.handle('history:save', (_event, payload) => workspace.saveHistory(app.getPath('userData'), payload));
ipcMain.handle('history:list', (_event, identity) => workspace.listHistory(app.getPath('userData'), identity));
ipcMain.handle('history:read', (_event, payload) => workspace.readHistory(app.getPath('userData'), payload.identity, payload.file));

ipcMain.handle('export:html', async (_event, payload) => {
  const resolved = path.resolve(payload.path);
  await fsp.writeFile(resolved, payload.html, 'utf8');
  return { path: resolved, name: path.basename(resolved) };
});

ipcMain.handle('export:pdf', async (_event, payload) => {
  const resolved = path.resolve(payload.path);
  const temporary = path.join(app.getPath('temp'), `qingyue-export-${Date.now()}.html`);
  await fsp.writeFile(temporary, payload.html, 'utf8');
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await printWindow.loadFile(temporary);
    const buffer = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: .5, bottom: .5, left: .55, right: .55 } });
    await fsp.writeFile(resolved, buffer);
  } finally {
    printWindow.destroy();
    await fsp.unlink(temporary).catch(() => undefined);
  }
  return { path: resolved, name: path.basename(resolved) };
});

ipcMain.handle('file:reveal', (_event, filePath) => shell.showItemInFolder(path.resolve(filePath)));
ipcMain.handle('shell:open-external', (_event, url) => {
  if (/^(https?:|mailto:)/i.test(url)) return shell.openExternal(url);
  return false;
});
ipcMain.handle('window:set-fullscreen', (_event, enabled) => mainWindow.setFullScreen(Boolean(enabled)));
ipcMain.handle('window:get-fullscreen', () => mainWindow.isFullScreen());
ipcMain.on('app:set-dirty', (_event, dirty) => { isDirty = Boolean(dirty); });
ipcMain.on('app:close-response', (_event, allow) => {
  if (allow) {
    allowClose = true;
    mainWindow.close();
  }
});
ipcMain.handle('registry:status', () => getAssociationStatus(executablePath()));
ipcMain.handle('registry:register', async () => {
  if (!app.isPackaged) throw new Error('请先生成便携版或安装版，再注册文件关联。');
  return registerFileAssociations(executablePath());
});
ipcMain.handle('registry:unregister', () => unregisterFileAssociations(executablePath()));
ipcMain.handle('registry:open-default-apps', () => shell.openExternal('ms-settings:defaultapps'));
ipcMain.handle('update:state', () => publicUpdateState());
ipcMain.handle('update:check', async () => {
  const updater = installedUpdater();
  publishUpdateState({ status: 'checking', percent: 0, message: '正在检查更新…' });
  await updater.checkForUpdates();
  return publicUpdateState();
});
ipcMain.handle('update:download', async () => {
  const updater = installedUpdater();
  publishUpdateState({ status: 'downloading', percent: 0, message: '正在准备增量下载…' });
  await updater.downloadUpdate();
  return publicUpdateState();
});
ipcMain.handle('update:install', () => {
  if (updateState.status !== 'ready') throw new Error('更新尚未下载完成。');
  allowClose = true;
  installedUpdater().quitAndInstall(false, true);
  return true;
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  executablePath: executablePath(),
  portable: isPortableRuntime,
  updateCapable: canUseInstalledUpdater(),
  updateChannel,
  installationDirectory: path.dirname(process.execPath),
  userDataDirectory: app.getPath('userData'),
}));

module.exports = { extractFilePaths, decodeText, encodeText };
