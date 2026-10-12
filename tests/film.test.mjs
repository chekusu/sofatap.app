// The narration timing tools in tools/film: no browser, ffmpeg or audio needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCues } from '../scripts/captions.mjs';
import { LOCALES } from '../scripts/locales.mjs';
import { narrationManifest, speechText } from '../tools/film/narration.mjs';
import { planFilm, sceneTime } from '../tools/film/timeline.mjs';
import { cueSpans, readAlignment, refineCuts } from '../tools/film/voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = await loadCues();

const N = cues.cues.length;
const strings = Object.fromEntries(await Promise.all(LOCALES.map(async (l) => [l.lang, JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${l.lang}.json`), 'utf8'))])));

test('the narration script: every cue in every language, "Sofa tap" spoken, offsets exact', async () => {
  const m = await narrationManifest();
  assert.equal(Object.keys(m.languages).length, 12);
  assert.equal(m.cues, N);
  for (const [lang, entry] of Object.entries(m.languages)) {
    assert.equal(entry.cues.length, N, lang);
    for (const c of entry.cues) {
      assert.equal(entry.text.slice(c.chars[0], c.chars[1]), c.speech, lang);
      assert.doesNotMatch(c.speech, /Sofatap/, lang);
      assert.match(c.caption, /\S/, lang);
    }
    assert.match(entry.cues.at(-1).caption, /Sofatap/, `${lang} ends with the brand`);
    assert.doesNotMatch(entry.text, /github|https?:/i, lang);
  }
  assert.equal(speechText('Everything from the sofa. Sofatap.'), 'Everything from the sofa. Sofa tap.');
});

// The demo's search matches like main.js: case-insensitive part of a film title.
const fold = (text) => text.normalize('NFKC').toLocaleLowerCase();
const matches = (s, query) => Array.from({ length: 9 }, (_, i) => i).filter((i) => fold(s[`demo.film${i + 1}`]).includes(fold(query.trim())));

test('the example texts: the typed search finds only City After Rain, the spoken title only Last Train Home', () => {
  for (const l of LOCALES) {
    const s = strings[l.lang];
    assert.deepEqual(matches(s, s['demo.search.typed']), [4], `${l.lang}: ${s['demo.search.typed']}`);
    assert.deepEqual(matches(s, s['demo.search.spoken']), [8], l.lang);
    // Both are short single lines: Send types them as they are and never presses Enter.
    for (const key of ['demo.search.typed', 'demo.search.spoken']) assert.match(s[key], /^[^\n]{1,40}$/, `${l.lang}:${key}`);
    // The narrator says the dictated title itself, so the voice step is heard as well as seen.
    assert.ok(s['video.cue.say'].includes(s['demo.search.spoken']), l.lang);
  }
});

test('the film keeps every action on its cue and only holds, never rushes', () => {
  const short = planFilm(cues, Array(N).fill(0.5));
  // Short narration: the scene runs at its natural pace (the end card at least 4.2 s).
  assert.deepEqual(short.segments.map((s) => +(s.filmFrom).toFixed(3)), cues.cues.map((c) => c.anchor));
  const long = planFilm(cues, Array.from({ length: N }, (_, i) => (i ? 2 + (i % 4) : 5))); // the first cue outlasts its moment
  long.segments.forEach((s, i) => {
    assert.ok(s.filmTo - s.filmFrom >= s.sceneTo - s.sceneFrom - 1e-9 || i === N - 1, `segment ${i} is never shortened`);
    assert.ok(s.speechAt + s.speechLength <= s.filmTo + 1e-9, `cue ${i} fits its segment`);
    if (i) assert.ok(s.filmFrom >= long.segments[i - 1].filmTo - 1e-9);
  });
  // Scene time: real speed, then a hold at the segment's last moment.
  const seg = long.segments[0];
  assert.equal(sceneTime(long, 1), 1);
  assert.ok(Math.abs(sceneTime(long, seg.filmTo - 0.01) - (seg.sceneTo - 1e-3)) < 1e-9);
  assert.equal(sceneTime(long, long.segments[1].filmFrom), long.segments[1].sceneFrom);
  // Captions start with the speech, end before the next cue, never overlap.
  long.captions.forEach((c, i) => { assert.ok(c.end > c.start); if (i) assert.ok(c.start >= long.captions[i - 1].end); });
  assert.throws(() => planFilm(cues, [1, 2]), new RegExp(`expected ${N}`));
});

test('a cue that leads up to its action holds before it: Send is tapped as the words "tap Send" arrive', () => {
  const i = cues.cues.findIndex((c) => c.key === 'video.cue.send');
  const send = cues.cues[i];
  assert.ok(send.hold > send.anchor, 'the send cue holds before the tap');
  const lengths = Array(N).fill(1);
  lengths[i] = 4.1; // French: "Le texte reste sur le téléphone jusqu’à ce que vous touchiez Envoyer."
  const plan = planFilm(cues, lengths);
  const seg = plan.segments[i];
  assert.ok(seg.holdFor > 0);
  // Real speed up to the hold, the hold itself, then real speed again to the segment's end.
  assert.ok(Math.abs(sceneTime(plan, seg.filmFrom + 0.5) - (seg.sceneFrom + 0.5)) < 1e-9);
  const holdStart = seg.filmFrom + (send.hold - send.anchor);
  assert.equal(sceneTime(plan, holdStart + 0.01), send.hold);
  assert.equal(sceneTime(plan, holdStart + seg.holdFor - 0.01), send.hold);
  assert.ok(Math.abs(sceneTime(plan, seg.filmTo - 0.5) - (seg.sceneTo - 0.5)) < 1e-9);
  // The tap (0.4 s glide after the hold) lands in the last second of the speech, not at its start.
  const tapAt = seg.filmTo - (seg.sceneTo - (send.hold + 0.4));
  const speechEnd = seg.speechAt + seg.speechLength;
  assert.ok(tapAt > speechEnd - 1.2 && tapAt < speechEnd + 0.3, `tap at ${tapAt}, speech ends ${speechEnd}`);
  // Cues without a hold keep holding at their end, as before.
  const plain = plan.segments.find((s, k) => !('hold' in cues.cues[k]) && s.holdFor > 0);
  if (plain) assert.equal(plain.holdAt, plain.sceneTo);
});

test('character timestamps: grouped provider output, folding (… and quotes) and in-order matching', () => {
  const chars = (text, t0) => ({ characters: [...text], character_start_times_seconds: [...text].map((_, i) => t0 + i * 0.1), character_end_times_seconds: [...text].map((_, i) => t0 + (i + 1) * 0.1) });
  const data = { audio: {}, timestamps: [chars('Choose Play…\n', 0), chars('…and Sofa tap.', 1.3)] };
  const a = readAlignment(data);
  assert.equal(a.text, 'Choose Play…\n…and Sofa tap.');
  assert.equal(a.start.length, [...a.text].length);
  const spans = cueSpans(a, ['Choose Play…', '…and Sofa tap.']);
  assert.ok(Math.abs(spans[0].start - 0) < 1e-9 && Math.abs(spans[0].end - 1.2) < 1e-9);
  assert.ok(Math.abs(spans[1].start - 1.3) < 1e-9 && Math.abs(spans[1].end - 2.7) < 1e-9);
  assert.throws(() => cueSpans(a, ['missing words']), /not found/);
});

test('cuts between cues fall in the pause and partition the whole recording', () => {
  // 3 s of "speech" with a quiet gap at 1.40–1.70 s.
  const env = new Float32Array(300).map((_, f) => (f >= 140 && f < 170 ? 0.001 : 0.3));
  const parts = refineCuts(env, [{ start: 0.1, end: 1.3 }, { start: 1.5, end: 2.9 }]);
  assert.equal(parts[0].from, 0);
  assert.ok(parts[0].to >= 1.4 && parts[0].to <= 1.7, `cut at ${parts[0].to}`);
  assert.equal(parts[1].from, parts[0].to);
  assert.equal(parts[1].to, 3);
});

test('timestamp matching maps folded text back exactly, including expanding and astral characters', () => {
  const text = 'A…𝒳 b\n…c';
  const a = { text, start: [...text].map((_, i) => i), end: [...text].map((_, i) => i + 1) };
  const spans = cueSpans(a, ['A…𝒳 b', '…c']);
  assert.deepEqual([spans[0].start, spans[0].end, spans[1].start, spans[1].end], [0, 5, 6, 8]);
});

test('outro revision: the end card starts where the last segment begins, on a whole frame', async () => {
  const { endSegment, parseArgs } = await import('../tools/film/outro.mjs');
  // The last cue is spoken 0.2 s after its anchor, so the card starts 0.2 s before the speech.
  const last = cues.cues.at(-1);
  assert.ok(Math.abs(last.start - last.anchor - 0.2) < 1e-9);
  const end = endSegment(cues, { cues: [...Array(N - 1).fill({}), { speechAt: 62.39 }] });
  assert.ok(Math.abs(end.filmFrom - 62.19) < 1e-9);
  assert.equal(end.sceneFrom, last.anchor);
  assert.equal(end.firstFrame, 1865); // 62.19 s × 30 fps = 1865.7: the frame showing the card's first moment
  // An end exactly on a frame boundary starts on that frame (no rounding drift below it).
  assert.equal(endSegment(cues, { cues: [...Array(N - 1).fill({}), { speechAt: 61.2 }] }).firstFrame, 1830);
  // Arguments: jobs must be 1–8, and the previous videos are never overwritten.
  const base = ['--from', 'a', '--out', 'b', '--playwright', 'playwright'];
  for (const jobs of ['0', '-1', 'NaN', '9', '1.5']) assert.throws(() => parseArgs([...base, '--jobs', jobs], {}), /jobs/);
  assert.equal(parseArgs([...base, '--jobs', '2'], {}).jobs, 2);
  assert.throws(() => parseArgs(['--from', 'a', '--out', 'a', '--playwright', 'p'], {}), /must differ/);
});
