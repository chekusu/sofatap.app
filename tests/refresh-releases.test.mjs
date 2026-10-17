// The build/publish-time release refresh (scripts/refresh-releases.mjs), driven by injected GitHub
// API fixtures. Every tag, size and checksum here is synthetic fixture data, not the shipped snapshot.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { checksumFor, fetchReleases, refresh, selectReleases, validateSnapshot } from '../scripts/refresh-releases.mjs';

const REPO = 'https://github.com/chekusu/sofatap';
const DESKTOP_FILES = ['SofaTap-Windows-x64.zip', 'SofaTap-macOS-arm64-notarized.zip', 'SofaTap-macOS-x64-notarized.zip', 'SofaTap-Linux-x64.tar.gz', 'SofaTap-Linux-arm64.tar.gz'];
const hash = (seed) => seed.replace(/[^0-9a-f]/g, '').padEnd(64, '0').slice(0, 64);
const hex = (tag, file) => hash([...`${tag}${file}`].map((c) => c.charCodeAt(0).toString(16)).join(''));

// The checksum files' text, keyed by their download URL.
const TEXTS = new Map();
const asset = (tag, name, size, extra = {}) => ({ name, size, state: 'uploaded', browser_download_url: `${REPO}/releases/download/${tag}/${name}`, ...extra });
function sums(tag, name, files) {
  TEXTS.set(`${REPO}/releases/download/${tag}/${name}`, files.map((f) => `${hex(tag, f)}  ${f}\n`).join(''));
  return asset(tag, name, 100);
}
function desktop(tag, { skip = [], published = '2026-10-16T00:00:00Z', draft = false, edit } = {}) {
  const assets = [];
  DESKTOP_FILES.forEach((f, i) => {
    if (skip.includes(f)) return;
    assets.push(asset(tag, f, 40e6 + i, { digest: `sha256:${hex(tag, f)}` }), sums(tag, `${f}.sha256`, [f]));
  });
  const release = { tag_name: tag, draft, prerelease: tag.includes('-'), published_at: published, assets };
  edit?.(release);
  return release;
}
function tv(tag, { checksum = 'SHA256SUMS.txt', draft = false, edit } = {}) {
  const apk = `Sofatap-Android-TV-${tag.slice('android-tv-v'.length)}.apk`;
  const assets = [asset(tag, apk, 6.4e6, { digest: `sha256:${hex(tag, apk)}` })];
  if (checksum) assets.push(sums(tag, checksum === '.sha256' ? `${apk}.sha256` : checksum, [apk]));
  const release = { tag_name: tag, draft, prerelease: true, published_at: '2026-10-16T00:00:00Z', assets };
  edit?.(release);
  return release;
}

const LABELS = { 'SofaTap-Windows-x64.zip': 'x64', 'SofaTap-macOS-arm64-notarized.zip': 'Apple Silicon', 'SofaTap-macOS-x64-notarized.zip': 'Intel', 'SofaTap-Linux-x64.tar.gz': 'x64', 'SofaTap-Linux-arm64.tar.gz': 'ARM64' };
const GUIDES = { windows: 'docs/WINDOWS-START.md', mac: 'docs/MAC-START.md', linux: 'desktop/linux/README.md' };
function snapshot(tag = 'v0.7.3-beta.1', tvTag = 'android-tv-v0.1.4-beta.1') {
  const pkgs = (files) => files.map((file) => ({ label: LABELS[file], file, bytes: 40e6, sha256: hex(tag, file) }));
  return {
    platforms: [
      { id: 'windows', tag, guide: GUIDES.windows, packages: pkgs(DESKTOP_FILES.slice(0, 1)) },
      { id: 'mac', tag, guide: GUIDES.mac, packages: pkgs(DESKTOP_FILES.slice(1, 3)) },
      { id: 'linux', tag, guide: GUIDES.linux, packages: pkgs(DESKTOP_FILES.slice(3)) },
    ],
    androidTv: { tag: tvTag, file: `Sofatap-Android-TV-${tvTag.slice('android-tv-v'.length)}.apk`, bytes: 6e6, sha256: hex(tvTag, 'apk') },
  };
}
const fetchText = async (url) => {
  if (!TEXTS.has(url)) throw new Error(`unexpected fetch ${url}`);
  return TEXTS.get(url);
};
const select = (releases, snap = snapshot()) => selectReleases(releases, snap, fetchText);
const tags = ({ data }) => [data.platforms.map((p) => p.tag).join(), data.androidTv.tag];

test('newest complete release per stream by version number, not list order or dates; betas count', async () => {
  const list = [
    desktop('v0.7.3-beta.2', { published: '2026-10-20T00:00:00Z' }),
    tv('android-tv-v0.1.10-beta.1'),
    desktop('v0.8.0-beta.1', { published: '2026-10-01T00:00:00Z' }),
    tv('android-tv-v0.1.9'),
    desktop('v0.7.10'),
  ];
  const result = await select(list);
  assert.deepEqual(tags(result), ['v0.8.0-beta.1,v0.8.0-beta.1,v0.8.0-beta.1', 'android-tv-v0.1.10-beta.1']);
  assert.equal(result.report.desktop.decision, 'updated');
  // Sizes and checksums come from the verified release; labels and guides from the snapshot.
  const mac = result.data.platforms[1];
  assert.deepEqual(mac.packages.map((k) => [k.label, k.bytes, k.sha256]), [['Apple Silicon', 40e6 + 1, hex('v0.8.0-beta.1', DESKTOP_FILES[1])], ['Intel', 40e6 + 2, hex('v0.8.0-beta.1', DESKTOP_FILES[2])]]);
  assert.equal(mac.guide, GUIDES.mac);
  assert.equal(result.data.androidTv.file, 'Sofatap-Android-TV-0.1.10-beta.1.apk');
  // A newer beta of the same version replaces the older beta.
  assert.deepEqual(tags(await select([desktop('v0.7.3-beta.2')])), ['v0.7.3-beta.2,v0.7.3-beta.2,v0.7.3-beta.2', 'android-tv-v0.1.4-beta.1']);
});

test('the streams never mix: TV tags never become desktop releases and desktop tags never the TV release', async () => {
  const wrongTv = desktop('v0.9.0'); wrongTv.assets.push(asset('v0.9.0', 'Sofatap-Android-TV-0.9.0.apk', 6e6));
  const wrongDesktop = tv('android-tv-v0.2.0'); wrongDesktop.assets.push(...desktop('android-tv-v0.2.0').assets);
  const result = await select([wrongTv, wrongDesktop, { tag_name: 'tv-v9.9.9', draft: false, assets: [] }]);
  assert.deepEqual(tags(result), ['v0.9.0,v0.9.0,v0.9.0', 'android-tv-v0.2.0']);
  assert.equal(result.data.androidTv.file, 'Sofatap-Android-TV-0.2.0.apk');
});

test('an incomplete newer release is skipped; nothing older than the snapshot is ever chosen', async () => {
  const result = await select([desktop('v0.9.0', { skip: ['SofaTap-Linux-arm64.tar.gz'] }), desktop('v0.8.0'), desktop('v0.7.2-beta.1')]);
  assert.equal(result.data.platforms[0].tag, 'v0.8.0');
  assert.match(result.report.desktop.skipped[0], /^v0\.9\.0: missing or malformed asset SofaTap-Linux-arm64\.tar\.gz/);
  // Only an incomplete newer release and older ones: the snapshot stays (no rollback).
  const kept = await select([desktop('v0.9.0', { skip: ['SofaTap-Windows-x64.zip'] }), desktop('v0.7.2-beta.1'), desktop('v0.7.3-beta.1')]);
  assert.deepEqual(kept.data, snapshot());
  assert.equal(kept.report.desktop.decision, 'kept');
  // Drafts never count.
  assert.deepEqual((await select([desktop('v0.9.0', { draft: true }), tv('android-tv-v0.9.0', { draft: true })])).data, snapshot());
  // A checksum file is required.
  const noSum = desktop('v0.9.0', { edit: (r) => { r.assets = r.assets.filter((a) => a.name !== 'SofaTap-Windows-x64.zip.sha256'); } });
  assert.deepEqual((await select([noSum])).data, snapshot());
});

test('malformed assets, links, sizes and checksums reject that candidate only', async () => {
  const bad = [
    desktop('v0.9.0', { edit: (r) => { r.assets = Object.fromEntries(r.assets.map((a) => [a.name, a])); } }),
    desktop('v0.9.1', { edit: (r) => { r.assets[0].browser_download_url = 'https://example.com/SofaTap-Windows-x64.zip'; } }),
    desktop('v0.9.2', { edit: (r) => { r.assets[2].browser_download_url = `${REPO}/releases/download/v0.1.0/SofaTap-macOS-arm64-notarized.zip`; } }),
    desktop('v0.9.3', { edit: (r) => { r.assets[0].size = '90 MB'; } }),
    desktop('v0.9.4', { edit: (r) => { r.assets[0].size = 12; } }), // passes the asset shape, fails snapshot validation
    desktop('v0.9.5', { edit: (r) => { r.assets[0].digest = `sha256:${'f'.repeat(64)}`; } }),
    desktop('v0.9.6', { edit: (r) => { r.assets[0].state = 'starter'; } }),
    desktop('v0.9.7', { edit: (r) => { r.assets.push({ ...r.assets[0] }); } }),
    desktop('v0.9.8', { edit: (r) => { TEXTS.set(r.assets[1].browser_download_url, `${'a'.repeat(64)}  SofaTap-Windows-x64.zip.old\n`); } }),
    desktop('v0.9.9', { edit: (r) => { r.assets[1].browser_download_url = `${REPO}/releases/download/v0.9.9/missing.sha256`; } }),
    null, 'release', { tag_name: 'v1.0.0', draft: false },
  ];
  const result = await select([...bad, desktop('v0.8.0'), tv('android-tv-v0.1.5', { edit: (r) => { r.assets = 'none'; } })]);
  assert.equal(result.data.platforms[0].tag, 'v0.8.0');
  assert.equal(result.report.desktop.skipped.length, 11);
  assert.ok(result.report.desktop.skipped.some((s) => /v0\.9\.4: invalid:/.test(s)));
  assert.ok(result.report.desktop.skipped.some((s) => /v0\.9\.5: checksum mismatch/.test(s)));
  // The other stream keeps its snapshot.
  assert.equal(result.data.androidTv.tag, 'android-tv-v0.1.4-beta.1');
  assert.equal(result.report.androidTv.decision, 'kept');
});

test('Android TV checksum files of every published form, naming the exact APK', async () => {
  for (const checksum of ['SHA256SUMS.txt', 'SHA256SUMS', '.sha256']) {
    assert.equal((await select([tv('android-tv-v0.2.0', { checksum })])).data.androidTv.tag, 'android-tv-v0.2.0', checksum);
  }
  assert.equal((await select([tv('android-tv-v0.2.0', { checksum: null })])).data.androidTv.tag, 'android-tv-v0.1.4-beta.1');
  assert.equal(checksumFor(`${'A'.repeat(64)} *Sofatap-Android-TV-0.2.0.apk\r\n`, 'Sofatap-Android-TV-0.2.0.apk'), 'a'.repeat(64));
  assert.equal(checksumFor(`${'a'.repeat(63)}  x.apk`, 'x.apk'), null);
  assert.equal(checksumFor(`${'a'.repeat(64)}  other/x.apk`, 'x.apk'), null);
  // A checksum file that cannot be read rejects the candidate.
  const unreadable = tv('android-tv-v0.2.0');
  unreadable.assets[1].browser_download_url = `${REPO}/releases/download/android-tv-v0.2.0/SHA256SUMS.txt`;
  const failing = await selectReleases([unreadable], snapshot(), async () => { throw new Error('timeout'); });
  assert.equal(failing.data.androidTv.tag, 'android-tv-v0.1.4-beta.1');
  assert.match(failing.report.androidTv.skipped[0], /unreadable: timeout/);
});

test('one stream can update while the other has nothing complete', async () => {
  const result = await select([desktop('v0.8.0'), tv('android-tv-v0.2.0', { checksum: null })]);
  assert.deepEqual(tags(result), ['v0.8.0,v0.8.0,v0.8.0', 'android-tv-v0.1.4-beta.1']);
  const other = await select([desktop('v0.8.0', { skip: ['SofaTap-macOS-x64-notarized.zip'] }), tv('android-tv-v0.2.0')]);
  assert.deepEqual(tags(other), ['v0.7.3-beta.1,v0.7.3-beta.1,v0.7.3-beta.1', 'android-tv-v0.2.0']);
});

test('pagination reads every page; HTTP errors, rate limits and timeouts throw', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => desktop(`v0.0.${i}`));
  const seen = [];
  const pages = { 1: page1, 2: [desktop('v0.9.0')] };
  const all = await fetchReleases(async (url) => { const n = Number(new URL(url).searchParams.get('page')); seen.push(n); return { ok: true, status: 200, json: async () => pages[n] ?? [] }; });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(all.length, 101);
  assert.equal((await select(all)).data.platforms[0].tag, 'v0.9.0');
  await assert.rejects(fetchReleases(async () => ({ ok: false, status: 403, json: async () => ({ message: 'API rate limit exceeded' }) })), /403/);
  await assert.rejects(fetchReleases(async () => ({ ok: true, status: 200, json: async () => ({ message: 'oops' }) })), /not a list/);
  await assert.rejects(fetchReleases(async () => { throw new DOMException('timed out', 'TimeoutError'); }), /timed out/);
  // A failure on a later page is not a partial list.
  await assert.rejects(fetchReleases(async (url) => (new URL(url).searchParams.get('page') === '1' ? { ok: true, status: 200, json: async () => page1 } : { ok: false, status: 502 })), /502 on page 2/);
});

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-refresh-'));
after(() => rm(tmp, { recursive: true, force: true }));

test('refresh keeps the snapshot byte for byte on API failure, and replaces it atomically on success', async () => {
  const file = path.join(tmp, 'releases.json');
  const original = `${JSON.stringify(snapshot(), null, 2)}\n`;
  await writeFile(file, original);
  for (const fetchImpl of [async () => ({ ok: false, status: 429 }), async () => { throw new Error('ENOTFOUND api.github.com'); }]) {
    const result = await refresh({ file, fetchImpl, fetchText });
    assert.equal(result.changed, false);
    assert.ok(result.report.error);
    assert.equal(await readFile(file, 'utf8'), original);
  }
  const same = await refresh({ file, fetchImpl: async () => ({ ok: true, status: 200, json: async () => [desktop('v0.7.2-beta.1')] }), fetchText });
  assert.equal(same.changed, false);
  assert.equal(await readFile(file, 'utf8'), original);
  const updated = await refresh({ file, fetchImpl: async () => ({ ok: true, status: 200, json: async () => [desktop('v0.8.0'), tv('android-tv-v0.2.0')] }), fetchText });
  assert.equal(updated.changed, true);
  const written = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([written.platforms[2].tag, written.androidTv.tag], ['v0.8.0', 'android-tv-v0.2.0']);
  assert.deepEqual(await readdir(tmp), ['releases.json'], 'no temporary file left');
});

test('an invalid local snapshot is refused before any request or write', async () => {
  const file = path.join(tmp, 'bad.json');
  const cases = [
    (s) => { s.platforms[2].packages.pop(); },
    (s) => { s.platforms[1].packages = s.platforms[1].packages.filter((k) => k.label !== 'Intel'); },
    (s) => { s.platforms[1].packages[1].label = 'x64'; },
    (s) => { s.platforms[1].tag = 'v0.7.2-beta.1'; },
    (s) => { delete s.androidTv; },
    (s) => { s.platforms[0].packages[0].file = 'SofaTap-Windows-arm64.zip'; },
  ];
  for (const edit of cases) {
    const s = snapshot(); edit(s);
    const text = JSON.stringify(s);
    await writeFile(file, text);
    let called = false;
    await assert.rejects(refresh({ file, fetchImpl: async () => { called = true; return { ok: true, json: async () => [] }; }, fetchText }));
    assert.equal(called, false);
    assert.equal(await readFile(file, 'utf8'), text);
  }
  assert.doesNotThrow(() => validateSnapshot(snapshot()));
});
