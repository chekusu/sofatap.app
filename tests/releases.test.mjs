import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareTags, displayVersion, isRepoLink, validateAndroidController, validateAndroidTv, validateReleases } from '../scripts/releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'src', 'releases.json'), 'utf8'));
const clone = () => structuredClone(data);

test('the shipped snapshot: five desktop packages at one tag with sizes and checksums, and one Android TV APK', () => {
  const [windows, mac, linux] = validateReleases(data);
  assert.deepEqual([windows.id, mac.id, linux.id], ['windows', 'mac', 'linux']);
  const tag = windows.tag;
  assert.ok([windows, mac, linux].every((p) => p.tag === tag), 'one desktop tag');
  assert.match(tag, /^v\d+\.\d+\.\d+/);
  // The exact six artifacts the site offers, with their architectures.
  assert.deepEqual([windows, mac, linux].flatMap((p) => p.packages.map((k) => `${k.arch} ${k.file}`)),
    ['x64 SofaTap-Windows-x64.zip', 'arm64 SofaTap-macOS-arm64-notarized.zip', 'x64 SofaTap-macOS-x64-notarized.zip', 'x64 SofaTap-Linux-x64.tar.gz', 'arm64 SofaTap-Linux-arm64.tar.gz']);
  assert.equal(mac.packages[0].url, `https://github.com/chekusu/sofatap/releases/download/${tag}/SofaTap-macOS-arm64-notarized.zip`);
  assert.equal(linux.releaseUrl, `https://github.com/chekusu/sofatap/releases/tag/${tag}`);
  assert.equal(linux.packages[1].ext, '.tar.gz');
  assert.ok(data.platforms.flatMap((p) => p.packages).every((k) => Number.isInteger(k.bytes) && /^[0-9a-f]{64}$/.test(k.sha256)));
  assert.equal(linux.guideUrl, 'https://github.com/chekusu/sofatap/blob/main/desktop/linux/README.md');
  const tv = validateAndroidTv(data);
  assert.match(tv.tag, /^android-tv-v\d+\.\d+\.\d+/);
  assert.equal(tv.file, `Sofatap-Android-TV-${tv.tag.slice('android-tv-v'.length)}.apk`);
  assert.equal(tv.url, `https://github.com/chekusu/sofatap/releases/download/${tv.tag}/${tv.file}`);
});

test('the Android phone/tablet controller: its own stream, exact APK, size and checksum, never the TV receiver', () => {
  const phone = validateAndroidController(data);
  assert.match(phone.tag, /^android-controller-v\d+\.\d+\.\d+/);
  assert.equal(phone.file, `Sofatap-Android-${phone.tag.slice('android-controller-v'.length)}.apk`);
  assert.equal(phone.url, `https://github.com/chekusu/sofatap/releases/download/${phone.tag}/${phone.file}`);
  assert.match(phone.sha256, /^[0-9a-f]{64}$/);
  assert.ok(isRepoLink(phone.url) && isRepoLink(phone.releaseUrl));
  const bad = (edit) => { const d = clone(); edit(d.androidController); return () => validateAndroidController(d); };
  assert.throws(bad((c) => { c.tag = 'android-tv-v0.1.0-beta.1'; }), /tag/);
  assert.throws(bad((c) => { c.file = 'Sofatap-Android-TV-0.1.0-beta.1.apk'; }), /文件名/);
  assert.throws(bad((c) => { c.file = 'Sofatap-Android-9.9.9.apk'; }), /文件名/);
  assert.throws(bad((c) => { c.bytes = 1000; }), /大小/);
  assert.throws(bad((c) => { c.sha256 = 'DE34'; }), /SHA-256/);
  assert.throws(() => validateAndroidController({ ...clone(), androidController: undefined }), /缺少 androidController/);
  // The two Android streams never share links.
  assert.ok(!isRepoLink('https://github.com/chekusu/sofatap/releases/download/android-controller-v0.1.0-beta.1/Sofatap-Android-TV-0.1.0-beta.1.apk'));
  assert.ok(!isRepoLink('https://github.com/chekusu/sofatap/releases/download/android-tv-v0.2.0-beta.1/Sofatap-Android-0.2.0-beta.1.apk'));
  assert.ok(!isRepoLink('https://github.com/chekusu/sofatap/releases/download/v0.8.1-beta.1/Sofatap-Android-0.1.0-beta.1.apk'));
  assert.notEqual(phone.url, validateAndroidTv(data).url);
});

test('display versions and tag order across both streams (synthetic tags)', () => {
  assert.equal(displayVersion('v0.7.2-beta.1'), '0.7.2 beta.1');
  assert.equal(displayVersion('android-tv-v0.1.4-beta.1'), '0.1.4 beta.1');
  assert.ok(compareTags('android-tv-v0.1.10-beta.1', 'android-tv-v0.1.9') > 0);
  assert.ok(compareTags('v0.8.0-beta.1', 'v0.7.10') > 0);
  assert.ok(compareTags('v0.8.0', 'v0.8.0-rc.1') > 0);
  assert.throws(() => validateAndroidTv({ androidTv: { ...data.androidTv, file: 'Sofatap-Android-TV-9.9.9.apk' } }), /文件名/);
  assert.throws(() => validateAndroidTv({ androidTv: { ...data.androidTv, tag: 'v0.1.4-beta.1' } }), /tag/);
  assert.throws(() => validateAndroidTv({ androidTv: { ...data.androidTv, sha256: 'abc' } }), /SHA-256/);
  const noSum = clone(); delete noSum.platforms[0].packages[0].sha256;
  assert.throws(() => validateReleases(noSum), /SHA-256/);
  assert.ok(isRepoLink('https://github.com/chekusu/sofatap/releases/download/android-tv-v0.1.4-beta.1/Sofatap-Android-TV-0.1.4-beta.1.apk'));
  assert.ok(isRepoLink('https://github.com/chekusu/sofatap/releases/tag/android-tv-v0.1.4-beta.1'));
  assert.ok(!isRepoLink('https://github.com/chekusu/sofatap/releases/download/android-tv-v0.1.4-beta.1/other.apk'));
  assert.ok(!isRepoLink('https://github.com/chekusu/sofatap/releases/download/v0.7.3-beta.1/Sofatap-Android-TV-0.1.4-beta.1.apk'));
});

test('the build, check and refresh accept exactly the five expected packages at one tag', () => {
  const noIntel = clone(); noIntel.platforms[1].packages.pop();
  assert.throws(() => validateReleases(noIntel), /mac 的安装包必须正好是/);
  const extra = clone(); extra.platforms[0].packages.push({ ...extra.platforms[0].packages[0], label: 'ARM64', file: 'SofaTap-Windows-arm64.zip' });
  assert.throws(() => validateReleases(extra), /windows 的安装包必须正好是/);
  const relabeled = clone(); relabeled.platforms[2].packages[0].label = 'ARM64';
  assert.throws(() => validateReleases(relabeled), /linux 的安装包必须正好是/);
  const swapped = clone(); swapped.platforms[1].packages.reverse();
  assert.throws(() => validateReleases(swapped), /mac 的安装包必须正好是/);
  const mixed = clone(); mixed.platforms[2].tag = 'v0.7.2-beta.1';
  assert.throws(() => validateReleases(mixed), /同一个电脑端发行版 tag/);
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
  bad((p) => { p.packages[0].file = 'SofaTap-Windows-portable.zip'; }, /架构/);
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
