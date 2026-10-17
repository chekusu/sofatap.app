// Validation for the desktop receiver downloads in src/releases.json.
// Every link is built from a fixed GitHub repository, so the data file can only
// choose a release tag, a package file name and a guide path inside that repository.

export const REPO_URL = 'https://github.com/chekusu/sofatap';
export const PLATFORM_IDS = ['windows', 'mac', 'linux'];

const FILE_PREFIX = { windows: 'SofaTap-Windows-', mac: 'SofaTap-macOS-', linux: 'SofaTap-Linux-' };
const TAG = /^v\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:alpha|beta|rc)(?:\.\d{1,3})?)?$/;
const FILE = /^SofaTap-[A-Za-z0-9._-]{1,80}\.(?:zip|tar\.gz)$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9 ]{0,23}$/;
const GUIDE = /^(?:[A-Za-z0-9_-]+\/){0,3}[A-Za-z0-9_.-]+\.md$/;
const SHA256 = /^[0-9a-f]{64}$/;
// The Android TV receiver has its own tag stream and one APK named after its version.
export const TV_TAG = /^android-tv-v\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:alpha|beta|rc)(?:\.\d{1,3})?)?$/;
export const DESKTOP_TAG = TAG;
export const tvFile = (tag) => `Sofatap-Android-TV-${tag.replace(/^android-tv-v/, '')}.apk`;

// The exact desktop packages the site offers, in page order: one source for the build, the static
// check and the release refresh. A release that lacks any of them is incomplete.
export const DESKTOP_PACKAGES = {
  windows: [{ label: 'x64', file: 'SofaTap-Windows-x64.zip', arch: 'x64' }],
  mac: [{ label: 'Apple Silicon', file: 'SofaTap-macOS-arm64-notarized.zip', arch: 'arm64' }, { label: 'Intel', file: 'SofaTap-macOS-x64-notarized.zip', arch: 'x64' }],
  linux: [{ label: 'x64', file: 'SofaTap-Linux-x64.tar.gz', arch: 'x64' }, { label: 'ARM64', file: 'SofaTap-Linux-arm64.tar.gz', arch: 'arm64' }],
};

export class ReleaseDataError extends Error {}

function fail(message) {
  throw new ReleaseDataError(message);
}

// The package's processor architecture, from its file name (every package names one).
const ARCH = /-(arm64|x64)[.-]/;

/** A release tag as people read it: v0.7.2-beta.1 → 0.7.2 beta.1. */
export const displayVersion = (tag) => tag.replace(/^(?:android-tv-)?v/, '').replace('-', ' ');

/** Orders release tags: by version number, then a pre-release before its release, then by its number. */
export function compareTags(a, b) {
  const parse = (tag) => {
    const [, x, y, z, pre, n] = tag.match(/^(?:android-tv-)?v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)(?:\.(\d+))?)?$/);
    return [Number(x), Number(y), Number(z), pre ? ['alpha', 'beta', 'rc'].indexOf(pre) : 3, Number(n ?? 0)];
  };
  const [p, q] = [parse(a), parse(b)];
  for (let i = 0; i < p.length; i += 1) if (p[i] !== q[i]) return p[i] - q[i];
  return 0;
}

export const releasePageUrl = (tag) => `${REPO_URL}/releases/tag/${tag}`;
export const packageUrl = (tag, file) => `${REPO_URL}/releases/download/${tag}/${file}`;
export const guideUrl = (guide) => `${REPO_URL}/blob/main/${guide}`;

/** Validates the parsed releases.json and returns platforms in a fixed order. */
export function validateReleases(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.platforms)) fail('releases.json 必须包含 platforms 数组。');
  const byId = new Map();
  for (const platform of data.platforms) {
    const id = platform?.id;
    if (!PLATFORM_IDS.includes(id)) fail(`未知平台：${JSON.stringify(id)}`);
    if (byId.has(id)) fail(`平台重复：${id}`);
    if (typeof platform.tag !== 'string' || !TAG.test(platform.tag)) fail(`${id} 的 tag 格式不正确：${JSON.stringify(platform.tag)}`);
    if (typeof platform.guide !== 'string' || !GUIDE.test(platform.guide) || platform.guide.includes('..')) {
      fail(`${id} 的 guide 必须是仓库内的 .md 路径：${JSON.stringify(platform.guide)}`);
    }
    if (!Array.isArray(platform.packages) || platform.packages.length === 0 || platform.packages.length > 4) {
      fail(`${id} 需要 1–4 个下载包。`);
    }
    const files = new Set();
    for (const pkg of platform.packages) {
      if (typeof pkg?.label !== 'string' || !LABEL.test(pkg.label)) fail(`${id} 的下载包名称不正确：${JSON.stringify(pkg?.label)}`);
      if (typeof pkg.file !== 'string' || !FILE.test(pkg.file) || !pkg.file.startsWith(FILE_PREFIX[id])) {
        fail(`${id} 的文件名不正确：${JSON.stringify(pkg.file)}`);
      }
      if (!ARCH.test(pkg.file)) fail(`${id} 的文件名必须写明架构（arm64 或 x64）：${pkg.file}`);
      if (files.has(pkg.file)) fail(`${id} 的文件重复：${pkg.file}`);
      files.add(pkg.file);
      if (!Number.isInteger(pkg.bytes) || pkg.bytes < 1e6 || pkg.bytes > 2e9) fail(`${id} 的 ${pkg.file} 大小不合理：${pkg.bytes}`);
      if (typeof pkg.sha256 !== 'string' || !SHA256.test(pkg.sha256)) fail(`${id} 的 ${pkg.file} 缺少 SHA-256：${JSON.stringify(pkg.sha256)}`);
    }
    byId.set(id, platform);
  }
  for (const id of PLATFORM_IDS) if (!byId.has(id)) fail(`缺少平台：${id}`);
  // Exactly the expected packages (name, label, architecture), all from one desktop release.
  for (const id of PLATFORM_IDS) {
    const got = byId.get(id).packages.map((k) => `${k.label}|${k.file}`).join(',');
    const want = DESKTOP_PACKAGES[id].map((k) => `${k.label}|${k.file}`).join(',');
    if (got !== want) fail(`${id} 的安装包必须正好是 ${want}：${got}`);
  }
  if (new Set(PLATFORM_IDS.map((id) => byId.get(id).tag)).size !== 1) fail('三个平台必须来自同一个电脑端发行版 tag。');
  return PLATFORM_IDS.map((id) => {
    const p = byId.get(id);
    return {
      id,
      tag: p.tag,
      prerelease: p.tag.includes('-'),
      releaseUrl: releasePageUrl(p.tag),
      guideUrl: guideUrl(p.guide),
      packages: p.packages.map((pkg) => ({
        label: pkg.label,
        file: pkg.file,
        arch: pkg.file.match(ARCH)[1],
        url: packageUrl(p.tag, pkg.file),
        sha256: pkg.sha256,
        size: `${Math.round(pkg.bytes / 1e6)} MB`,
        ext: pkg.file.endsWith('.tar.gz') ? '.tar.gz' : '.zip',
      })),
    };
  });
}

/** Validates the Android TV entry of releases.json: its own tag stream and the one APK of that tag. */
export function validateAndroidTv(data) {
  const tv = data?.androidTv;
  if (!tv || typeof tv !== 'object') fail('releases.json 缺少 androidTv。');
  if (typeof tv.tag !== 'string' || !TV_TAG.test(tv.tag)) fail(`androidTv 的 tag 格式不正确：${JSON.stringify(tv.tag)}`);
  if (tv.file !== tvFile(tv.tag)) fail(`androidTv 的文件名应为 ${tvFile(tv.tag)}：${JSON.stringify(tv.file)}`);
  if (!Number.isInteger(tv.bytes) || tv.bytes < 1e6 || tv.bytes > 5e8) fail(`androidTv 的大小不合理：${tv.bytes}`);
  if (typeof tv.sha256 !== 'string' || !SHA256.test(tv.sha256)) fail('androidTv 缺少 SHA-256。');
  return {
    id: 'androidtv',
    tag: tv.tag,
    file: tv.file,
    sha256: tv.sha256,
    releaseUrl: releasePageUrl(tv.tag),
    url: packageUrl(tv.tag, tv.file),
    size: `${(tv.bytes / 1e6).toFixed(1)} MB`,
  };
}

/** True when an https URL is one of the product repository links the site may use. */
export function isRepoLink(href) {
  if (href === REPO_URL || href === `${REPO_URL}/releases` || href === `${REPO_URL}/issues` || href === `${REPO_URL}/issues/new`
    || href === `${REPO_URL}/blob/main/LICENSE`) return true;
  const rest = href.startsWith(`${REPO_URL}/`) ? href.slice(REPO_URL.length) : null;
  if (rest === null) return false;
  const tag = '(v\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?:-(?:alpha|beta|rc)(?:\\.\\d{1,3})?)?)';
  return new RegExp(`^/releases/tag/${tag}$`).test(rest)
    || new RegExp(`^/releases/download/${tag}/SofaTap-[A-Za-z0-9._-]{1,80}\\.(?:zip|tar\\.gz)$`).test(rest)
    || new RegExp(`^/releases/tag/android-tv-${tag}$`).test(rest)
    || new RegExp(`^/releases/download/android-tv-${tag}/Sofatap-Android-TV-\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?:-(?:alpha|beta|rc)(?:\\.\\d{1,3})?)?\\.apk$`).test(rest)
    || (/^\/blob\/(?:main|[0-9a-f]{40})\/(?:[A-Za-z0-9_-]+\/){0,3}[A-Za-z0-9_.-]+\.md$/.test(rest) && !rest.includes('..'));
}
