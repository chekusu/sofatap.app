// Makes the finished narrated videos for every language. The scene is recorded per language,
// retimed to that language's narration (tools/film/timeline.mjs): every action happens as the
// cue that names it begins, and segments hold on a resting frame while the voice finishes.
//
// For each language it reads either
//   A) one continuous narration   narration-<lang>.<mp3|wav|m4a|aac> + narration-<lang>.json
//      (character timestamps: ElevenLabs "alignment" { characters, character_start_times_seconds,
//      character_end_times_seconds }, or a list of { text, start, end } tokens), or
//   B) one clip per cue           narration-<lang>-1.<ext> … narration-<lang>-<cues>.<ext>
// cuts the cues out of A using the timestamps (B needs no cutting), records the scene to
// fit them (tools/film/record.mjs, same page and fixed clock), mixes the cues in at their
// segments, normalises loudness, and writes
//   <out>/site/sofatap-demo-<lang>.mp4      narrated, no burned captions (the website plays these)
//   <out>/site/sofatap-demo.<lang>.vtt      captions at the measured times
//   <out>/site/timing.json                  measured caption times for scripts/build.mjs --media
//   <out>/site/sofatap-demo-poster-<lang>.jpg   a frame after the first search, in that language
//   <out>/promo/sofatap-demo-<lang>-subtitled.mp4   narrated with captions burned in (for sharing)
//   <out>/report.json                        cue placement, lengths, loudness and warnings
//
// Usage:
//   node tools/film/voice.mjs --audio <dir> --out <dir> --playwright <playwright package>
//        [--langs en,ja] [--jobs 3] [--browser <chromium>] [--ffmpeg ffmpeg] [--font "<family>"]
// Caption fonts per script: SOFATAP_FONT_<LANG> (for example SOFATAP_FONT_JA); fontconfig falls back.
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCues, toAss, toVtt } from '../../scripts/captions.mjs';
import { LOCALES, mediaTag } from '../../scripts/locales.mjs';
import { narrationManifest } from './narration.mjs';
import { posterScene, record } from './record.mjs';
import { planFilm } from './timeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac'];

export function parseArgs(argv, env = process.env) {
  const args = { audio: null, out: null, playwright: env.SOFATAP_PLAYWRIGHT ?? null, browser: env.SOFATAP_BROWSER ?? null, langs: LOCALES.map((l) => l.lang).join(','), jobs: 3, ffmpeg: env.SOFATAP_FFMPEG ?? 'ffmpeg', font: 'sans-serif' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[key] = key === 'jobs' ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!args.audio || !args.out || !args.playwright) throw new Error('--audio, --out and --playwright (or SOFATAP_PLAYWRIGHT) are required');
  if (!Number.isInteger(args.jobs) || args.jobs < 1 || args.jobs > 8) throw new Error('--jobs must be 1–8');
  const playwright = /^[./]|^[A-Za-z]:[\\/]/.test(args.playwright) ? path.resolve(args.playwright) : args.playwright;
  const langs = args.langs.split(',');
  for (const lang of langs) if (!LOCALES.some((l) => l.lang === lang)) throw new Error(`Unknown language ${lang}`);
  const fonts = Object.fromEntries(langs.map((lang) => [lang, env[`SOFATAP_FONT_${mediaTag(lang).replace('-', '_').toUpperCase()}`] ?? args.font]));
  return { ...args, playwright, langs, fonts, audio: path.resolve(args.audio), out: path.resolve(args.out) };
}

// ---- character timestamps ----

/** Normalises the supported timestamp formats to { text, start[], end[] } per character. */
export function readAlignment(data) {
  // A list of alignment groups (one per generated chunk, absolute times) is joined in order.
  const groups = data?.timestamps ?? data?.result?.timestamps;
  if (Array.isArray(groups) && groups.length && Array.isArray(groups[0]?.characters)) {
    return groups.map((g) => readAlignment(g)).reduce((all, g) => ({ text: all.text + g.text, start: all.start.concat(g.start), end: all.end.concat(g.end) }));
  }
  const a = data?.alignment ?? data?.normalized_alignment ?? data;
  if (Array.isArray(a?.characters) && Array.isArray(a.character_start_times_seconds)) {
    return { text: a.characters.join(''), start: a.character_start_times_seconds.slice(), end: a.character_end_times_seconds.slice() };
  }
  const tokens = Array.isArray(data) ? data : data?.timestamps ?? data?.words ?? null;
  if (Array.isArray(tokens) && tokens.length) {
    let text = '';
    const start = [];
    const end = [];
    for (const t of tokens) {
      const s = String(t.text ?? t.char ?? t.word ?? '');
      const t0 = Number(t.start ?? t.start_time); const t1 = Number(t.end ?? t.end_time);
      [...s].forEach((ch, k, all) => {
        text += ch;
        start.push(t0 + ((t1 - t0) * k) / all.length);
        end.push(t0 + ((t1 - t0) * (k + 1)) / all.length);
      });
    }
    return { text, start, end };
  }
  throw new Error('Unrecognised timestamp format (expected ElevenLabs alignment or a token list)');
}

// Ignore spacing, line breaks and typographic variants when matching speech to the timestamps.
const KEEP = (ch) => !/[\s ​-‏]/.test(ch);
const fold = (ch) => ch.normalize('NFKC').toLowerCase().replace(/[’']/g, "'").replace(/[“”„«»]/g, '"');

/** Finds each cue's speech in the timestamped text, in order, and returns its time span. */
export function cueSpans(alignment, speeches) {
  const idx = [];
  let compact = '';
  // One index entry per UTF-16 unit of the folded text (a fold can expand, e.g. … to ...),
  // so offsets from compact.indexOf always map back to the source character.
  [...alignment.text].forEach((ch, i) => {
    if (!KEEP(ch)) return;
    const f = fold(ch);
    compact += f;
    for (let k = 0; k < f.length; k += 1) idx.push(i);
  });
  // Index from code points in alignment.text to the start/end arrays (one entry per character).
  let from = 0;
  return speeches.map((speech, n) => {
    const needle = [...speech].filter(KEEP).map(fold).join('');
    const at = compact.indexOf(needle, from);
    if (!needle || at < 0) throw new Error(`Cue ${n + 1} not found in the timestamps: ${speech}`);
    from = at + needle.length;
    const chars = [...alignment.text];
    const first = idx[at];
    const last = idx[at + needle.length - 1];
    // Code points and timestamp entries line up one to one.
    const codeIndex = (k) => chars.slice(0, k).length;
    const s = alignment.start[codeIndex(first)];
    const e = alignment.end[codeIndex(last)];
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) throw new Error(`Cue ${n + 1} has no usable timing`);
    return { start: s, end: e };
  });
}

// ---- cutting at pauses ----

const FRAME = 0.01; // seconds per loudness frame

/** Short-term loudness (RMS per 10 ms) of an audio file, decoded with ffmpeg. */
export function loudness(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Cannot decode ${file}`);
  const samples = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
  const per = 160;
  const env = new Float32Array(Math.floor(samples.length / per));
  for (let f = 0; f < env.length; f += 1) {
    let sum = 0;
    for (let k = 0; k < per; k += 1) { const v = samples[f * per + k] / 32768; sum += v * v; }
    env[f] = Math.sqrt(sum / per);
  }
  return env;
}

/**
 * Turns estimated cue spans into cut points at real pauses: each boundary between two cues is
 * the centre of the quietest 120 ms between them (searching a little either side). The cues
 * partition the whole file: contiguous, nothing dropped, nothing repeated.
 */
export function refineCuts(env, spans) {
  const total = env.length * FRAME;
  const quietest = (from, to) => {
    const a = Math.max(0, Math.floor(from / FRAME)); const b = Math.min(env.length - 12, Math.ceil(to / FRAME));
    let best = a; let bestSum = Infinity;
    for (let f = a; f <= b; f += 1) {
      let sum = 0;
      for (let k = 0; k < 12; k += 1) sum += env[f + k];
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    return (best + 6) * FRAME;
  };
  const cuts = [];
  for (let i = 0; i + 1 < spans.length; i += 1) {
    const lo = Math.min(spans[i].end, spans[i + 1].start) - 0.35;
    const hi = Math.max(spans[i].end, spans[i + 1].start) + 0.35;
    cuts.push(quietest(Math.max(lo, spans[i].start + 0.2), Math.min(hi, spans[i + 1].end - 0.2)));
  }
  // The cues cover the file from 0 to its measured end, contiguous and without overlap,
  // so the full narration is preserved.
  const first = 0;
  const last = total;
  return spans.map((_, i) => ({ from: i ? cuts[i - 1] : first, to: i + 1 < spans.length ? cuts[i] : last }));
}

// ---- ffmpeg ----

function run(ffmpeg, args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.split('\n').slice(-6).join(' ')}`);
  return r.stderr;
}
export function mediaDuration(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  if (!m) throw new Error(`Cannot read the duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function findAudio(dir, tag, lang, count) {
  const names = await readdir(dir);
  const pick = (base) => names.find((n) => AUDIO_EXT.includes(path.extname(n).toLowerCase()) && path.basename(n, path.extname(n)) === base);
  // narration-<tag>.<ext> + .json, or simply <lang>.<ext> + <lang>.json.
  for (const base of [`narration-${tag}`, lang, tag]) {
    const full = pick(base);
    if (!full) continue;
    const json = names.find((n) => n === `${base}.json`);
    if (!json) throw new Error(`${full} needs ${base}.json with character timestamps`);
    return { kind: 'full', file: path.join(dir, full), timestamps: path.join(dir, json) };
  }
  const clips = Array.from({ length: count }, (_, i) => pick(`narration-${tag}-${i + 1}`));
  if (clips.every(Boolean)) return { kind: 'clips', files: clips.map((n) => path.join(dir, n)) };
  throw new Error(`No narration for ${tag}: expected narration-${tag}.<audio> + .json, or narration-${tag}-1…${count}.<audio>`);
}

export async function voice(args) {
  const cues = await loadCues();
  const manifest = await narrationManifest();
  const site = path.join(args.out, 'site');
  const promo = path.join(args.out, 'promo');
  await mkdir(site, { recursive: true });
  await mkdir(promo, { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-voice-'));
  const report = { languages: {} };
  try { Object.assign(report.languages, JSON.parse(await readFile(path.join(args.out, 'report.json'), 'utf8')).languages); } catch { /* first run */ }
  // Written after every language, so an interrupted run keeps what it finished.
  const save = async () => {
    await writeFile(path.join(site, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`);
    await writeFile(path.join(args.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  };
  let timing = {};
  try { timing = JSON.parse(await readFile(path.join(site, 'timing.json'), 'utf8')); } catch { /* first run */ }

  async function one(lang) {
    const tag = mediaTag(lang);
    const l = LOCALES.find((x) => x.lang === lang);
    const entry = manifest.languages[lang];
    const source = await findAudio(args.audio, tag, lang, cues.cues.length);
    // Where each cue sits in its audio input.
    let spans;
    let inputs;
    if (source.kind === 'full') {
      spans = cueSpans(readAlignment(JSON.parse(await readFile(source.timestamps, 'utf8'))), entry.cues.map((c) => c.speech));
      inputs = spans.map(() => source.file);
      // Timestamps can be spread evenly over a chunk of words, so the cut between two cues is
      // moved to the quietest moment near it in the audio itself, between words.
      spans = refineCuts(loudness(args.ffmpeg, source.file), spans);
    } else {
      inputs = source.files;
      spans = source.files.map((f) => ({ from: 0, to: mediaDuration(args.ffmpeg, f) }));
    }
    const plan = planFilm(cues, spans.map((sp) => sp.to - sp.from), { sceneEnd: cues.duration });

    // The scene, recorded to this language's plan (silent, H.264).
    const work = path.join(tmp, tag);
    await mkdir(work, { recursive: true });
    // The page is this language's own, so the scene's text (titles, search, Send) is in it too.
    const posterSegment = plan.segments.find((s) => s.sceneFrom <= posterScene(cues) && posterScene(cues) < s.sceneTo);
    await record({ out: work, name: 'silent.mp4', plan, playwright: args.playwright, browser: args.browser, ffmpeg: args.ffmpeg,
      lang, fps: 30, quiet: true, posterAt: posterSegment.filmFrom + (posterScene(cues) - posterSegment.sceneFrom) });
    await copyFile(path.join(work, 'sofatap-demo-poster.jpg'), path.join(site, `sofatap-demo-poster-${tag}.jpg`));

    // One audio track: every cue trimmed, delayed to its segment, mixed, normalised, padded.
    const files = [...new Set(inputs)];
    const parts = spans.map((sp, i) => {
      const input = files.indexOf(inputs[i]) + 1;
      const ms = Math.round(plan.placements[i] * 1000);
      return `[${input}:a]atrim=${sp.from.toFixed(3)}:${sp.to.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,`
        + `afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, sp.to - sp.from - 0.05).toFixed(3)}:d=0.05,adelay=${ms}|${ms}[c${i}]`;
    });
    const graph = `${parts.join(';')};${spans.map((_, i) => `[c${i}]`).join('')}amix=inputs=${spans.length}:normalize=0,`
      + `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur=${plan.duration},atrim=0:${plan.duration}[a]`;
    const output = path.join(site, `sofatap-demo-${tag}.mp4`);
    run(args.ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(work, 'silent.mp4'), ...files.flatMap((f) => ['-i', f]),
      '-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
      '-movflags', '+faststart', '-t', String(plan.duration), output]);

    // Captions at the measured times: WebVTT for the site, burned in for the sharing copy.
    const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
    await writeFile(path.join(site, `sofatap-demo.${tag}.vtt`), toVtt(strings, cues, plan.captions));
    const ass = path.join(work, `${tag}.ass`);
    await writeFile(ass, toAss(strings, cues, { font: args.fonts[lang], rtl: Boolean(l.rtl), timing: plan.captions }));
    run(args.ffmpeg, ['-y', '-loglevel', 'error', '-i', output, '-vf', `ass=filename='${ass.replace(/[\\':]/g, '\\$&')}':shaping=complex`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', path.join(promo, `sofatap-demo-${tag}-subtitled.mp4`)]);

    // Loudness and peak of the result, so clipping or silence is caught.
    const stats = run(args.ffmpeg, ['-hide_banner', '-nostats', '-i', output, '-af', 'volumedetect', '-f', 'null', '-']);
    const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(stats)?.[1]);
    const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(stats)?.[1]);
    const warnings = [];
    if (!(peak <= -0.5)) warnings.push(`peak ${peak} dB is close to clipping`);
    if (plan.duration > 75) warnings.push(`video is ${plan.duration.toFixed(2)} s, over 75 s`);
    timing[lang] = plan.captions;
    report.languages[lang] = {
      duration: plan.duration, peakDb: peak, meanDb: mean, warnings,
      cues: plan.segments.map((sg, i) => ({ key: entry.cues[i].key, speechAt: +sg.speechAt.toFixed(3), speechLength: +sg.speechLength.toFixed(3),
        heldFor: +Math.max(0, (sg.filmTo - sg.filmFrom) - (sg.sceneTo - sg.sceneFrom)).toFixed(3) })),
    };
    await save();
    console.log(`${lang}: ${plan.duration.toFixed(2)} s, peak ${peak} dB${warnings.length ? `, ${warnings.join('; ')}` : ''}`);
  }

  try {
    const queue = args.langs.slice();
    const workers = Array.from({ length: Math.min(args.jobs, queue.length) }, async () => {
      for (let lang = queue.shift(); lang; lang = queue.shift()) await one(lang);
    });
    await Promise.all(workers);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  await save();
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await voice(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`Voice assembly failed: ${error.message}`);
    process.exitCode = 1;
  }
}
