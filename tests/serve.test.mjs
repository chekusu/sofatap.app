import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { downloadName } from '../scripts/serve.mjs';
import { fileURLToPath } from 'node:url';

const SERVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'serve.mjs');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sofatap-serve-'));
const dist = path.join(tmp, 'dist');
let child;
let origin;

async function start(args) {
  const proc = spawn(process.execPath, [SERVE, '--dir', dist, '--port', '0', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\/\S*/); if (m) resolve(m[0]); });
    proc.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return { proc, url };
}

// Raw request so the path reaches the server exactly as written.
function get(pathname) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => {
      const u = new URL(origin);
      const req = request({ host: u.hostname, port: u.port, path: pathname }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body, location: res.headers.location }));
      });
      req.on('error', reject);
      req.end();
    });
  });
}

before(async () => {
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await writeFile(path.join(dist, 'index.html'), '<title>fixture</title>');
  await writeFile(path.join(dist, 'assets', 'a.svg'), '<svg/>');
  await mkdir(path.join(dist, 'media'));
  await writeFile(path.join(dist, 'media', 'v.mp4'), Buffer.from('0123456789'));
  await writeFile(path.join(dist, 'media', 'c.vtt'), 'WEBVTT\n');
  await mkdir(path.join(dist, 'zh'));
  await writeFile(path.join(dist, 'zh', 'index.html'), '<title>zh fixture</title>');
  await mkdir(path.join(tmp, 'dist-private'));
  await writeFile(path.join(tmp, 'dist-private', 'example.txt'), 'private fixture');
  await writeFile(path.join(tmp, 'outside.txt'), 'outside fixture');
  await symlink(path.join(tmp, 'outside.txt'), path.join(dist, 'escape.txt'));
  ({ proc: child, url: origin } = await start([]));
});

after(async () => {
  child?.kill();
  await rm(tmp, { recursive: true, force: true });
});

test('serves files from the directory', async () => {
  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/assets/a.svg')).status, 200);
});

test('malformed escapes return 400 and the server keeps running', async () => {
  assert.equal((await get('/%ZZ')).status, 400);
  assert.equal((await get('/%E0%A4%A')).status, 400);
  assert.equal((await get('/')).status, 200);
});

test('no traversal into sibling directories or outside files', async () => {
  for (const p of ['/..%2fdist-private/example.txt', '/%2e%2e/dist-private/example.txt', '/..%2f..%2foutside.txt', '/escape.txt', '/%2e%2e%2foutside.txt']) {
    const res = await get(p);
    assert.notEqual(res.status, 200, p);
    assert.doesNotMatch(res.body, /fixture/, p);
  }
});

test('serves under a path prefix', async () => {
  const { proc, url } = await start(['--base', '/preview/sofatap/']);
  try {
    const u = new URL(url);
    assert.equal(u.pathname, '/preview/sofatap/');
    const res = await fetch(new URL('assets/a.svg', url));
    assert.equal(res.status, 200);
    assert.equal((await fetch(new URL('/assets/a.svg', url))).status, 404);
  } finally {
    proc.kill();
  }
});

test('directories redirect to a trailing slash, never to another host', async () => {
  const res = await get('/zh');
  assert.equal(res.status, 301);
  assert.equal(res.location, '/zh/');
  assert.equal((await get('/zh/')).status, 200);
  for (const p of ['/%2Fzh', '//zh', '/.//zh', '///zh?x=1']) {
    const r = await get(p);
    if (r.status === 301) assert.ok(r.location.startsWith('/') && !r.location.startsWith('//'), `${p} -> ${r.location}`);
  }
  const { proc, url } = await start(['--base', '/sofatap/']);
  try {
    const r = await fetch(new URL('zh', url), { redirect: 'manual' });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/sofatap/zh/');
  } finally {
    proc.kill();
  }
});

test('videos and subtitles have their MIME types and byte ranges', async () => {
  const whole = await fetch(new URL('/media/v.mp4', origin));
  assert.equal(whole.headers.get('content-type'), 'video/mp4');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal((await fetch(new URL('/media/c.vtt', origin))).headers.get('content-type'), 'text/vtt; charset=utf-8');
  const part = await fetch(new URL('/media/v.mp4', origin), { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');
  const tail = await fetch(new URL('/media/v.mp4', origin), { headers: { Range: 'bytes=-3' } });
  assert.equal(await tail.text(), '789');
  const bad = await fetch(new URL('/media/v.mp4', origin), { headers: { Range: 'bytes=20-30' } });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), 'bytes */10');
});

test('?download=1 saves an MP4 under its own safe name; playback and other files are unchanged', async () => {
  const save = await fetch(new URL('/media/v.mp4?download=1', origin));
  assert.equal(save.headers.get('content-disposition'), 'attachment; filename="v.mp4"');
  assert.equal(save.headers.get('content-type'), 'video/mp4');
  assert.equal(await save.text(), '0123456789');
  assert.equal((await fetch(new URL('/media/v.mp4', origin))).headers.get('content-disposition'), null);
  assert.equal((await fetch(new URL('/media/v.mp4?download=0', origin))).headers.get('content-disposition'), null);
  assert.equal((await fetch(new URL('/media/c.vtt?download=1', origin))).headers.get('content-disposition'), null);
  const part = await fetch(new URL('/media/v.mp4?download=1', origin), { headers: { Range: 'bytes=0-1' } });
  assert.equal(part.status, 206);
  assert.equal(downloadName('/x/sofatap-demo-zh-cn.mp4?download=1', '/srv/sofatap-demo-zh-cn.mp4'), 'sofatap-demo-zh-cn.mp4');
  assert.equal(downloadName('/x/a b"c.mp4?download=1', '/srv/a b"c.mp4'), 'a_b_c.mp4');
  assert.equal(downloadName('/x/.mp4?download=1', '/srv/.mp4'), null);
});
