// Production preparation (scripts/prepare-deploy.mjs): copies a complete reviewed build unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { build, mediaPosterFor, mediaVideoFor, mediaVttFor } from '../scripts/build.mjs';
import { LANGS } from '../scripts/locales.mjs';
import { EXPORTS, HEADERS, prepareDeploy } from '../scripts/prepare-deploy.mjs';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-deploy-'));
after(() => rm(tmp, { recursive: true, force: true }));
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000, 7)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 9)]);
const config = path.join(tmp, 'config.json');
await writeFile(config, JSON.stringify({ mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' }));

// A media-inclusive build with the two shared exports, like the reviewed release build.
async function releaseBuild(name) {
  const media = path.join(tmp, `${name}-media`);
  await mkdir(media, { recursive: true });
  for (const lang of LANGS) {
    await writeFile(path.join(media, mediaVideoFor(lang)), mp4);
    await writeFile(path.join(media, mediaPosterFor(lang)), jpg);
  }
  const dist = path.join(tmp, name);
  await build({ config, out: dist, media });
  await mkdir(path.join(dist, 'exports'));
  for (const file of EXPORTS) await writeFile(path.join(dist, 'exports', file), mp4);
  return dist;
}
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

test('a complete build is copied byte for byte, without build metadata, plus download headers for the exports only', async () => {
  const dist = await releaseBuild('release');
  const out = path.join(tmp, 'assets');
  const result = await prepareDeploy({ dist, out, base: tmp });
  assert.ok(existsSync(path.join(dist, '.sofatap-build')));
  assert.equal(existsSync(path.join(out, '.sofatap-build')), false);
  for (const rel of ['index.html', 'ja/index.html', `media/${mediaVideoFor('ar')}`, `media/${mediaVttFor('zh-CN')}`, `exports/${EXPORTS[1]}`, 'styles.css']) {
    assert.equal(await hash(path.join(out, rel)), await hash(path.join(dist, rel)), rel);
  }
  const all = (await readdir(dist, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  assert.equal(result.files, all.length - 1); // everything except .sofatap-build
  const headers = await readFile(path.join(out, '_headers'), 'utf8');
  assert.equal(headers, HEADERS);
  assert.deepEqual([...headers.matchAll(/^(\S+)$/gm)].map((m) => m[1]), EXPORTS.map((f) => `/exports/${f}`));
  assert.match(headers, /Content-Disposition: attachment; filename="sofatap-promo-zh-cn\.mp4"/);
  assert.doesNotMatch(headers, /media|Content-Security|Cache-Control/);
});

test('an incomplete or plain build is rejected, never rebuilt, and nothing is prepared from it', async () => {
  const out = path.join(tmp, 'rejected');
  const missing = await releaseBuild('missing');
  await rm(path.join(missing, 'media', mediaVttFor('hi')));
  await rm(path.join(missing, 'exports', EXPORTS[0]));
  await assert.rejects(prepareDeploy({ dist: missing, out, base: tmp }), (e) => /sofatap-demo\.hi\.vtt/.test(e.message) && /sofatap-promo-en\.mp4/.test(e.message));
  assert.equal(existsSync(out), false);
  // Captions with the wrong number of cues (an older film) are refused.
  const old = await releaseBuild('old-captions');
  await writeFile(path.join(old, 'media', mediaVttFor('en')), 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000 line:-2\nHi\n');
  await assert.rejects(prepareDeploy({ dist: old, out, base: tmp }), /sofatap-demo\.en\.vtt/);
  // A plain build (no --media) has no video section at all.
  const plain = path.join(tmp, 'plain');
  await build({ config, out: plain });
  await assert.rejects(prepareDeploy({ dist: plain, out, base: tmp }), /没有视频区|缺少 media/);
  await assert.rejects(prepareDeploy({ dist: path.join(tmp, 'absent'), out, base: tmp }), /没有找到构建目录/);
  assert.equal(existsSync(out), false);
  // The output may not overlap the build.
  await assert.rejects(prepareDeploy({ dist: missing, out: path.join(missing, 'assets'), base: tmp }), /重叠/);
});

test('only the site’s own public files are published: an extra file stops the release', async () => {
  const out = path.join(tmp, 'extra-out');
  for (const extra of ['.env', 'notes/private-report.md', '_redirects', '_headers', 'media/sofatap-demo-old.mp4']) {
    const dist = await releaseBuild(`extra-${extra.replace(/\W/g, '-')}`);
    await mkdir(path.dirname(path.join(dist, extra)), { recursive: true });
    await writeFile(path.join(dist, extra), 'not for the website');
    await assert.rejects(prepareDeploy({ dist, out, base: tmp }), new RegExp(`不应发布的文件：${extra.replace(/\./g, '\\.')}`), extra);
    assert.equal(existsSync(out), false, extra);
  }
});

test('the output is never reached through a symbolic link, so its delete cannot land elsewhere', async () => {
  const dist = await releaseBuild('linked');
  // .wrangler is a link to another directory (here: the build itself, and an unrelated one).
  const keep = path.join(tmp, 'keep');
  await mkdir(path.join(keep, 'production-assets'), { recursive: true });
  await writeFile(path.join(keep, 'production-assets', 'important.txt'), 'keep me');
  for (const [name, target] of [['link-to-keep', keep], ['link-to-dist', dist]]) {
    const base = path.join(tmp, name);
    await mkdir(base);
    await symlink(target, path.join(base, '.wrangler'));
    await assert.rejects(prepareDeploy({ dist, out: path.join(base, '.wrangler', 'production-assets'), base }), /符号链接/);
  }
  assert.equal(await readFile(path.join(keep, 'production-assets', 'important.txt'), 'utf8'), 'keep me');
  assert.ok(existsSync(path.join(dist, 'index.html')));
  // The output must also stay inside its base directory.
  await assert.rejects(prepareDeploy({ dist, out: path.join(os.tmpdir(), 'elsewhere-assets'), base: path.join(tmp, 'link-to-keep') }), /之内/);
});

test('a build missing a script, the styles or a brand asset is rejected', async () => {
  const out = path.join(tmp, 'missing-out');
  for (const gone of ['main.js', 'styles.css', 'assets/sofatap-wordmark.svg']) {
    const dist = await releaseBuild(`gone-${gone.replace(/\W/g, '-')}`);
    await rm(path.join(dist, gone));
    await assert.rejects(prepareDeploy({ dist, out, base: tmp }), new RegExp(`缺少 ${gone.replace(/\./g, '\\.')}`), gone);
    assert.equal(existsSync(out), false, gone);
  }
});
