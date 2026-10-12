// Prepares a reviewed, media-inclusive build for production (Cloudflare Workers Static Assets,
// see wrangler.jsonc). It never builds: it checks that the existing build is complete, copies its
// public files unchanged into .wrangler/production-assets, adds the _headers rules for the two
// shared download files, and confirms every copied file is byte-identical to its source.
// Usage: node scripts/prepare-deploy.mjs [--dist dist]
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, mediaPosterFor, mediaVideoFor, mediaVttFor } from './build.mjs';
import { loadCues } from './captions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEPLOY_DIR = path.join(ROOT, '.wrangler', 'production-assets');
// Build bookkeeping, not part of the site.
const EXCLUDE = new Set(['.sofatap-build']);
// Owner-shared promo files: offered as downloads. The website's own /media/ videos stay inline.
export const EXPORTS = ['sofatap-promo-en.mp4', 'sofatap-promo-zh-cn.mp4'];
export const HEADERS = EXPORTS.map((name) => `/exports/${name}\n  Content-Disposition: attachment; filename="${name}"\n`).join('\n');

async function listFiles(dir, base = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) throw new Error(`拒绝符号链接：${rel}`);
    if (entry.isDirectory()) files.push(...await listFiles(full, base));
    else if (entry.isFile()) files.push(rel);
    else throw new Error(`不支持的文件类型：${rel}`);
  }
  return files.sort();
}

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

/** Checks that a build is the complete, media-inclusive site; returns its public files. */
export async function checkBuild(dist) {
  let info;
  try { info = await lstat(dist); } catch { throw new Error(`没有找到构建目录 ${dist}：请先用 --media 构建并审核网站`); }
  if (!info.isDirectory()) throw new Error(`${dist} 不是目录`);
  const files = (await listFiles(dist)).filter((f) => !EXCLUDE.has(f));
  const have = new Set(files);
  const cues = (await loadCues()).cues.length;
  const problems = [];
  const need = async (rel, check) => {
    if (!have.has(rel)) { problems.push(`缺少 ${rel}`); return; }
    const head = (await readFile(path.join(dist, rel))).subarray(0, 4096);
    const why = check(head);
    if (why) problems.push(`${rel}：${why}`);
  };
  const mp4 = (b) => (b.subarray(4, 8).toString('latin1') === 'ftyp' ? null : '不是 MP4');
  const jpg = (b) => (b[0] === 0xff && b[1] === 0xd8 ? null : '不是 JPEG');
  for (const page of PAGES) {
    const html = `${page.dir ? `${page.dir}/` : ''}index.html`;
    await need(html, () => null);
    await need(`media/${mediaVideoFor(page.lang)}`, mp4);
    await need(`media/${mediaPosterFor(page.lang)}`, jpg);
    const vtt = `media/${mediaVttFor(page.lang)}`;
    if (!have.has(vtt)) problems.push(`缺少 ${vtt}`);
    else {
      const text = await readFile(path.join(dist, vtt), 'utf8');
      const count = (text.match(/ --> /g) ?? []).length;
      if (!text.startsWith('WEBVTT') || count !== cues) problems.push(`${vtt}：应有 ${cues} 条字幕，实际 ${count}`);
    }
    // A page built without --media has no video section: that build is not for release.
    if (have.has(html) && !(await readFile(path.join(dist, html), 'utf8')).includes(`media/${mediaVideoFor(page.lang)}`)) {
      problems.push(`${html} 没有视频区（不是含媒体的构建）`);
    }
  }
  for (const name of EXPORTS) await need(`exports/${name}`, mp4);
  if (have.has('_headers')) problems.push('构建里已有 _headers；生产规则由本脚本写入');
  if (problems.length) throw new Error(`构建不完整，拒绝准备发布（不会自动重新构建）：\n- ${problems.join('\n- ')}`);
  return files;
}

/** Copies the checked build into `out` unchanged, adds _headers, and verifies the copy. */
export async function prepareDeploy({ dist = path.join(ROOT, 'dist'), out = DEPLOY_DIR } = {}) {
  dist = path.resolve(dist);
  out = path.resolve(out);
  const inside = (a, b) => a === b || a.startsWith(b + path.sep);
  if (inside(out, dist) || inside(dist, out)) throw new Error('发布目录不能与构建目录重叠');
  const files = await checkBuild(dist);
  await rm(out, { recursive: true, force: true });
  let bytes = 0;
  for (const rel of files) {
    const to = path.join(out, rel);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(path.join(dist, rel), to);
  }
  await writeFile(path.join(out, '_headers'), HEADERS);
  // Every public file must arrive byte for byte.
  const copied = (await listFiles(out)).filter((f) => f !== '_headers');
  if (copied.join('\n') !== files.join('\n')) throw new Error('复制后的文件列表与构建不一致');
  for (const rel of files) {
    const [a, b] = await Promise.all([sha256(path.join(dist, rel)), sha256(path.join(out, rel))]);
    if (a !== b) throw new Error(`复制后内容不一致：${rel}`);
    bytes += (await lstat(path.join(out, rel))).size;
  }
  return { out, files: files.length, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--dist');
  try {
    const result = await prepareDeploy(i > 0 ? { dist: process.argv[i + 1] } : {});
    console.log(`已准备发布文件：${path.relative(ROOT, result.out)}/（${result.files} 个网站文件，${result.bytes} 字节，与构建逐字节一致；另加 _headers）`);
    console.log('下一步：wrangler deploy');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
