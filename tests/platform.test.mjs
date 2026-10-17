// The computer guess (src/platform.js), loaded as the browser loads it: the detector on real and
// tricky user agents and client hints, and what it does to the built hero and download section.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from '../scripts/build.mjs';
import { displayVersion, validateAndroidTv, validateReleases } from '../scripts/releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(ROOT, 'src', 'platform.js'), 'utf8');
const load = (globals = {}) => {
  const sandbox = { setTimeout, ...globals };
  vm.runInNewContext(source, { window: sandbox, Promise, Error, JSON, Array, Number, decodeURIComponent });
  return sandbox.SofatapPlatform;
};
const { osOf, archOf, detect } = load();

// The built pages, made before any test runs.
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-platform-'));
after(() => rm(tmp, { recursive: true, force: true }));
const config = path.join(tmp, 'site.config.json');
await writeFile(config, JSON.stringify({ mobileDownloadKind: 'testflight', mobileDownloadUrl: 'https://testflight.apple.com/join/e6MuKx9S' }));
await build({ config, out: path.join(tmp, 'site') });
const PAGES = { en: await readFile(path.join(tmp, 'site', 'index.html'), 'utf8'), zh: await readFile(path.join(tmp, 'site', 'zh', 'index.html'), 'utf8'), ar: await readFile(path.join(tmp, 'site', 'ar', 'index.html'), 'utf8') };

const UA = {
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  linuxFirefoxArm: 'Mozilla/5.0 (X11; Linux aarch64; rv:143.0) Gecko/20100101 Firefox/143.0',
  freebsd: 'Mozilla/5.0 (X11; FreeBSD amd64; rv:143.0) Gecko/20100101 Firefox/143.0',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};
// A Chromium navigator whose high-entropy hints answer `hints` (or a function producing the result).
const chromium = (userAgent, platform, hints, extra = {}) => {
  const calls = [];
  return {
    userAgent,
    maxTouchPoints: 0,
    userAgentData: {
      platform, mobile: false, brands: [],
      getHighEntropyValues(names) { calls.push(names); return typeof hints === 'function' ? hints() : Promise.resolve({ platform, ...hints }); },
    },
    calls,
    ...extra,
  };
};

test('operating system: computers, phones and tablets, and nothing claimed on doubt', () => {
  assert.equal(osOf({ userAgent: UA.macSafari, maxTouchPoints: 0 }), 'mac');
  assert.equal(osOf({ userAgent: UA.winChrome }), 'windows');
  assert.equal(osOf({ userAgent: UA.linuxFirefox }), 'linux');
  assert.equal(osOf({ userAgent: UA.iphone, maxTouchPoints: 5 }), 'ios');
  assert.equal(osOf({ userAgent: UA.ipad, maxTouchPoints: 5 }), 'ios');
  // iPadOS asking for the desktop site looks like a Mac, but has a touch screen.
  assert.equal(osOf({ userAgent: UA.macSafari, maxTouchPoints: 5 }), 'ios');
  // Android says Linux; it is a phone, never the Linux receiver.
  assert.equal(osOf({ userAgent: UA.android }), 'android');
  assert.equal(osOf(chromium(UA.android, 'Android', {})), 'android');
  // ChromeOS and FreeBSD (X11 is not an operating system) are not Linux.
  assert.equal(osOf({ userAgent: UA.cros }), 'unknown');
  assert.equal(osOf({ userAgent: UA.freebsd }), 'unknown');
  assert.equal(osOf({}), 'unknown');
  assert.equal(osOf(undefined), 'unknown');
  // Client hints and the user agent must agree (an emulated or spoofed agent claims nothing).
  assert.equal(osOf(chromium(UA.winChrome, 'macOS', {})), 'unknown');
  assert.equal(osOf(chromium(UA.macChrome, 'macOS', {})), 'mac');
  assert.equal(osOf(chromium(UA.linuxChrome, 'Linux', {})), 'linux');
  assert.equal(osOf(chromium(UA.cros, 'Chrome OS', {})), 'unknown');
  const mobileWindows = chromium(UA.winChrome, 'Windows', {}); mobileWindows.userAgentData.mobile = true;
  assert.equal(osOf(mobileWindows), 'unknown');
});

test('architecture: only a complete, coherent 64-bit client-hint answer', () => {
  assert.equal(archOf('mac', { platform: 'macOS', architecture: 'arm', bitness: '64' }), 'arm64');
  assert.equal(archOf('mac', { platform: 'macOS', architecture: 'x86', bitness: '64' }), 'x64');
  assert.equal(archOf('linux', { platform: 'Linux', architecture: 'arm', bitness: '64' }), 'arm64');
  assert.equal(archOf('linux', { platform: 'Linux', architecture: 'x86', bitness: '64' }), 'x64');
  // Partial or mismatched answers say nothing.
  assert.equal(archOf('mac', { platform: 'macOS', architecture: 'arm' }), null);
  assert.equal(archOf('mac', { platform: 'macOS', bitness: '64' }), null);
  assert.equal(archOf('mac', { platform: 'macOS', architecture: '', bitness: '' }), null);
  assert.equal(archOf('mac', { architecture: 'arm', bitness: '64' }), null);
  assert.equal(archOf('mac', { platform: 'Windows', architecture: 'arm', bitness: '64' }), null);
  assert.equal(archOf('mac', null), null);
  // Complete, but no package of ours: 32-bit or another processor.
  assert.equal(archOf('linux', { platform: 'Linux', architecture: 'x86', bitness: '32' }), 'other');
  assert.equal(archOf('linux', { platform: 'Linux', architecture: 'riscv', bitness: '64' }), 'other');
});

test('detect: Apple Silicon and Intel Macs, Rosetta, Linux; the user agent string never decides', async () => {
  const arm = chromium(UA.macChrome, 'macOS', { architecture: 'arm', bitness: '64' });
  assert.deepEqual({ ...(await detect(arm)) }, { os: 'mac', arch: 'arm64' });
  assert.deepEqual(arm.calls.map((names) => [...names]), [['architecture', 'bitness']]);
  // Chromium reports an x64 build under Rosetta as arm, so it still gets the Apple Silicon package.
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', { architecture: 'arm', bitness: '64' }))).arch, 'arm64');
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', { architecture: 'x86', bitness: '64' }))).arch, 'x64');
  assert.equal((await detect(chromium(UA.linuxChrome, 'Linux', { architecture: 'arm', bitness: '64' }))).arch, 'arm64');
  // "Intel Mac OS X" and "Linux x86_64" are frozen strings: no hints, no architecture.
  for (const userAgent of [UA.macSafari, UA.macFirefox, UA.linuxChrome, UA.linuxFirefox, UA.linuxFirefoxArm]) {
    assert.equal((await detect({ userAgent, maxTouchPoints: 0 })).arch, null, userAgent);
  }
  // Hints that disagree with the user agent, or come back partial, give nothing.
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', { platform: 'Linux', architecture: 'arm', bitness: '64' }))).arch, null);
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', { architecture: 'arm' }))).arch, null);
});

test('detect: missing, refused, throwing or slow hints fall back to no architecture', async () => {
  const missing = { userAgent: UA.macChrome, userAgentData: { platform: 'macOS', mobile: false } };
  assert.deepEqual({ ...(await detect(missing)) }, { os: 'mac', arch: null });
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', () => Promise.reject(new Error('NotAllowedError'))))).arch, null);
  assert.equal((await detect(chromium(UA.macChrome, 'macOS', () => { throw new Error('policy'); }))).arch, null);
  const started = Date.now();
  const late = await detect(chromium(UA.linuxChrome, 'Linux', () => new Promise(() => {})), { timeout: 30 });
  assert.deepEqual({ ...late }, { os: 'linux', arch: null });
  assert.ok(Date.now() - started < 1000);
  // An answer after the timeout changes nothing.
  let answer;
  const slow = await detect(chromium(UA.macChrome, 'macOS', () => new Promise((r) => { answer = r; })), { timeout: 10 });
  answer({ platform: 'macOS', architecture: 'arm', bitness: '64' });
  await new Promise((r) => setImmediate(r));
  assert.equal(slow.arch, null);
  // Phones, tablets and unknown systems are never asked for more.
  for (const nav of [chromium(UA.android, 'Android', {}), chromium(UA.cros, 'Chrome OS', {})]) {
    assert.equal((await detect(nav)).arch, null);
    assert.deepEqual(nav.calls, []);
  }
  // A Windows PC is asked, so that an ARM PC isn't offered the x64 package as its match.
  assert.deepEqual({ ...(await detect(chromium(UA.winChrome, 'Windows', { architecture: 'arm', bitness: '64' }))) }, { os: 'windows', arch: 'arm64' });
});

// ---------------------------------------------------------------------------
// A small DOM for the built markup: enough for the elements and selectors the script uses.

const VOID = new Set(['img', 'source', 'track', 'meta', 'link', 'br', 'input']);
class Node extends EventTarget {
  constructor(tag, attrs = new Map()) { super(); this.tagName = tag; this.attrs = attrs; this.children = []; this.parentNode = null; this.text = ''; this.open = attrs.has('open'); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  get classList() {
    const get = () => (this.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    return { contains: (c) => get().includes(c), add: (c) => { if (!get().includes(c)) this.setAttribute('class', [...get(), c].join(' ')); } };
  }
  get textContent() { return this.tagName === '#text' ? this.text : this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); const t = new Node('#text'); t.text = v; this.children = []; this.appendChild(t); }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, ref) {
    child.remove();
    const at = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(at, 0, child);
    child.parentNode = this;
    return child;
  }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  cloneNode(deep) {
    const copy = new Node(this.tagName, new Map(this.attrs));
    copy.text = this.text;
    if (deep) this.children.forEach((c) => copy.appendChild(c.cloneNode(true)));
    return copy;
  }
  *walk() { for (const c of this.children) { if (c.tagName !== '#text') { yield c; yield* c.walk(); } } }
  matches(sel) {
    let m;
    if ((m = sel.match(/^\.([\w-]+)$/))) return this.classList.contains(m[1]);
    if ((m = sel.match(/^#([\w-]+)$/))) return this.getAttribute('id') === m[1];
    if ((m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/))) return this.hasAttribute(m[1]) && (m[2] === undefined || this.getAttribute(m[1]) === m[2]);
    if (/^[a-z][a-z0-9]*$/.test(sel)) return this.tagName === sel;
    throw new Error(`selector not supported here: ${sel}`);
  }
  querySelectorAll(sel) { return [...this.walk()].filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  getElementById(id) { return this.querySelector(`#${id}`); }
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function parse(html) {
  const doc = new Node('#document');
  let at = doc;
  for (const [, close, tag, rest, text] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*)>|([^<]+)/g)) {
    if (text !== undefined) { const t = new Node('#text'); t.text = decode(text); at.appendChild(t); continue; }
    const name = tag.toLowerCase();
    if (close) { while (at.tagName !== name) at = at.parentNode; at = at.parentNode; continue; }
    const attrs = new Map([...rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], decode(m[2] ?? '')]));
    const node = at.appendChild(new Node(name, attrs));
    if (!VOID.has(name) && !rest.endsWith('/')) at = node;
  }
  return doc;
}

// Everything comes from the validated snapshot, so a release refresh needs no test edits.
const RELEASE_DATA = JSON.parse(await readFile(path.join(ROOT, 'src', 'releases.json'), 'utf8'));
const DESKTOP = validateReleases(RELEASE_DATA);
const TV = validateAndroidTv(RELEASE_DATA);
const TAG = DESKTOP[0].tag;
const VERSION = displayVersion(TAG);
const PKG = (file) => `https://github.com/chekusu/sofatap/releases/download/${TAG}/${file}`;
const ALL = [...['SofaTap-Windows-x64.zip', 'SofaTap-macOS-arm64-notarized.zip', 'SofaTap-macOS-x64-notarized.zip', 'SofaTap-Linux-x64.tar.gz', 'SofaTap-Linux-arm64.tar.gz'].map(PKG), TV.url];

// Runs the script on the page's body for one navigator; returns what a visitor would find.
async function visit(nav, { lang = 'en', hash = '', before } = {}) {
  const doc = parse(PAGES[lang].match(/<body>([\s\S]*)<\/body>/)[1]);
  const win = new EventTarget();
  win.location = { hash };
  const { run } = load({ addEventListener: win.addEventListener.bind(win), location: win.location });
  before?.(doc);
  const found = await run(doc, nav, { timeout: 30 });
  const section = doc.getElementById('download');
  const main = section.querySelector('.platforms');
  const other = section.querySelector('.downloads-other');
  const cards = (box) => box.children.filter((c) => c.tagName === 'article').map((c) => c.getAttribute('id') ?? `copy:${c.getAttribute('aria-labelledby')}`);
  const links = (box) => box.querySelectorAll('.pkg').map((a) => a.getAttribute('href'));
  const hero = doc.querySelector('.get-desktop__link');
  const ids = [...doc.walk()].map((n) => n.getAttribute('id')).filter(Boolean);
  return {
    doc, found, section, other, win,
    main: cards(main), mainLinks: links(main),
    rest: cards(other.querySelector('.downloads-other__list')), restLinks: links(other),
    hero: { os: hero.getAttribute('data-os'), text: doc.querySelector('.get-desktop__text').textContent, version: doc.querySelector('.get-desktop__version').textContent, href: hero.getAttribute('href') },
    ids,
  };
}
const AS_BUILT = ['platform-iphone', 'platform-windows', 'platform-mac', 'platform-linux', 'platform-androidtv'];
const assertNoDuplicateIds = (v) => assert.equal(v.ids.length, new Set(v.ids).size, 'duplicate ids');
const assertEveryPackageOnce = (v) => assert.deepEqual([...v.mainLinks, ...v.restLinks].sort(), [...ALL].sort());

test('unknown computers, phones and tablets keep the downloads exactly as built', async () => {
  for (const nav of [{ userAgent: UA.freebsd }, { userAgent: UA.iphone, maxTouchPoints: 5 }, { userAgent: UA.macSafari, maxTouchPoints: 5 }, { userAgent: UA.android }, { userAgent: UA.cros }, {}]) {
    const v = await visit(nav);
    assert.deepEqual(v.main, AS_BUILT, nav.userAgent);
    assert.deepEqual(v.mainLinks, ALL);
    assert.equal(v.other.hidden, true);
    assert.deepEqual(v.rest, []);
    // The neutral computer button, a link to the downloads.
    assert.deepEqual(v.hero, { os: 'unknown', text: 'Computer downloads', version: VERSION, href: '#download' });
  }
});

test('an Apple Silicon Mac: its package first; the Intel package, with its card details, under Other downloads', async () => {
  const v = await visit(chromium(UA.macChrome, 'macOS', { architecture: 'arm', bitness: '64' }));
  assert.deepEqual(v.hero, { os: 'mac', text: 'Download for Mac', version: VERSION, href: '#download' });
  assert.deepEqual(v.main, ['platform-mac', 'platform-iphone']);
  assert.deepEqual(v.mainLinks, [PKG('SofaTap-macOS-arm64-notarized.zip')]);
  assert.deepEqual(v.rest, ['copy:platform-mac-more-title', 'platform-windows', 'platform-linux', 'platform-androidtv']);
  assert.equal(v.other.hidden, false);
  assert.equal(v.other.open, false, 'collapsed');
  assert.equal(v.section.getAttribute('data-arch'), 'arm64');
  assertEveryPackageOnce(v);
  assertNoDuplicateIds(v);
  // The Intel copy keeps its name, version, size, requirements, notes and links.
  const copy = v.other.querySelector('.downloads-other__list').children[0];
  assert.equal(copy.querySelector('#platform-mac-more-title').textContent, 'Mac');
  assert.equal(copy.querySelector('.tag').textContent, TAG);
  assert.match(copy.querySelector('.pkg').textContent, /Intel.*47 MB · \.zip/);
  assert.match(copy.querySelector('.platform__req').textContent, /macOS 15/);
  assert.ok(copy.querySelector('.platform__note'));
  assert.deepEqual(copy.querySelector('.platform__links').querySelectorAll('a').map((a) => a.getAttribute('href')),
    ['https://github.com/chekusu/sofatap/blob/main/docs/MAC-START.md', `https://github.com/chekusu/sofatap/releases/tag/${TAG}`]);
  assert.ok(v.doc.getElementById('platform-mac').classList.contains('platform--current'));
});

test('a Mac or Linux computer of unknown architecture shows both of its packages; other systems collapse', async () => {
  for (const [nav, os, files] of [
    [{ userAgent: UA.macSafari, maxTouchPoints: 0 }, 'mac', ['SofaTap-macOS-arm64-notarized.zip', 'SofaTap-macOS-x64-notarized.zip']],
    [chromium(UA.macChrome, 'macOS', () => Promise.reject(new Error('denied'))), 'mac', ['SofaTap-macOS-arm64-notarized.zip', 'SofaTap-macOS-x64-notarized.zip']],
    [{ userAgent: UA.linuxFirefox }, 'linux', ['SofaTap-Linux-x64.tar.gz', 'SofaTap-Linux-arm64.tar.gz']],
    [chromium(UA.linuxChrome, 'Linux', { architecture: 'x86', bitness: '32' }), 'linux', ['SofaTap-Linux-x64.tar.gz', 'SofaTap-Linux-arm64.tar.gz']],
  ]) {
    const v = await visit(nav);
    assert.deepEqual(v.main, [`platform-${os}`, 'platform-iphone']);
    assert.deepEqual(v.mainLinks, files.map(PKG));
    assert.deepEqual(v.rest, ['platform-windows', 'platform-mac', 'platform-linux'].filter((id) => id !== `platform-${os}`).concat('platform-androidtv'));
    assert.equal(v.section.getAttribute('data-arch'), null);
    assertEveryPackageOnce(v);
    assertNoDuplicateIds(v);
  }
});

test('Linux ARM64 in Chinese and x64 Linux in Arabic: localized labels, nothing lost', async () => {
  const zh = await visit(chromium(UA.linuxChrome, 'Linux', { architecture: 'arm', bitness: '64' }), { lang: 'zh' });
  assert.deepEqual(zh.hero, { os: 'linux', text: '下载 Linux 版', version: VERSION, href: '#download' });
  assert.deepEqual(zh.mainLinks, [PKG('SofaTap-Linux-arm64.tar.gz')]);
  assert.equal(zh.other.querySelector('summary').textContent, '其他下载');
  assertEveryPackageOnce(zh);
  const ar = await visit(chromium(UA.linuxChrome, 'Linux', { architecture: 'x86', bitness: '64' }), { lang: 'ar' });
  assert.equal(ar.hero.text, 'تنزيل لنظام Linux');
  assert.deepEqual(ar.mainLinks, [PKG('SofaTap-Linux-x64.tar.gz')]);
  assertEveryPackageOnce(ar);
  assertNoDuplicateIds(ar);
});

test('Windows: the x64 package first, but never offered as the match on an ARM or 32-bit PC', async () => {
  const x64 = await visit(chromium(UA.winChrome, 'Windows', { architecture: 'x86', bitness: '64' }));
  assert.deepEqual(x64.hero, { os: 'windows', text: 'Download for Windows', version: VERSION, href: '#download' });
  assert.deepEqual(x64.main, ['platform-windows', 'platform-iphone']);
  assert.deepEqual(x64.rest, ['platform-mac', 'platform-linux', 'platform-androidtv']);
  assertEveryPackageOnce(x64);
  const plain = await visit({ userAgent: UA.winChrome });
  assert.deepEqual(plain.main, ['platform-windows', 'platform-iphone']);
  for (const hints of [{ architecture: 'arm', bitness: '64' }, { architecture: 'x86', bitness: '32' }]) {
    const v = await visit(chromium(UA.winChrome, 'Windows', hints));
    assert.equal(v.hero.os, 'windows', 'the button names the system only');
    assert.deepEqual(v.main, AS_BUILT);
    assert.equal(v.other.hidden, true);
  }
});

test('nothing moves once the visitor is using the download section; a link into Other downloads opens it', async () => {
  let resolveHints;
  const nav = chromium(UA.macChrome, 'macOS', () => new Promise((r) => { resolveHints = r; }));
  const pending = visit(nav, { before: (doc) => setImmediate(() => doc.getElementById('download').dispatchEvent(new Event('pointerdown'))) });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  resolveHints({ platform: 'macOS', architecture: 'arm', bitness: '64' });
  const v = await pending;
  assert.deepEqual(v.main, AS_BUILT);
  assert.equal(v.hero.os, 'mac', 'the hero changed at once, before anything was pressed');

  const linked = await visit(chromium(UA.macChrome, 'macOS', { architecture: 'arm', bitness: '64' }), { hash: '#platform-linux' });
  assert.equal(linked.other.open, true);
  const plain = await visit(chromium(UA.macChrome, 'macOS', { architecture: 'arm', bitness: '64' }), { hash: '#platform-mac' });
  assert.equal(plain.other.open, false);
  plain.win.location.hash = '#platform-windows';
  plain.win.dispatchEvent(new Event('hashchange'));
  assert.equal(plain.other.open, true);
});

test('the script never stores, sends or probes anything', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /document\.cookie|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|getContext|WebGL|gpu|hardwareConcurrency|deviceMemory/i);
  assert.match(source, /getHighEntropyValues\(\['architecture', 'bitness'\]\)/);
});
