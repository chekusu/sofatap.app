// Subtitles for the demo video, generated from the language files and src/video/cues.json.
// The same cues produce the WebVTT tracks on the website and the ASS files that
// tools/film/voice.mjs burns into the per-language sharing copies.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CUES_FILE = path.join(ROOT, 'src', 'video', 'cues.json');

/** Reads and checks the cue timing: in order, non-overlapping, inside the video. */
export async function loadCues(file = CUES_FILE) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  validateCues(data);
  return data;
}

export function validateCues(data) {
  const fail = (msg) => { throw new Error(`字幕时间轴不正确：${msg}`); };
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!data || !num(data.duration) || data.duration <= 0 || !Array.isArray(data.cues) || data.cues.length === 0) fail('缺少 duration 或 cues');
  if ('label' in data) fail('不再使用常驻标注（label）');
  const all = data.cues;
  for (const cue of all) {
    if (!cue || typeof cue.key !== 'string' || !/^video\.[\w.]+$/.test(cue.key)) fail(`键名无效：${JSON.stringify(cue?.key)}`);
    if (!num(cue.start) || !num(cue.end) || !(cue.start >= 0 && cue.end > cue.start && cue.end <= data.duration)) fail(`${cue.key} 的时间无效`);
    // The scene moment a cue belongs to (tools/film/timeline.mjs); speech starts at or after it.
    if ('anchor' in cue && (!num(cue.anchor) || cue.anchor < 0 || cue.anchor > cue.start)) fail(`${cue.key} 的 anchor 无效`);
  }
  data.cues.forEach((cue, i) => {
    if (i > 0 && cue.start < data.cues[i - 1].end) fail(`${cue.key} 与上一条重叠`);
  });
  return data;
}

/** Planned cue times, or measured ones that must be finite, ordered and non-overlapping. */
export function cueTimes(data, timing) {
  if (!timing) return data.cues.map((c) => ({ start: c.start, end: c.end }));
  const ok = Array.isArray(timing) && timing.length === data.cues.length && timing.every((t, i) =>
    Number.isFinite(t?.start) && Number.isFinite(t?.end) && t.start >= 0 && t.end > t.start && (i === 0 || t.start >= timing[i - 1].end));
  if (!ok) throw new Error('字幕实测时间不正确：需要与字幕条数相同、递增且不重叠的 start/end');
  return timing.map((t) => ({ start: t.start, end: t.end }));
}

/** Keys every language file must provide for the video. */
export const cueKeys = (data) => data.cues.map((c) => c.key);

const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, '0')}`;
};

const plain = (value, key) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少字幕文案：${key}`);
  if (/[<>]|-->/.test(value)) throw new Error(`字幕文案 ${key} 不能包含 <、> 或 -->`);
  // A blank line would end a WebVTT cue early; keep each cue on one paragraph.
  if (/\n\s*\n|\r/.test(value)) throw new Error(`字幕文案 ${key} 不能包含空行或回车`);
  // Leading or trailing line breaks would render as empty caption lines.
  return value.trim().replace(/&/g, '&amp;');
};

/**
 * WebVTT for one language: the narration cues, in the player's default placement so native
 * controls never cover them. `timing` (optional) replaces the planned cue times with the
 * measured ones from the voiced video: [{ start, end }, …] in cue order.
 */
export function toVtt(strings, data, timing = null) {
  const at = cueTimes(data, timing);
  const lines = ['WEBVTT', ''];
  data.cues.forEach((cue, i) => {
    // No explicit line: players then keep the narration clear of their own controls.
    lines.push(String(i + 1), `${stamp(at[i].start)} --> ${stamp(at[i].end)}`, plain(strings[cue.key], cue.key), '');
  });
  return lines.join('\n');
}

const assTime = (seconds) => {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const assText = (value, key) => plain(value, key).replace(/&amp;/g, '&').replace(/[{}]/g, '').replace(/\n/g, '\\N');

/**
 * An ASS subtitle script for burning one language into the 1920x1080 video:
 * a boxed caption at the bottom and the simulation label at the top-left corner for every
 * language (the film keeps its brand mark at the top right).
 */
export function toAss(strings, data, { font = 'sans-serif', rtl = false, width = 1920, height = 1080, timing = null } = {}) {
  const at = cueTimes(data, timing);
  // A right-to-left mark gives each line a right-to-left base direction (punctuation on the left).
  const line = (text) => (rtl ? `\u200F${text}` : text);
  // Encoding -1 tells libass to take each line's base direction from its first strong character.
  const encoding = rtl ? -1 : 1;
  const scale = height / 1080;
  const size = Math.round(50 * scale);
  // Colours are &HAABBGGRR. Text #F0F5F3, box #11191B at ~15% transparency.
  const styles = [
    `Style: Caption,${font},${size},&H00F3F5F0,&H00F3F5F0,&H2611191B,&H2611191B,0,0,0,0,100,100,0,0,3,${Math.round(18 * scale)},0,2,${Math.round(160 * scale)},${Math.round(160 * scale)},${Math.round(64 * scale)},${encoding}`,
  ];
  const events = [
    ...data.cues.map((cue, i) => `Dialogue: 0,${assTime(at[i].start)},${assTime(at[i].end)},Caption,,0,0,0,,${line(assText(strings[cue.key], cue.key))}`),
  ];
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
