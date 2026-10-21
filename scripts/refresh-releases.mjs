// Refreshes src/releases.json from the public GitHub releases of the product repository.
// It runs at build/publish time only (npm run release:refresh, or npm run build:publish); it is not
// a live scheduler, and visitors' browsers never call the GitHub API. The ordinary build stays
// offline and uses the committed snapshot.
//
// The desktop receiver (tags v1.2.3[-beta.N]), the Android TV receiver (tags
// android-tv-v1.2.3[-beta.N]) and the Android phone/tablet controller (tags
// android-controller-v1.2.3[-beta.N]) are separate streams, each chosen on its own:
//  - every release page is read (paginated); drafts are ignored, betas are allowed;
//  - candidates are ordered by version number (never by GitHub's list order, dates or /latest);
//  - a release counts only when every expected binary is uploaded, its link is the fixed GitHub
//    download URL for that tag and file, and a published checksum file names that exact file with a
//    64-hex SHA-256 (matching GitHub's own asset digest when it reports one). Source archives and
//    any other asset are never used;
//  - the newest complete release wins, but never one older than the snapshot (no silent rollback).
// On any network error, timeout, rate limit or malformed response, every stream keeps its last
// known-good snapshot; a stream whose newer release is incomplete keeps its snapshot too.
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROLLER_TAG, DESKTOP_TAG, TV_TAG, compareTags, controllerFile, packageUrl, tvFile, validateAndroidController, validateAndroidTv, validateReleases } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API_URL = 'https://api.github.com/repos/chekusu/sofatap/releases';
const PER_PAGE = 100;
const MAX_PAGES = 10;

/** Every release, page by page. Throws on any HTTP, network, timeout or shape problem. */
export async function fetchReleases(fetchImpl = fetch, { timeout = 15000 } = {}) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchImpl(`${API_URL}?per_page=${PER_PAGE}&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'sofatap-website-release-refresh' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} on page ${page}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error(`GitHub API page ${page} is not a list`);
    all.push(...items);
    if (items.length < PER_PAGE) return all;
  }
  throw new Error(`more than ${MAX_PAGES * PER_PAGE} releases; refusing a partial list`);
}

/** The SHA-256 a checksum file gives for exactly `file` (sha256sum format), or null. */
export function checksumFor(text, file) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{64}) [ *]?(.+)$/);
    if (m && m[2] === file) return m[1].toLowerCase();
  }
  return null;
}

// An uploaded asset of `release` named `name` at its fixed download URL, or null.
function assetOf(release, name) {
  if (!Array.isArray(release.assets)) return null;
  const found = release.assets.filter((a) => a?.name === name);
  if (found.length !== 1) return null;
  const a = found[0];
  if (a.state !== 'uploaded' || a.browser_download_url !== packageUrl(release.tag_name, name)) return null;
  if (!Number.isInteger(a.size) || a.size <= 0) return null;
  return a;
}

const digestOf = (asset) => (typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(asset.digest) ? asset.digest.slice(7) : null);

// { bytes, sha256 } for a verified binary of the release, or a reason string.
async function verified(release, file, checksumNames, fetchText) {
  const asset = assetOf(release, file);
  if (!asset) return `missing or malformed asset ${file}`;
  for (const name of checksumNames) {
    const sums = assetOf(release, name);
    if (!sums) continue;
    let text;
    try { text = await fetchText(sums.browser_download_url); } catch (error) { return `checksum ${name} unreadable: ${error.message}`; }
    const sha256 = checksumFor(text, file);
    if (!sha256) continue;
    const digest = digestOf(asset);
    if (digest && digest !== sha256) return `checksum mismatch for ${file}`;
    return { bytes: asset.size, sha256 };
  }
  return `no checksum names ${file}`;
}

/**
 * The last known-good snapshot: exactly the five desktop packages at one tag (validateReleases,
 * which the build and the static check use too), and a valid Android TV entry.
 */
export function validateSnapshot(snapshot) {
  validateReleases(snapshot);
  validateAndroidTv(snapshot);
  validateAndroidController(snapshot);
  return snapshot;
}

// The single-APK Android streams: the key in releases.json, its tags, its APK name and validator.
const APK_STREAMS = [
  { key: 'androidTv', tags: TV_TAG, fileOf: tvFile, validate: validateAndroidTv },
  { key: 'androidController', tags: CONTROLLER_TAG, fileOf: controllerFile, validate: validateAndroidController },
];

/**
 * Chooses each stream's release from the API list. `snapshot` is the current releases.json; the
 * result is the new data (the snapshot's guides and labels kept) and a per-stream report.
 */
export async function selectReleases(releases, snapshot, fetchText) {
  const report = {};
  const pick = async (stream, tagPattern, current, check) => {
    const tags = [...new Map(releases.filter((r) => r && r.draft === false && typeof r.tag_name === 'string' && tagPattern.test(r.tag_name))
      .map((r) => [r.tag_name, r])).values()].sort((a, b) => compareTags(b.tag_name, a.tag_name));
    const skipped = [];
    for (const release of tags) {
      if (compareTags(release.tag_name, current) <= 0) break;
      let result;
      // A malformed release or one that fails validation is a rejected candidate, never a crash.
      try { result = await check(release); } catch (error) { result = `invalid: ${error.message}`; }
      if (typeof result === 'string') { skipped.push(`${release.tag_name}: ${result}`); continue; }
      report[stream] = { decision: 'updated', from: current, to: release.tag_name, skipped };
      return result;
    }
    report[stream] = { decision: 'kept', tag: current, skipped };
    return null;
  };

  validateSnapshot(snapshot);
  if (!Array.isArray(releases)) releases = [];
  const data = structuredClone(snapshot);
  const desktopTag = data.platforms[0].tag;
  const desktop = await pick('desktop', DESKTOP_TAG, desktopTag, async (release) => {
    const out = [];
    for (const platform of data.platforms) {
      const packages = [];
      for (const pkg of platform.packages) {
        const v = await verified(release, pkg.file, [`${pkg.file}.sha256`], fetchText);
        if (typeof v === 'string') return v;
        packages.push({ ...pkg, bytes: v.bytes, sha256: v.sha256 });
      }
      out.push({ ...platform, tag: release.tag_name, packages });
    }
    validateReleases({ ...data, platforms: out });
    return out;
  });
  if (desktop) data.platforms = desktop;

  for (const stream of APK_STREAMS) {
    const entry = await pick(stream.key, stream.tags, data[stream.key].tag, async (release) => {
      const file = stream.fileOf(release.tag_name);
      // Releases have named their checksum file differently; any of these, naming the exact APK.
      const v = await verified(release, file, [`${file}.sha256`, 'SHA256SUMS.txt', 'SHA256SUMS'], fetchText);
      if (typeof v === 'string') return v;
      const next = { tag: release.tag_name, file, bytes: v.bytes, sha256: v.sha256 };
      stream.validate({ [stream.key]: next });
      return next;
    });
    if (entry) data[stream.key] = entry;
  }

  validateSnapshot(data);
  return { data, report };
}

async function fetchTextDefault(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 4096) throw new Error('checksum file too large');
  return text;
}

/** Reads the snapshot, refreshes it, writes it back only when a stream changed. Never throws on GitHub problems. */
export async function refresh({ file = path.join(ROOT, 'src', 'releases.json'), fetchImpl = fetch, fetchText = fetchTextDefault } = {}) {
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  validateSnapshot(snapshot);
  let releases;
  try {
    releases = await fetchReleases(fetchImpl);
  } catch (error) {
    const kept = (tag) => ({ decision: 'kept', tag });
    return { changed: false, report: { error: error.message, desktop: kept(snapshot.platforms[0].tag), androidTv: kept(snapshot.androidTv.tag), androidController: kept(snapshot.androidController.tag) } };
  }
  const { data, report } = await selectReleases(releases, snapshot, fetchText);
  const changed = JSON.stringify(data) !== JSON.stringify(snapshot);
  if (changed) {
    // Same-directory temporary file and rename: an interruption never truncates the snapshot.
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tmp, file);
  }
  return { changed, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await refresh();
  console.log(JSON.stringify(result, null, 2));
  if (result.report.error) console.warn(`未能读取 GitHub 发行版，保留现有 src/releases.json：${result.report.error}`);
}
