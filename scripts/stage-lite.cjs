const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'release', 'lite-stage');
if (path.dirname(stage) !== path.join(root, 'release')) throw new Error('Invalid staging directory');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const generatedDist = path.resolve(stage, 'dist');
if (path.dirname(generatedDist) !== stage) throw new Error('Invalid staging directory');
fs.cpSync(path.join(root, 'dist-lite'), path.join(stage, 'dist'), { recursive: true });
fs.mkdirSync(path.join(stage, 'electron'), { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'electron'))) {
  if (name.endsWith('.cjs') && name !== 'office.cjs') fs.copyFileSync(path.join(root, 'electron', name), path.join(stage, 'electron', name));
}
fs.mkdirSync(path.join(stage, 'build'), { recursive: true });
for (const name of ['icon.png', 'icon.ico']) fs.copyFileSync(path.join(root, 'build', name), path.join(stage, 'build', name));

// Keep Lite small while copying each production dependency required by text IO and installed updates.
const copiedDependencies = new Map();
function copyDependency(name, searchPaths = [root]) {
  if (copiedDependencies.has(name)) return copiedDependencies.get(name);
  const manifestPath = require.resolve(`${name}/package.json`, { paths: searchPaths });
  const source = fs.realpathSync(path.dirname(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  copiedDependencies.set(name, manifest.version);
  fs.cpSync(source, path.join(stage, 'node_modules', name), { recursive: true });
  for (const dependency of Object.keys(manifest.dependencies || {})) copyDependency(dependency, [source, root]);
  return manifest.version;
}
const iconvVersion = copyDependency('iconv-lite');
const updaterVersion = copyDependency('electron-updater');
const metadata = {
  name: 'qingyue-lite', version: '0.1.2', qingyueEdition: 'lite', private: true,
  repository: 'https://github.com/HeYun0576/qingyue',
  // electron-builder's offline collector traverses the copied production dependencies.
  packageManager: 'traversal',
  description: '轻阅 Lite', author: 'Local Software', license: 'MIT', main: 'electron/main.cjs',
  dependencies: { 'iconv-lite': iconvVersion, 'electron-updater': updaterVersion },
  build: {
    appId: 'com.local.qingyue.lite', productName: '轻阅 Lite', executableName: 'QingYueLite',
    electronDist: path.join(root, 'node_modules', 'electron', 'dist'),
    electronVersion: require('electron/package.json').version,
    asar: true, npmRebuild: false,
    directories: { output: path.join(root, 'release', 'lite') },
    files: ['dist/**/*', 'electron/**/*', 'build/icon.png', 'package.json'],
    win: {
      icon: 'build/icon.ico', target: ['portable'],
      publish: { provider: 'github', owner: 'HeYun0576', repo: 'qingyue', channel: 'lite' },
    },
    portable: { artifactName: 'QingYue-Lite-${version}-Portable-${arch}.${ext}', requestExecutionLevel: 'user' },
    nsis: {
      artifactName: 'QingYue-Lite-${version}-Setup-${arch}.${ext}', oneClick: false, perMachine: false,
      allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true,
      shortcutName: '轻阅 Lite', differentialPackage: true, deleteAppDataOnUninstall: false,
    },
  },
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(metadata, null, 2));
console.log(stage);
