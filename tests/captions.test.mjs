import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cueKeys, loadCues, toAss, toVtt, validateCues } from '../scripts/captions.mjs';
import { LOCALES } from '../scripts/locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = await loadCues();

test('the cue timeline: a one-minute, three-act story with every cue on its own scene moment and no label', () => {
  assert.ok(cues.duration >= 45 && cues.duration <= 70);
  assert.equal('label' in cues, false);
  const keys = cueKeys(cues).map((k) => k.replace('video.cue.', ''));
  // Pointer, then keyboard (draft → Send → Search), then voice (clear → mic → spoken title → review → Search), then the brand.
  assert.deepEqual(keys, ['intro', 'setup', 'slide', 'tap', 'double', 'menu', 'field', 'keyboard', 'send', 'search',
    'clear', 'mic', 'say', 'review', 'found', 'play', 'sofa', 'end']);
  cues.cues.forEach((c, i) => { if (i) assert.ok(c.anchor > cues.cues[i - 1].anchor, c.key); });
});

test('every language has every caption, as valid WebVTT and ASS', async () => {
  for (const l of LOCALES) {
    const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${l.lang}.json`), 'utf8'));
    for (const key of cueKeys(cues)) assert.ok(strings[key]?.trim(), `${l.lang}:${key}`);
    const vtt = toVtt(strings, cues);
    assert.match(vtt, /^WEBVTT\n/);
    assert.equal(vtt.match(/ --> /g).length, cues.cues.length, l.lang);
    // Every cue sits one snapped line above the default, never at a percentage that controls could cover.
    assert.equal(vtt.match(/ line:-2\n/g).length, cues.cues.length, l.lang);
    assert.doesNotMatch(vtt, /line:\d+%/, l.lang);
    assert.match(vtt, /--> 00:00:54\.700 line:-2\n/);
    // A blank line inside a cue would end it early.
    for (const block of vtt.trimEnd().split('\n\n').slice(1)) assert.ok(block.split('\n').every((line) => line.trim()), `${l.lang}: ${block}`);
    const ass = toAss(strings, cues);
    assert.equal(ass.match(/^Dialogue:/gm).length, cues.cues.length);
    assert.doesNotMatch(ass, /Style: Label/);
    assert.match(ass, /^Style: Caption,.*,112,(?:1|-1)$/m);
    assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
  }
});

test('caption validation rejects broken timing and unsafe or multi-paragraph text', () => {
  const base = { duration: 25, cues: [{ key: 'video.cue.a', start: 1, end: 2 }] };
  const bad = (mutate) => { const d = structuredClone(base); mutate(d); assert.throws(() => validateCues(d)); };
  bad((d) => { d.duration = '25'; });
  bad((d) => { d.duration = Infinity; });
  bad((d) => { d.cues[0].start = '1'; });
  bad((d) => { d.cues[0].end = 30; });
  bad((d) => { d.cues.push({ key: 'video.cue.b', start: 1.5, end: 3 }); });
  bad((d) => { d.cues[0].key = '../x'; });
  bad((d) => { d.label = { key: 'video.label', start: 0, end: 25 }; });
  const strings = { 'video.cue.a': 'A' };
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': 'one\n\ntwo' }, base), /空行/);
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': '<b>x</b>' }, base), /</);
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': 'a --> b' }, base));
  assert.throws(() => toVtt({}, base), /缺少/);
  // Measured timing from the narrated video replaces the plan, and must be well formed.
  assert.match(toVtt(strings, base, [{ start: 0.5, end: 2.75 }]), /00:00:00\.500 --> 00:00:02\.750 line:-2\n/);
  assert.throws(() => toVtt(strings, base, [{ start: 2, end: 1 }]), /实测时间/);
  assert.throws(() => toVtt(strings, base, []), /实测时间/);
  assert.match(toVtt({ ...strings, 'video.cue.a': '\nA & B\n' }, base), /\nA &amp; B\n/);
});
