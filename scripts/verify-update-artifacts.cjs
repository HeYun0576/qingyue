const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const full = require('../package.json');
const lite = JSON.parse(fs.readFileSync(path.join(root, 'release', 'lite-stage', 'package.json'), 'utf8'));

function sha512Base64(filename) {
  return crypto.createHash('sha512').update(fs.readFileSync(filename)).digest('base64');
}

function manifestValue(content, key) {
  return content.match(new RegExp(`^${key}:\\s*['\"]?([^'\"\\r\\n]+)`, 'm'))?.[1]?.trim();
}

function verifyEdition({ name, version, directory, channel, setup, portable, fast, executable, dataDirectory }) {
  const manifestFile = path.join(directory, `${channel}.yml`);
  const setupFile = path.join(directory, setup);
  const blockmapFile = `${setupFile}.blockmap`;
  const portableFile = path.join(directory, portable);
  const fastFile = path.join(root, 'release', `${fast}.zip`);
  const fastDirectory = path.join(root, 'release', fast);
  const updateConfigFile = path.join(directory, 'win-unpacked', 'resources', 'app-update.yml');
  for (const filename of [manifestFile, setupFile, blockmapFile, portableFile, fastFile, updateConfigFile]) {
    if (!fs.existsSync(filename)) throw new Error(`${name} 缺少更新产物：${path.relative(root, filename)}`);
  }
  for (const filename of [path.join(fastDirectory, executable), path.join(fastDirectory, 'QingYue-Portable.txt'), path.join(fastDirectory, dataDirectory)]) {
    if (!fs.existsSync(filename)) throw new Error(`${name} Fast 包缺少文件：${path.relative(root, filename)}`);
  }
  if (fs.existsSync(path.join(fastDirectory, 'resources', 'app-update.yml'))) throw new Error(`${name} Fast 包不应包含安装版更新配置`);
  const manifest = fs.readFileSync(manifestFile, 'utf8');
  const updateConfig = fs.readFileSync(updateConfigFile, 'utf8');
  if (manifestValue(manifest, 'version') !== version) throw new Error(`${name} 更新清单版本不一致`);
  if (!manifest.includes(`url: ${setup}`) || !manifest.includes(`path: ${setup}`)) throw new Error(`${name} 更新清单未指向 Setup`);
  if (manifestValue(manifest, 'sha512') !== sha512Base64(setupFile)) throw new Error(`${name} Setup 校验值不一致`);
  if (manifestValue(updateConfig, 'channel') !== channel) throw new Error(`${name} 应用内更新通道不一致`);
  if (fs.statSync(blockmapFile).size < 1024) throw new Error(`${name} blockmap 异常`);
  if (fs.statSync(portableFile).size < 10 * 1024 * 1024 || fs.statSync(fastFile).size < 10 * 1024 * 1024) throw new Error(`${name} 便携包体积异常`);
  return {
    name, version, channel, setup,
    setupBytes: fs.statSync(setupFile).size,
    blockmapBytes: fs.statSync(blockmapFile).size,
    portableBytes: fs.statSync(portableFile).size,
    fastBytes: fs.statSync(fastFile).size,
  };
}

const report = [
  verifyEdition({
    name: 'Full', version: full.version, directory: path.join(root, 'release'), channel: 'latest',
    setup: `QingYue-Markdown-${full.version}-Setup-x64.exe`,
    portable: `QingYue-Markdown-${full.version}-Portable-x64.exe`,
    fast: `QingYue-${full.version}-Fast-Portable-x64`, executable: 'QingYue.exe', dataDirectory: 'QingYue-Data',
  }),
  verifyEdition({
    name: 'Lite', version: lite.version, directory: path.join(root, 'release', 'lite'), channel: 'lite',
    setup: `QingYue-Lite-${lite.version}-Setup-x64.exe`,
    portable: `QingYue-Lite-${lite.version}-Portable-x64.exe`,
    fast: `QingYue-Lite-${lite.version}-Fast-Portable-x64`, executable: 'QingYueLite.exe', dataDirectory: 'QingYueLite-Data',
  }),
];
console.log(JSON.stringify(report, null, 2));
