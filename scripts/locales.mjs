// The one list of website languages. English is the default page at the site root;
// every other language lives in its own directory. Order is the order of the language menu.
//   lang   BCP 47 code used for <html lang>, hreflang and src/i18n/<lang>.json
//   dir    output directory ('' for the root); keep these stable, they are public URLs
//   name   native name shown in the language menu
//   short  shorter native name for the menu button on narrow screens
//   rtl    right-to-left script
export const LOCALES = [
  { lang: 'en', dir: '', name: 'English', short: 'English' },
  { lang: 'zh-CN', dir: 'zh', name: '简体中文', short: '中文' },
  { lang: 'es', dir: 'es', name: 'Español', short: 'Español' },
  { lang: 'fr', dir: 'fr', name: 'Français', short: 'Français' },
  { lang: 'de', dir: 'de', name: 'Deutsch', short: 'Deutsch' },
  { lang: 'pt-BR', dir: 'pt-br', name: 'Português (Brasil)', short: 'Português' },
  { lang: 'ja', dir: 'ja', name: '日本語', short: '日本語' },
  { lang: 'ko', dir: 'ko', name: '한국어', short: '한국어' },
  { lang: 'ar', dir: 'ar', name: 'العربية', short: 'العربية', rtl: true },
  { lang: 'hi', dir: 'hi', name: 'हिन्दी', short: 'हिन्दी' },
  { lang: 'ru', dir: 'ru', name: 'Русский', short: 'Русский' },
  { lang: 'id', dir: 'id', name: 'Bahasa Indonesia', short: 'Indonesia' },
];

export const LANGS = LOCALES.map((l) => l.lang);
export const DEFAULT_LANG = 'en';

export function locale(lang) {
  const found = LOCALES.find((l) => l.lang === lang);
  if (!found) throw new Error(`未知语言：${lang}`);
  return found;
}

/** Relative link from the page of `from` to the page of `to`. */
export function hrefBetween(from, to) {
  const a = locale(from);
  const b = locale(to);
  if (a.lang === b.lang) return './';
  const up = a.dir ? '../' : '';
  return b.dir ? `${up}${b.dir}/` : (up || './');
}

/** Lowercase file-name tag for per-language media (en, zh-cn, pt-br …). */
export const mediaTag = (lang) => lang.toLowerCase();
