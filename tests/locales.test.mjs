import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateStrings } from '../scripts/build.mjs';
import { LOCALES } from '../scripts/locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = Object.fromEntries(await Promise.all(LOCALES.map(async (l) =>
  [l.lang, JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${l.lang}.json`), 'utf8'))])));
const en = tables.en;

// Values that are the same word in a language as in English (product and platform names,
// or words like "Illustration" that French and German share).
const SAME_AS_ENGLISH = new Set(['platform.windows.name', 'platform.mac.name', 'platform.linux.name', 'platform.windows.req']);
const SAME_ALSO = { fr: ['label.illustration', 'label.simulation'], de: ['label.illustration', 'label.simulation'] };
// The writing system each language must actually use (no English left in its place).
const SCRIPT = {
  'zh-CN': /\p{Script=Han}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, ko: /\p{Script=Hangul}/u,
  ar: /\p{Script=Arabic}/u, hi: /\p{Script=Devanagari}/u, ru: /\p{Script=Cyrillic}/u,
};

test('exactly the twelve agreed languages, English first', () => {
  assert.deepEqual(LOCALES.map((l) => l.lang), ['en', 'zh-CN', 'es', 'fr', 'de', 'pt-BR', 'ja', 'ko', 'ar', 'hi', 'ru', 'id']);
  assert.equal(LOCALES[0].dir, '');
  assert.equal(LOCALES.find((l) => l.lang === 'zh-CN').dir, 'zh');
  assert.deepEqual(LOCALES.filter((l) => l.rtl).map((l) => l.lang), ['ar']);
  assert.equal(new Set(LOCALES.map((l) => l.dir)).size, 12);
});

test('all language files have the same keys, non-empty and script-free', () => {
  assert.doesNotThrow(() => validateStrings(tables));
});

test('no added language falls back to English prose', () => {
  for (const [lang, table] of Object.entries(tables)) {
    if (lang === 'en') continue;
    const same = Object.keys(en).filter((k) => en[k] && table[k] === en[k] && !SAME_AS_ENGLISH.has(k) && !(SAME_ALSO[lang] ?? []).includes(k));
    assert.deepEqual(same, [], `${lang} copies English for ${same.join(', ')}`);
    if (SCRIPT[lang]) {
      const prose = Object.entries(table).filter(([k, v]) => v && !SAME_AS_ENGLISH.has(k) && /\s/.test(en[k]));
      const missing = prose.filter(([, v]) => !SCRIPT[lang].test(v)).map(([k]) => k);
      assert.deepEqual(missing, [], `${lang} has text without its script: ${missing.join(', ')}`);
    }
  }
});

test('placeholders, links and markup survive translation', () => {
  for (const [lang, table] of Object.entries(tables)) {
    for (const [key, value] of Object.entries(en)) {
      const vars = (v) => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      assert.equal(vars(table[key]), vars(value), `${lang}:${key} placeholders`);
      const links = (v) => [...v.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).join();
      assert.equal(links(table[key]), links(value), `${lang}:${key} links`);
    }
    assert.match(table['hero.title'], /<em>[^<]+/, lang);
    assert.match(table['faq.ready.a'], /<a href="https:\/\/github\.com\/chekusu\/sofatap\/issues">[^<]+<\/a>/, lang);
    // Hold time and simulation wording carry the product facts.
    assert.match(table['gesture.hold'], /300/, lang);
  }
});
