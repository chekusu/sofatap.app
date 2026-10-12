// Fits the film to a language's narration. The scene (the website's scripted demo, title and
// end cards) has eight moments, one per narration cue: src/video/cues.json gives each cue its
// scene "anchor" and its planned start. A segment runs from one anchor to the next. When a cue
// is spoken for longer than its segment lasts, the segment is held on its last, resting frame
// until the narration has finished. The scene never runs faster or slower, nothing is cut,
// and each action still happens exactly as the cue that names it begins.

const GAP = 0.3; // silence after a cue before the next segment starts
const MIN_END = 4.2; // the end card stays at least this long
const TAIL = 1.4; // after the last word, before the video ends

/**
 * cues: the cues.json data (anchor = scene time of the cue's moment, start = planned speech start).
 * lengths: the measured length (s) of each spoken cue, in order.
 * sceneEnd: how much scene time exists after the last anchor (the recorded scene's length).
 * Returns { segments, duration, placements, captions }, times in seconds of the finished film.
 */
export function planFilm(cues, lengths, { sceneEnd = 30 } = {}) {
  const list = cues.cues;
  if (lengths.length !== list.length) throw new Error(`expected ${list.length} cue lengths, got ${lengths.length}`);
  lengths.forEach((l, i) => { if (!(l > 0 && Number.isFinite(l))) throw new Error(`cue ${i + 1} has no usable length`); });
  const segments = [];
  let filmAt = 0;
  list.forEach((cue, i) => {
    const sceneFrom = cue.anchor;
    const sceneTo = i + 1 < list.length ? list[i + 1].anchor : sceneEnd;
    const lead = cue.start - cue.anchor; // speech starts this long after the moment begins
    const natural = sceneTo - sceneFrom;
    const needed = lead + lengths[i] + (i + 1 < list.length ? GAP : TAIL);
    const length = Math.max(i + 1 < list.length ? natural : Math.min(natural, MIN_END), needed);
    segments.push({ sceneFrom, sceneTo, filmFrom: filmAt, filmTo: filmAt + length, speechAt: filmAt + lead, speechLength: lengths[i] });
    filmAt += length;
  });
  const duration = +filmAt.toFixed(3);
  const captions = segments.map((s, i) => {
    const next = segments[i + 1];
    const end = Math.min(s.speechAt + s.speechLength + 0.35, next ? next.speechAt - 0.05 : duration);
    return { start: +Math.max(0, s.speechAt - 0.05).toFixed(3), end: +end.toFixed(3) };
  });
  return { segments, duration, placements: segments.map((s) => +s.speechAt.toFixed(3)), captions };
}

/** Scene time to show at film time t: real speed inside a segment, then a hold on its last frame. */
export function sceneTime(plan, t) {
  const seg = plan.segments.find((s) => t < s.filmTo) ?? plan.segments.at(-1);
  return seg.sceneFrom + Math.min(Math.max(0, t - seg.filmFrom), seg.sceneTo - seg.sceneFrom - 1e-3);
}
