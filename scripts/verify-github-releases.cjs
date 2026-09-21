// Read-only verification of published release files against the audited catalog.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'releases/catalog.json'), 'utf8'));
const run = promisify(execFile);
async function api(endpoint, ...flags) {
  return JSON.parse((await run('gh', ['api', ...flags, endpoint], {
    cwd: root, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  })).stdout);
}
(async () => {
  const [repo, pages, latest] = await Promise.all([
    api(`repos/${catalog.repository}`),
    api(`repos/${catalog.repository}/releases?per_page=100`, '--paginate', '--slurp'),
    api(`repos/${catalog.repository}/releases/latest`),
  ]);
  const issues = [];
  const warnings = [];
  if (repo.full_name !== catalog.repository || repo.private) issues.push('Repository is not the approved public repository.');
  if (repo.default_branch !== 'main') issues.push('Default branch is not main.');
  if (latest.tag_name !== 'v1.3.4') issues.push('The latest release is not the current full edition.');
  const releases = pages.flat();
  let binaries = 0;
  let verifiedDigests = 0;
  let checksumFiles = 0;
  let bytes = 0;
  for (const expected of catalog.releases) {
    const matches = releases.filter(item => item.tag_name === expected.tag);
    if (matches.length !== 1) { issues.push(`${expected.tag}: expected exactly one release, found ${matches.length}`); continue; }
    const actual = matches[0];
    if (actual.draft || actual.prerelease) issues.push(`${expected.tag}: not a published stable release`);
    const sums = actual.assets.find(item => item.name === `SHA256SUMS-${expected.tag}.txt`);
    const expectedSums = expected.assets.map(asset => `${asset.sha256}  ${asset.filename}`).join('\n') + '\n';
    if (!sums || sums.state !== 'uploaded') issues.push(`${expected.tag}: missing checksum attachment`);
    else {
      const digest = require('node:crypto').createHash('sha256').update(expectedSums).digest('hex');
      if (sums.size !== Buffer.byteLength(expectedSums)) issues.push(`${expected.tag}: checksum file size mismatch`);
      if (sums.digest && sums.digest !== `sha256:${digest}`) issues.push(`${expected.tag}: checksum file digest mismatch`);
      checksumFiles++;
    }
    for (const asset of expected.assets) {
      const uploaded = actual.assets.find(item => item.name === asset.filename);
      if (!uploaded || uploaded.state !== 'uploaded') { issues.push(`${expected.tag}: missing ${asset.filename}`); continue; }
      if (uploaded.size !== asset.size) issues.push(`${asset.filename}: size mismatch`);
      if (uploaded.digest) {
        if (uploaded.digest !== `sha256:${asset.sha256}`) issues.push(`${asset.filename}: SHA256 mismatch`);
        else verifiedDigests++;
      } else warnings.push(`${asset.filename}: GitHub did not report a digest; only size verified`);
      const expectedURL = `https://github.com/${catalog.repository}/releases/download/${expected.tag}/${asset.filename}`;
      if (uploaded.browser_download_url !== expectedURL) issues.push(`${asset.filename}: unexpected download URL`);
      binaries++;
      bytes += uploaded.size;
    }
  }
  console.log(JSON.stringify({ repository: repo.html_url, public: !repo.private, defaultBranch: repo.default_branch,
    latest: latest.tag_name, expectedReleases: catalog.releases.length, binaries, verifiedDigests, checksumFiles, bytes, issues, warnings }, null, 2));
  if (issues.length) process.exitCode = 1;
})().catch(error => { console.error(error.stderr || error); process.exitCode = 1; });
