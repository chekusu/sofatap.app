// Static checks on the built site (both languages): structure, links, assets,
// image labels, copy limits and colour contrast.
// Usage: node scripts/check.mjs [--config <file>]
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, build } from './build.mjs';
import { REPO_URL, isRepoLink, validateReleases } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_HOSTS = new Set(['testflight.apple.com', 'apps.apple.com']);

// Claims the page must never make. Some product features are future directions or
// unverified; the site must not present them as available.
const FORBIDDEN = {
  common: [/Face ID/i, /\bPIN\b/, /\bCUA\b/, /Sofa\s+Tap/i, /SofaTap(?!\.exe)/, /[¥￥]/, /\$\s?\d/],
  en: [
    /\bmirror/i, /\bstream/i, /remote desktop/i, /supports? Bluetooth|Bluetooth support/i, /\btilt/i, /gyro/i,
    /unlock/i, /lock screen/i, /auto-?submit/i, /all apps|any app\b/i, /\bfree\b/i, /\bpric(e|ing)/i,
    /\brating/i, /testimonial/i, /stable (release|version)/i, /never records|doesn[’']t record|no microphone/i,
    /coming soon/i, /voice command/i, /fully compatible/i,
  ],
  'zh-CN': [
    '投屏', '镜像', '串流', '远程桌面', '云端遥控', '支持蓝牙', '体感', '倾斜', '陀螺仪', '解锁', '锁屏',
    '自动提交', '自动发送', '完全兼容', '全面兼容', '任何应用', /(?<!并非)所有应用都/, '已上架', '免费', '价格',
    '下载量', '好评', '评分', '用户评价', '正式版', '稳定版', '即将', '不录音', '不会录音', '不使用麦克风', '语音指令',
  ],
};
// Facts each language must state.
const REQUIRED = {
  en: ['iOS 17', 'alpha', 'macOS 15', 'Apple Silicon', 'Intel', 'x64', 'ARM64', 'X11', 'Wayland', 'same home network',
    '300 ms', 'Right click', 'Double-tap', 'two fingers', 'Tap Send', 'Enter', 'Illustration', 'Development preview',
    'In development', 'aren’t included yet'],
  'zh-CN': ['iOS 17', 'alpha', 'macOS 15', 'Apple Silicon', 'Intel', 'x64', 'ARM64', 'X11', 'Wayland', '同一个家庭网络',
    '300 毫秒', '右键', '连续双击', '双指', '发送', '回车', '示意图', '开发预览', '开发中', '尚未包含'],
};
// Each labelled image must sit in a figure whose caption carries the right label.
const IMAGE_LABELS = [
  { src: 'living-room', en: /Illustration[\s\S]*AI-generated[\s\S]*not an app screenshot/, 'zh-CN': /示意图[\s\S]*AI 生成[\s\S]*并非应用截图/ },
  { src: 'single-screen', en: /Development preview[\s\S]*simulator[\s\S]*Not a test on a real iPhone/, 'zh-CN': /开发预览[\s\S]*模拟器[\s\S]*并非真机测试/ },
];
const PRIVATE = [
  /\/home\//, /\/root\//, /\/opt\//, /\/tmp\//, /\/Users\//, /127\.0\.0\.1/, /localhost/i, /deploy/i, /部署/,
  /sofatap:\/\/pair/i, /token=/i,
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

const visibleText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

function checkPage(html, page, pageDir, releaseUrls, fail) {
  const text = visibleText(html);
  const lang = page.lang;

  // Document basics
  if (!html.includes(`<html lang="${lang}"`)) fail(`缺少 <html lang="${lang}">`);
  if (!/<meta name="viewport" content="[^"]*width=device-width/.test(html)) fail('缺少 viewport');
  if (!/<title>[^<]*Sofatap[^<]*<\/title>/.test(html)) fail('<title> 缺少 Sofatap');
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail('缺少 description');
  if (/\{\{|\}\}/.test(html)) fail('存在未替换的模板占位符');

  // Headings: one h1, no skipped levels
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (levels.filter((l) => l === 1).length !== 1) fail('h1 必须恰好一个');
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) fail(`标题层级跳级：h${levels[i - 1]} → h${l}`); });

  // Unique ids and references
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail(`重复 id：${[...new Set(dupes)].join(', ')}`);
  for (const [, ref] of html.matchAll(/(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    ref.split(/\s+/).forEach((id) => { if (!ids.includes(id)) fail(`aria 引用不存在：#${id}`); });
  }

  // Links
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href === '' || href === '#') fail('空链接或 href="#"');
    else if (href.startsWith('#')) { if (!ids.includes(href.slice(1))) fail(`锚点不存在：${href}`); }
    else if (href === './' || href === page.alt.href) { /* this page or the other language */ }
    else if (/^https:\/\//.test(href)) {
      if (!isRepoLink(href) && !MOBILE_HOSTS.has(new URL(href).hostname)) fail(`未允许的外部链接：${href}`);
    } else fail(`不安全或非预期的链接：${href}`);
  }
  if (/target="_blank"/.test(html)) fail('不应使用 target="_blank"');
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()) fail(`链接没有可读文字：${m[0].slice(0, 80)}`);
  }
  for (const url of [REPO_URL, `${REPO_URL}/releases`, ...releaseUrls]) {
    if (!hrefs.includes(url)) fail(`缺少必要链接：${url}`);
  }

  // Language switch: a real link to the other page, announced in that language.
  const sw = html.match(/<a class="lang-switch"[^>]*>/)?.[0] ?? '';
  if (!sw.includes(`href="${page.alt.href}"`) || !sw.includes(`hreflang="${page.alt.lang}"`) || !sw.includes(` lang="${page.alt.lang}"`)) {
    fail('语言切换链接缺失或属性不正确');
  }

  // Only one primary mobile download entry, and never a fake one.
  const entries = [...html.matchAll(/<div class="get-app" id="get-app" data-kind="([a-z]+)"/g)];
  if (entries.length !== 1) fail(`手机下载入口应恰好一个，当前 ${entries.length}`);
  const mobileLinks = hrefs.filter((h) => /^https:\/\//.test(h) && MOBILE_HOSTS.has(new URL(h).hostname));
  if (mobileLinks.length > 1) fail('手机下载链接出现多次');
  if (entries[0]?.[1] === 'unavailable') {
    if (mobileLinks.length) fail('未开放状态下不应出现手机下载链接');
    if (/TestFlight|App Store/i.test(text)) fail('未开放状态下不应提到 TestFlight 或 App Store');
  }

  // Relative assets only, inside the site, and they must exist
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .concat([...html.matchAll(/\bsrcset="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0])))
    .filter((r) => !/^(https:|#)/.test(r) && r !== './' && r !== page.alt.href);
  for (const ref of refs) {
    if (/^(\/|[a-z]+:)/i.test(ref)) { fail(`资源必须使用相对路径：${ref}`); continue; }
    const file = path.resolve(pageDir, ref.split(/[?#]/)[0]);
    if (!existsSync(file)) fail(`资源不存在：${ref}`);
  }

  // Images: alt text; svgs: labelled or hidden; product images labelled honestly
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) fail(`图片缺少 alt：${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
    if (!/role="img"/.test(m[0]) && !/aria-hidden="true"/.test(m[0])) {
      const before = html.slice(0, m.index);
      if (before.lastIndexOf('aria-hidden="true"') < before.lastIndexOf('</span>')) fail(`svg 需要 role="img" 或 aria-hidden：${m[0].slice(0, 60)}`);
    }
  }
  const figures = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  for (const rule of IMAGE_LABELS) {
    const total = (html.match(new RegExp(`<img[^>]+src="[^"]*${rule.src}`, 'g')) ?? []).length;
    const labelled = figures.filter((f) => f.includes(rule.src) && rule[lang].test(visibleText(f.match(/<figcaption[\s\S]*?<\/figcaption>/)?.[0] ?? ''))).length;
    if (total === 0) fail(`缺少图片：${rule.src}`);
    if (labelled !== total) fail(`图片 ${rule.src} 必须放在带正确标注的 figure 中`);
  }

  // Copy limits
  for (const rule of [...FORBIDDEN.common, ...FORBIDDEN[lang]]) {
    const hit = typeof rule === 'string' ? text.includes(rule) : rule.test(text);
    if (hit) fail(`页面出现不允许的说法：${rule}`);
  }
  for (const phrase of REQUIRED[lang]) if (!text.includes(phrase)) fail(`缺少必要说明：${phrase}`);
  const devLabel = lang === 'en' ? 'In development' : '开发中';
  if (text.split(devLabel).length - 1 < 2) fail('手势和语音部分都需要“开发中”提示');
}

export async function checkSite(dir) {
  const problems = [];
  const releaseData = JSON.parse(await readFile(path.join(ROOT, 'src', 'releases.json'), 'utf8'));
  const releaseUrls = validateReleases(releaseData).flatMap((p) => [p.releaseUrl, p.guideUrl, ...p.packages.map((k) => k.url)]);

  const pages = [];
  for (const page of PAGES) {
    const pageDir = path.join(dir, page.dir);
    const file = path.join(pageDir, 'index.html');
    if (!existsSync(file)) { problems.push(`缺少页面：${path.join(page.dir, 'index.html')}`); continue; }
    const html = await readFile(file, 'utf8');
    pages.push({ page, html });
    checkPage(html, page, pageDir, releaseUrls, (msg) => problems.push(`[${page.lang}] ${msg}`));
  }

  // Both languages share one structure.
  const shape = (html) => [...html.matchAll(/\sid="([^"]+)"|<(h[1-6]|section|details|figure|img)\b/g)].map((m) => m[1] ?? m[2]).join(' ');
  if (pages.length === 2 && shape(pages[0].html) !== shape(pages[1].html)) problems.push('中英文页面结构不一致');

  // Private paths, credentials and process wording never ship in any file.
  const files = ['styles.css', 'main.js', ...PAGES.map((p) => path.join(p.dir, 'index.html'))];
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    for (const pattern of PRIVATE) if (pattern.test(content)) problems.push(`${file} 含内部或私有信息：${pattern}`);
  }

  // Motion
  const css = await readFile(path.join(dir, 'styles.css'), 'utf8');
  if (!/@media \(prefers-reduced-motion: reduce\)/.test(css)) problems.push('缺少 prefers-reduced-motion: reduce');
  const outsideMotion = css.split('@media (prefers-reduced-motion: no-preference)')[0];
  if (/\banimation:/.test(outsideMotion)) problems.push('动画必须放在 prefers-reduced-motion: no-preference 中');
  const script = await readFile(path.join(dir, 'main.js'), 'utf8');
  if (!script.includes('prefers-reduced-motion: reduce')) problems.push('main.js 的动态效果必须遵守减少动态效果设置');

  // Colour contrast of the text/background pairs used by the stylesheet
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
    if (!m) throw new Error(`缺少颜色变量 --${name}`);
    return m[1];
  };
  const pairs = [
    ['text', 'canvas', 4.5], ['muted', 'canvas', 4.5], ['text', 'surface', 4.5], ['muted', 'surface', 4.5],
    ['muted', 'surface-deep', 4.5], ['mint', 'canvas', 4.5], ['mint', 'surface', 4.5], ['mint', 'surface-deep', 4.5],
    ['mint', 'mint-soft', 4.5], ['on-mint', 'mint', 4.5], ['on-mint-muted', 'mint', 4.5], ['focus', 'canvas', 3],
    ['focus', 'surface', 3], ['border', 'canvas', 1.3],
  ];
  const results = pairs.map(([fg, bg, min]) => {
    const ratio = contrast(token(fg), token(bg));
    if (ratio < min) problems.push(`对比度不足：--${fg} 在 --${bg} 上为 ${ratio.toFixed(2)}，需要 ${min}`);
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
      console.log('✓ 静态检查全部通过（en、zh-CN）');
    }
  } catch (error) {
    console.error(`检查失败：${error.message}`);
    process.exitCode = 1;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
