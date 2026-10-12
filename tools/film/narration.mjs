// Narration script for the demo video: the caption cues of every language (src/video/cues.json),
// with the text a voice should speak. Captions show "Sofatap"; speech says "Sofa tap" so the brand
// is pronounced as two familiar words. One continuous passage per language (cues on separate
// lines) reads more naturally than separate clips; character offsets let the returned
// character timestamps be split back into cues.
// Usage: node tools/film/narration.mjs --out <file.json>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCues } from '../../scripts/captions.mjs';
import { LOCALES } from '../../scripts/locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** How the brand and punctuation are spoken (captions keep the written form). */
export const speechText = (caption) => caption
  .replace(/Sofatap/g, 'Sofa tap')
  .replace(/[…]/g, '…')
  .replace(/ /g, ' ');

export async function narrationManifest() {
  const cues = await loadCues();
  const languages = {};
  for (const l of LOCALES) {
    const strings = JSON.parse(await readFile(path.join(ROOT, 'src', 'i18n', `${l.lang}.json`), 'utf8'));
    let text = '';
    const lines = cues.cues.map((cue, i) => {
      const caption = strings[cue.key];
      const speech = speechText(caption);
      const start = text.length;
      text += (i ? '\n' : '') + speech;
      return { key: cue.key, caption, speech, chars: [start + (i ? 1 : 0), text.length], window: [cue.start, cue.end] };
    });
    languages[l.lang] = { file: `narration-${l.lang.toLowerCase()}`, rtl: Boolean(l.rtl), text, cues: lines };
  }
  return {
    version: 3,
    cues: cues.cues.length,
    timeline: { duration: cues.duration, note: 'Windows are the planned on-screen moments; final cue times come from the measured audio.' },
    voice: { model: 'elevenlabs/tts/eleven-v4', voice: 'Brian', stability: 0.7, similarity_boost: 0.75, output_format: 'mp3_44100_192', timestamps: true },
    languages,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  if (i < 0 || !process.argv[i + 1]) { console.error('Usage: node tools/film/narration.mjs --out <file.json>'); process.exit(1); }
  const manifest = await narrationManifest();
  await writeFile(path.resolve(process.argv[i + 1]), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(manifest.languages).length} languages × ${manifest.cues} cues`);
}
