import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MEDIA_TIMING, build, mediaPosterFor, mediaVideoFor, renderPage, resolveSafeOutDir, validateStrings } from '../scripts/build.mjs';
import { ART, checkSite } from '../scripts/check.mjs';
import { publicFiles } from '../scripts/prepare-deploy.mjs';
import { downloadCopy } from '../scripts/download-config.mjs';
import { LANGS, LOCALES, hrefBetween } from '../scripts/locales.mjs';
import { loadCues } from '../scripts/captions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-test-'));
after(() => rm(tmp, { recursive: true, force: true }));

async function buildWith(name, config) {
  const configPath = path.join(tmp, `${name}.json`);
  await writeFile(configPath, JSON.stringify(config));
  const out = path.join(tmp, name);
  await build({ config: configPath, out });
  return {
    out,
    configPath,
    html: await readFile(path.join(out, 'index.html'), 'utf8'),
    zh: await readFile(path.join(out, 'zh', 'index.html'), 'utf8'),
  };
}

const entryOf = (html) => html.match(/<div class="get-app"[\s\S]*?<\/div>/)[0];
const iphoneCard = (html) => html.match(/<article class="platform platform--iphone"[\s\S]*?<\/article>/)[0];

test('unavailable: neutral status in both languages, no link, no TestFlight promise', async () => {
  const { out, html, zh } = await buildWith('unavailable', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  assert.match(entryOf(html), /iPhone beta not open yet/);
  assert.match(entryOf(zh), /iPhone 测试版尚未开放/);
  for (const page of [html, zh]) {
    assert.doesNotMatch(entryOf(page), /<a\b/);
    assert.doesNotMatch(page, /href="#"/);
    assert.doesNotMatch(page, /testflight\.apple\.com|apps\.apple\.com|TestFlight|App Store|即将|coming soon/i);
  }
  assert.match(iphoneCard(html), /Beta not open yet[\s\S]*Public beta testing isn’t open yet, so there’s no install link/);
  assert.match(iphoneCard(zh), /测试版尚未开放[\s\S]*公开测试尚未开放，所以这里没有安装链接/);
  assert.deepEqual((await checkSite(out)).problems, []);
});

test('testflight: one HTTPS link per page, in the single entry', async () => {
  const url = 'https://testflight.apple.com/join/AbCd1234';
  const { out, html, zh } = await buildWith('testflight', { mobileDownloadKind: 'testflight', mobileDownloadUrl: url });
  for (const page of [html, zh]) {
    assert.match(entryOf(page), new RegExp(`<a class="get-app__link" href="${url}">`));
    assert.equal(page.split(url).length - 1, 1);
    assert.doesNotMatch(page, /not open yet|尚未开放/);
  }
  assert.match(entryOf(html), /Join the TestFlight Beta/);
  assert.match(entryOf(zh), /加入 TestFlight 公测/);
  assert.match(iphoneCard(html), /TestFlight beta[\s\S]*Install Apple’s TestFlight app from the App Store first\. Then, on your iPhone, tap “Join the TestFlight Beta”/);
  assert.match(iphoneCard(zh), /TestFlight 公测中[\s\S]*请先从 App Store 安装 Apple 的 TestFlight App，然后在 iPhone 上点「加入 TestFlight 公测」/);
  assert.deepEqual((await checkSite(out)).problems, []);
});

// The committed configuration: the real public TestFlight link, in every language.
test('site.config.json: every language links the Sofatap TestFlight beta once, with install steps', async () => {
  const url = 'https://testflight.apple.com/join/e6MuKx9S';
  const config = JSON.parse(await readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  assert.deepEqual(config, { mobileDownloadKind: 'testflight', mobileDownloadUrl: url });
  const out = path.join(tmp, 'committed');
  await build({ config: path.join(ROOT, 'site.config.json'), out });
  for (const l of LOCALES) {
    const page = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    const copy = downloadCopy('testflight', l.lang);
    assert.equal(entryOf(page).match(/<a class="get-app__link" href="([^"]+)">/)?.[1], url, l.lang);
    assert.ok(entryOf(page).includes(`<span>${copy.action}</span>`), l.lang);
    assert.equal(page.split(url).length - 1, 1, l.lang);
    assert.match(iphoneCard(page), /data-state="available"/);
    assert.ok(iphoneCard(page).includes(copy.note), l.lang);
    // Install TestFlight first, then Sofatap; no App Store listing link for Sofatap itself.
    assert.ok(copy.note.indexOf('TestFlight') < copy.note.lastIndexOf('Sofatap'), l.lang);
    assert.ok(copy.note.includes(copy.action), `${l.lang}: the note names the button`);
    assert.doesNotMatch(page, /apps\.apple\.com/);
    const closed = downloadCopy('unavailable', l.lang);
    for (const stale of [closed.action, closed.status, closed.note]) assert.ok(!page.includes(stale), `${l.lang} still says: ${stale}`);
  }
  assert.deepEqual((await checkSite(out)).problems, []);
});

test('appstore: link with text, no badge image', async () => {
  const url = 'https://apps.apple.com/cn/app/sofatap/id1234567890';
  const { out, html, zh } = await buildWith('appstore', { mobileDownloadKind: 'appstore', mobileDownloadUrl: url });
  assert.match(entryOf(html), /View on the App Store/);
  assert.match(entryOf(zh), /前往 App Store/);
  for (const page of [html, zh]) {
    assert.equal(page.split(url).length - 1, 1);
    assert.doesNotMatch(page, /badge[^"]*\.(png|svg|webp)/);
  }
  assert.deepEqual((await checkSite(out)).problems, []);
});

test('desktop downloads link the real 0.7.1 beta.1 release assets with architecture labels', async () => {
  const { html, zh } = await buildWith('downloads', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  const base = 'https://github.com/chekusu/sofatap/releases/download/';
  for (const page of [html, zh]) {
    for (const file of ['SofaTap-Windows-x64.zip', 'SofaTap-macOS-arm64-notarized.zip', 'SofaTap-macOS-x64-notarized.zip',
      'SofaTap-Linux-x64.tar.gz', 'SofaTap-Linux-arm64.tar.gz'].map((f) => `v0.7.1-beta.1/${f}`)) {
      assert.equal(page.split(`href="${base}${file}"`).length - 1, 1, file);
    }
    assert.equal(page.split('<span class="tag" dir="ltr">v0.7.1-beta.1</span>').length - 1, 3);
    assert.doesNotMatch(page, /v0\.[34]\.0-alpha/);
    assert.match(page, />Apple Silicon<\/bdi>[\s\S]*>Intel<\/bdi>[\s\S]*>x64<\/bdi>[\s\S]*>ARM64<\/bdi>/);
    // The old air-mouse claims and the provisional logo are gone.
    assert.doesNotMatch(page, /logo\.svg|tilt|倾斜|v0\.1\.1-alpha/i);
  }
  // The QR compatibility note, and the facts about live editing and line breaks; no badges.
  assert.match(html, /These codes need the iPhone app 1\.0 \(15\) or later/);
  assert.match(html, /many browser and custom controls, Linux and older receivers, keep a draft/);
  assert.match(html, /some fields treat a line break as Enter/);
  assert.doesNotMatch(html, /Nothing is typed on the computer until you tap Send\./);
  assert.doesNotMatch(html, /class="label|In development|Development preview|Simulation/);
});

test('language pages: twelve locales, English default, Chinese still in zh/, each linking to all others', async () => {
  const { out, html, zh } = await buildWith('langs', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  assert.match(html, /<html lang="en" dir="ltr"/);
  assert.match(zh, /<html lang="zh-CN" dir="ltr"/);
  assert.match(zh, /href="\.\.\/styles\.css\?v=/);
  assert.match(zh, /沙发瘫/);
  assert.doesNotMatch(html, /沙发瘫/);
  for (const l of LOCALES) {
    const page = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    assert.match(page, new RegExp(`<html lang="${l.lang}" dir="${l.rtl ? 'rtl' : 'ltr'}"`), l.lang);
    for (const other of LOCALES) {
      const href = hrefBetween(l.lang, other.lang);
      assert.ok(page.includes(`<a href="${href}" hreflang="${other.lang}" lang="${other.lang}"`), `${l.lang} → ${other.lang}`);
      assert.ok(page.includes(`<link rel="alternate" hreflang="${other.lang}" href="${href}">`), `${l.lang} alternate ${other.lang}`);
    }
    assert.equal(page.split('aria-current="page"').length - 1, 1, l.lang);
    assert.ok(page.includes(`<span class="lang-menu__name">${l.short}</span>`), l.lang);
  }
  assert.equal(hrefBetween('en', 'zh-CN'), 'zh/');
  assert.equal(hrefBetween('pt-BR', 'en'), '../');
  assert.equal(hrefBetween('ar', 'ja'), '../ja/');
  assert.equal(hrefBetween('fr', 'fr'), './');
});

test('every locale gets its own iPhone status in all three download states', async () => {
  for (const lang of LANGS) {
    for (const kind of ['unavailable', 'testflight', 'appstore']) {
      const copy = downloadCopy(kind, lang);
      for (const key of ['action', 'status', 'note', 'meta']) assert.ok(copy[key]?.trim(), `${lang} ${kind} ${key}`);
      if (kind === 'unavailable') assert.doesNotMatch(`${copy.action} ${copy.status} ${copy.note}`, /TestFlight|App Store/, lang);
      if (lang !== 'en') assert.notEqual(copy.action, downloadCopy(kind, 'en').action, `${lang} ${kind} falls back to English`);
    }
  }
  assert.throws(() => downloadCopy('unavailable', 'xx'), /未知语言/);
});

test('string tables must match key for key and stay free of script', () => {
  assert.doesNotThrow(() => validateStrings({ en: { a: 'A', 'brand.nickname': '' }, 'zh-CN': { a: '甲', 'brand.nickname': '沙发瘫' } }));
  assert.throws(() => validateStrings({ en: { a: 'A', b: 'B' }, 'zh-CN': { a: '甲' } }), /缺少 b/);
  assert.throws(() => validateStrings({ en: { a: '' }, 'zh-CN': { a: '甲' } }), /不能为空/);
  assert.throws(() => validateStrings({ en: { a: '<img src=x onerror=alert(1)>' }, 'zh-CN': { a: '甲' } }), /不允许/);
  assert.throws(() => renderPage('{{t:missing}}', {}, {}), /缺少文案/);
  assert.equal(renderPage('<a title="{{a:x}}">{{t:x}}</a>', { x: 'Say <em>"hi"</em>' }, {}), '<a title="Say &quot;hi&quot;">Say <em>"hi"</em></a>');
});

test('invalid config fails before writing output', async () => {
  const configPath = path.join(tmp, 'invalid.json');
  await writeFile(configPath, JSON.stringify({ mobileDownloadKind: 'testflight', mobileDownloadUrl: 'http://testflight.apple.com/join/AbCd1234' }));
  const out = path.join(tmp, 'invalid-out');
  await assert.rejects(build({ config: configPath, out }), /https/);
  assert.equal(existsSync(out), false);
});

test('builds are reproducible', async () => {
  const a = await buildWith('repro-a', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  const b = await buildWith('repro-b', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  assert.equal(a.html, b.html);
  assert.equal(a.zh, b.zh);
});

test('relative asset paths only, so any path prefix works', async () => {
  const { html, zh } = await buildWith('relative', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  for (const page of [html, zh]) {
    for (const [, ref] of page.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)) {
      assert.ok(!ref.startsWith('/'), `root-absolute reference: ${ref}`);
    }
  }
});

// Only the path guard runs here (it throws before anything is deleted); nothing in the repo is built over.
test('refuses dangerous output directories', async () => {
  const config = path.join(ROOT, 'site.config.json');
  for (const out of [ROOT, path.dirname(ROOT), '/', os.homedir(), path.join(ROOT, 'src'), path.join(ROOT, 'scripts'),
    path.join(ROOT, 'tests'), path.join(ROOT, '.git'), path.join(ROOT, 'src', 'assets'), path.join(ROOT, 'other-output')]) {
    await assert.rejects(resolveSafeOutDir(out, config), /拒绝使用输出目录/, out);
  }
  // A directory containing the config file.
  const cfgDir = path.join(tmp, 'cfgdir');
  await mkdir(cfgDir);
  await writeFile(path.join(cfgDir, 'site.json'), '{}');
  await assert.rejects(resolveSafeOutDir(cfgDir, path.join(cfgDir, 'site.json')), /配置文件/);
  // Symlinks: one to the repository, one to an unrelated directory.
  await symlink(ROOT, path.join(tmp, 'link-to-repo'));
  await assert.rejects(resolveSafeOutDir(path.join(tmp, 'link-to-repo'), config), /上级目录|符号链接/);
  await assert.rejects(resolveSafeOutDir(path.join(tmp, 'link-to-repo', 'dist-x'), config), /dist/);
  await mkdir(path.join(tmp, 'elsewhere'));
  await symlink(path.join(tmp, 'elsewhere'), path.join(tmp, 'link-out'));
  await assert.rejects(resolveSafeOutDir(path.join(tmp, 'link-out'), config), /符号链接/);
  // A non-empty directory that this build did not create.
  const foreign = path.join(tmp, 'foreign');
  await mkdir(foreign);
  await writeFile(path.join(foreign, 'keep.txt'), 'keep');
  await assert.rejects(resolveSafeOutDir(foreign, config), /不为空/);
  assert.equal(await readFile(path.join(foreign, 'keep.txt'), 'utf8'), 'keep');
});

test('allows dist/, fresh temp directories and previous build output', async () => {
  const config = path.join(ROOT, 'site.config.json');
  assert.equal(await resolveSafeOutDir(path.join(ROOT, 'dist'), config), path.join(ROOT, 'dist'));
  assert.ok(await resolveSafeOutDir(path.join(tmp, 'fresh', 'out'), config));
  const { out, configPath } = await buildWith('rebuild', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  await build({ config: configPath, out });
  assert.ok(existsSync(path.join(out, 'index.html')));
});

// A fake export: tiny files with the right signatures stand in for the real videos.
async function fakeMedia(dir) {
  await mkdir(dir, { recursive: true });
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000)]);
  for (const name of LANGS.map(mediaPosterFor)) await writeFile(path.join(dir, name), jpg);
  for (const name of LANGS.map(mediaVideoFor)) await writeFile(path.join(dir, name), mp4);
}

test('with --media: each page plays its own narrated video with its own captions, and no download links', async () => {
  const media = path.join(tmp, 'media-src');
  await fakeMedia(media);
  // Measured caption times for one language replace the plan in its WebVTT file.
  const count = (await loadCues()).cues.length;
  const measured = Array.from({ length: count }, (_, i) => ({ start: 1 + i * 3, end: 3 + i * 3 }));
  await writeFile(path.join(media, MEDIA_TIMING), JSON.stringify({ ja: measured }));
  const configPath = path.join(tmp, 'media.json');
  await writeFile(configPath, JSON.stringify({ mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' }));
  const out = path.join(tmp, 'with-media');
  await build({ config: configPath, out, media });
  for (const l of LOCALES) {
    const page = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    const tracks = [...page.matchAll(/<track kind="subtitles" srclang="([^"]+)"[^>]*>/g)];
    // Only the page's own captions: they are timed to this language's video.
    assert.deepEqual(tracks.map((t) => [t[1], t[0].includes(' default')]), [[l.lang, true]], l.lang);
    assert.ok(page.includes(`<source src="${l.dir ? '../' : ''}media/${mediaVideoFor(l.lang)}" type="video/mp4">`), l.lang);
    assert.ok(page.includes(`poster="${l.dir ? '../' : ''}media/${mediaPosterFor(l.lang)}"`), l.lang);
    assert.match(page, /controlslist="nodownload"/);
    assert.doesNotMatch(page, /<a\b[^>]*href="(?:\.\.\/)?media\/|\sdownload[\s>]/, l.lang);
  }
  const vtt = await readFile(path.join(out, 'media', 'sofatap-demo.ja.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:03\.000 line:-2\nSofatap。/);
  assert.equal((await readFile(path.join(out, 'media', 'sofatap-demo.en.vtt'), 'utf8')).match(/ --> /g).length, count);
  assert.deepEqual((await checkSite(out)).problems, []);
  // The film comes first: straight after the hero, before how it works and the live demo.
  const en = path.join(out, 'index.html');
  const page = await readFile(en, 'utf8');
  const order = ['<section class="hero"', '<section class="section video"', 'id="how"', '<figure class="demo" id="demo"', 'id="type"', 'id="setup"'].map((m) => page.indexOf(m));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(order.every((i) => i >= 0));
  const video = page.match(/<section class="section video"[\s\S]*?<\/section>/)[0];
  await writeFile(en, page.replace(video, '').replace('    <section class="section" id="type"', `${video}\n    <section class="section" id="type"`));
  const moved = (await checkSite(out)).problems;
  await writeFile(en, page);
  assert.ok(moved.some((p) => p.startsWith('[en]') && p.includes('宣传视频应紧跟首屏')), moved.join('\n'));
  // Without --media there is no video section and nothing refers to media/.
  const plain = await buildWith('no-media', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  assert.doesNotMatch(plain.html, /<video|media\//);
});

test('line art: four decorative pictures in every language, responsive and lazy below the hero', async () => {
  const { out } = await buildWith('art', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  const files = await publicFiles();
  for (const name of ART) {
    for (const w of [640, 960, 1440]) {
      const file = `assets/art-${name}-${w}.webp`;
      assert.ok(files.has(file), `release list misses ${file}`);
      const bytes = await readFile(path.join(out, file));
      assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP', file);
      assert.ok(bytes.length < 80_000, `${file} is ${bytes.length} bytes`);
    }
  }
  const pictures = (html) => [...html.matchAll(/<img class="art" src="[^"]*assets\/art-([a-z]+)-960\.webp"[^>]*>/g)];
  for (const l of LOCALES) {
    const html = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    const found = pictures(html);
    assert.deepEqual(found.map((m) => m[1]), ART, l.lang);
    for (const [img, name] of found) {
      assert.match(img, / width="1440" height="960" alt="" /, `${l.lang} ${name}`);
      assert.equal(/ loading="lazy"/.test(img), name !== 'sofa', `${l.lang} ${name}`);
    }
    for (const kind of ['privacy', 'support']) assert.doesNotMatch(await readFile(path.join(out, l.dir, kind, 'index.html'), 'utf8'), /assets\/art-/);
  }
  // A missing picture is caught.
  const en = path.join(out, 'index.html');
  const html = await readFile(en, 'utf8');
  await writeFile(en, html.replace(/<img class="art" src="assets\/art-voice[^>]*>/, ''));
  const problems = (await checkSite(out)).problems;
  await writeFile(en, html);
  assert.ok(problems.some((p) => p.includes('插图 voice')), problems.join('\n'));
});

test('the brand is the fixed-outline wordmark, in the header and footer of every page', async () => {
  const svg = await readFile(path.join(ROOT, 'src', 'assets', 'sofatap-wordmark.svg'), 'utf8');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"[^>]*role="img"/);
  assert.match(svg, /<title id="sofatap-wordmark-title">Sofatap<\/title>/);
  assert.doesNotMatch(svg, /<text|<image|href=|url\(|@font-face|font-family/);
  const { out } = await buildWith('brand', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  for (const l of LOCALES) {
    const page = await readFile(path.join(out, l.dir, 'index.html'), 'utf8');
    assert.equal(page.match(/assets\/sofatap-wordmark\.svg" alt="Sofatap"/g).length, 2, l.lang);
    assert.doesNotMatch(page, /brand__name|living-room-\d+\.webp/, l.lang);
  }
  assert.ok(existsSync(path.join(out, 'assets', 'sofatap-wordmark.svg')));
});

test('refuses a media directory inside (or containing) the output, without deleting anything', async () => {
  const configPath = path.join(tmp, 'overlap.json');
  await writeFile(configPath, JSON.stringify({ mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' }));
  const out = path.join(tmp, 'overlap-out');
  await build({ config: configPath, out });
  const inside = path.join(out, 'media-export');
  await fakeMedia(inside);
  await assert.rejects(build({ config: configPath, out, media: inside }), /重叠/);
  assert.ok(existsSync(path.join(inside, mediaVideoFor('en'))), 'source video kept');
  assert.ok(existsSync(path.join(out, 'index.html')), 'previous output kept');
  // The same directory through a symlinked alias, and an output inside the media directory.
  await symlink(out, path.join(tmp, 'overlap-alias'));
  await assert.rejects(build({ config: configPath, out, media: path.join(tmp, 'overlap-alias', 'media-export') }), /重叠/);
  await assert.rejects(build({ config: configPath, out: path.join(inside, 'site'), media: inside }), /重叠/);
  assert.ok(existsSync(path.join(inside, mediaVideoFor('en'))));
  // Missing or malformed exports fail before any output is written.
  const broken = path.join(tmp, 'broken-media');
  await fakeMedia(broken);
  await writeFile(path.join(broken, mediaVideoFor('ar')), 'not a video'.repeat(200));
  const fresh = path.join(tmp, 'broken-out');
  await assert.rejects(build({ config: configPath, out: fresh, media: broken }), /格式不正确/);
  assert.equal(existsSync(fresh), false);
});
