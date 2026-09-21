const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const repo = 'HeYun0576/qingyue';
const audit = JSON.parse(fs.readFileSync(path.join(root, 'release/.github-audit/catalog.json'), 'utf8'));
const groups = new Map();
for (const item of audit) {
  if (item.extraDistFiles.length) throw new Error(`Unreviewed extra files: ${item.filename}`);
  const latest = item.edition === 'lite' ? item.version === '0.1.2' : item.version === '1.3.4';
  const tag = item.edition === 'lite' ? `lite-v${item.version}` : latest ? `v${item.version}` : `archive-v${item.version}`;
  if (!groups.has(tag)) groups.set(tag, { tag, version: item.version, edition: item.edition, sourceAvailable: latest, assets: [] });
  groups.get(tag).assets.push({ filename: item.filename, size: item.size, sha256: item.sha256 });
}
const releases = [...groups.values()].sort((a, b) => a.edition.localeCompare(b.edition) || a.version.localeCompare(b.version, undefined, { numeric: true }));
const publicDir = path.join(root, 'releases');
const staging = path.join(root, 'release/.github-publish');
fs.mkdirSync(publicDir, { recursive: true }); fs.mkdirSync(staging, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'catalog.json'), JSON.stringify({ repository: repo, releases }, null, 2) + '\n');
fs.writeFileSync(path.join(publicDir, 'SHA256SUMS.txt'), releases.flatMap(release => release.assets.map(asset => `${asset.sha256}  ${asset.filename}`)).join('\n') + '\n');
let readme = '# 版本与历史发布包\n\n';
readme += '本仓库公开保存轻阅的当前源码和历史二进制发布包。所有 EXE、ZIP 均放在 GitHub Releases 中，不提交到源码目录。\n\n';
readme += '**历史源码边界：1.0.0～1.3.2 未留存原始源码快照。`archive-v*` 标签仅指向归档清单，不代表对应版本的源码；GitHub 自动提供的 Source code 下载也只是归档清单。请从 Releases 下载带版本号的 EXE / ZIP。**\n\n';
readme += '完整版 `v1.3.4` 与轻量版 `lite-v0.1.2` 标签指向实际共享源码；轻量版由同一源码的 Lite 构建开关生成。历史二进制只用于回溯，可能含已修复的问题，日常使用请选择最新版本。\n\n';
readme += '| 版本 | 类型 | 下载 | 原始源码 |\n| --- | --- | --- | --- |\n';
for (const release of releases) {
  readme += `| ${release.version} | ${release.edition === 'lite' ? '轻量版' : '完整版'} | [${release.assets.map(a => a.filename.endsWith('.zip') ? 'ZIP' : 'EXE').join(' / ')}](https://github.com/${repo}/releases/tag/${release.tag}) | ${release.sourceAvailable ? '有' : '仅二进制归档'} |\n`;
  const sumsName = `SHA256SUMS-${release.tag}.txt`;
  fs.writeFileSync(path.join(staging, sumsName), release.assets.map(asset => `${asset.sha256}  ${asset.filename}`).join('\n') + '\n');
  const notes = [`# 轻阅${release.edition === 'lite' ? ' Lite' : ''} ${release.version}`, '',
    release.sourceAvailable ? '正式便携发布。本标签包含对应源码。' : '**历史二进制归档**：仅保留当时的原始发布包，没有当时的源码快照。该标签与自动生成的 Source code 下载仅包含归档清单，请下载下面带版本号的 EXE / ZIP。旧版可能含已修复的问题，仅供回溯，日常使用请选择 1.3.4。', '',
    release.edition === 'lite' ? '轻量版不含 Word/Excel、白板、思维导图编辑器、图片工具、文件对比、结构校验、格式化和完整 IDE 语言服务。保留 Markdown/文本阅读编辑等常用功能。' : '',
    'ZIP 为极速便携版：解压后运行文件夹里的程序；EXE 为单文件便携版：无需安装，但冷启动时需要释放程序文件。', '',
    ...release.assets.map(asset => `- [${asset.filename}](https://github.com/${repo}/releases/download/${release.tag}/${asset.filename}) — ${(asset.size / 1024 / 1024).toFixed(2)} MiB`), '',
    `附件 ${sumsName} 提供 SHA256 校验值。已检查发布包不包含个人设置、文档恢复或会话数据。`, '',
    release.sourceAvailable ? `更新说明：[RELEASE-1.3.4.md](https://github.com/${repo}/blob/main/RELEASE-1.3.4.md)` : '',
  ].filter((line, index, all) => line || all[index - 1]).join('\n');
  fs.writeFileSync(path.join(staging, `${release.tag}.md`), notes + '\n');
}
readme += '\n校验信息：[SHA256SUMS.txt](SHA256SUMS.txt) · [机器可读清单](catalog.json)。所有发布包保留原始字节；不包含运行后生成的个人数据。\n';
fs.writeFileSync(path.join(publicDir, 'README.md'), readme);
console.log(JSON.stringify({ releases: releases.length, assets: audit.length, totalBytes: audit.reduce((sum, a) => sum + a.size, 0) }));
