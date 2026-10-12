// Revises finished narrated videos without recording them again: the end card (and anything
// after its first frame) is re-rendered from the current page and film setup, then spliced
// onto the existing footage. The narration track is copied unchanged, captions are rebuilt
// from the measured timing with the current caption settings, and the subtitled sharing
// copies are burned again from the revised clean videos.
//
// Input: a previous tools/film/voice.mjs (or outro.mjs) output directory (site/*.mp4,
// site/timing.json, report.json). Output: the same layout in --out (report.json copied),
// plus outro-report.json.
//
// Usage:
//   node tools/film/outro.mjs --from <previous output> --out <dir> --playwright <playwright package>
//        [--langs en,zh-CN] [--jobs 3] [--browser <chromium>] [--ffmpeg ffmpeg] [--font "<family>"]
// Caption fonts per script: SOFATAP_FONT_<LANG>, as for voice.mjs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCues, toAss, toVtt } from '../../scripts/captions.mjs';
import { LOCALES, mediaTag } from '../../scripts/locales.mjs';
import { record } from './record.mjs';
import { mediaDuration } from './voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FPS = 30;

export function parseArgs(argv, env = process.env) {
  const args = { from: null, out: null, playwright: env.SOFATAP_PLAYWRIGHT ?? null, browser: env.SOFATAP_BROWSER ?? null,
    langs: LOCALES.map((l) => l.lang).join(','), jobs: 3, ffmpeg: env.SOFATAP_FFMPEG ?? 'ffmpeg', font: 'sans-serif' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[key] = key === 'jobs' ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!args.from || !args.out || !args.playwright) throw new Error('--from, --out and --playwright (or SOFATAP_PLAYWRIGHT) are required');
  if (path.resolve(args.from) === path.resolve(args.out)) throw new Error('--out must differ from --from (the previous videos are kept)');
  if (!Number.isInteger(args.jobs) || args.jobs < 1 || args.jobs > 8) throw new Error('--jobs must be 1–8');
  const langs = args.langs.split(',');
  for (const lang of langs) if (!LOCALES.some((l) => l.lang === lang)) throw new Error(`Unknown language ${lang}`);
  const fonts = Object.fromEntries(langs.map((lang) => [lang, env[`SOFATAP_FONT_${mediaTag(lang).replace('-', '_').toUpperCase()}`] ?? args.font]));
  const playwright = /^[./]|^[A-Za-z]:[\\/]/.test(args.playwright) ? path.resolve(args.playwright) : args.playwright;
  return { ...args, playwright, langs, fonts, from: path.resolve(args.from), out: path.resolve(args.out) };
}

function run(ffmpeg, argv) {
  const r = spawnSync(ffmpeg, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.split('\n').slice(-6).join(' ')}`);
  return r.stderr;
}
// Hash of a stream's packets (copied, not decoded): equal hashes mean an identical track.
function streamHash(ffmpeg, file, stream) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-map', `0:${stream}`, '-c', 'copy', '-f', 'data', '-'], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Cannot read ${stream} of ${file}`);
  return createHash('sha256').update(r.stdout).digest('hex');
}
function frameCount(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.stdout.split('\n').filter((l) => l && !l.startsWith('#')).length;
}

/**
 * Where the end card begins in a language's film: the last cue's speech start minus its lead
 * (cues.json start − anchor). The last segment runs at real speed from scene time `anchor`.
 */
export function endSegment(cues, reportEntry) {
  const last = cues.cues.at(-1);
  const filmFrom = reportEntry.cues.at(-1).speechAt - (last.start - last.anchor);
  return { filmFrom, sceneFrom: last.anchor, firstFrame: Math.floor(filmFrom * FPS + 1e-6) };
}

export async function revise(args) {
  const cues = await loadCues();
  const previous = JSON.parse(await readFile(path.join(args.from, 'report.json'), 'utf8'));
  const timing = JSON.parse(await readFile(path.join(args.from, 'site', 'timing.json'), 'utf8'));
  const site = path.join(args.out, 'site');
  const promo = path.join(args.out, 'promo');
  await mkdir(site, { recursive: true });
  await mkdir(promo, { recursive: true });
  // The measured narration report travels with the videos, so this output can be revised again.
  await copyFile(path.join(args.from, 'report.json'), path.join(args.out, 'report.json'));
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-outro-'));
  const report = { from: args.from, languages: {} };
  try { Object.assign(report.languages, JSON.parse(await readFile(path.join(args.out, 'outro-report.json'), 'utf8')).languages); } catch { /* first run */ }
  const save = async () => {
    await writeFile(path.join(site, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`);
    await writeFile(path.join(args.out, 'outro-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  };

  async function one(lang) {
    const tag = mediaTag(lang);
    const l = LOCALES.find((x) => x.lang === lang);
    const source = path.join(args.from, 'site', `sofatap-demo-${tag}.mp4`);
    const duration = mediaDuration(args.ffmpeg, source);
    const frames = frameCount(args.ffmpeg, source);
    const end = endSegment(cues, previous.languages[lang]);
    // The scene before the end card is only stepped through; the tail is captured frame by frame.
    const plan = {
      duration: frames / FPS,
      segments: [
        { sceneFrom: 0, sceneTo: end.sceneFrom, filmFrom: 0, filmTo: end.filmFrom },
        { sceneFrom: end.sceneFrom, sceneTo: cues.duration, filmFrom: end.filmFrom, filmTo: frames / FPS },
      ],
    };
    const work = path.join(tmp, tag);
    await mkdir(work, { recursive: true });
    await record({ out: work, name: 'tail.mp4', plan, tail: { firstFrame: end.firstFrame }, playwright: args.playwright,
      browser: args.browser, ffmpeg: args.ffmpeg, lang, fps: FPS, quiet: true });
    // The poster comes from the unchanged part of the film.
    await copyFile(path.join(args.from, 'site', `sofatap-demo-poster-${tag}.jpg`), path.join(site, `sofatap-demo-poster-${tag}.jpg`));

    // Existing footage up to the end card, then the new tail; the narration track is copied.
    const output = path.join(site, `sofatap-demo-${tag}.mp4`);
    run(args.ffmpeg, ['-y', '-loglevel', 'error', '-i', source, '-i', path.join(work, 'tail.mp4'),
      '-filter_complex', `[0:v]trim=end_frame=${end.firstFrame},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]`,
      '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-profile:v', 'high',
      '-r', String(FPS), '-c:a', 'copy', '-movflags', '+faststart', output]);

    // Checks: same frame count, narration packets identical to the previous video.
    const newFrames = frameCount(args.ffmpeg, output);
    const audioSame = streamHash(args.ffmpeg, source, 'a') === streamHash(args.ffmpeg, output, 'a');
    if (newFrames !== frames) throw new Error(`${lang}: ${newFrames} frames, expected ${frames}`);
    if (!audioSame) throw new Error(`${lang}: narration track changed`);

    // Captions from the measured timing, with the current placement; then the sharing copy.
    const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
    await writeFile(path.join(site, `sofatap-demo.${tag}.vtt`), toVtt(strings, cues, timing[lang]));
    const ass = path.join(work, `${tag}.ass`);
    await writeFile(ass, toAss(strings, cues, { font: args.fonts[lang], rtl: Boolean(l.rtl), timing: timing[lang] }));
    run(args.ffmpeg, ['-y', '-loglevel', 'error', '-i', output, '-vf', `ass=filename='${ass.replace(/[\\':]/g, '\\$&')}':shaping=complex`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', path.join(promo, `sofatap-demo-${tag}-subtitled.mp4`)]);

    report.languages[lang] = { duration, frames, endCardFrom: +end.filmFrom.toFixed(3), firstReplacedFrame: end.firstFrame, narrationUnchanged: audioSame };
    await save();
    console.log(`${lang}: end card from ${end.filmFrom.toFixed(2)} s (frame ${end.firstFrame} of ${frames}), narration unchanged`);
  }

  try {
    const queue = args.langs.slice();
    await Promise.all(Array.from({ length: Math.min(args.jobs, queue.length) }, async () => {
      for (let lang = queue.shift(); lang; lang = queue.shift()) await one(lang);
    }));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  await save();
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await revise(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`Outro revision failed: ${error.message}`);
    process.exitCode = 1;
  }
}
