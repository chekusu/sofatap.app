import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
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
