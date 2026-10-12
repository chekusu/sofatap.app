// Builds the static site into dist/ (or --out <dir>) from src/ and site.config.json:
// one page per language in scripts/locales.mjs (English at index.html, the others in
// their own directories), from one template and src/i18n/*.json.
// Usage: node scripts/build.mjs [--config <file>] [--out <dir>] [--media <dir>]
//   --media  a directory with the exported narrated videos (see tools/film/README.md). When
//            given, they are copied into media/ with one WebVTT subtitle file per language and
//            each page plays its own language's video. Without it the site has no video section.
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DownloadConfigError, downloadCopy, validateDownloadConfig } from './download-config.mjs';
import { LANGS, LOCALES, hrefBetween, locale, mediaTag } from './locales.mjs';
import { ReleaseDataError, validateReleases } from './releases.mjs';
import { loadCues, toVtt } from './captions.mjs';
import { renderDemoTiles } from './demo-art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

function parseArgs(argv) {
  const args = { config: path.join(ROOT, 'site.config.json'), out: DEFAULT_OUT, media: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === '--config' || flag === '--out' || flag === '--media') && value) {
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

/**
 * The pages that are built, one per language: English at the root, the others in their
 * directories. `links` maps every language (including this one) to its relative URL.
 */
export const PAGES = LOCALES.map((l) => ({
  lang: l.lang,
  dir: l.dir,
  root: l.dir ? '../' : '',
  rtl: Boolean(l.rtl),
  links: Object.fromEntries(LOCALES.map((o) => [o.lang, hrefBetween(l.lang, o.lang)])),
}));
// Keys that may be empty in one language (for example the Chinese nickname).
const OPTIONAL_KEYS = new Set(['brand.nickname', 'footer.nickname']);

/** <link rel="alternate"> for every language, plus x-default (English). */
export function renderAlternates(page) {
  const lines = LOCALES.map((l) => `  <link rel="alternate" hreflang="${l.lang}" href="${page.links[l.lang]}">`);
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${page.links.en}">`);
  return lines.join('\n');
}

/** The language menu: real links with native names, the current page marked. */
export function renderLangLinks(page) {
  return LOCALES.map((l) => {
    const current = l.lang === page.lang ? ' aria-current="page"' : '';
    const dir = l.rtl ? ' dir="rtl"' : '';
    return `          <li><a href="${page.links[l.lang]}" hreflang="${l.lang}" lang="${l.lang}"${dir}${current}>${l.name}</a></li>`;
  }).join('\n');
}

// Strings the demo script needs at run time; the build embeds them as JSON.
const DEMO_COPY_KEYS = (strings) => Object.keys(strings).filter((k) => k.startsWith('demo.'));
export function renderDemoCopy(strings) {
  const copy = Object.fromEntries(DEMO_COPY_KEYS(strings).map((k) => [k, strings[k].replace(/<[^>]+>/g, '')]));
  // Safe inside <script type="application/json">: no '<' can close the element.
  return JSON.stringify(copy).replace(/</g, '\\u003c');
}

// Media files the --media directory must provide, all copied to media/: one narrated video
// per language (the page plays its own language) and a poster. Optional timing.json holds the
// measured caption times per language ({ "<lang>": [{ start, end }, …] }) from tools/film/voice.mjs.
export const MEDIA_POSTER = 'sofatap-demo-poster.jpg';
export const MEDIA_TIMING = 'timing.json';
export const mediaVideoFor = (lang) => `sofatap-demo-${mediaTag(lang)}.mp4`;
export const mediaVttFor = (lang) => `sofatap-demo.${mediaTag(lang)}.vtt`;
const MEDIA_MAX_BYTES = 64 * 1024 * 1024;

/** Checks the exported media files and returns their sizes, or throws before anything is written. */
export async function validateMedia(dir) {
  const files = [MEDIA_POSTER, ...LANGS.map(mediaVideoFor)];
  const sizes = {};
  for (const name of files) {
    const file = path.join(dir, name);
    let info;
    try { info = await lstat(file); } catch { throw new Error(`媒体目录缺少 ${name}`); }
    if (!info.isFile()) throw new Error(`媒体文件 ${name} 必须是普通文件（不能是符号链接或目录）`);
    if (info.size < 1000 || info.size > MEDIA_MAX_BYTES) throw new Error(`媒体文件 ${name} 大小不合理：${info.size}`);
    const head = (await readFile(file)).subarray(0, 12);
    const ok = name.endsWith('.jpg') ? head[0] === 0xff && head[1] === 0xd8 : head.subarray(4, 8).toString('latin1') === 'ftyp';
    if (!ok) throw new Error(`媒体文件 ${name} 的格式不正确`);
    sizes[name] = info.size;
  }
  let timing = null;
  try { timing = JSON.parse(await readFile(path.join(dir, MEDIA_TIMING), 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`无法读取 ${MEDIA_TIMING}：${error.message}`);
  }
  return { sizes, timing };
}

/**
 * The video section: the page's own narrated video with its own captions, on by default.
 * It is for watching only: no download links.
 */
export function renderVideoSection(page, strings) {
  const m = (name) => `${page.root}media/${name}`;
  // Each language's video is timed to its own narration, so its captions only fit that video;
  // the language menu switches video and captions together.
  const own = locale(page.lang);
  const tracks = [`          <track kind="subtitles" srclang="${own.lang}" label="${own.name}" src="${m(mediaVttFor(own.lang))}" default>`];
  return [
    '',
    '    <section class="section video" id="video" aria-labelledby="video-title">',
    '      <div class="section__inner">',
    `        <h2 class="section-title" id="video-title">${strings['video.title']}</h2>`,
    `        <p class="section-lead">${strings['video.lead']}</p>`,
    `        <video class="video__player" controls controlslist="nodownload" preload="metadata" playsinline width="1920" height="1080" poster="${m(MEDIA_POSTER)}">`,
    `          <source src="${m(mediaVideoFor(page.lang))}" type="video/mp4">`,
    ...tracks,
    `          <p>${strings['video.fallback']}</p>`,
    '        </video>',
    '      </div>',
    '    </section>',
  ].join('\n');
}

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
      `                <a class="pkg" href="${escapeHtml(pkg.url)}">${DOWNLOAD}<span class="pkg__label"><span class="visually-hidden">${fill(strings['dl.for'], { platform: name })}: </span><bdi>${escapeHtml(pkg.label)}</bdi></span><span class="pkg__meta" dir="ltr">${pkg.size} · ${pkg.ext}</span></a>`,
      '              </li>',
    ].join('\n')).join('\n');
    return [
      `          <article class="platform" id="platform-${p.id}" aria-labelledby="platform-${p.id}-title">`,
      '            <div class="platform__head">',
      `              <h3 id="platform-${p.id}-title">${name}</h3>`,
      `              <span class="tag" dir="ltr">${escapeHtml(p.tag)}</span>`,
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

/**
 * The output directory is deleted before writing, so the media source must never be
 * inside it (or contain it). Compared on real paths, so symlinked aliases are caught too.
 */
export async function refuseMediaOverlap(media, out) {
  const [m, o] = await Promise.all([realPathLoose(path.resolve(media)), realPathLoose(path.resolve(out))]);
  if (isWithin(m, o) || isWithin(o, m)) {
    throw new Error(`拒绝使用媒体目录 ${path.resolve(media)}：它与输出目录 ${path.resolve(out)} 重叠，构建会先清空输出目录。请把导出的视频放在输出目录之外。`);
  }
}

async function readJson(file, ErrorType = Error) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new ErrorType(`无法读取 ${path.basename(file)}：${error.message}`);
  }
}

export async function build({ config: configPath, out, media = null }) {
  // Validate everything before touching the output directory.
  out = await resolveSafeOutDir(out, configPath);
  if (media) await refuseMediaOverlap(media, out);
  const mediaInfo = media ? await validateMedia(path.resolve(media)) : null;
  const mediaSizes = mediaInfo?.sizes ?? null;
  const download = validateDownloadConfig(await readJson(configPath, DownloadConfigError));
  const platforms = validateReleases(await readJson(path.join(SRC, 'releases.json'), ReleaseDataError));
  const tables = Object.fromEntries(await Promise.all(
    LANGS.map(async (lang) => [lang, await readJson(path.join(SRC, 'i18n', `${lang}.json`))]),
  ));
  validateStrings(tables);

  const [template, styles, script, core, cues] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, 'styles.css'), 'utf8'),
    readFile(path.join(SRC, 'main.js'), 'utf8'),
    readFile(path.join(SRC, 'demo-core.js'), 'utf8'),
    loadCues(),
  ]);
  const vtts = LANGS.map((lang) => ({ file: mediaVttFor(lang), text: toVtt(tables[lang], cues, mediaInfo?.timing?.[lang] ?? null) }));

  const pages = PAGES.map((page) => {
    const strings = tables[page.lang];
    const copy = downloadCopy(download.kind, page.lang);
    const html = renderPage(template, strings, {
      LANG: page.lang,
      DIR: page.rtl ? 'rtl' : 'ltr',
      ROOT: page.root,
      ALTERNATES: renderAlternates(page),
      LANG_SHORT: locale(page.lang).short,
      LANG_LINKS: renderLangLinks(page),
      DEMO_TILES: renderDemoTiles(strings),
      DEMO_COPY: renderDemoCopy(strings),
      VIDEO_SECTION: mediaSizes ? renderVideoSection(page, strings) : '',
      MOBILE_ENTRY: renderMobileEntry(download, page.lang),
      IPHONE_STATUS: copy.status,
      IPHONE_NOTE: copy.note,
      IPHONE_STATE: download.kind === 'unavailable' ? 'unavailable' : 'available',
      DESKTOP_DOWNLOADS: renderDesktopDownloads(platforms, strings),
      STYLES_HASH: shortHash(styles),
      SCRIPT_HASH: shortHash(script),
      CORE_HASH: shortHash(core),
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
    writeFile(path.join(out, 'demo-core.js'), core),
    cp(path.join(SRC, 'assets'), path.join(out, 'assets'), { recursive: true }),
  ]);
  if (mediaSizes) {
    await mkdir(path.join(out, 'media'));
    await Promise.all([
      ...Object.keys(mediaSizes).map((name) => cp(path.join(path.resolve(media), name), path.join(out, 'media', name))),
      ...vtts.map((v) => writeFile(path.join(out, 'media', v.file), v.text)),
    ]);
  }
  return { out, download, media: Boolean(mediaSizes), pages: pages.map((p) => p.file) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await build(parseArgs(process.argv.slice(2)));
    const rel = path.relative(process.cwd(), result.out) || '.';
    console.log(`已构建 ${rel}/（${result.pages.length} 种语言；手机下载入口：${result.download.kind}${result.download.url ? ` → ${result.download.url}` : ''}；演示视频：${result.media ? '已包含' : '未包含'}）`);
  } catch (error) {
    console.error(`构建失败：${error.message}`);
    process.exitCode = 1;
  }
}
