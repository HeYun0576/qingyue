// Explicit opt-in publishing. Only audited files named in releases/catalog.json may be uploaded.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'releases/catalog.json'), 'utf8'));
const repo = catalog.repository;
const staging = path.join(root, 'release/.github-publish');
const run = promisify(execFile);
const gh = async (...args) => (await run('gh', args, { cwd: root, windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const releaseIds = new Map();
const getRelease = async tag => {
  if (releaseIds.has(tag)) return JSON.parse(await gh('api', `repos/${repo}/releases/${releaseIds.get(tag)}`));
  try {
    const release = JSON.parse(await gh('api', `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`));
    releaseIds.set(tag, release.id);
    return release;
  } catch (error) {
    if (!/404|release not found/i.test(error.stderr || error.message)) throw error;
    // The tag endpoint omits unpublished drafts; the authenticated list includes them.
    const pages = JSON.parse(await gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`));
    const release = pages.flat().find(item => item.tag_name === tag);
    if (release) releaseIds.set(tag, release.id);
    return release || null;
  }
};
function checkAsset(actual, expected) {
  if (actual.size !== expected.size || actual.state !== 'uploaded') throw new Error(`Asset not complete: ${expected.filename}`);
  if (actual.digest && actual.digest !== `sha256:${expected.sha256}`) throw new Error(`Remote digest mismatch: ${expected.filename}`);
}
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function publish(release) {
  let remote = await getRelease(release.tag);
  if (!remote) {
    await gh('release', 'create', release.tag, '--repo', repo, '--verify-tag', '--draft', '--latest=false', '--title', `轻阅${release.edition === 'lite' ? ' Lite' : ''} ${release.version}${release.sourceAvailable ? '' : ' · 历史归档'}`, '--notes-file', path.join(staging, `${release.tag}.md`));
    remote = await getRelease(release.tag);
    if (!remote) throw new Error(`Release creation not confirmed: ${release.tag}`);
  }
  for (const asset of release.assets) {
    const local = path.resolve(root, 'release', asset.filename);
    if (path.dirname(local) !== path.join(root, 'release') || fs.statSync(local).size !== asset.size) throw new Error(`Local file changed: ${asset.filename}`);
    const existing = remote.assets.find(item => item.name === asset.filename);
    if (existing) { checkAsset(existing, asset); continue; }
    if (await sha256(local) !== asset.sha256) throw new Error(`Local digest mismatch: ${asset.filename}`);
    console.log(JSON.stringify({ tag: release.tag, uploading: asset.filename, bytes: asset.size }));
    try { await gh('release', 'upload', release.tag, local, '--repo', repo); }
    catch (error) {
      const check = await getRelease(release.tag);
      const completed = check?.assets.find(item => item.name === asset.filename);
      if (!completed) throw error;
      checkAsset(completed, asset);
    }
    remote = await getRelease(release.tag);
    const uploaded = remote.assets.find(item => item.name === asset.filename);
    if (!uploaded) throw new Error(`Missing uploaded asset: ${asset.filename}`);
    checkAsset(uploaded, asset);
  }
  const sums = `SHA256SUMS-${release.tag}.txt`;
  if (!remote.assets.some(item => item.name === sums)) await gh('release', 'upload', release.tag, path.join(staging, sums), '--repo', repo);
  if (remote.draft) await gh('release', 'edit', release.tag, '--repo', repo, '--draft=false', release.tag === 'v1.3.4' ? '--latest=true' : '--latest=false');
  remote = await getRelease(release.tag);
  if (remote.draft) throw new Error(`Release still draft: ${release.tag}`);
  for (const asset of release.assets) checkAsset(remote.assets.find(item => item.name === asset.filename) || {}, asset);
  console.log(JSON.stringify({ published: release.tag, url: remote.html_url, verifiedFiles: release.assets.length }));
  return { tag: release.tag, url: remote.html_url, assets: remote.assets.map(item => ({ name: item.name, size: item.size, digest: item.digest, url: item.browser_download_url })) };
}
(async () => {
  const ordered = [...catalog.releases].sort((a, b) => Number(b.sourceAvailable) - Number(a.sourceAvailable));
  if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ repository: repo, releases: ordered.map(item => item.tag), note: 'Use --execute after reviewing the catalog and pushing tags.' }, null, 2)); return; }
  const repository = JSON.parse(await gh('api', `repos/${repo}`));
  if (repository.full_name !== repo || repository.private) throw new Error('Expected the approved public repository.');
  let cursor = 0;
  const results = [];
  const failures = [];
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < ordered.length) {
      const item = ordered[cursor++];
      try { results.push(await publish(item)); }
      catch (error) { failures.push({ tag: item.tag, message: error.stderr || error.message }); console.error(JSON.stringify(failures[failures.length - 1])); }
      fs.writeFileSync(path.join(staging, 'upload-progress.json'), JSON.stringify({ results, failures }, null, 2));
    }
  }));
  console.log(JSON.stringify({ completed: results.length, failed: failures.length }));
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error.stderr || error); process.exitCode = 1; });
