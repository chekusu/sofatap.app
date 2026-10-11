import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, resolveSafeOutDir } from '../scripts/build.mjs';
import { checkSite } from '../scripts/check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-test-'));
after(() => rm(tmp, { recursive: true, force: true }));

async function buildWith(name, config) {
  const configPath = path.join(tmp, `${name}.json`);
  await writeFile(configPath, JSON.stringify(config));
  const out = path.join(tmp, name);
  await build({ config: configPath, out });
  return { out, html: await readFile(path.join(out, 'index.html'), 'utf8'), configPath };
}

const entryOf = (html) => html.match(/<div class="get-app"[\s\S]*?<\/div>/)[0];

test('unavailable: honest status, no link, no fake badge', async () => {
  const { out, html } = await buildWith('unavailable', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  const entry = entryOf(html);
  assert.match(entry, /TestFlight 即将开放/);
  assert.doesNotMatch(entry, /<a\b/);
  assert.doesNotMatch(html, /href="#"/);
  assert.doesNotMatch(html, /testflight\.apple\.com|apps\.apple\.com/);
  assert.match(html, /iPhone App 暂未开放安装/);
  assert.deepEqual((await checkSite(out)).problems, []);
});

test('testflight: one working HTTPS link in the single entry', async () => {
  const url = 'https://testflight.apple.com/join/AbCd1234';
  const { out, html } = await buildWith('testflight', { mobileDownloadKind: 'testflight', mobileDownloadUrl: url });
  assert.match(entryOf(html), new RegExp(`<a class="get-app__link" href="${url}">`));
  assert.equal(html.split(url).length - 1, 1);
  assert.match(html, /TestFlight 测试中/);
  assert.doesNotMatch(html, /即将开放/);
  assert.deepEqual((await checkSite(out)).problems, []);
});

test('appstore: link with text, no badge image', async () => {
  const url = 'https://apps.apple.com/cn/app/sofa-tap/id1234567890';
  const { out, html } = await buildWith('appstore', { mobileDownloadKind: 'appstore', mobileDownloadUrl: url });
  assert.match(entryOf(html), /前往 App Store/);
  assert.equal(html.split(url).length - 1, 1);
  assert.doesNotMatch(html, /badge[^"]*\.(png|svg)/);
  assert.deepEqual((await checkSite(out)).problems, []);
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
});

test('relative asset paths only, so any path prefix works', async () => {
  const { html } = await buildWith('relative', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    assert.ok(!ref.startsWith('/'), `root-absolute reference: ${ref}`);
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
