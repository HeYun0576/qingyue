const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('qingyue', {
  takeStartupFiles: () => ipcRenderer.invoke('app:take-startup-files'),
  rendererReady: () => ipcRenderer.invoke('app:renderer-ready'),
  archiveSession: () => ipcRenderer.invoke('session:archive'),
  loadArchivedSession: () => ipcRenderer.invoke('session:archived'),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  saveAsDialog: (suggestedName) => ipcRenderer.invoke('dialog:save-as', suggestedName),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  readLargeFile: (filePath) => ipcRenderer.invoke('file:read', { path: filePath, allowLarge: true }),
  writeFile: (payload) => ipcRenderer.invoke('file:write', payload),
  statFile: (filePath) => ipcRenderer.invoke('file:stat', filePath),
  readBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),
  writeBinary: (payload) => ipcRenderer.invoke('file:write-binary', payload),
  attachFile: (payload) => ipcRenderer.invoke('file:attach', payload),
  readDocx: (filePath) => ipcRenderer.invoke('office:read-docx', filePath),
  writeDocx: (payload) => ipcRenderer.invoke('office:write-docx', payload),
  readXlsx: (filePath) => ipcRenderer.invoke('office:read-xlsx', filePath),
  writeXlsx: (payload) => ipcRenderer.invoke('office:write-xlsx', payload),
  loadTree: (root) => ipcRenderer.invoke('workspace:tree', root),
  searchFolder: (payload) => ipcRenderer.invoke('workspace:search', payload),
  replaceFolder: (payload) => ipcRenderer.invoke('workspace:replace', payload),
  saveSession: (payload) => ipcRenderer.invoke('session:save', payload),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveHistory: (payload) => ipcRenderer.invoke('history:save', payload),
  listHistory: (identity) => ipcRenderer.invoke('history:list', identity),
  readHistory: (payload) => ipcRenderer.invoke('history:read', payload),
  exportHtml: (payload) => ipcRenderer.invoke('export:html', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', enabled),
  getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
  setDirty: (dirty) => ipcRenderer.send('app:set-dirty', dirty),
  respondToClose: (allow) => ipcRenderer.send('app:close-response', allow),
  getAssociationStatus: () => ipcRenderer.invoke('registry:status'),
  registerAssociations: () => ipcRenderer.invoke('registry:register'),
  unregisterAssociations: () => ipcRenderer.invoke('registry:unregister'),
  openDefaultApps: () => ipcRenderer.invoke('registry:open-default-apps'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  onOpenFiles: (callback) => {
    const listener = (_event, paths) => callback(paths);
    ipcRenderer.on('app:open-files', listener);
    return () => ipcRenderer.removeListener('app:open-files', listener);
  },
  onRequestClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:request-close', listener);
    return () => ipcRenderer.removeListener('app:request-close', listener);
  },
  onFullscreenChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
});
