const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SUPPORTED_EXTENSIONS, PROTECTED_EXECUTABLE_EXTENSIONS, ASSOCIATION_EXTENSIONS } = require('./file-types.cjs');

const execFileAsync = promisify(execFile);
const CLASSES = 'HKCU\\Software\\Classes';
const REG_FILE_CLASSES = 'HKEY_CURRENT_USER\\Software\\Classes';
const REG_FILE_SOFTWARE = 'HKEY_CURRENT_USER\\Software';
const { isLite, appName } = require('./edition.cjs');
const PROG_ID = isLite ? 'QingYueLite.TextFile' : 'QingYue.TextFile';
const APP_EXE = isLite ? 'QingYueLite.exe' : 'QingYue.exe';
const CONTEXT_VERB = isLite ? 'QingYueLiteOpen' : 'QingYueOpen';
const REGISTERED_APP = isLite ? 'QingYueLite' : 'QingYue';
const CAPABILITIES_PATH = `Software\\${REGISTERED_APP}\\Capabilities`;
const NATIVE_EXECUTION_CLASSES = new Map([['.bat', 'batfile'], ['.cmd', 'cmdfile']]);

function openCommand(executablePath) {
  return `"${executablePath}" "%1"`;
}

function applicationExecutableName(executablePath) {
  return path.basename(path.resolve(executablePath)) || APP_EXE;
}

function registryOperations(executablePath) {
  const command = openCommand(executablePath);
  const applicationExe = applicationExecutableName(executablePath);
  const operations = [
    ['add', `${CLASSES}\\${PROG_ID}`, '/ve', '/d', appName + '文本文档', '/f'],
    ['add', `${CLASSES}\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', `"${executablePath}",0`, '/f'],
    ['add', `${CLASSES}\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', command, '/f'],
    ['add', `${CLASSES}\\Applications\\${applicationExe}`, '/v', 'FriendlyAppName', '/d', appName, '/f'],
    ['add', `${CLASSES}\\Applications\\${applicationExe}\\shell\\open\\command`, '/ve', '/d', command, '/f'],
    ['add', 'HKCU\\Software\\RegisteredApplications', '/v', REGISTERED_APP, '/d', CAPABILITIES_PATH, '/f'],
    ['add', `HKCU\\${CAPABILITIES_PATH}`, '/v', 'ApplicationName', '/d', appName, '/f'],
    ['add', `HKCU\\${CAPABILITIES_PATH}`, '/v', 'ApplicationIcon', '/d', `"${executablePath}",0`, '/f'],
  ];

  for (const extension of ASSOCIATION_EXTENSIONS) {
    operations.push(
      ['add', `${CLASSES}\\${extension}\\OpenWithProgids`, '/v', PROG_ID, '/t', 'REG_NONE', '/d', '', '/f'],
      ['add', `${CLASSES}\\Applications\\${applicationExe}\\SupportedTypes`, '/v', extension, '/t', 'REG_SZ', '/d', '', '/f'],
      ['add', `HKCU\\${CAPABILITIES_PATH}\\FileAssociations`, '/v', extension, '/d', PROG_ID, '/f'],
      ['add', `${CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}`, '/ve', '/d', appName, '/f'],
      ['add', `${CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}`, '/v', 'Icon', '/d', `"${executablePath}"`, '/f'],
      ['add', `${CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}\\command`, '/ve', '/d', command, '/f'],
    );
  }
  return operations;
}

async function runReg(args) {
  return execFileAsync('reg.exe', args, { windowsHide: true });
}

function regString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function registrationFile(executablePath) {
  const executable = path.resolve(executablePath);
  const applicationExe = applicationExecutableName(executable);
  const command = openCommand(executable);
  const lines = ['Windows Registry Editor Version 5.00', ''];
  const key = (name, values) => {
    lines.push(`[${name}]`, ...values, '');
  };
  key(`${REG_FILE_CLASSES}\\${PROG_ID}`, [`@=${regString(appName + '文本文档')}`]);
  key(`${REG_FILE_CLASSES}\\${PROG_ID}\\DefaultIcon`, [`@=${regString(`"${executable}",0`)}`]);
  key(`${REG_FILE_CLASSES}\\${PROG_ID}\\shell\\open\\command`, [`@=${regString(command)}`]);
  key(`${REG_FILE_CLASSES}\\Applications\\${applicationExe}`, [
    `"FriendlyAppName"=${regString(appName)}`,
    `"ApplicationIcon"=${regString(`"${executable}",0`)}`,
  ]);
  key(`${REG_FILE_CLASSES}\\Applications\\${applicationExe}\\shell\\open\\command`, [`@=${regString(command)}`]);
  key(`${REG_FILE_SOFTWARE}\\RegisteredApplications`, [`"${REGISTERED_APP}"=${regString(CAPABILITIES_PATH)}`]);
  key(`${REG_FILE_SOFTWARE}\\${REGISTERED_APP}\\Capabilities`, [
    `"ApplicationName"=${regString(appName)}`,
    `"ApplicationDescription"=${regString(appName + ' 本地文档阅读编辑器')}`,
    `"ApplicationIcon"=${regString(`"${executable}",0`)}`,
  ]);
  for (const extension of ASSOCIATION_EXTENSIONS) {
    key(`${REG_FILE_CLASSES}\\${extension}\\OpenWithProgids`, [`"${PROG_ID}"=hex(0):`]);
    key(`${REG_FILE_CLASSES}\\Applications\\${applicationExe}\\SupportedTypes`, [`"${extension}"=""`]);
    key(`${REG_FILE_SOFTWARE}\\${REGISTERED_APP}\\Capabilities\\FileAssociations`, [`"${extension}"=${regString(PROG_ID)}`]);
    key(`${REG_FILE_CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}`, [
      `@=${regString(appName)}`,
      `"Icon"=${regString(`"${executable}"`)}`,
    ]);
    key(`${REG_FILE_CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}\\command`, [`@=${regString(command)}`]);
  }
  for (const extension of PROTECTED_EXECUTABLE_EXTENSIONS) {
    lines.push(
      `[-${REG_FILE_CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}]`, '',
      `[${REG_FILE_CLASSES}\\${extension}\\OpenWithProgids]`, `"${PROG_ID}"=-`, '',
      `[${REG_FILE_CLASSES}\\Applications\\${applicationExe}\\SupportedTypes]`, `"${extension}"=-`, '',
      `[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${extension}\\OpenWithProgids]`, `"${PROG_ID}"=-`, '',
    );
  }
  for (const [extension, nativeClass] of NATIVE_EXECUTION_CLASSES) key(`${REG_FILE_CLASSES}\\${extension}`, [`@=${regString(nativeClass)}`]);
  return `${lines.join('\r\n')}\r\n`;
}

function unregistrationFile(executablePath = APP_EXE) {
  const applicationExe = applicationExecutableName(executablePath);
  const lines = ['Windows Registry Editor Version 5.00', '',
    `[-${REG_FILE_CLASSES}\\${PROG_ID}]`, '',
    `[-${REG_FILE_CLASSES}\\Applications\\${applicationExe}]`, '',
    `[-${REG_FILE_SOFTWARE}\\${REGISTERED_APP}\\Capabilities]`, '',
    `[${REG_FILE_SOFTWARE}\\RegisteredApplications]`, `"${REGISTERED_APP}"=-`, '',
  ];
  if (applicationExe.toLowerCase() !== APP_EXE.toLowerCase()) lines.push(`[-${REG_FILE_CLASSES}\\Applications\\${APP_EXE}]`, '');
  for (const extension of SUPPORTED_EXTENSIONS) {
    lines.push(
      `[-${REG_FILE_CLASSES}\\SystemFileAssociations\\${extension}\\shell\\${CONTEXT_VERB}]`, '',
      `[${REG_FILE_CLASSES}\\${extension}\\OpenWithProgids]`, `"${PROG_ID}"=-`, '',
      `[${REG_FILE_CLASSES}\\Applications\\${applicationExe}\\SupportedTypes]`, `"${extension}"=-`, '',
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

async function importRegistry(content) {
  const filePath = path.join(os.tmpdir(), `qingyue-associations-${process.pid}-${Date.now()}.reg`);
  const encoded = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')]);
  await fsp.writeFile(filePath, encoded);
  try { await runReg(['import', filePath]); }
  finally { await fsp.unlink(filePath).catch(() => undefined); }
}

async function registerFileAssociations(executablePath) {
  await importRegistry(registrationFile(executablePath));
  await registerMarkdownShellNew();
  return { registered: true, executablePath: path.resolve(executablePath) };
}

function markdownShellNewFile(setDefault = false) {
  const lines = ['Windows Registry Editor Version 5.00', ''];
  if (setDefault) lines.push(`[${REG_FILE_CLASSES}\\.md]`, `@=${regString(PROG_ID)}`, '');
  lines.push(`[${REG_FILE_CLASSES}\\.md\\ShellNew]`, '"NullFile"=""', `"ItemName"=${regString(appName + ' Markdown 文档')}`, `"QingYueOwner"=${regString(PROG_ID)}`, '');
  return lines.join('\r\n');
}

async function registerMarkdownShellNew() {
  // Do not overwrite another application's existing template or creation command.
  try {
    const { stdout } = await runReg(['query', 'HKCR\\.md\\ShellNew', '/s']);
    if (/\b(NullFile|FileName|Data|Command)\s+REG_/i.test(stdout)) return;
  } catch { /* No existing New-menu entry. */ }
  let hasDefault = false;
  try { hasDefault = /REG_SZ\s+\S/.test((await runReg(['query', 'HKCR\\.md', '/ve'])).stdout); } catch { /* first registration */ }
  await importRegistry(markdownShellNewFile(!hasDefault));
}

async function unregisterFileAssociations(executablePath = APP_EXE) {
  try {
    const { stdout } = await runReg(['query', `${CLASSES}\\.md\\ShellNew`, '/v', 'QingYueOwner']);
    if (stdout.trim().endsWith(PROG_ID)) {
      await importRegistry(['Windows Registry Editor Version 5.00', '', `[${REG_FILE_CLASSES}\\.md\\ShellNew]`, '"NullFile"=-', '"ItemName"=-', '"QingYueOwner"=-', ''].join('\r\n'));
    }
  } catch { /* Not owned by this edition; preserve it. */ }
  await importRegistry(unregistrationFile(executablePath));
  return { registered: false };
}

async function getAssociationStatus(executablePath) {
  try {
    const { stdout } = await runReg(['query', `${CLASSES}\\${PROG_ID}\\shell\\open\\command`, '/ve']);
    const expected = path.resolve(executablePath).toLowerCase();
    return { registered: stdout.toLowerCase().includes(expected), executablePath: path.resolve(executablePath) };
  } catch {
    return { registered: false, executablePath: path.resolve(executablePath) };
  }
}

module.exports = {
  PROG_ID,
  APP_EXE,
  REGISTERED_APP,
  CAPABILITIES_PATH,
  NATIVE_EXECUTION_CLASSES,
  openCommand,
  applicationExecutableName,
  registryOperations,
  registrationFile,
  markdownShellNewFile,
  unregistrationFile,
  registerFileAssociations,
  unregisterFileAssociations,
  getAssociationStatus,
};
