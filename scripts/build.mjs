// Builds the static site into dist/ (or --out <dir>) from src/ and site.config.json.
// Usage: node scripts/build.mjs [--config <file>] [--out <dir>]
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DownloadConfigError, downloadCopy, validateDownloadConfig } from './download-config.mjs';

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

const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 14 14 6M8 6h6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOCK = '<svg class="get-app__clock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.4l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export function renderMobileEntry({ kind, url }) {
  const copy = downloadCopy(kind);
  const meta = '          <p class="get-app__meta">iPhone App · 需要 iOS 17 或更高版本</p>';
  const body = kind === 'unavailable'
    ? `          <p class="get-app__pending">${CLOCK}<span>${copy.action}</span></p>`
    : `          <a class="get-app__link" href="${escapeHtml(url)}">${ARROW}<span>${copy.action}</span></a>`;
  return `        <div class="get-app" id="get-app" data-kind="${kind}">\n${body}\n${meta}\n        </div>`;
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

export async function build({ config: configPath, out }) {
  // Validate everything before touching the output directory.
  out = await resolveSafeOutDir(out, configPath);
  const raw = await readFile(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new DownloadConfigError(`无法解析 ${path.basename(configPath)}：${error.message}`);
  }
  const download = validateDownloadConfig(parsed);
  const copy = downloadCopy(download.kind);

  const [template, styles, script] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, 'styles.css'), 'utf8'),
    readFile(path.join(SRC, 'main.js'), 'utf8'),
  ]);

  const replacements = {
    MOBILE_ENTRY: renderMobileEntry(download),
    IPHONE_STATUS: copy.status,
    IPHONE_STATE: download.kind === 'unavailable' ? 'soon' : 'available',
    RECEIVER_NOTE: copy.receiverNote,
    STYLES_HASH: shortHash(styles),
    SCRIPT_HASH: shortHash(script),
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in replacements)) throw new Error(`模板占位符未定义：${match}`);
    return replacements[key];
  });

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all([
    writeFile(path.join(out, MARKER), 'Generated by scripts/build.mjs; safe to delete.\n'),
    writeFile(path.join(out, 'index.html'), html),
    writeFile(path.join(out, 'styles.css'), styles),
    writeFile(path.join(out, 'main.js'), script),
    cp(path.join(SRC, 'assets'), path.join(out, 'assets'), { recursive: true }),
  ]);
  return { out, download };
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
