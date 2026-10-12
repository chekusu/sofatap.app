// The website's gesture rules and scripted demo (src/demo-core.js), loaded as the browser loads it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = {};
vm.runInNewContext(await readFile(path.join(ROOT, 'src', 'demo-core.js'), 'utf8'), { window: sandbox });
const { Gestures, ScriptPlayer, SCRIPT, RULES } = sandbox.SofatapDemoCore;
// Arrays made inside the vm context have another realm's prototype; compare plain copies.
const types = (actions) => Array.from(actions, (a) => (a.type === 'drag' ? `drag:${a.down}` : a.type));
const plain = (value) => JSON.parse(JSON.stringify(value));
const origin = { x: 100, y: 100 };
const far = { x: 180, y: 170 };

// Mirrors the product's TouchGestureTests (iOS app, gesture state machine).
test('timings match the app: 300 ms hold, 280 ms double tap, 7 pt tolerance, 32 pt double-tap distance', () => {
  assert.equal(RULES.hold, 0.3);
  assert.equal(RULES.doubleInterval, 0.28);
  assert.equal(RULES.tolerance, 7);
  assert.equal(RULES.doubleDistance, 32);
});

test('a single tap waits for the double-tap window, then left-clicks once', () => {
  const g = new Gestures();
  assert.deepEqual(types(g.begin(origin, 1, 0)), []);
  assert.deepEqual(types(g.end(origin, 0, 0.05)), []);
  assert.deepEqual(types(g.advance(0.329)), []);
  assert.deepEqual(types(g.advance(0.331)), ['left']);
  assert.deepEqual(types(g.advance(2)), []);
});

test('a double tap sends ONLY a right click, with no left click before or after', () => {
  const g = new Gestures();
  g.begin(origin, 1, 0); g.end(origin, 0, 0.04);
  assert.deepEqual(types(g.begin(origin, 1, 0.14)), []);
  assert.deepEqual(types(g.end(origin, 0, 0.2)), ['right']);
  assert.deepEqual(types(g.advance(2)), []);
  assert.equal(g.nextDeadline(), null);
});

test('a distant second tap is two left clicks', () => {
  const g = new Gestures();
  g.begin(origin, 1, 0); g.end(origin, 0, 0.04);
  assert.deepEqual(types(g.begin(far, 1, 0.12)), ['left']);
  assert.deepEqual(types(g.end(far, 0, 0.16)), []);
  assert.deepEqual(types(g.advance(1)), ['left']);
});

test('hold 300 ms then move drags; release ends the drag without a click', () => {
  const g = new Gestures();
  g.begin(origin, 1, 0);
  assert.deepEqual(types(g.advance(0.299)), []);
  assert.deepEqual(types(g.advance(0.3)), ['drag:true']);
  assert.deepEqual(plain(g.move({ x: 114, y: 106 }, 1, 0.42)).map((a) => [a.type, a.dx, a.dy]), [['move', 14, 6]]);
  assert.deepEqual(types(g.end({ x: 114, y: 106 }, 0, 0.5)), ['drag:false']);
  assert.deepEqual(types(g.advance(2)), []);
});

test('a slide moves the pointer and never becomes a drag; stationary jitter is ignored', () => {
  const g = new Gestures();
  g.begin(origin, 1, 0);
  assert.deepEqual(types(g.move({ x: 103, y: 101 }, 1, 0.05)), []);
  assert.deepEqual(types(g.move({ x: 120, y: 100 }, 1, 0.1)), ['move']);
  assert.deepEqual(types(g.advance(0.5)), []);
  assert.deepEqual(types(g.end({ x: 120, y: 100 }, 0, 0.6)), []);
  assert.deepEqual(types(g.advance(2)), []);
});

test('two fingers scroll (scroll(-dy)) without moving the pointer, and the leftover finger is ignored', () => {
  const g = new Gestures();
  g.begin(origin, 1, 0);
  assert.deepEqual(types(g.begin({ x: 110, y: 100 }, 2, 0.02)), []);
  const scroll = g.move({ x: 110, y: 120 }, 2, 0.05);
  assert.deepEqual(plain(scroll).map((a) => [a.type, a.dy]), [['scroll', -20]]);
  assert.deepEqual(types(g.end({ x: 110, y: 120 }, 1, 0.1)), []);
  assert.deepEqual(types(g.move({ x: 150, y: 150 }, 1, 0.15)), []);
  assert.deepEqual(types(g.end({ x: 150, y: 150 }, 0, 0.2)), []);
  assert.deepEqual(types(g.advance(2)), []);
});

test('cancel drops a waiting tap and releases a held drag', () => {
  const tap = new Gestures();
  tap.begin(origin, 1, 0); tap.end(origin, 0, 0.03);
  assert.deepEqual(types(tap.cancel()), []);
  assert.deepEqual(types(tap.advance(5)), []);
  const hold = new Gestures();
  hold.begin(origin, 1, 0); hold.advance(0.3);
  assert.deepEqual(types(hold.cancel()), ['drag:false']);
  assert.deepEqual(types(hold.cancel()), []);
});

test('website mouse rules: a slower desktop double click is still only a right click', () => {
  const g = new Gestures({ doubleInterval: RULES.mouseDoubleInterval });
  g.begin(origin, 1, 0); g.end(origin, 0, 0.04);
  assert.deepEqual(types(g.advance(0.36)), []);
  g.begin(origin, 1, 0.36);
  assert.deepEqual(types(g.end(origin, 0, 0.4)), ['right']);
  assert.deepEqual(types(g.advance(2)), []);
  // A single mouse click still clicks, after the desktop window.
  const one = new Gestures({ doubleInterval: RULES.mouseDoubleInterval });
  one.begin(origin, 1, 0); one.end(origin, 0, 0.05);
  assert.deepEqual(types(one.advance(0.54)), []);
  assert.deepEqual(types(one.advance(0.56)), ['left']);
  // A browser dblclick that arrives after the gesture rules already answered adds nothing.
  const pending = new Gestures({ doubleInterval: RULES.mouseDoubleInterval });
  pending.begin(origin, 1, 0); pending.end(origin, 0, 0.04);
  pending.dropPendingTap();
  assert.deepEqual(types(pending.advance(2)), []);
});

// Runs the scripted demo against a model scene, the way main.js wires it, at a fixed frame rate.
const AIM = {
  'tile:4': { x: 550, y: 330 }, 'menu:1': { x: 610, y: 400 }, 'search:field': { x: 600, y: 40 }, 'search:go': { x: 1000, y: 40 },
  'search:clear': { x: 900, y: 40 }, 'tile:8': { x: 180, y: 140 }, 'menu:0': { x: 240, y: 170 },
};
const CONTROLS = { keyboard: { x: 40, y: 600 }, mic: { x: 150, y: 600 }, send: { x: 250, y: 700 } };
const END = SCRIPT.steps.at(-1).at;

function runScript({ pad = { w: 300, h: 640 }, tv = { w: 1100, h: 619 }, fps = 30, script = SCRIPT, targets = AIM } = {}) {
  const gain = tv.w / pad.w;
  const pointer = { x: script.pointer.x * tv.w, y: script.pointer.y * tv.h };
  const g = new Gestures();
  const log = [];
  const fingers = [];
  const presses = [];
  const progress = [];
  const dispatch = (time, actions) => actions.forEach((a) => {
    log.push({ time, type: a.type === 'drag' ? `drag:${a.down}` : a.type, pointer: { ...pointer } });
    if (a.type === 'move') { pointer.x += a.dx * gain; pointer.y += a.dy * gain; }
  });
  let done = false;
  let finger = null;
  let now = 0;
  const player = new ScriptPlayer({
    padSize: () => pad,
    gain: () => gain,
    pointer: () => ({ ...pointer }),
    target: (name) => targets[name],
    contact: (kind, p, t) => dispatch(t, kind === 'begin' ? g.begin(p, 1, t) : kind === 'move' ? g.move(p, 1, t) : g.end(p, 0, t)),
    finger: (p, touching) => { finger = p; fingers.push({ p, touching }); },
    control: (name) => CONTROLS[name],
    press: (name, down) => presses.push({ name, down, time: now }),
    progress: (kind, key, k) => progress.push({ kind, key, k, time: now }),
    step: () => {},
    done: () => { done = true; },
  });
  for (let i = 0; i <= (END + 1) * fps; i += 1) {
    const t = i / fps;
    now = t;
    player.update(t);
    // Where the finger was when a phone button went down.
    const last = presses.at(-1);
    if (last && last.down && last.time === t && !last.at) last.at = { ...finger };
    dispatch(t, g.advance(t));
  }
  return { log, pointer, done, fingers, presses, progress };
}

test('the scripted demo: every click lands on its target, double taps right-click, and it never drags', () => {
  for (const fps of [30, 60, 24]) {
    const { log, done } = runScript({ fps });
    const clicks = log.filter((e) => e.type !== 'move');
    // Act 1: select, right-click, Add to watchlist. Act 2: search box, Search. Act 3: clear, Search, right-click the result, Play.
    const expected = [['left', 'tile:4'], ['right', 'tile:4'], ['left', 'menu:1'], ['left', 'search:field'], ['left', 'search:go'],
      ['left', 'search:clear'], ['left', 'search:go'], ['right', 'tile:8'], ['left', 'menu:0']];
    assert.deepEqual(clicks.map((e) => e.type), expected.map((e) => e[0]), `fps ${fps}`);
    clicks.forEach((event, i) => {
      const target = AIM[expected[i][1]];
      assert.ok(Math.abs(event.pointer.x - target.x) < 0.5 && Math.abs(event.pointer.y - target.y) < 0.5, `fps ${fps}: ${expected[i][1]} ${JSON.stringify(event)}`);
    });
    assert.ok(done);
    // The first move of each slide comes well before the 300 ms hold could start.
    const firstMove = log.find((e) => e.type === 'move');
    assert.ok(firstMove.time - SCRIPT.steps[0].at < 0.3, `fps ${fps}: first move at ${firstMove.time}`);
  }
});

test('text on the phone: typed and dictated in full before the Send that delivers it, buttons pressed where they are', () => {
  const { presses, progress } = runScript();
  const ups = presses.filter((p) => !p.down);
  // Keyboard → (typing) → Send; microphone → (dictation) → microphone (stop) → Send.
  assert.deepEqual(ups.map((p) => p.name), ['keyboard', 'send', 'mic', 'mic', 'send']);
  for (const p of presses.filter((x) => x.down)) assert.deepEqual(p.at, CONTROLS[p.name], p.name);
  const finished = (kind) => progress.find((p) => p.kind === kind && p.k === 1);
  assert.equal(finished('type').key, 'demo.search.typed');
  assert.equal(finished('dictate').key, 'demo.search.spoken');
  assert.ok(finished('type').time > ups[0].time && finished('type').time < ups[1].time, 'typed after the keyboard opens, before Send');
  assert.ok(finished('dictate').time > ups[2].time && finished('dictate').time < ups[3].time, 'dictated while listening');
  assert.ok(ups[4].time > ups[3].time + 1, 'the dictated draft can be checked before Send');
  // Progress never goes backwards.
  for (const kind of ['type', 'dictate']) {
    const ks = progress.filter((p) => p.kind === kind).map((p) => p.k);
    ks.forEach((k, i) => { if (i) assert.ok(k >= ks[i - 1]); });
  }
});

test('the scripted finger lifts between steps, hides while typing, and a near-target slide is no touch at all', () => {
  const { fingers, presses } = runScript();
  // At 2.5 s the first slide is over and the tap at 3.2 s has not started: the finger is up.
  assert.equal(fingers[Math.round(2.5 * 30)].touching, false);
  // Gliding to a phone button is not a touch, so the touch area sees nothing.
  const glide = fingers[Math.round((SCRIPT.steps.find((s) => s.press).at + 0.2) * 30)];
  assert.equal(glide.touching, false);
  const typing = SCRIPT.steps.find((s) => s.type);
  assert.equal(fingers[Math.round((typing.at + typing.duration / 2) * 30)].p, null);
  assert.ok(presses.length === 10);
  const still = Object.fromEntries(Object.keys(AIM).map((k) => [k, { x: 0.2 * 1100 + 5, y: 0.8 * 619 }]));
  const near = runScript({ targets: still });
  assert.deepEqual(near.log.filter((e) => e.type.startsWith('drag')), []);
});

test('skipped time still finishes typing before the Send that follows it', () => {
  const script = { pointer: { x: 0.5, y: 0.5 }, finger: { x: 0.5, y: 0.5 }, steps: [
    { at: 0, type: 'demo.search.typed', duration: 1 }, { at: 2, press: 'send' }, { at: 4, end: true }] };
  const order = [];
  const player = new ScriptPlayer({
    padSize: () => ({ w: 300, h: 640 }), gain: () => 3, pointer: () => ({ x: 0, y: 0 }), target: () => null,
    contact: () => {}, finger: () => {}, control: () => ({ x: 10, y: 600 }), step: () => {}, done: () => {},
    press: (name, down) => order.push(`${name}:${down ? 'down' : 'up'}`),
    progress: (kind, key, k) => order.push(`${kind}:${k}`),
  }, script);
  // A stalled frame (or a still seek) jumps from 0.5 s straight past the Send.
  for (const t of [0, 0.5, 2.5]) player.update(t);
  assert.deepEqual(order, ['type:0', 'type:0', 'type:0.5', 'type:1', 'send:down', 'send:up']);
});
