import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isRepoLink, validateReleases } from '../scripts/releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'src', 'releases.json'), 'utf8'));
const clone = () => structuredClone(data);

test('the shipped release data is valid and points at the published alpha assets', () => {
  const [windows, mac, linux] = validateReleases(data);
  assert.deepEqual([windows.id, mac.id, linux.id], ['windows', 'mac', 'linux']);
  assert.equal(windows.tag, 'v0.3.0-alpha');
  assert.equal(mac.tag, 'v0.3.0-alpha');
  assert.equal(linux.tag, 'v0.4.0-alpha');
  assert.ok([windows, mac, linux].every((p) => p.prerelease));
  assert.equal(mac.packages[0].url, 'https://github.com/chekusu/sofatap/releases/download/v0.3.0-alpha/SofaTap-macOS-arm64-notarized.zip');
  assert.equal(linux.packages[1].ext, '.tar.gz');
  assert.equal(windows.packages[0].size, '91 MB');
  assert.equal(linux.releaseUrl, 'https://github.com/chekusu/sofatap/releases/tag/v0.4.0-alpha');
  assert.equal(linux.guideUrl, 'https://github.com/chekusu/sofatap/blob/main/desktop/linux/README.md');
});

test('rejects missing, duplicate or unknown platforms', () => {
  const missing = clone(); missing.platforms.pop();
  assert.throws(() => validateReleases(missing), /缺少平台/);
  const dup = clone(); dup.platforms.push(clone().platforms[0]);
  assert.throws(() => validateReleases(dup), /重复/);
  const unknown = clone(); unknown.platforms[0].id = 'android';
  assert.throws(() => validateReleases(unknown), /未知平台/);
  assert.throws(() => validateReleases(null));
});

test('rejects tags, files and guides that could leave the product repository', () => {
  const bad = (mutate, pattern) => { const d = clone(); mutate(d.platforms[0]); assert.throws(() => validateReleases(d), pattern); };
  bad((p) => { p.tag = '../../evil'; }, /tag/);
  bad((p) => { p.tag = 'v0.3.0-alpha/../../x'; }, /tag/);
  bad((p) => { p.tag = 'latest'; }, /tag/);
  bad((p) => { p.packages[0].file = 'SofaTap-macOS-arm64.zip'; }, /文件名/); // wrong platform prefix
  bad((p) => { p.packages[0].file = 'SofaTap-Windows-x64.exe'; }, /文件名/);
  bad((p) => { p.packages[0].file = 'SofaTap-Windows-x64.zip?x=https://example.com/a.zip'; }, /文件名/);
  bad((p) => { p.packages[0].file = '../SofaTap-Windows-x64.zip'; }, /文件名/);
  bad((p) => { p.packages[0].label = '<b>x64</b>'; }, /名称/);
  bad((p) => { p.packages[0].bytes = 12; }, /大小/);
  bad((p) => { p.packages = []; }, /下载包/);
  bad((p) => { p.guide = 'https://example.com/guide.md'; }, /guide/);
  bad((p) => { p.guide = '../other/README.md'; }, /guide/);
});

test('only product repository links are accepted by the checker', () => {
  for (const ok of [
    'https://github.com/chekusu/sofatap',
    'https://github.com/chekusu/sofatap/releases',
    'https://github.com/chekusu/sofatap/issues',
    'https://github.com/chekusu/sofatap/releases/tag/v0.4.0-alpha',
    'https://github.com/chekusu/sofatap/releases/download/v0.3.0-alpha/SofaTap-Windows-x64.zip',
    'https://github.com/chekusu/sofatap/blob/main/docs/MAC-START.md',
  ]) assert.ok(isRepoLink(ok), ok);
  for (const no of [
    'https://github.com/chekusu/sofatap-evil',
    'https://github.com/chekusu/sofatap/releases/download/v0.3.0-alpha/other.zip',
    'https://github.com/chekusu/sofatap/blob/main/../../x.md',
    'https://github.com/someone/sofatap',
    'https://example.com/chekusu/sofatap',
  ]) assert.ok(!isRepoLink(no), no);
});
