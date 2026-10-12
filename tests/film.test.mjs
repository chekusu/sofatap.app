// The narration timing tools in tools/film: no browser, ffmpeg or audio needed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCues } from '../scripts/captions.mjs';
import { narrationManifest, speechText } from '../tools/film/narration.mjs';
import { planFilm, sceneTime } from '../tools/film/timeline.mjs';
import { cueSpans, readAlignment, refineCuts } from '../tools/film/voice.mjs';

const cues = await loadCues();

test('the narration script: eight cues per language, "Sofa tap" spoken, offsets exact', async () => {
  const m = await narrationManifest();
  assert.equal(Object.keys(m.languages).length, 12);
  for (const [lang, entry] of Object.entries(m.languages)) {
    assert.equal(entry.cues.length, 8, lang);
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

test('the film keeps every action on its cue and only holds, never rushes', () => {
  const short = planFilm(cues, Array(8).fill(0.5));
  // Short narration: the scene runs at its natural pace (the end card at least 4.2 s).
  assert.deepEqual(short.segments.map((s) => +(s.filmFrom).toFixed(3)), cues.cues.map((c) => c.anchor));
  const long = planFilm(cues, [5, 4, 3, 2, 3, 2, 3, 3]);
  long.segments.forEach((s, i) => {
    assert.ok(s.filmTo - s.filmFrom >= s.sceneTo - s.sceneFrom - 1e-9 || i === 7, `segment ${i} is never shortened`);
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
  assert.throws(() => planFilm(cues, [1, 2]), /expected 8/);
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
