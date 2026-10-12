// Shared, DOM-free logic for the phone → TV simulation on the website.
// The page script (main.js), the recorded demo video (tools/film) and the unit tests
// all use this file, so the interactive demo, the "Play demo" button and the video
// follow the same gesture rules and the same scripted timeline.
(function (global) {
  'use strict';

  // Gesture rules from the Sofatap iPhone app's touch surface (TouchGestureState):
  // a single tap waits for the double-tap window, so a double tap sends ONLY a right click.
  var HOLD = 0.3; // seconds of stillness before a hold becomes a drag
  var DOUBLE_INTERVAL = 0.28; // seconds after the first lift in which a second tap counts
  var TOLERANCE = 7; // points of movement before a touch counts as a slide
  var DOUBLE_DISTANCE = 32; // points between the two taps of a double tap

  function distance(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }

  /**
   * Touch semantics. Times are in seconds. Each call returns a list of actions:
   * { type: 'move', dx, dy } | { type: 'left' } | { type: 'right' } | { type: 'drag', down } | { type: 'scroll', dy }
   */
  // options.doubleInterval: website-only override for a desktop mouse, whose double click
  // follows the computer's slower double-click timing; touch keeps the app's 280 ms.
  function Gestures(options) {
    this.doubleInterval = options && options.doubleInterval ? options.doubleInterval : DOUBLE_INTERVAL;
    this.mode = 'idle';
    this.origin = { x: 0, y: 0 };
    this.previous = { x: 0, y: 0 };
    this.holdDeadline = null;
    this.moved = false;
    this.secondTap = false;
    this.pendingTap = null;
    this.dragging = false;
  }

  Gestures.prototype.nextDeadline = function () {
    var times = [this.holdDeadline, this.pendingTap && this.pendingTap.deadline].filter(function (t) { return t !== null && t !== undefined; });
    return times.length ? Math.min.apply(null, times) : null;
  };

  Gestures.prototype.begin = function (point, count, time) {
    if (count <= 0) return [];
    if (count !== 1 || this.mode !== 'idle') return this.switchContactCount(count, point);
    var actions = this.advance(time);
    this.secondTap = false;
    if (this.pendingTap) {
      if (time < this.pendingTap.deadline && distance(this.pendingTap.point, point) <= DOUBLE_DISTANCE) this.secondTap = true;
      else actions.push({ type: 'left' });
    }
    this.pendingTap = null;
    this.mode = 'one';
    this.origin = { x: point.x, y: point.y };
    this.previous = { x: point.x, y: point.y };
    this.moved = false;
    this.holdDeadline = time + HOLD;
    return actions;
  };

  Gestures.prototype.move = function (point, count, time) {
    if (count <= 0) return [];
    if (count === 2 && this.mode !== 'two') return this.switchContactCount(count, point);
    if (count > 2 || (count === 1 && this.mode === 'two')) return this.switchContactCount(count, point);
    if (this.mode !== 'one' && this.mode !== 'two') return [];
    var dx = point.x - this.previous.x;
    var dy = point.y - this.previous.y;
    this.previous = { x: point.x, y: point.y };
    if (this.mode === 'two') return dy === 0 ? [] : [{ type: 'scroll', dy: -dy }];
    if (distance(this.origin, point) > TOLERANCE) {
      this.moved = true;
      this.holdDeadline = null;
    }
    var actions = this.advance(time);
    if ((this.dragging || this.moved) && (dx !== 0 || dy !== 0)) actions.push({ type: 'move', dx: dx, dy: dy });
    return actions;
  };

  Gestures.prototype.end = function (point, remaining, time) {
    if (remaining > 0) {
      var released = this.dragging ? [{ type: 'drag', down: false }] : [];
      this.resetContact();
      this.mode = 'suppressed';
      this.pendingTap = null;
      return released;
    }
    var actions = [];
    if (this.mode === 'one') {
      if (distance(this.origin, point) > TOLERANCE) { this.moved = true; this.holdDeadline = null; }
      actions = actions.concat(this.advance(time));
      if (this.dragging) actions.push({ type: 'drag', down: false });
      else if (!this.moved) {
        if (this.secondTap) actions.push({ type: 'right' });
        else this.pendingTap = { point: { x: point.x, y: point.y }, deadline: time + this.doubleInterval };
      }
    }
    this.resetContact();
    return actions;
  };

  Gestures.prototype.advance = function (time) {
    var actions = [];
    if (this.pendingTap && time >= this.pendingTap.deadline) {
      this.pendingTap = null;
      actions.push({ type: 'left' });
    }
    if (this.holdDeadline !== null && time >= this.holdDeadline && this.mode === 'one' && !this.moved && !this.dragging) {
      this.holdDeadline = null;
      this.pendingTap = null;
      this.secondTap = false;
      this.dragging = true;
      actions.push({ type: 'drag', down: true });
    }
    return actions;
  };

  /** Interruption drops deferred clicks and releases a held drag. */
  Gestures.prototype.cancel = function () {
    var actions = this.dragging ? [{ type: 'drag', down: false }] : [];
    this.pendingTap = null;
    this.resetContact();
    return actions;
  };

  /** Website-only: a browser double click consumed the waiting tap, so it must not click later. */
  Gestures.prototype.dropPendingTap = function () { this.pendingTap = null; };

  /** Website-only: a mouse right button sends a waiting tap first, in order. */
  Gestures.prototype.flushPendingTap = function () {
    if (!this.pendingTap) return [];
    this.pendingTap = null;
    return [{ type: 'left' }];
  };

  Gestures.prototype.switchContactCount = function (count, point) {
    var actions = this.dragging ? [{ type: 'drag', down: false }] : [];
    this.resetContact();
    this.pendingTap = null;
    this.mode = count === 2 ? 'two' : 'suppressed';
    this.previous = { x: point.x, y: point.y };
    return actions;
  };

  Gestures.prototype.resetContact = function () {
    this.mode = 'idle';
    this.holdDeadline = null;
    this.dragging = false;
    this.moved = false;
    this.secondTap = false;
  };

  // ---------------------------------------------------------------------------
  // The scripted demo. Times are seconds from the start of the script. A slide names
  // the TV target the pointer should reach; the finger path on the phone is worked out
  // from the pointer gain, so the same script lands correctly at any page size.
  var SCRIPT = {
    pointer: { x: 0.2, y: 0.8 }, // where the TV pointer starts (fractions of the screen)
    finger: { x: 0.34, y: 0.68 }, // where the finger rests on the phone (fractions of the touch area)
    steps: [
      { at: 0.2, slide: 'tile:4', duration: 1.9, gesture: 'slide' },
      { at: 3.2, tap: true, gesture: 'tap' },
      { at: 5.2, doubleTap: true, gesture: 'double' },
      { at: 8.2, slide: 'menu:0', duration: 0.8, gesture: 'slide' },
      { at: 9.3, tap: true, gesture: 'tap' },
      { at: 14.3, end: true },
    ],
  };
  var TAP_LENGTH = 0.08;
  var DOUBLE_SECOND = 0.2;
  var EDGE = 0.12; // keep the scripted finger this far inside the touch area
  var SLOP_TIME = 0.08; // a scripted slide passes the touch tolerance this quickly

  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /**
   * Plays SCRIPT through the same contact handlers as real touches.
   * io = {
   *   padSize(): { w, h }            touch area size in px
   *   gain(): number                 TV px moved per phone px
   *   pointer(): { x, y }            TV pointer in px
   *   target(name): { x, y } | null  centre of a TV target in px
   *   contact(kind, point, time)     kind: 'begin' | 'move' | 'end'
   *   finger(point | null, touching) show the scripted finger
   *   step(step)                     a step started (for captions and the gesture legend)
   *   done()
   * }
   */
  function ScriptPlayer(io, script) {
    this.io = io;
    this.script = script || SCRIPT;
    this.index = 0;
    this.events = [];
    this.slide = null;
    this.finished = false;
    var size = io.padSize();
    this.finger = { x: this.script.finger.x * size.w, y: this.script.finger.y * size.h };
    io.finger(this.finger, false);
  }

  ScriptPlayer.prototype.update = function (t) {
    if (this.finished) return;
    var io = this.io;
    for (;;) {
      var next = this.nextTime();
      if (next === null || next > t) break;
      this.fire(next);
      if (this.finished) return;
    }
    if (this.slide && t >= this.slide.t0) this.slideTo(Math.min(t, this.slide.t1));
    io.finger(this.finger, Boolean(this.slide) || Boolean(this.touching));
  };

  // The earliest pending moment: a queued contact event or the next step.
  ScriptPlayer.prototype.nextTime = function () {
    var times = [];
    if (this.events.length) times.push(this.events[0].time);
    if (this.slide && this.slide.done === false && this.slide.ending) times.push(this.slide.t1);
    var step = this.script.steps[this.index];
    if (step) times.push(step.at);
    return times.length ? Math.min.apply(null, times) : null;
  };

  ScriptPlayer.prototype.fire = function (time) {
    var io = this.io;
    if (this.events.length && this.events[0].time <= time) {
      var e = this.events.shift();
      if (e.kind === 'begin') this.touching = true;
      if (e.kind === 'end') this.touching = false;
      io.contact(e.kind, { x: this.finger.x, y: this.finger.y }, e.time);
      return;
    }
    if (this.slide && this.slide.ending && time >= this.slide.t1) {
      this.slideTo(this.slide.t1);
      this.touching = false;
      io.contact('end', { x: this.finger.x, y: this.finger.y }, this.slide.t1);
      this.slide = null;
      return;
    }
    var step = this.script.steps[this.index];
    this.index += 1;
    io.step(step);
    if (step.end) { this.finished = true; io.finger(null, false); io.done(); return; }
    if (step.tap) {
      this.events.push({ kind: 'begin', time: step.at }, { kind: 'end', time: step.at + TAP_LENGTH });
    } else if (step.doubleTap) {
      this.events.push({ kind: 'begin', time: step.at }, { kind: 'end', time: step.at + TAP_LENGTH },
        { kind: 'begin', time: step.at + DOUBLE_SECOND }, { kind: 'end', time: step.at + DOUBLE_SECOND + TAP_LENGTH });
    } else if (step.slide) {
      this.startSlide(step);
    }
  };

  ScriptPlayer.prototype.startSlide = function (step) {
    var io = this.io;
    var size = io.padSize();
    var gain = io.gain();
    var from = io.pointer();
    var to = io.target(step.slide) || from;
    var dx = (to.x - from.x) / gain;
    var dy = (to.y - from.y) / gain;
    // The pointer is already (almost) there: no touch at all, so no hold can start.
    if (Math.sqrt(dx * dx + dy * dy) <= TOLERANCE + 1) { this.slide = null; return; }
    // Start where the finger rests, shifted so the whole path stays on the touch area.
    var sx = clamp(this.finger.x, EDGE * size.w - Math.min(0, dx), (1 - EDGE) * size.w - Math.max(0, dx));
    var sy = clamp(this.finger.y, EDGE * size.h - Math.min(0, dy), (1 - EDGE) * size.h - Math.max(0, dy));
    this.finger = { x: sx, y: sy };
    this.slide = { t0: step.at, t1: step.at + step.duration, from: { x: sx, y: sy }, dx: dx, dy: dy, ending: true, done: false, sent: false };
    this.touching = true;
    io.contact('begin', { x: sx, y: sy }, step.at);
  };

  // Moves the finger along its path. Like a person starting a slide, the finger passes the
  // touch tolerance within SLOP_TIME (well before the 300 ms hold would start a drag), then
  // eases to the end. Movement is reported from the moment it is past the tolerance, in one
  // piece, so no distance is lost and the pointer lands on its target.
  ScriptPlayer.prototype.slideTo = function (time) {
    var s = this.slide;
    var length = Math.sqrt(s.dx * s.dx + s.dy * s.dy);
    if (length <= TOLERANCE + 1) return; // too short to be a slide; the pointer is already there
    var slop = (TOLERANCE + 1) / length;
    var elapsed = Math.max(0, time - s.t0);
    var k = elapsed <= SLOP_TIME
      ? slop * (elapsed / SLOP_TIME)
      : slop + (1 - slop) * ease(clamp((elapsed - SLOP_TIME) / (s.t1 - s.t0 - SLOP_TIME), 0, 1));
    if (time >= s.t1) k = 1;
    this.finger = { x: s.from.x + s.dx * k, y: s.from.y + s.dy * k };
    if (s.sent || k * length > TOLERANCE + 0.5) {
      s.sent = true;
      this.io.contact('move', { x: this.finger.x, y: this.finger.y }, time);
    }
  };

  var api = {
    Gestures: Gestures,
    ScriptPlayer: ScriptPlayer,
    SCRIPT: SCRIPT,
    RULES: { hold: HOLD, doubleInterval: DOUBLE_INTERVAL, tolerance: TOLERANCE, doubleDistance: DOUBLE_DISTANCE, mouseDoubleInterval: 0.5 },
    ease: ease,
  };
  global.SofatapDemoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
