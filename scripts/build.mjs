// Builds the static site into dist/ (or --out <dir>) from src/ and site.config.json:
// English at index.html and Chinese at zh/index.html, from one template and src/i18n/*.json.
// Usage: node scripts/build.mjs [--config <file>] [--out <dir>]
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DownloadConfigError, LANGS, downloadCopy, validateDownloadConfig } from './download-config.mjs';
import { ReleaseDataError, validateReleases } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

function parseArgs(argv) {
  const args = { config: path.join(ROOT, 'site.config.json'), out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === '--config' || flag === '--out') && value) {
      args[flag.slice(2)] = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`未知参数：${flag}`);
    }
  }
  return args;
}

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const shortHash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 14 14 6M8 6h6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOCK = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.4l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const DOWNLOAD = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 3v9m-4-4 4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The pages that are built: English at the root, Chinese in zh/. */
export const PAGES = [
  { lang: 'en', dir: '', root: '', alt: { lang: 'zh-CN', href: 'zh/' } },
  { lang: 'zh-CN', dir: 'zh', root: '../', alt: { lang: 'en', href: '../' } },
];
// Keys that may be empty in one language (for example the Chinese nickname).
const OPTIONAL_KEYS = new Set(['brand.nickname', 'footer.nickname']);

export function renderMobileEntry({ kind, url }, lang = 'en') {
  const copy = downloadCopy(kind, lang);
  const meta = `          <p class="get-app__meta">${copy.meta}</p>`;
  const body = kind === 'unavailable'
    ? `          <p class="get-app__pending">${CLOCK}<span>${copy.action}</span></p>`
    : `          <a class="get-app__link" href="${escapeHtml(url)}">${ARROW}<span>${copy.action}</span></a>`;
  return `        <div class="get-app" id="get-app" data-kind="${kind}">\n${body}\n${meta}\n        </div>`;
}

export function renderDesktopDownloads(platforms, strings) {
  return platforms.map((p) => {
    const name = strings[`platform.${p.id}.name`];
    const packages = p.packages.map((pkg) => [
      '              <li>',
      `                <a class="pkg" href="${escapeHtml(pkg.url)}">${DOWNLOAD}<span class="pkg__label"><span class="visually-hidden">${fill(strings['dl.for'], { platform: name })}: </span>${escapeHtml(pkg.label)}</span><span class="pkg__meta">${pkg.size} · ${pkg.ext}</span></a>`,
      '              </li>',
    ].join('\n')).join('\n');
    return [
      `          <article class="platform" id="platform-${p.id}" aria-labelledby="platform-${p.id}-title">`,
      '            <div class="platform__head">',
      `              <h3 id="platform-${p.id}-title">${name}</h3>`,
      `              <span class="tag">${escapeHtml(p.tag)}</span>`,
      '            </div>',
      `            <p class="platform__req">${strings[`platform.${p.id}.req`]}</p>`,
      '            <ul class="pkgs">',
      packages,
      '            </ul>',
      `            <p class="platform__note">${strings[`platform.${p.id}.note`]}</p>`,
      `            <p class="platform__links"><a href="${escapeHtml(p.guideUrl)}">${fill(strings['dl.guide'], { platform: name })}</a> <a href="${escapeHtml(p.releaseUrl)}">${fill(strings['dl.notes'], { tag: escapeHtml(p.tag) })}</a></p>`,
      '          </article>',
    ].join('\n');
  }).join('\n');
}

/** Checks that every language has the same keys, all non-empty strings. */
export function validateStrings(tables) {
  const [first, ...rest] = Object.keys(tables);
  const keys = Object.keys(tables[first]).sort();
  for (const lang of rest) {
    const other = Object.keys(tables[lang]).sort();
    const missing = keys.filter((k) => !other.includes(k));
    const extra = other.filter((k) => !keys.includes(k));
    if (missing.length || extra.length) {
      throw new Error(`语言文件 ${lang} 与 ${first} 的键不一致：缺少 ${missing.join(', ') || '无'}；多出 ${extra.join(', ') || '无'}`);
    }
  }
  for (const [lang, table] of Object.entries(tables)) {
    for (const [key, value] of Object.entries(table)) {
      if (typeof value !== 'string') throw new Error(`${lang}:${key} 必须是字符串`);
      if (!value.trim() && !OPTIONAL_KEYS.has(key)) throw new Error(`${lang}:${key} 不能为空`);
      if (/<script|\son\w+=|javascript:/i.test(value)) throw new Error(`${lang}:${key} 含不允许的标记`);
    }
  }
}

export function renderPage(template, strings, replacements) {
  return template.replace(/\{\{(?:(t|a):([\w.]+)|([A-Z_]+))\}\}/g, (match, mode, key, name) => {
    if (name) {
      if (!(name in replacements)) throw new Error(`模板占位符未定义：${match}`);
      return replacements[name];
    }
    if (!(key in strings)) throw new Error(`缺少文案：${key}`);
    return mode === 'a' ? escapeHtml(strings[key].replace(/<[^>]+>/g, '')) : strings[key];
  });
}

const MARKER = '.sofatap-build';
const DEFAULT_OUT = path.join(ROOT, 'dist');

const isWithin = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

// Resolves symlinks in the deepest existing part of a path.
async function realPathLoose(target) {
  let existing = target;
  const rest = [];
  for (;;) {
    try {
      return path.join(await realpath(existing), ...rest);
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return target;
      rest.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/**
 * Refuses output directories that the build must never delete: the repository
 * or any of its ancestors, anything inside the repository other than dist/,
 * the config file's location, symlinks, and existing non-empty directories
 * that were not created by this build.
 */
export async function resolveSafeOutDir(out, configPath) {
  const lexical = path.resolve(out);
  const [real, root, defaultOut, config] = await Promise.all([
    realPathLoose(lexical), realPathLoose(ROOT), realPathLoose(DEFAULT_OUT), realPathLoose(path.resolve(configPath)),
  ]);
  const refuse = (why) => { throw new Error(`拒绝使用输出目录 ${lexical}：${why}`); };

  if (isWithin(root, real)) refuse('它是仓库本身或仓库的上级目录。');
  if (isWithin(real, root) && !isWithin(real, defaultOut)) refuse('仓库内只允许输出到 dist/。');
  if (isWithin(config, real)) refuse('它包含配置文件。');

  let info = null;
  try { info = await lstat(lexical); } catch { /* does not exist yet */ }
  if (info?.isSymbolicLink()) refuse('它是符号链接。');
  if (info && !info.isDirectory()) refuse('它不是目录。');
  if (info && real !== defaultOut) {
    const entries = await readdir(lexical);
    if (entries.length > 0 && !entries.includes(MARKER)) refuse('目录不为空，且不是本构建生成的输出。');
  }
  return lexical;
}

async function readJson(file, ErrorType = Error) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new ErrorType(`无法读取 ${path.basename(file)}：${error.message}`);
  }
}

export async function build({ config: configPath, out }) {
  // Validate everything before touching the output directory.
  out = await resolveSafeOutDir(out, configPath);
  const download = validateDownloadConfig(await readJson(configPath, DownloadConfigError));
  const platforms = validateReleases(await readJson(path.join(SRC, 'releases.json'), ReleaseDataError));
  const tables = Object.fromEntries(await Promise.all(
    LANGS.map(async (lang) => [lang, await readJson(path.join(SRC, 'i18n', `${lang}.json`))]),
  ));
  validateStrings(tables);

  const [template, styles, script] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, 'styles.css'), 'utf8'),
    readFile(path.join(SRC, 'main.js'), 'utf8'),
  ]);

  const pages = PAGES.map((page) => {
    const strings = tables[page.lang];
    const copy = downloadCopy(download.kind, page.lang);
    const html = renderPage(template, strings, {
      LANG: page.lang,
      ROOT: page.root,
      ALT_LANG: page.alt.lang,
      ALT_HREF: page.alt.href,
      MOBILE_ENTRY: renderMobileEntry(download, page.lang),
      IPHONE_STATUS: copy.status,
      IPHONE_NOTE: copy.note,
      IPHONE_STATE: download.kind === 'unavailable' ? 'unavailable' : 'available',
      DESKTOP_DOWNLOADS: renderDesktopDownloads(platforms, strings),
      STYLES_HASH: shortHash(styles),
      SCRIPT_HASH: shortHash(script),
    });
    return { file: path.join(page.dir, 'index.html'), html };
  });

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all(PAGES.filter((p) => p.dir).map((p) => mkdir(path.join(out, p.dir), { recursive: true })));
  await Promise.all([
    writeFile(path.join(out, MARKER), 'Generated by scripts/build.mjs; safe to delete.\n'),
    ...pages.map((p) => writeFile(path.join(out, p.file), p.html)),
    writeFile(path.join(out, 'styles.css'), styles),
    writeFile(path.join(out, 'main.js'), script),
    cp(path.join(SRC, 'assets'), path.join(out, 'assets'), { recursive: true }),
  ]);
  return { out, download, pages: pages.map((p) => p.file) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await build(parseArgs(process.argv.slice(2)));
    const rel = path.relative(process.cwd(), result.out) || '.';
    console.log(`已构建 ${rel}/（手机下载入口：${result.download.kind}${result.download.url ? ` → ${result.download.url}` : ''}）`);
  } catch (error) {
    console.error(`构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
