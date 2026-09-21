const test = require('node:test');
const assert = require('node:assert/strict');
const { openCommand, applicationExecutableName, registryOperations, registrationFile, unregistrationFile } = require('../electron/registry.cjs');

test('quotes portable executable and incoming file path', () => {
  assert.equal(openCommand('D:\\Tools\\Qing Yue.exe'), '"D:\\Tools\\Qing Yue.exe" "%1"');
  assert.equal(applicationExecutableName('D:\\Tools\\QingYue-Markdown-1.3.4-Portable-x64.exe'), 'QingYue-Markdown-1.3.4-Portable-x64.exe');
});

test('builds one batch registry import with short app labels', () => {
  const content = registrationFile('D:\\Tools\\轻阅.exe');
  assert.match(content, /^Windows Registry Editor Version 5\.00/);
  assert.match(content, /"FriendlyAppName"="轻阅"/);
  assert.match(content, /QingYueOpen\][\s\S]*@="轻阅"/);
  assert.match(content, /Software\\RegisteredApplications\][\s\S]*"QingYue"="Software\\\\QingYue\\\\Capabilities"/);
  assert.match(content, /Software\\QingYue\\Capabilities\\FileAssociations\][\s\S]*"\.md"="QingYue\.TextFile"/);
  assert.doesNotMatch(content, /本地、离线|Markdown 与代码文件阅读编辑器/);
  const removal = unregistrationFile();
  assert.match(removal, /\[-HKEY_CURRENT_USER\\Software\\Classes\\QingYue\.TextFile\]/);
});

test('portable registration uses the real versioned executable name', () => {
  const executable = 'D:\\Tools\\QingYue-Markdown-1.3.4-Portable-x64.exe';
  const content = registrationFile(executable);
  assert.match(content, /Applications\\QingYue-Markdown-1\.3\.4-Portable-x64\.exe\\shell\\open\\command/);
  assert.match(content, /QingYue-Markdown-1\.3\.4-Portable-x64\.exe[\s\S]*%1/);
  assert.doesNotMatch(content, /Applications\\QingYue\.exe\\shell\\open\\command/);
  const removal = unregistrationFile(executable);
  assert.match(removal, /Applications\\QingYue-Markdown-1\.3\.4-Portable-x64\.exe\]/);
  assert.match(removal, /RegisteredApplications\][\s\S]*"QingYue"=-/);
});

test('registers open command and context menu without replacing extension defaults', () => {
  const operations = registryOperations('D:\\QingYue.exe');
  assert.ok(operations.some((args) => args.join(' ').includes('OpenWithProgids')));
  assert.ok(operations.some((args) => args.join(' ').includes('QingYueOpen')));
  assert.equal(operations.some((args) => /^HKCU\\Software\\Classes\\\.md$/.test(args[1])), false);
  assert.ok(operations.some((args) => args.includes('FriendlyAppName') && args.includes('轻阅')));
  const contextMenu = operations.find((args) => args[1].endsWith('\\shell\\QingYueOpen') && args.includes('/ve'));
  assert.equal(contextMenu?.[4], '轻阅');
  assert.equal(operations.some((args) => args.includes('FriendlyAppName') && args.some((value) => value.includes('本地、离线'))), false);
});

test('never registers executable script extensions and repairs BAT/CMD execution classes', () => {
  const content = registrationFile('D:\\QingYue.exe');
  const operations = registryOperations('D:\\QingYue.exe');
  for (const extension of ['.bat', '.cmd', '.ps1']) {
    assert.equal(operations.some((args) => args[1]?.includes(`\\${extension}\\`)), false, extension);
    assert.match(content, new RegExp(`SystemFileAssociations\\\\\\${extension}\\\\shell\\\\QingYueOpen\\]`));
    assert.match(content, new RegExp(`\\${extension}\\\\OpenWithProgids\\][\\s\\S]*"QingYue\\.TextFile"=-`));
  }
  assert.match(content, /Software\\Classes\\\.bat\][\s\S]*@="batfile"/);
  assert.match(content, /Software\\Classes\\\.cmd\][\s\S]*@="cmdfile"/);
});
