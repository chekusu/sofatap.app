// After a production deploy: tell IndexNow (Bing, Yandex, Seznam, Naver…) that every page in the
// sitemap may have changed, so they recrawl soon. Bing's index also feeds ChatGPT search and Copilot.
// Never fails the deploy: problems are printed and the exit code stays 0.
// Usage: node scripts/indexnow.mjs [--dist dist]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { INDEXNOW_FILE, INDEXNOW_KEY } from './discovery.mjs';
import { SITE_URL } from './locales.mjs';

export function indexNowPayload(sitemap) {
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  urlList.push(`${SITE_URL}llms.txt`);
  return { host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}${INDEXNOW_FILE}`, urlList };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const i = process.argv.indexOf('--dist');
  const dist = i > 0 ? process.argv[i + 1] : 'dist';
  try {
    const payload = indexNowPayload(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'));
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    console.log(`IndexNow: ${res.status} for ${payload.urlList.length} URLs`);
  } catch (error) {
    console.log(`IndexNow skipped: ${error.message}`);
  }
}
