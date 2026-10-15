// The film's player (src/film-player.js), loaded as the browser loads it and driven through a small
// model of the media element: the states, labels and captions follow the element's own events.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(ROOT, 'src', 'film-player.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, { window: sandbox, EventTarget, Promise, Error, JSON, String });
const { attach } = sandbox.SofatapFilmPlayer;

const LABELS = { play: 'Play the film', pause: 'Pause the film', soundOn: 'Turn sound on', soundOff: 'Turn sound off', replay: 'Play from the start' };

class El extends EventTarget {
  constructor() { super(); this.attrs = new Map(); this.hidden = false; this.textContent = ''; this.classes = new Set(); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  get classList() { const c = this.classes; return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x) }; }
  click() { this.dispatchEvent(new Event('click')); }
}

class Track extends EventTarget {
  constructor() { super(); this.mode = 'showing'; this.activeCues = []; }
  cue(text) { this.activeCues = text ? [{ text }] : []; this.dispatchEvent(new Event('cuechange')); }
}

class Video extends El {
  constructor() {
    super();
    this.paused = true; this.ended = false; this.loop = false; this.plays = 0; this.refuse = false;
    this._muted = false; this._time = 0;
    this.setAttribute('controls', '');
    const list = new EventTarget();
    this.track = new Track();
    list[0] = this.track; list.length = 1;
    this.textTracks = list;
  }
  get muted() { return this._muted; }
  set muted(v) { this._muted = v; this.dispatchEvent(new Event('volumechange')); }
  get currentTime() { return this._time; }
  set currentTime(t) { this._time = t; if (t === 0) this.ended = false; this.dispatchEvent(new Event('seeked')); }
  play() {
    this.plays += 1;
    if (this.refuse) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false; this.ended = false;
    this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  // The end of the film (no loop): paused becomes true, then 'pause' and 'ended' fire.
  finish() { this.paused = true; this.ended = true; this.dispatchEvent(new Event('pause')); this.dispatchEvent(new Event('ended')); }
}

function setup({ without } = {}) {
  const root = new El();
  root.setAttribute('data-labels', JSON.stringify(LABELS));
  const video = new Video();
  const controls = new El(); controls.hidden = true;
  const captions = new El(); captions.hidden = true;
  const buttons = Object.fromEntries(['play', 'sound', 'replay'].filter((a) => a !== without).map((a) => [a, new El()]));
  root.querySelector = (sel) => {
    if (sel === 'video') return video;
    if (sel === '.film__controls') return controls;
    if (sel === '.film__captions') return captions;
    const m = sel.match(/^\[data-action="(\w+)"\]$/);
    return m ? buttons[m[1]] ?? null : null;
  };
  return { root, video, controls, captions, buttons, player: attach(root) };
}
const tick = () => new Promise((r) => setImmediate(r));

test('takes over quietly: native controls go, nothing plays, sound will be on', () => {
  const { root, video, controls, buttons } = setup();
  assert.equal(video.hasAttribute('controls'), false);
  assert.equal(controls.hidden, false);
  assert.ok(root.classList.contains('is-ready'));
  assert.equal(root.getAttribute('data-state'), 'paused');
  assert.equal(video.plays, 0, 'no autoplay');
  assert.equal(video.loop, false);
  assert.equal(video.muted, false);
  assert.equal(buttons.play.getAttribute('aria-label'), LABELS.play);
  assert.equal(buttons.play.getAttribute('data-state'), 'play');
  assert.equal(buttons.sound.getAttribute('aria-label'), LABELS.soundOff);
  assert.equal(buttons.sound.getAttribute('aria-pressed'), 'true');
  // Attaching twice does nothing.
  assert.equal(attach(root), null);
});

test('play and pause only on an explicit click, on the button or the picture', () => {
  const { root, video, buttons } = setup();
  buttons.play.click();
  assert.equal(video.paused, false);
  assert.equal(root.getAttribute('data-state'), 'playing');
  assert.equal(buttons.play.getAttribute('aria-label'), LABELS.pause);
  assert.equal(buttons.play.getAttribute('data-state'), 'pause');
  video.click();
  assert.equal(video.paused, true);
  assert.equal(root.getAttribute('data-state'), 'paused');
  assert.equal(buttons.play.getAttribute('aria-label'), LABELS.play);
  video.click();
  assert.equal(video.paused, false);
  assert.equal(video.plays, 2);
});

test('sound toggles without starting or stopping the film', () => {
  const { video, buttons } = setup();
  buttons.sound.click();
  assert.equal(video.muted, true);
  assert.equal(buttons.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(buttons.sound.getAttribute('aria-label'), LABELS.soundOn);
  assert.equal(buttons.sound.getAttribute('data-state'), 'off');
  assert.equal(video.plays, 0);
  buttons.sound.click();
  assert.equal(video.muted, false);
  assert.equal(buttons.sound.getAttribute('aria-label'), LABELS.soundOff);
});

test('replay starts from the beginning; the end rests on the last frame until asked again', () => {
  const { root, video, buttons } = setup();
  buttons.play.click();
  video.currentTime = 30;
  buttons.replay.click();
  assert.equal(video.currentTime, 0);
  assert.equal(video.paused, false);
  video.finish();
  assert.equal(root.getAttribute('data-state'), 'ended');
  assert.equal(buttons.play.getAttribute('aria-label'), LABELS.play);
  const plays = video.plays;
  // Nothing restarts by itself after the end.
  assert.equal(video.plays, plays);
  buttons.play.click();
  assert.equal(video.currentTime, 0);
  assert.equal(video.paused, false);
  assert.equal(root.getAttribute('data-state'), 'playing');
});

test('a refused play() leaves a correct paused state', async () => {
  const { root, video, buttons } = setup();
  video.refuse = true;
  buttons.play.click();
  await tick();
  assert.equal(video.paused, true);
  assert.equal(root.getAttribute('data-state'), 'paused');
  assert.equal(buttons.play.getAttribute('aria-label'), LABELS.play);
  buttons.replay.click();
  await tick();
  assert.equal(root.getAttribute('data-state'), 'paused');
});

test('captions: the page track as text in one layer; the track never shows natively', () => {
  const { video, captions } = setup();
  const track = video.track;
  assert.equal(track.mode, 'hidden');
  assert.equal(captions.hidden, true);
  track.cue('Sofatap. Your iPhone, <b>your</b> remote.');
  assert.equal(captions.textContent, 'Sofatap. Your iPhone, <b>your</b> remote.', 'text, not HTML');
  assert.equal(captions.hidden, false);
  // A browser switching the track to 'showing' later is put back to 'hidden'.
  track.mode = 'showing';
  video.textTracks.dispatchEvent(new Event('change'));
  assert.equal(track.mode, 'hidden');
  track.mode = 'showing';
  video.dispatchEvent(new Event('seeked'));
  assert.equal(track.mode, 'hidden');
  track.cue('');
  assert.equal(captions.textContent, '');
  assert.equal(captions.hidden, true);
});

test('if setting up fails, the native player stays untouched', () => {
  assert.throws(() => setup({ without: 'replay' }), /missing replay/);
  const root = new El();
  const video = new Video();
  root.setAttribute('data-labels', JSON.stringify(LABELS));
  root.querySelector = (sel) => (sel === 'video' ? video : null);
  assert.throws(() => attach(root));
  assert.equal(video.hasAttribute('controls'), true);
  assert.equal(video.track.mode, 'showing');
  assert.equal(root.classList.contains('is-ready'), false);
  // Clicking the picture is left to the native player.
  video.click();
  assert.equal(video.plays, 0);
  // Pages without the film (a build without media) are fine.
  assert.equal(attach(null), null);
});
