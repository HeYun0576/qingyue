const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/startup-policy.ts'), 'utf8');
const policy = { exports: {} };
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(policy.exports);

test('startup preferences have safe defaults and tolerate invalid saved settings', () => {
  const { normalizeStartupSettings, readStartupSettings } = policy.exports;
  assert.deepEqual(normalizeStartupSettings(null), { defaultView: 'split', startupMode: 'restore', rememberFolder: true });
  assert.deepEqual(normalizeStartupSettings({ defaultView: 'preview', startupMode: 'restore', rememberFolder: true }), { defaultView: 'preview', startupMode: 'restore', rememberFolder: true });
  assert.equal(readStartupSettings({ getItem: () => '{invalid' }).startupMode, 'restore');
  assert.equal(normalizeStartupSettings({ defaultView: 'broken', rememberFolder: 'true' }).rememberFolder, true);
  assert.equal(normalizeStartupSettings({ startupMode: 'empty', rememberFolder: false }).rememberFolder, false);
});

test('fresh launches archive recovery and empty launches do not erase it', async () => {
  const workspace = require('../electron/workspace.cjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qingyue-archive-'));
  const session = { tabs: [{ id: 'draft', kind: 'text', dirty: true, content: '# 未保存的内容' }] };
  await workspace.saveSession(root, session);
  assert.equal(await workspace.archiveSession(root), true);
  await workspace.saveSession(root, { tabs: [] });
  assert.equal(await workspace.archiveSession(root), false);
  assert.deepEqual(await workspace.loadArchivedSession(root), session);
});

test('desktop New entry targets only Markdown and preserves existing defaults', () => {
  const { markdownShellNewFile } = require('../electron/registry.cjs');
  assert.match(markdownShellNewFile(), /Classes\\\.md\\ShellNew/);
  assert.match(markdownShellNewFile(), /"NullFile"=""/);
  assert.doesNotMatch(markdownShellNewFile(), /Classes\\\.md\]/);
  assert.match(markdownShellNewFile(true), /@="QingYue\.TextFile"/);
  assert.doesNotMatch(markdownShellNewFile(), /\.bat|\.cmd|\.ps1/);
});

test('Lite associations and user data are independent and exclude removed formats', () => {
  const result = JSON.parse(execFileSync(process.execPath, ['-e', `const e=require('./electron/edition.cjs');const f=require('./electron/file-types.cjs');const r=require('./electron/registry.cjs');const p='D:\\\\Apps\\\\QingYue-Lite-0.1.2-Portable-x64.exe';console.log(JSON.stringify({e,extensions:f.ASSOCIATION_EXTENSIONS,id:r.PROG_ID,exe:r.APP_EXE,application:r.applicationExecutableName(p),registry:r.registrationFile(p)}))`], { cwd: path.join(__dirname, '..'), env: { ...process.env, QINGYUE_EDITION: 'lite' }, encoding: 'utf8' }));
  assert.equal(result.e.dataDirectory, 'QingYueLite-Data');
  assert.equal(result.id, 'QingYueLite.TextFile');
  assert.equal(result.exe, 'QingYueLite.exe');
  assert.equal(result.application, 'QingYue-Lite-0.1.2-Portable-x64.exe');
  assert.match(result.registry, /RegisteredApplications\][\s\S]*"QingYueLite"="Software\\\\QingYueLite\\\\Capabilities"/);
  assert.match(result.registry, /Applications\\QingYue-Lite-0\.1\.2-Portable-x64\.exe\\shell\\open\\command/);
  for (const ext of ['.docx', '.xlsx', '.xmind', '.excalidraw', '.png', '.bat', '.cmd']) assert.ok(!result.extensions.includes(ext), ext);
  assert.ok(result.extensions.includes('.md'));
});
