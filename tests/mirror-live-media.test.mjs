import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { build, MEDIA_TIMING, mediaPosterFor, mediaVideoFor, mediaVttFor } from '../scripts/build.mjs';
import { loadCues } from '../scripts/captions.mjs';
import { LANGS } from '../scripts/locales.mjs';
import { mirrorLiveMedia, parseStamp, verifyCaptions, vttTiming } from '../scripts/mirror-live-media.mjs';
import { EXPORTS } from '../scripts/prepare-deploy.mjs';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-mirror-'));
after(() => rm(tmp, { recursive: true, force: true }));
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000, 7)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 9)]);
const config = path.join(tmp, 'config.json');
await writeFile(config, JSON.stringify({ mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' }));

test('time stamps parse with and without hours', () => {
  assert.equal(parseStamp('00:01:02.345'), 62.345);
  assert.equal(parseStamp('01:02.500'), 62.5);
  assert.throws(() => parseStamp('1:2.3'));
});

test('mirrored media rebuild the live captions with their measured timing', async () => {
  // A "live" build whose captions use measured timing that differs from the planned cue times.
  const { cues } = await loadCues();
  const timing = Object.fromEntries(LANGS.map((lang, k) => [lang, cues.map((c) => ({ start: c.start + 0.123 + k / 1000, end: c.end + 0.123 + k / 1000 }))]));
  const liveMedia = path.join(tmp, 'live-media');
  await mkdir(liveMedia);
  for (const lang of LANGS) {
    await writeFile(path.join(liveMedia, mediaVideoFor(lang)), mp4);
    await writeFile(path.join(liveMedia, mediaPosterFor(lang)), jpg);
  }
  await writeFile(path.join(liveMedia, MEDIA_TIMING), JSON.stringify(timing));
  const live = path.join(tmp, 'live');
  await build({ config, out: live, media: liveMedia });
  await mkdir(path.join(live, 'exports'));
  for (const name of EXPORTS) await writeFile(path.join(live, 'exports', name), mp4);

  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    const rel = url.replace('https://sofatap.app/', '');
    return readFile(path.join(live, rel));
  };
  const out = path.join(tmp, 'mirror');
  const result = await mirrorLiveMedia({ out, fetcher });
  assert.equal(asked.length, LANGS.length * 3 + EXPORTS.length);
  assert.ok(asked.every((u) => u.startsWith('https://sofatap.app/media/') || u.startsWith('https://sofatap.app/exports/')));

  const rebuilt = path.join(tmp, 'rebuilt');
  await build({ config, out: rebuilt, media: result.media });
  assert.deepEqual(await verifyCaptions({ out, dist: rebuilt }), []);
  for (const lang of LANGS) {
    assert.equal(await readFile(path.join(rebuilt, 'media', mediaVttFor(lang)), 'utf8'), await readFile(path.join(live, 'media', mediaVttFor(lang)), 'utf8'), lang);
  }
  // Without the timing the captions fall back to the planned times, and the check notices.
  const planned = path.join(tmp, 'planned');
  await rm(path.join(result.media, MEDIA_TIMING));
  await build({ config, out: planned, media: result.media });
  assert.deepEqual(await verifyCaptions({ out, dist: planned }), LANGS);
  assert.equal(vttTiming(await readFile(path.join(out, mediaVttFor('en')), 'utf8')).length, cues.length);
});
