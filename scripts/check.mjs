// Static checks on the built site: structure, links, assets, copy limits and colour contrast.
// Usage: node scripts/check.mjs [--config <file>]
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_LINKS = new Set([
  'https://github.com/chekusu/sofatap',
  'https://github.com/chekusu/sofatap/releases/tag/v0.1.1-alpha',
]);
const MOBILE_HOSTS = new Set(['testflight.apple.com', 'apps.apple.com']);

// Claims the page must never make, and local paths or release-process wording that must never ship.
const FORBIDDEN = [
  '投屏', '镜像', '串流', '远程桌面', '云端遥控', '支持蓝牙', '蓝牙连接电脑', '自动提交', '自动发送',
  '完全兼容', '全面兼容', '已上架', '免费', '价格', '¥', '￥', '下载量', '好评', '评分', '用户评价',
  '正式版', '稳定版', 'Linux 版下载', 'Mac 版下载',
];
const PRIVATE = [
  /\/home\//, /\/root\//, /\/opt\//, /\/tmp\//, /\/Users\//, /127\.0\.0\.1/, /localhost/i, /deploy/i, /部署/,
];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export async function checkSite(dir) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  const css = await readFile(path.join(dir, 'styles.css'), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

  // Document basics
  if (!/<html lang="zh-CN"/.test(html)) fail('缺少 <html lang="zh-CN">');
  if (!/<meta name="viewport" content="[^"]*width=device-width/.test(html)) fail('缺少 viewport');
  if (!/<title>[^<]+<\/title>/.test(html)) fail('缺少 <title>');
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail('缺少 description');
  if (/\{\{|\}\}/.test(html)) fail('存在未替换的模板占位符');

  // Headings: one h1, no skipped levels
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (levels.filter((l) => l === 1).length !== 1) fail('h1 必须恰好一个');
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) fail(`标题层级跳级：h${levels[i - 1]} → h${l}`); });

  // Unique ids and in-page anchors
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail(`重复 id：${[...new Set(dupes)].join(', ')}`);
  for (const [, ref] of html.matchAll(/(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    ref.split(/\s+/).forEach((id) => { if (!ids.includes(id)) fail(`aria 引用不存在：#${id}`); });
  }

  // Links
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href === '' || href === '#') fail(`空链接或 href="#"`);
    else if (href.startsWith('#')) { if (!ids.includes(href.slice(1))) fail(`锚点不存在：${href}`); }
    else if (href === './') { /* home */ }
    else if (/^https:\/\//.test(href)) {
      const host = new URL(href).hostname;
      if (!ALLOWED_LINKS.has(href) && !MOBILE_HOSTS.has(host)) fail(`未允许的外部链接：${href}`);
    } else fail(`不安全或非预期的链接：${href}`);
  }
  if (/target="_blank"/.test(html)) fail('不应使用 target="_blank"');
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()) fail(`链接没有可读文字：${m[0].slice(0, 80)}`);
  }
  for (const url of ALLOWED_LINKS) if (!hrefs.includes(url)) fail(`缺少必要链接：${url}`);

  // Only one primary mobile download entry, and never a fake one.
  const entries = html.match(/class="get-app"/g) ?? [];
  if (entries.length !== 1) fail(`手机下载入口应恰好一个，当前 ${entries.length}`);
  const mobileLinks = hrefs.filter((h) => /^https:\/\//.test(h) && MOBILE_HOSTS.has(new URL(h).hostname));
  if (mobileLinks.length > 1) fail('手机下载链接出现多次');

  // Relative assets only, and they must exist
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((r) => !/^(https:|#|\.\/$)/.test(r));
  for (const ref of refs) {
    if (/^(\/|[a-z]+:)/i.test(ref)) { fail(`资源必须使用相对路径：${ref}`); continue; }
    const file = path.join(dir, ref.split(/[?#]/)[0]);
    if (!existsSync(file)) fail(`资源不存在：${ref}`);
  }
  if (/url\(\s*['"]?\//.test(css)) fail('CSS 中存在根路径 url()');

  // Images: alt text or hidden; svgs: labelled or hidden
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) fail(`图片缺少 alt：${m[0]}`);
  for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
    const tag = m[0];
    const inHidden = html.lastIndexOf('aria-hidden="true"', m.index) > html.lastIndexOf('</div>', m.index);
    if (!/role="img"/.test(tag) && !/aria-hidden="true"/.test(tag) && !inHidden) fail(`svg 需要 role="img" 或 aria-hidden：${tag.slice(0, 60)}`);
  }

  // Copy limits and private wording
  for (const word of FORBIDDEN) if (text.includes(word)) fail(`页面出现不允许的说法：${word}`);
  for (const file of ['index.html', 'styles.css', 'main.js']) {
    const content = await readFile(path.join(dir, file), 'utf8');
    for (const pattern of PRIVATE) if (pattern.test(content)) fail(`${file} 含内部或私有信息：${pattern}`);
  }
  for (const phrase of ['客厅电脑', 'iOS 17', 'alpha', 'Mac 开发中', 'Linux 规划中', '同一个家庭网络']) {
    if (!text.includes(phrase)) fail(`缺少必要说明：${phrase}`);
  }

  // Motion
  if (!/@media \(prefers-reduced-motion: reduce\)/.test(css)) fail('缺少 prefers-reduced-motion: reduce');
  const animated = css.split('@media (prefers-reduced-motion: no-preference)')[0];
  if (/\banimation:/.test(animated)) fail('动画必须放在 prefers-reduced-motion: no-preference 中');

  // Colour contrast of the text/background pairs used by the stylesheet
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
    if (!m) throw new Error(`缺少颜色变量 --${name}`);
    return m[1];
  };
  const pairs = [
    ['text', 'ink', 4.5], ['muted', 'ink', 4.5], ['muted', 'ink-raised', 4.5], ['cream', 'ink', 4.5],
    ['mint', 'ink', 4.5], ['mint', 'ink-raised', 4.5], ['ink', 'mint', 4.5],
    ['on-cream', 'cream', 4.5], ['on-cream-muted', 'cream', 4.5], ['mint', 'ink', 3],
    ['on-cream', 'cream', 3],
  ];
  const results = pairs.map(([fg, bg, min]) => {
    const ratio = contrast(token(fg), token(bg));
    if (ratio < min) fail(`对比度不足：--${fg} 在 --${bg} 上为 ${ratio.toFixed(2)}，需要 ${min}`);
    return `${fg}/${bg} ${ratio.toFixed(2)}`;
  });

  return { problems, contrast: results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const config = argv[0] === '--config' ? path.resolve(argv[1]) : path.join(ROOT, 'site.config.json');
  const out = await mkdtemp(path.join(os.tmpdir(), 'sofatap-check-'));
  try {
    await build({ config, out });
    const { problems, contrast: ratios } = await checkSite(out);
    console.log(`对比度：${ratios.join('，')}`);
    if (problems.length) {
      problems.forEach((p) => console.error(`✗ ${p}`));
      process.exitCode = 1;
    } else {
      console.log('✓ 静态检查全部通过');
    }
  } catch (error) {
    console.error(`检查失败：${error.message}`);
    process.exitCode = 1;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
