// Static checks on the built site (every language): structure, links, language menu,
// assets, image labels, the demo, copy limits and colour contrast.
// Usage: node scripts/check.mjs [--config <file>] [--media <dir>]
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_KINDS, LEGAL_PAGES, PAGES, build, loadLegalDocuments } from './build.mjs';
import { LOCALES } from './locales.mjs';
import { REPO_URL, isRepoLink, validateReleases } from './releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_HOSTS = new Set(['testflight.apple.com', 'apps.apple.com']);

// Claims the page must never make, in every language. Some product features are future
// directions or unverified; the site must not present them as available.
const FORBIDDEN = {
  common: [/Face ID/i, /\bPIN\b/, /\bCUA\b/, /Sofa\s+Tap/i, /SofaTap(?!\.exe)/, /[¥￥]/, /\$\s?\d/, /\balpha\b/i, /v0\.[34]\.0/],
  en: [
    /\bmirror/i, /\bstream/i, /remote desktop/i, /supports? Bluetooth|Bluetooth support/i, /\btilt/i, /gyro/i,
    /unlock/i, /lock screen/i, /auto-?submit/i, /all apps|any app\b/i, /\bfree\b/i, /\bpric(e|ing)/i,
    /\brating/i, /testimonial/i, /stable (release|version)/i, /never records|doesn[’']t record|no microphone/i,
    /coming soon/i, /voice command/i, /fully compatible/i, /all browsers|every browser|browsers (don’t|do not|can’t)/i,
    /never presses? Enter|doesn’t press Enter/i,
  ],
  'zh-CN': [
    '投屏', '镜像', '串流', '远程桌面', '云端遥控', '支持蓝牙', '体感', '倾斜', '陀螺仪', '解锁', '锁屏',
    '自动提交', '自动发送', '完全兼容', '全面兼容', '任何应用', /(?<!并非)所有应用都/, '已上架', '免费', '价格',
    '下载量', '好评', '评分', '用户评价', '正式版', '稳定版', '即将', '不录音', '不会录音', '不使用麦克风', '语音指令',
  ],
  es: [/duplicaci[oó]n de pantalla|duplicar (la )?pantalla/i, /\bstreaming\b|transmisi[oó]n en vivo/i, /escritorio remoto/i, /desbloque/i,
    /pantalla de bloqueo/i, /\bgratis\b|gratuit/i, /\bprecio/i, /pr[oó]ximamente/i, /versi[oó]n estable/i, /totalmente compatible/i,
    /comandos? de voz/i, /no graba|nunca graba/i, /env[ií]o autom[aá]tico/i],
  fr: [/recopie|mise en miroir|duplication d[’']écran/i, /\bstreaming\b|diffusion en continu/i, /bureau à distance/i, /déverrouill/i,
    /écran de verrouillage/i, /gratuit/i, /\bprix\b|tarif/i, /bientôt disponible|prochainement/i, /version stable/i,
    /entièrement compatible/i, /commandes? vocales?/i, /n[’']enregistre jamais/i, /envoi automatique/i],
  de: [/spiegel/i, /\bstream/i, /Remote[- ]Desktop/i, /entsperr/i, /Sperrbildschirm/i, /kostenlos|gratis/i, /\bPreis/i,
    /demnächst|in Kürze/i, /stabile Version/i, /voll kompatibel|vollständig kompatibel/i, /Sprachbefehl/i, /nimmt nie auf/i, /automatisch abgeschickt/i],
  'pt-BR': [/espelhamento|espelhar/i, /\bstreaming\b|transmiss[aã]o ao vivo/i, /[aá]rea de trabalho remota/i, /desbloque/i,
    /tela de bloqueio/i, /gr[aá]tis|gratuito/i, /\bpre[cç]o/i, /em breve/i, /vers[aã]o est[aá]vel/i, /totalmente compat[ií]vel/i,
    /comandos? de voz/i, /nunca grava/i, /envio autom[aá]tico/i],
  ja: ['ミラーリング', 'ストリーミング', 'リモートデスクトップ', 'ロック解除', 'ロック画面', '無料', '価格', '近日', '安定版', '正式版',
    '完全対応', '完全互換', '音声コマンド', 'すべてのアプリで使え', '録音しません', '自動送信'],
  ko: ['미러링', '스트리밍', '원격 데스크톱', '잠금 해제', '잠금 화면', '무료', '가격', '출시 예정', '곧 출시', '정식 버전', '안정 버전',
    '완벽 호환', '완벽하게 호환', '음성 명령', '모든 앱에서 작동', '녹음하지 않', '자동 제출', '자동으로 제출'],
  ar: ['نسخ الشاشة', 'انعكاس الشاشة', 'البث المباشر', 'سطح المكتب البعيد', 'فتح القفل', 'شاشة القفل', 'مجاني', 'مجانًا', 'السعر',
    'قريبًا', 'إصدار مستقر', 'متوافق تمامًا', 'أوامر صوتية', 'لا يسجّل', 'الإرسال التلقائي'],
  hi: ['मिररिंग', 'स्ट्रीमिंग', 'रिमोट डेस्कटॉप', 'अनलॉक', 'लॉक स्क्रीन', 'मुफ़्त', 'मुफ्त', 'कीमत', 'जल्द आ रहा', 'स्टेबल वर्शन',
    'पूरी तरह संगत', 'वॉइस कमांड', 'रिकॉर्ड नहीं करता', 'अपने-आप सबमिट'],
  ru: [/дублирован|зеркалир/i, /стрим|трансляц/i, /удал[её]нн(ый|ого) рабоч/i, /разблокир/i, /экран блокировки/i, /бесплатн/i,
    /\bцен[аы]\b/i, /скоро появ|в ближайшее время/i, /стабильн(ая|ой) верси/i, /полностью совместим/i, /голосов(ые|ых) команд/i,
    /не записывает/i, /автоматическ(ая|и) отправ/i],
  id: [/mirroring|pencerminan/i, /streaming/i, /desktop jarak jauh|remote desktop/i, /buka kunci/i, /layar kunci/i, /gratis/i,
    /\bharga\b/i, /segera hadir/i, /versi stabil/i, /sepenuhnya kompatibel/i, /perintah suara/i, /tidak pernah merekam/i, /kirim otomatis/i],
};
// Facts every language must state, and the page labels that must be visible.
const REQUIRED_COMMON = ['iOS 17', 'beta', 'macOS 15', 'Apple Silicon', 'Intel', 'x64', 'ARM64', 'X11', 'Wayland', '300', '0.7.1', '1.0 (15)', 'Authenticode',
  'LG webOS', 'Android/Google TV'];
const REQUIRED = {
  en: ['Enter', 'same home network', '300 ms', 'Right click', 'Double-tap', 'two fingers', 'Send the draft', 'many browser and custom controls', 'line break'],
  'zh-CN': ['同一个家庭网络', '300 毫秒', '右键', '连续双击', '双指', '发送', '回车', '许多浏览器和自定义控件', '换行'],
  es: ['Enter', 'misma red doméstica', '300 ms', 'Clic derecho', 'Toca dos veces', 'dos dedos', 'Envía el borrador', 'muchos controles de navegador', 'saltos de línea'],
  fr: ['même réseau domestique', '300 ms', 'Clic droit', 'Toucher deux fois', 'deux doigts', 'Envoyez le brouillon', 'Entrée', 'nombreux contrôles de navigateur', 'retours à la ligne'],
  de: ['Enter', 'demselben Heimnetz', '300 ms', 'Rechtsklick', 'Doppeltippen', 'zwei Fingern', '„Senden“', 'viele Browser- und eigene Steuerelemente', 'Zeilenumbr'],
  'pt-BR': ['Enter', 'mesma rede doméstica', '300 ms', 'Clique direito', 'Toque duplo', 'dois dedos', 'Envie o rascunho', 'muitos controles de navegador', 'quebras de linha'],
  ja: ['Enter', '同じ家庭内ネットワーク', '300 ミリ秒', '右クリック', 'ダブルタップ', '2 本指', '「送信」', '多くのブラウザー', '改行'],
  ko: ['Enter', '같은 홈 네트워크', '300ms', '오른쪽 클릭', '두 번 탭', '두 손가락', '보내기', '많은 브라우저', '줄바꿈'],
  ar: ['Enter', 'الشبكة المنزلية نفسها', '300 مللي ثانية', 'نقرة بالزر الأيمن', 'اضغط مرتين', 'بإصبعين', '«إرسال»', 'كثير من عناصر المتصفحات', 'فواصل الأسطر'],
  hi: ['Enter', 'एक ही होम नेटवर्क', '300 मि.से.', 'राइट क्लिक', 'डबल टैप', 'दो उँगलियों', 'भेजें', 'कई ब्राउज़र', 'नई पंक्ति'],
  ru: ['Enter', 'одной домашней сети', '300 мс', 'Правый клик', 'Коснитесь дважды', 'двумя пальцами', '«Отправить»', 'многие элементы браузеров', 'перенос'],
  id: ['Enter', 'jaringan rumah yang sama', '300 ms', 'Klik kanan', 'Ketuk dua kali', 'dua jari', 'Kirim draf', 'banyak kontrol browser', 'baris baru'],
};
// Owner decision: the marketing site carries no "Simulation", "Development preview" or
// "Illustration" badges in any language (the factual download note still says what the
// published downloads include). These words must not come back as labels.
const BANNED_LABELS = {
  en: ['Simulation', 'Development preview', 'Illustration'], 'zh-CN': ['模拟演示', '开发预览', '示意图'],
  es: ['Simulación', 'Vista previa de desarrollo', 'Ilustración'], fr: ['Simulation', 'Aperçu de développement'],
  de: ['Simulation', 'Entwicklungsvorschau'], 'pt-BR': ['Simulação', 'Prévia de desenvolvimento', 'Ilustração'],
  ja: ['シミュレーション', '開発プレビュー'], ko: ['시뮬레이션', '개발 미리 보기'], ar: ['محاكاة', 'معاينة قيد التطوير'],
  hi: ['सिम्युलेशन', 'डेवलपमेंट प्रीव्यू'], ru: ['Симуляция', 'Предпросмотр разработки'], id: ['Simulasi', 'Pratinjau pengembangan'],
};
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

/** Language menu and alternates: a real link to every language, with hreflang and lang, the current one marked. */
function checkLanguageMenu(html, page, fail) {
  const lang = page.lang;
  const menu = html.match(/<ul class="lang-menu__list">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const menuLinks = [...menu.matchAll(/<a href="([^"]*)" hreflang="([^"]+)" lang="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  if (menuLinks.length !== LOCALES.length) fail(`语言菜单应有 ${LOCALES.length} 个链接，当前 ${menuLinks.length}`);
  for (const l of LOCALES) {
    const link = menuLinks.find((m) => m[2] === l.lang);
    if (!link || link[1] !== page.links[l.lang] || link[3] !== l.lang || link[4] !== l.name) fail(`语言菜单中 ${l.lang} 的链接不正确`);
  }
  if ((menu.match(/aria-current="page"/g) ?? []).length !== 1 || !new RegExp(`hreflang="${page.lang}"[^>]*aria-current="page"`).test(menu)) {
    fail('语言菜单必须标出当前语言');
  }
  for (const l of LOCALES) {
    if (!html.includes(`<link rel="alternate" hreflang="${l.lang}" href="${page.links[l.lang]}">`)) fail(`缺少 hreflang 备用链接：${l.lang}`);
  }
  if (!html.includes(`<link rel="alternate" hreflang="x-default" href="${page.links.en}">`)) fail('缺少 x-default 备用链接');
  const rtl = LOCALES.find((l) => l.lang === lang)?.rtl;
  if (!html.includes(`<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"`)) fail('<html> 的 dir 不正确');

}

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
    else if (href === './' || Object.values(page.links).includes(href)) { /* this page or another language */ }
    else if (href === 'privacy/' || href === 'support/') { /* this language's privacy and support pages */ }
    else if (/^https:\/\//.test(href)) {
      if (!isRepoLink(href) && !MOBILE_HOSTS.has(new URL(href).hostname)) fail(`未允许的外部链接：${href}`);
    } else fail(`不安全或非预期的链接：${href}`);
  }
  if (/target="_blank"/.test(html)) fail('不应使用 target="_blank"');
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    // Readable text, or an image's alt text (the wordmark), names the link.
    const name = m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, '').trim();
    if (!name) fail(`链接没有可读文字：${m[0].slice(0, 80)}`);
  }
  for (const url of [REPO_URL, `${REPO_URL}/releases`, ...releaseUrls, 'privacy/', 'support/']) {
    if (!hrefs.includes(url)) fail(`缺少必要链接：${url}`);
  }

  checkLanguageMenu(html, page, fail);

  // The interactive demo: present, labelled as a simulation, with its strings.
  const demo = html.match(/<figure class="demo"[\s\S]*?<\/figure>/)?.[0] ?? '';
  if (!demo || !demo.includes('class="pad"') || !demo.includes('class="tv"') || !demo.includes('role="status"')) fail('缺少交互演示');
  if (demo && !/class="search__field"[\s\S]*class="composer__draft"[\s\S]*class="phone__key"[\s\S]*class="phone__mic"/.test(demo)) fail('演示缺少搜索框、草稿、键盘按钮或麦克风');
  try {
    const copy = JSON.parse(demo.match(/<script type="application\/json" id="demo-copy">([\s\S]*?)<\/script>/)?.[1] ?? '');
    for (const key of ['demo.s.select', 'demo.s.menu', 'demo.menu.play', 'demo.play', 'demo.stop', 'demo.search', 'demo.search.typed', 'demo.search.spoken', 'demo.compose.send', 'demo.s.sent', 'demo.s.noField']) if (!copy[key]) fail(`演示文案缺少 ${key}`);
  } catch { fail('演示文案 JSON 无法解析'); }

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
    .filter((r) => !/^(https:|#)/.test(r) && r !== './' && !Object.values(page.links).includes(r) && r !== 'privacy/' && r !== 'support/');
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
  if (/class="(?:label|dev-note)\b/.test(html)) fail('页面不应再有标注徽章（label / dev-note）');
  for (const word of BANNED_LABELS[lang] ?? []) if (text.includes(word)) fail(`页面不应出现标注：${word}`);

  // The brand: the fixed-outline wordmark in the header and footer, never re-typeset text.
  const wordmarks = [...html.matchAll(/<img class="(brand__wordmark|site-footer__wordmark)" src="[^"]*assets\/sofatap-wordmark\.svg" alt="Sofatap"/g)];
  if (wordmarks.length !== 2) fail(`页头和页脚都必须使用 Sofatap 文字标志 SVG，当前 ${wordmarks.length} 处`);
  if (/<span class="brand__name">/.test(html)) fail('品牌名不能用普通文字排版');

  // Copy limits. The one FAQ answer about plans may say that manual control is free and that a
  // paid autonomous option is future work (product README roadmap); the rest of the page may not
  // mention prices, and that answer is still held to the common limits.
  const plans = html.match(/<details data-faq="plans">[\s\S]*?<\/details>/g) ?? [];
  if (plans.length !== 1) fail('常见问题中必须恰好有一条关于免费手动控制和未来付费功能的说明');
  const rest = visibleText(html.replace(/<details data-faq="plans">[\s\S]*?<\/details>/g, ' '));
  for (const rule of [...FORBIDDEN.common, ...FORBIDDEN[lang]]) {
    const hit = typeof rule === 'string' ? rest.includes(rule) : rule.test(rest);
    if (hit) fail(`页面出现不允许的说法：${rule}`);
  }
  const plansText = visibleText(plans[0] ?? '');
  for (const rule of FORBIDDEN.common) if (rule.test(plansText)) fail(`付费说明出现不允许的说法：${rule}`);
  if (!REQUIRED[lang] || !FORBIDDEN[lang] || !BANNED_LABELS[lang]) { fail(`没有 ${lang} 的文案检查规则`); return; }
  for (const phrase of [...REQUIRED_COMMON, ...REQUIRED[lang]]) if (!text.includes(phrase)) fail(`缺少必要说明：${phrase}`);

  // The demo video section, when the build included the exported videos: watch only.
  const video = html.match(/<section class="section video"[\s\S]*?<\/section>/)?.[0];
  if (video) {
    const tracks = [...video.matchAll(/<track kind="subtitles" srclang="([^"]+)"[^>]*>/g)];
    // Captions are timed to this language's video, so only its own track belongs here.
    if (tracks.length !== 1 || tracks[0][1] !== lang || !/ default>?/.test(tracks[0][0])) fail('视频只能带本页语言的默认字幕');
    const own = `sofatap-demo-${lang.toLowerCase()}.mp4`;
    if (!new RegExp(`<source src="(?:\\.\\./)?media/${own}" type="video/mp4">`).test(video)) fail(`视频必须播放本页语言的版本：${own}`);
    if (!/controlslist="nodownload"/.test(video)) fail('视频播放器应隐藏下载按钮');
  }
  if (/<a\b[^>]*href="(?:\.\.\/)?media\//.test(html) || /\bdownload\b(?==|>|\s)/.test(html.replace(/controlslist="nodownload"/g, ''))) {
    fail('页面不应提供演示视频或字幕的下载链接');
  }
}

/** The words of a Markdown document as a reader sees them: no markup, link targets or table rules. */
export function markdownWords(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/^\s*\|?[\s|:-]+\|?\s*$/gm, ' ')
    .replace(/^#{1,4}\s+|^\s*(?:- |\d+\. )/gm, ' ')
    .replace(/\*\*|`/g, '')
    .replace(/\|/g, ' ')
    .split(/\s+/).filter(Boolean);
}
const htmlWords = (html) => visibleText(html.replace(/<\/?(?:a|strong|code)\b[^>]*>/g, '')).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\|/g, ' ').split(/\s+/).filter(Boolean);

// Facts each republished document must keep (the legal substance and the contact route).
const LEGAL_REQUIRED = {
  privacy: ['CHEKUSU INC.', 'Effective date:', 'https://github.com/chekusu/sofatap/issues'],
  support: ['https://github.com/chekusu/sofatap/issues/new', 'iOS 17', '1.0 (15)', '../privacy/'],
};
const LEGAL_HOSTS = new Set(['testflight.apple.com']);

/**
 * A privacy or support page: the page language's navigation around the product document,
 * which stays in English (lang="en", dir="ltr") with exactly the source's words.
 */
function checkLegalPage(html, page, pageDir, legal, fail) {
  const lang = page.lang;
  if (!html.includes(`<html lang="${lang}"`)) fail(`缺少 <html lang="${lang}">`);
  if (!/<title>[^<]*Sofatap[^<]*<\/title>/.test(html)) fail('<title> 缺少 Sofatap');
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail('缺少 description');
  if (/\{\{|\}\}/.test(html)) fail('存在未替换的模板占位符');
  checkLanguageMenu(html, page, fail);

  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (levels.filter((l) => l === 1).length !== 1) fail('h1 必须恰好一个');
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) fail(`标题层级跳级：h${levels[i - 1]} → h${l}`); });
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  if (ids.length !== new Set(ids).size) fail('存在重复 id');
  for (const [, ref] of html.matchAll(/(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    ref.split(/\s+/).forEach((id) => { if (!ids.includes(id)) fail(`aria 引用不存在：#${id}`); });
  }

  const own = ['./', '../', '../#how', '../#download', '../#faq', '../privacy/', '../support/', '#main'];
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (own.includes(href) || Object.values(page.links).includes(href)) continue;
    if (/^https:\/\//.test(href) && (isRepoLink(href) || LEGAL_HOSTS.has(new URL(href).hostname))) continue;
    fail(`不安全或非预期的链接：${href}`);
  }
  for (const href of ['../', '../privacy/', '../support/']) {
    if (!hrefs.includes(href) && !(href === `../${page.kind}/` && hrefs.includes('./'))) fail(`缺少必要链接：${href}`);
  }
  const current = html.match(/<nav class="legal-tabs"[\s\S]*?<\/nav>/)?.[0] ?? '';
  if ((current.match(/aria-current="page"/g) ?? []).length !== 1 || !/<a href="\.\/" aria-current="page">/.test(current)) fail('隐私/支持切换必须标出当前页面');
  if (/target="_blank"/.test(html)) fail('不应使用 target="_blank"');

  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((r) => !/^(https:|#)/.test(r) && !own.includes(r) && !Object.values(page.links).includes(r));
  for (const ref of refs) {
    if (/^(\/|[a-z]+:)/i.test(ref)) { fail(`资源必须使用相对路径：${ref}`); continue; }
    if (!existsSync(path.resolve(pageDir, ref.split(/[?#]/)[0]))) fail(`资源不存在：${ref}`);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) fail(`图片缺少 alt：${m[0].slice(0, 80)}`);
  const wordmarks = [...html.matchAll(/<img class="(brand__wordmark|site-footer__wordmark)" src="[^"]*assets\/sofatap-wordmark\.svg" alt="Sofatap"/g)];
  if (wordmarks.length !== 2) fail(`页头和页脚都必须使用 Sofatap 文字标志 SVG，当前 ${wordmarks.length} 处`);

  // The document: English, left to right, every word of the (recorded) source and nothing else.
  const article = html.match(/<article class="legal" lang="en" dir="ltr">([\s\S]*?)<\/article>/)?.[1];
  if (!article) { fail('缺少 lang="en" dir="ltr" 的文档正文'); return; }
  const expected = markdownWords(legal.docs[page.kind].text);
  const actual = htmlWords(article);
  if (expected.join(' ') !== actual.join(' ')) {
    const at = expected.findIndex((w, i) => w !== actual[i]);
    fail(`文档正文与产品文档不一致（第 ${at} 个词附近：${expected.slice(at, at + 6).join(' ')} ≠ ${actual.slice(at, at + 6).join(' ')}）`);
  }
  for (const fact of LEGAL_REQUIRED[page.kind]) if (!article.includes(fact)) fail(`文档缺少：${fact}`);
  const note = /<p class="callout callout--quiet">/.test(html);
  if (note !== (lang !== 'en')) fail(lang === 'en' ? '英文页不需要“仅英文”说明' : '非英文页必须说明正文只有英文');
  if (!html.includes(`https://github.com/chekusu/sofatap/blob/${legal.commit}/`)) fail('缺少固定提交的来源链接');
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

  // Every language shares one structure; a missing page is already a problem above.
  const shape = (html) => [...html.matchAll(/\sid="([^"]+)"|<(h[1-6]|section|details|figure|img|video|track)\b/g)].map((m) => m[1] ?? m[2]).join(' ');
  if (pages.length !== PAGES.length || PAGES.length !== LOCALES.length) problems.push(`页面数量不正确：${pages.length}/${LOCALES.length}`);
  for (const { page, html } of pages.slice(1)) {
    if (shape(html) !== shape(pages[0].html)) problems.push(`[${page.lang}] 页面结构与 ${pages[0].page.lang} 不一致`);
  }

  // Privacy and support pages, in every language, with one shared structure per page.
  const legal = await loadLegalDocuments();
  for (const kind of LEGAL_KINDS) {
    const shapes = [];
    for (const page of LEGAL_PAGES.filter((p) => p.kind === kind)) {
      const pageDir = path.join(dir, page.dir);
      const file = path.join(pageDir, 'index.html');
      if (!existsSync(file)) { problems.push(`缺少页面：${path.join(page.dir, 'index.html')}`); continue; }
      const html = await readFile(file, 'utf8');
      checkLegalPage(html, page, pageDir, legal, (msg) => problems.push(`[${kind} ${page.lang}] ${msg}`));
      shapes.push([page.lang, shape(html.replace(/<p class="callout callout--quiet">/, ''))]);
    }
    for (const [lang, sh] of shapes.slice(1)) if (sh !== shapes[0][1]) problems.push(`[${kind} ${lang}] 页面结构与 ${shapes[0][0]} 不一致`);
  }

  // Private paths, credentials and process wording never ship in any file.
  const files = ['styles.css', 'main.js', 'demo-core.js', ...[...PAGES, ...LEGAL_PAGES].map((p) => path.join(p.dir, 'index.html'))];
  if (existsSync(path.join(dir, 'media'))) {
    for (const name of await readdir(path.join(dir, 'media'))) if (name.endsWith('.vtt')) files.push(path.join('media', name));
  }
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
  // The demo must not reach the network, storage or the clipboard: it is a local simulation.
  for (const file of ['main.js', 'demo-core.js']) {
    const code = await readFile(path.join(dir, file), 'utf8');
    for (const api of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /navigator\.clipboard/, /localStorage/, /sendBeacon/, /\beval\(/]) {
      if (api.test(code)) problems.push(`${file} 不应使用 ${api}`);
    }
  }

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
  const opt = (flag) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : null; };
  const config = opt('--config') ?? path.join(ROOT, 'site.config.json');
  const media = opt('--media');
  const out = await mkdtemp(path.join(os.tmpdir(), 'sofatap-check-'));
  try {
    await build({ config, out, media });
    const { problems, contrast: ratios } = await checkSite(out);
    console.log(`对比度：${ratios.join('，')}`);
    if (problems.length) {
      problems.forEach((p) => console.error(`✗ ${p}`));
      process.exitCode = 1;
    } else {
      console.log(`✓ 静态检查全部通过（${LOCALES.map((l) => l.lang).join('、')}）`);
    }
  } catch (error) {
    console.error(`检查失败：${error.message}`);
    process.exitCode = 1;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
