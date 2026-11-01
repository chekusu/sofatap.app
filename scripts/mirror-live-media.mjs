// Mirrors the media the live site already serves into a local directory, so a deploy from
// GitHub Actions can rebuild the media-inclusive site without a personal computer.
// The videos, posters and promo exports are not in git; the live site is their published copy
// (the owner approved rebuilding from it on 2026-10-23).
//
// Writes, into --out <dir>:
//   media/   12 narrated videos + 12 posters + timing.json (the --media directory for build.mjs)
//   exports/ the two owner-shared promo videos (copied into the build's exports/ before deploy)
// timing.json is read back from the live WebVTT captions, so the rebuilt captions keep the
// measured timing; `--verify <dist>` then checks the rebuilt captions match the live ones.
//
// Usage: node scripts/mirror-live-media.mjs --out <dir> [--base https://sofatap.app] [--verify <dist>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_TIMING, mediaPosterFor, mediaVideoFor, mediaVttFor } from './build.mjs';
import { LANGS } from './locales.mjs';
import { EXPORTS } from './prepare-deploy.mjs';

export const DEFAULT_BASE = 'https://sofatap.app';

/** Seconds from a WebVTT time stamp (hh:mm:ss.mmm or mm:ss.mmm). */
export function parseStamp(text) {
  const m = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(text);
  if (!m) throw new Error(`无法解析字幕时间：${text}`);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/** The cue times of a WebVTT file, in order. */
export function vttTiming(text) {
  if (!text.startsWith('WEBVTT')) throw new Error('不是 WebVTT 文件');
  return [...text.matchAll(/^(\S+) --> (\S+)/gm)].map((m) => ({ start: parseStamp(m[1]), end: parseStamp(m[2]) }));
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败 ${res.status}：${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function mirrorLiveMedia({ out, base = DEFAULT_BASE, fetcher = fetchBytes }) {
  const media = path.join(out, 'media');
  const exportsDir = path.join(out, 'exports');
  await mkdir(media, { recursive: true });
  await mkdir(exportsDir, { recursive: true });
  const timing = {};
  for (const lang of LANGS) {
    for (const name of [mediaVideoFor(lang), mediaPosterFor(lang)]) {
      await writeFile(path.join(media, name), await fetcher(`${base}/media/${name}`));
    }
    const vtt = (await fetcher(`${base}/media/${mediaVttFor(lang)}`)).toString('utf8');
    await writeFile(path.join(out, mediaVttFor(lang)), vtt);
    timing[lang] = vttTiming(vtt);
  }
  await writeFile(path.join(media, MEDIA_TIMING), `${JSON.stringify(timing, null, 2)}\n`);
  for (const name of EXPORTS) await writeFile(path.join(exportsDir, name), await fetcher(`${base}/exports/${name}`));
  return { media, exports: exportsDir };
}

/** The rebuilt captions must carry the live cue times; returns the languages that differ. */
export async function verifyCaptions({ out, dist }) {
  const differ = [];
  for (const lang of LANGS) {
    const live = vttTiming(await readFile(path.join(out, mediaVttFor(lang)), 'utf8'));
    const built = vttTiming(await readFile(path.join(dist, 'media', mediaVttFor(lang)), 'utf8'));
    if (JSON.stringify(live) !== JSON.stringify(built)) differ.push(lang);
  }
  return differ;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : undefined; };
  const out = arg('--out');
  const dist = arg('--verify');
  try {
    if (!out) throw new Error('用法：node scripts/mirror-live-media.mjs --out <目录> [--base <网址>] [--verify <构建目录>]');
    if (dist) {
      const differ = await verifyCaptions({ out: path.resolve(out), dist: path.resolve(dist) });
      if (differ.length) throw new Error(`重新构建的字幕时间与线上不一致：${differ.join('、')}`);
      console.log('字幕时间与线上一致（12 种语言）');
    } else {
      const result = await mirrorLiveMedia({ out: path.resolve(out), base: arg('--base') ?? DEFAULT_BASE });
      console.log(`已从线上取得媒体：${result.media}，宣传视频：${result.exports}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
