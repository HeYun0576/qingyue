const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const metadata = require('../package.json');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const liteStage = fs.readFileSync(path.join(root, 'scripts', 'stage-lite.cjs'), 'utf8');

test('installed Full build uses NSIS differential updates without deleting user data', () => {
  assert.equal(metadata.dependencies['electron-updater'], '^6.8.9');
  assert.equal(metadata.build.nsis.differentialPackage, true);
  assert.equal(metadata.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(metadata.build.nsis.perMachine, false);
  assert.equal(metadata.build.win.publish.channel, 'latest');
  assert.match(metadata.scripts['dist:installer'], /--win nsis/);
  assert.equal(metadata.build.extraFiles, undefined);
});

test('Full and Lite installed editions have isolated update channels and identities', () => {
  assert.match(liteStage, /appId: 'com\.local\.qingyue\.lite'/);
  assert.match(liteStage, /channel: 'lite'/);
  assert.match(liteStage, /QingYue-Lite-\$\{version\}-Setup/);
  assert.match(liteStage, /copyDependency\('electron-updater'\)/);
  assert.match(main, /updateChannel/);
});

test('updater is lazy, user-controlled, and limited to installed Windows builds', () => {
  assert.doesNotMatch(main.split('function installedUpdater()')[0], /require\('electron-updater'\)/);
  assert.match(main, /process\.platform === 'win32' && app\.isPackaged && !isPortableRuntime/);
  assert.match(main, /legacyUnpackedPortable[\s\S]*!installedUpdateConfig/);
  assert.match(main, /autoDownload = false/);
  assert.match(main, /autoInstallOnAppQuit = false/);
  assert.match(main, /disableDifferentialDownload = false/);
  assert.match(main, /path\.join\(app\.getPath\('appData'\), dataDirectory\)/);
  for (const channel of ['update:state', 'update:check', 'update:download', 'update:install']) {
    assert.match(preload, new RegExp(channel.replace(':', '\\:')));
  }
});

test('installed application state lives outside the install directory and window geometry is restored', () => {
  assert.match(main, /path\.join\(app\.getPath\('appData'\), dataDirectory\)/);
  assert.match(main, /window-state\.json/);
  assert.match(main, /savedWindow\.maximized/);
  assert.match(main, /saveWindowState\(\)/);
});
