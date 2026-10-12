// Renders the downloadable per-language videos: the silent base video from record.mjs with
// that language's captions burned in (ffmpeg + libass), from the same cues as the website's
// WebVTT tracks. Also writes the WebVTT files next to them.
//
// Usage:
//   node tools/film/burn.mjs --base <dir>/sofatap-demo.mp4 --out <dir> [--ffmpeg ffmpeg]
//        [--font "<family>"] [--langs en,ja,…]
// --font sets the caption font family; per-script families can be given with
// SOFATAP_FONT_<LANG> (for example SOFATAP_FONT_JA). fontconfig falls back for missing glyphs.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCues, toAss, toVtt } from '../../scripts/captions.mjs';
import { LOCALES, mediaTag } from '../../scripts/locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv, env = process.env) {
  const args = { base: null, out: null, ffmpeg: env.SOFATAP_FFMPEG ?? 'ffmpeg', font: 'sans-serif', langs: LOCALES.map((l) => l.lang).join(',') };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  if (!args.base || !args.out) throw new Error('--base <mp4> and --out <dir> are required');
  const langs = args.langs.split(',');
  for (const lang of langs) if (!LOCALES.some((l) => l.lang === lang)) throw new Error(`Unknown language ${lang}`);
  const fonts = Object.fromEntries(langs.map((lang) => [lang, env[`SOFATAP_FONT_${mediaTag(lang).replace('-', '_').toUpperCase()}`] ?? args.font]));
  return { ...args, langs, fonts, base: path.resolve(args.base), out: path.resolve(args.out) };
}

export async function burn(args) {
  const cues = await loadCues();
  await mkdir(args.out, { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-burn-'));
  const written = [];
  try {
    for (const lang of args.langs) {
      const l = LOCALES.find((x) => x.lang === lang);
      const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${lang}.json`), 'utf8'));
      const ass = path.join(tmp, `${mediaTag(lang)}.ass`);
      const rtl = Boolean(LOCALES.find((x) => x.lang === lang).rtl);
      await writeFile(ass, toAss(strings, cues, { font: args.fonts[lang], rtl }));
      await writeFile(path.join(args.out, `sofatap-demo.${mediaTag(lang)}.vtt`), toVtt(strings, cues));
      const output = path.join(args.out, `sofatap-demo-${mediaTag(lang)}.mp4`);
      // Complex shaping (HarfBuzz) is needed for Devanagari conjuncts and Arabic joining.
      const filter = `ass=filename='${ass.replace(/[\\':]/g, '\\$&')}':shaping=complex`;
      const r = spawnSync(args.ffmpeg, ['-y', '-loglevel', 'error', '-i', args.base, '-vf', filter,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-profile:v', 'high',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`ffmpeg failed for ${lang}`);
      written.push(output);
      console.log(`Wrote ${path.basename(output)}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await burn(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`Burning captions failed: ${error.message}`);
    process.exitCode = 1;
  }
}
