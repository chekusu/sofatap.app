import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, renderPage, resolveSafeOutDir, validateStrings } from '../scripts/build.mjs';
import { checkSite } from '../scripts/check.mjs';

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
  assert.match(iphoneCard(html), /Beta not open yet[\s\S]*no confirmed public install link/);
  assert.match(iphoneCard(zh), /测试版尚未开放[\s\S]*暂无已确认的公开安装入口/);
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
  assert.match(iphoneCard(html), /TestFlight beta/);
  assert.match(iphoneCard(zh), /TestFlight 测试中/);
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

test('desktop downloads link the real release assets with architecture and alpha labels', async () => {
  const { html, zh } = await buildWith('downloads', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  const base = 'https://github.com/chekusu/sofatap/releases/download/';
  for (const page of [html, zh]) {
    for (const file of ['v0.3.0-alpha/SofaTap-Windows-x64.zip', 'v0.3.0-alpha/SofaTap-macOS-arm64-notarized.zip',
      'v0.3.0-alpha/SofaTap-macOS-x64-notarized.zip', 'v0.4.0-alpha/SofaTap-Linux-x64.tar.gz', 'v0.4.0-alpha/SofaTap-Linux-arm64.tar.gz']) {
      assert.equal(page.split(`href="${base}${file}"`).length - 1, 1, file);
    }
    assert.match(page, /<span class="tag">v0\.3\.0-alpha<\/span>[\s\S]*<span class="tag">v0\.4\.0-alpha<\/span>/);
    assert.match(page, />Apple Silicon<\/span>[\s\S]*>Intel<\/span>[\s\S]*>x64<\/span>[\s\S]*>ARM64<\/span>/);
    // The old air-mouse claims and the provisional logo are gone.
    assert.doesNotMatch(page, /logo\.svg|tilt|倾斜|v0\.1\.1-alpha/i);
  }
  assert.match(html, /In development[\s\S]*In development[\s\S]*aren’t included yet/);
});

test('language pages: English default, Chinese in zh/, linked both ways', async () => {
  const { html, zh } = await buildWith('langs', { mobileDownloadKind: 'unavailable', mobileDownloadUrl: '' });
  assert.match(html, /<html lang="en"/);
  assert.match(zh, /<html lang="zh-CN"/);
  assert.match(html, /<a class="lang-switch" href="zh\/" hreflang="zh-CN" lang="zh-CN">/);
  assert.match(zh, /<a class="lang-switch" href="\.\.\/" hreflang="en" lang="en">/);
  assert.match(zh, /href="\.\.\/styles\.css\?v=/);
  assert.match(zh, /沙发瘫/);
  assert.doesNotMatch(html, /沙发瘫/);
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
