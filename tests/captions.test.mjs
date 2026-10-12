import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cueKeys, loadCues, toAss, toVtt, validateCues } from '../scripts/captions.mjs';
import { LOCALES } from '../scripts/locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = await loadCues();

test('the cue timeline fits a 20–30 second video and keeps the label on screen throughout', () => {
  assert.ok(cues.duration >= 20 && cues.duration <= 30);
  assert.equal(cues.label.start, 0);
  assert.equal(cues.label.end, cues.duration);
  assert.equal(cues.cues.length, 8);
});

test('every language has every caption, as valid WebVTT and ASS', async () => {
  for (const l of LOCALES) {
    const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${l.lang}.json`), 'utf8'));
    for (const key of cueKeys(cues)) assert.ok(strings[key]?.trim(), `${l.lang}:${key}`);
    const vtt = toVtt(strings, cues);
    assert.match(vtt, /^WEBVTT\n/);
    assert.equal(vtt.match(/ --> /g).length, 9, l.lang);
    assert.ok(vtt.includes(strings['video.label']), l.lang);
    // Only the label is placed; narration keeps the default line so native controls never cover it.
    assert.equal(vtt.match(/ line:/g).length, 1, l.lang);
    assert.match(vtt, /--> 00:00:24\.800\n/);
    // A blank line inside a cue would end it early.
    for (const block of vtt.trimEnd().split('\n\n').slice(1)) assert.ok(block.split('\n').every((line) => line.trim()), `${l.lang}: ${block}`);
    const ass = toAss(strings, cues);
    assert.equal(ass.match(/^Dialogue:/gm).length, 9);
    assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
  }
});

test('caption validation rejects broken timing and unsafe or multi-paragraph text', () => {
  const base = { duration: 25, label: { key: 'video.label', start: 0, end: 25 }, cues: [{ key: 'video.cue.a', start: 1, end: 2 }] };
  const bad = (mutate) => { const d = structuredClone(base); mutate(d); assert.throws(() => validateCues(d)); };
  bad((d) => { d.duration = '25'; });
  bad((d) => { d.duration = Infinity; });
  bad((d) => { d.cues[0].start = '1'; });
  bad((d) => { d.cues[0].end = 30; });
  bad((d) => { d.cues.push({ key: 'video.cue.b', start: 1.5, end: 3 }); });
  bad((d) => { d.cues[0].key = '../x'; });
  const strings = { 'video.label': 'L', 'video.cue.a': 'A' };
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': 'one\n\ntwo' }, base), /空行/);
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': '<b>x</b>' }, base), /</);
  assert.throws(() => toVtt({ ...strings, 'video.cue.a': 'a --> b' }, base));
  assert.throws(() => toVtt({ 'video.label': 'L' }, base), /缺少/);
  assert.match(toVtt({ ...strings, 'video.cue.a': '\nA & B\n' }, base), /\nA &amp; B\n/);
});
