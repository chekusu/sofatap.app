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

export class ReleaseDataError extends Error {}

function fail(message) {
  throw new ReleaseDataError(message);
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
      if (files.has(pkg.file)) fail(`${id} 的文件重复：${pkg.file}`);
      files.add(pkg.file);
      if (!Number.isInteger(pkg.bytes) || pkg.bytes < 1e6 || pkg.bytes > 2e9) fail(`${id} 的 ${pkg.file} 大小不合理：${pkg.bytes}`);
    }
    byId.set(id, platform);
  }
  for (const id of PLATFORM_IDS) if (!byId.has(id)) fail(`缺少平台：${id}`);
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
        url: packageUrl(p.tag, pkg.file),
        size: `${Math.round(pkg.bytes / 1e6)} MB`,
        ext: pkg.file.endsWith('.tar.gz') ? '.tar.gz' : '.zip',
      })),
    };
  });
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
    || (/^\/blob\/(?:main|[0-9a-f]{40})\/(?:[A-Za-z0-9_-]+\/){0,3}[A-Za-z0-9_.-]+\.md$/.test(rest) && !rest.includes('..'));
}
