// Records the website's phone → TV simulation as the silent 1920x1080 base video.
// It loads a fresh build of the real page, frames the same demo with film.css, and steps the
// demo's own clock frame by frame (SofatapDemo.film), so the video follows exactly the
// scripted timeline the "Play demo" button uses. Captions are added by burn.mjs.
//
// Usage:
//   node tools/film/record.mjs --out <dir> --playwright <path to the playwright package>
//        [--browser <chromium executable>] [--ffmpeg ffmpeg] [--lang en] [--fps 30]
// Paths can also come from SOFATAP_PLAYWRIGHT, SOFATAP_BROWSER and SOFATAP_FFMPEG.
// Writes <out>/sofatap-demo.mp4 (H.264, yuv420p, faststart, no audio) and sofatap-demo-poster.jpg.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.mjs';
import { loadCues } from '../../scripts/captions.mjs';
import { LOCALES } from '../../scripts/locales.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WIDTH = 1920;
const HEIGHT = 1080;
// Film timeline in seconds (captions in src/video/cues.json follow the same moments).
const INTRO_END = 3.2; // the title card fades out here
const SCRIPT_START = 6.3; // the scripted demo starts (finger appears)
const OUTRO_START = 20.6; // the end card fades in here
const FADE = 0.5;

export function parseArgs(argv, env = process.env) {
  const args = {
    out: null, playwright: env.SOFATAP_PLAYWRIGHT ?? null, browser: env.SOFATAP_BROWSER ?? null,
    ffmpeg: env.SOFATAP_FFMPEG ?? 'ffmpeg', lang: 'en', fps: 30,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[key] = key === 'fps' ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!args.out) throw new Error('--out <dir> is required');
  if (!args.playwright) throw new Error('--playwright <path> or SOFATAP_PLAYWRIGHT is required');
  if (!LOCALES.some((l) => l.lang === args.lang)) throw new Error(`Unknown --lang ${args.lang}`);
  if (!Number.isInteger(args.fps) || args.fps < 24 || args.fps > 60) throw new Error('--fps must be 24–60');
  // A path to the playwright package is taken relative to where the command runs;
  // a bare package name (for example "playwright") is resolved like an import.
  const playwright = /^[./]|^[A-Za-z]:[\\/]/.test(args.playwright) ? path.resolve(args.playwright) : args.playwright;
  return { ...args, playwright, out: path.resolve(args.out) };
}

function serve(dir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), '--dir', dir, '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
    proc.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\/\S*/); if (m) resolve({ proc, url: m[0] }); });
    proc.on('exit', (code) => reject(new Error(`preview server exited (${code})`)));
  });
}

// Runs in the page: moves the demo into the film frame and adds the title and end cards.
function setUpFilm({ intro, script, outro, fade }) {
  const demo = document.getElementById('demo');
  for (const img of document.images) img.loading = 'eager';
  const film = document.createElement('div');
  film.className = 'film';
  film.setAttribute('aria-hidden', 'true');
  const mark = document.querySelector('.brand__mark').getAttribute('src');
  const brand = `<img src="${mark}" alt="">`;
  film.innerHTML = `<div class="film__brand">${brand}<span>Sofatap</span></div>`
    + `<div class="film__card film__card--intro">${brand}<p class="film__name">Sofatap</p><span class="film__rule"></span></div>`
    + `<div class="film__card film__card--outro">${brand}<p class="film__name">Sofatap</p><p class="film__url">github.com/chekusu/sofatap</p></div>`;
  film.insertBefore(demo, film.firstChild);
  document.body.appendChild(film);
  document.body.classList.add('is-filming');
  window.SofatapDemo.film.begin({ neutral: true });
  const introCard = film.querySelector('.film__card--intro');
  const outroCard = film.querySelector('.film__card--outro');
  const clamp = (v) => Math.min(1, Math.max(0, v));
  window.__filmSeek = (t) => {
    introCard.style.opacity = String(1 - clamp((t - intro) / fade));
    outroCard.style.opacity = String(clamp((t - outro) / fade));
    window.SofatapDemo.film.seek(t - script);
    return window.SofatapDemo.film.state();
  };
}

export async function record(args) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(args.playwright);
  const cues = await loadCues();
  const duration = cues.duration;
  await mkdir(args.out, { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-film-'));
  const site = path.join(tmp, 'site');
  let server = null;
  let browser = null;
  let ffmpeg = null;
  const output = path.join(args.out, 'sofatap-demo.mp4');
  try {
    await build({ config: path.join(ROOT, 'site.config.json'), out: site });
    server = await serve(site);
    browser = await chromium.launch(args.browser ? { executablePath: args.browser } : {});
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const locale = LOCALES.find((l) => l.lang === args.lang);
    await page.goto(new URL(locale.dir ? `${locale.dir}/` : './', server.url).href, { waitUntil: 'load' });
    await page.addStyleTag({ content: await readFile(path.join(HERE, 'film.css'), 'utf8') });
    await page.evaluate(setUpFilm, { intro: INTRO_END, script: SCRIPT_START, outro: OUTRO_START, fade: FADE });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });

    ffmpeg = spawn(args.ffmpeg, [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(args.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-profile:v', 'high',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    // Spawn failures (missing ffmpeg) and broken pipes surface as errors instead of crashing.
    let failure = null;
    const done = new Promise((resolve, reject) => {
      ffmpeg.on('error', (e) => { failure = e; reject(e); });
      ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(failure ?? new Error(`ffmpeg exited ${code}`))));
    });
    done.catch(() => {});
    ffmpeg.stdin.on('error', (e) => { failure = failure ?? e; });
    // Waiting for the pipe to drain also ends if the encoder fails or exits meanwhile.
    const exited = done.then(() => { throw new Error('ffmpeg exited before all frames were written'); });
    exited.catch(() => {});
    const write = async (chunk) => {
      if (failure) throw failure;
      if (ffmpeg.stdin.write(chunk)) return;
      let onDrain;
      const drained = new Promise((resolve) => { onDrain = resolve; ffmpeg.stdin.once('drain', onDrain); });
      try {
        await Promise.race([drained, exited]);
      } finally {
        ffmpeg.stdin.off('drain', onDrain);
      }
    };
    const frames = Math.round(duration * args.fps);
    const marks = [];
    for (let i = 0; i < frames; i += 1) {
      const t = i / args.fps;
      const state = await page.evaluate((time) => window.__filmSeek(time), t);
      if (state.step && state.step !== marks.at(-1)?.step) marks.push({ step: state.step, time: +t.toFixed(3) });
      await write(await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
      if (i % (args.fps * 5) === 0) console.log(`frame ${i}/${frames}`);
    }
    ffmpeg.stdin.end();
    await done;
    ffmpeg = null;
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
    // Poster: the moment the right-click menu is open.
    const poster = path.join(args.out, 'sofatap-demo-poster.jpg');
    const p = spawnSync(args.ffmpeg, ['-y', '-loglevel', 'error', '-ss', '13.4', '-i', output, '-frames:v', '1', '-q:v', '3', poster], { stdio: 'inherit' });
    if (p.status !== 0) throw new Error('poster extraction failed');
    await writeFile(path.join(args.out, 'timeline.json'), `${JSON.stringify({ duration, fps: args.fps, scriptStart: SCRIPT_START, steps: marks }, null, 2)}\n`);
    return { output, poster, marks };
  } finally {
    // Always stop the encoder, browser and preview server, even after a failed frame.
    if (ffmpeg) {
      ffmpeg.stdin.destroy();
      if (ffmpeg.exitCode === null) ffmpeg.kill('SIGKILL');
    }
    await browser?.close().catch(() => {});
    server?.proc.kill();
    await rm(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await record(parseArgs(process.argv.slice(2)));
    console.log(`Wrote ${result.output} and ${result.poster}`);
    console.log(`Scripted steps: ${result.marks.map((m) => `${m.step}@${m.time}s`).join(', ')}`);
  } catch (error) {
    console.error(`Recording failed: ${error.message}`);
    process.exitCode = 1;
  }
}
