// The production Worker (worker/index.mjs): byte ranges for the MP4 videos on top of static assets.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index.mjs';
import { parseRange } from '../worker/range.mjs';

const video = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 251);
// Static assets as production behaves: whole files, Range ignored, ETag/If-None-Match honoured.
function assets({ length = true, chunk = 1024 } = {}) {
  const seen = [];
  const files = {
    '/media/sofatap-demo-en.mp4': { type: 'video/mp4' },
    '/exports/sofatap-promo-en.mp4': { type: 'video/mp4', disposition: 'attachment; filename="sofatap-promo-en.mp4"' },
    '/media/sofatap-demo.en.vtt': { type: 'text/vtt', body: new TextEncoder().encode('WEBVTT\n') },
  };
  return {
    seen,
    ASSETS: {
      async fetch(request) {
        seen.push({ method: request.method, range: request.headers.get('Range') });
        const file = files[new URL(request.url).pathname];
        if (!file) return new Response('not found', { status: 404 });
        const body = file.body ?? video;
        const headers = new Headers({ 'Content-Type': file.type, ETag: '"v1"', 'Cache-Control': 'public, max-age=0, must-revalidate' });
        if (file.disposition) headers.set('Content-Disposition', file.disposition);
        if (request.headers.get('If-None-Match') === '"v1"') return new Response(null, { status: 304, headers });
        if (length) headers.set('Content-Length', String(body.byteLength));
        const stream = new ReadableStream({ start(c) { for (let i = 0; i < body.byteLength; i += chunk) c.enqueue(body.slice(i, i + chunk)); c.close(); } });
        return new Response(request.method === 'HEAD' ? null : stream, { status: 200, headers });
      },
    },
  };
}
const get = (env, path, headers = {}, method = 'GET') => worker.fetch(new Request(`https://sofatap.app${path}`, { method, headers }), env);
const bytes = async (r) => new Uint8Array(await r.arrayBuffer());

test('range syntax: single, open-ended and suffix ranges; unsatisfiable and malformed; several ranges ignored', () => {
  assert.deepEqual(parseRange('bytes=0-31', 5000), { start: 0, end: 31 });
  assert.deepEqual(parseRange('bytes=4990-', 5000), { start: 4990, end: 4999 });
  assert.deepEqual(parseRange('bytes=-10', 5000), { start: 4990, end: 4999 });
  assert.deepEqual(parseRange('bytes=-9000', 5000), { start: 0, end: 4999 });
  assert.deepEqual(parseRange('bytes=4000-9999', 5000), { start: 4000, end: 4999 });
  for (const bad of ['bytes=5000-', 'bytes=6000-7000', 'bytes=10-5', 'bytes=-0', 'bytes=abc', 'bytes=-', 'bytes=1-2-3']) assert.equal(parseRange(bad, 5000), 'unsatisfiable', bad);
  assert.equal(parseRange('bytes=0-1,5-9', 5000), null);
  assert.equal(parseRange('items=0-1', 5000), null);
  assert.equal(parseRange(null, 5000), null);
});

for (const length of [true, false]) {
  test(`video ranges return 206 with the exact bytes and full headers (asset length ${length ? 'given' : 'not given'})`, async () => {
    const env = assets({ length });
    const cases = [['bytes=0-31', 0, 31], ['bytes=1000-3071', 1000, 3071], ['bytes=4500-', 4500, 4999], ['bytes=-100', 4900, 4999]];
    for (const [range, start, end] of cases) {
      const r = await get(env, '/media/sofatap-demo-en.mp4', { Range: range });
      assert.equal(r.status, 206, range);
      assert.equal(r.headers.get('Content-Range'), `bytes ${start}-${end}/5000`);
      assert.equal(r.headers.get('Content-Length'), String(end - start + 1));
      assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(r.headers.get('Content-Type'), 'video/mp4');
      assert.equal(r.headers.get('ETag'), '"v1"');
      assert.equal(r.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
      assert.deepEqual(await bytes(r), video.slice(start, end + 1), range);
    }
    // Static assets are always asked for the whole file.
    assert.ok(env.seen.every((s) => s.range === null && s.method === 'GET'));
  });
}

test('whole file without Range, 416 for an unsatisfiable range, and HEAD without a body', async () => {
  const env = assets();
  const whole = await get(env, '/media/sofatap-demo-en.mp4');
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(whole.headers.get('Content-Length'), '5000');
  assert.deepEqual(await bytes(whole), video);
  for (const range of ['bytes=5000-', 'bytes=abc']) {
    const r = await get(env, '/media/sofatap-demo-en.mp4', { Range: range });
    assert.equal(r.status, 416, range);
    assert.equal(r.headers.get('Content-Range'), 'bytes */5000');
    assert.equal((await bytes(r)).byteLength, 0);
  }
  const several = await get(env, '/media/sofatap-demo-en.mp4', { Range: 'bytes=0-1,10-20' });
  assert.equal(several.status, 200);
  assert.deepEqual(await bytes(several), video);
  const head = await get(env, '/media/sofatap-demo-en.mp4', { Range: 'bytes=0-1023' }, 'HEAD');
  assert.equal(head.status, 206);
  assert.equal(head.headers.get('Content-Range'), 'bytes 0-1023/5000');
  assert.equal(head.headers.get('Content-Length'), '1024');
  assert.equal(head.body, null);
  const headWhole = await get(env, '/media/sofatap-demo-en.mp4', {}, 'HEAD');
  assert.equal(headWhole.status, 200);
  assert.equal(headWhole.headers.get('Content-Length'), '5000');
  assert.equal(headWhole.body, null);
});

test('exports keep their attachment download; validators and other files pass through unchanged', async () => {
  const env = assets();
  const r = await get(env, '/exports/sofatap-promo-en.mp4?download=1', { Range: 'bytes=0-1023' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="sofatap-promo-en.mp4"');
  assert.deepEqual(await bytes(r), video.slice(0, 1024));
  // A stale If-Range gets the whole (changed) file; a matching one gets the range.
  assert.equal((await get(env, '/media/sofatap-demo-en.mp4', { Range: 'bytes=0-9', 'If-Range': '"old"' })).status, 200);
  assert.equal((await get(env, '/media/sofatap-demo-en.mp4', { Range: 'bytes=0-9', 'If-Range': '"v1"' })).status, 206);
  // Not modified and not found pass through.
  assert.equal((await get(env, '/media/sofatap-demo-en.mp4', { 'If-None-Match': '"v1"', Range: 'bytes=0-9' })).status, 304);
  assert.equal((await get(env, '/media/missing.mp4', { Range: 'bytes=0-9' })).status, 404);
  const head404 = await get(env, '/media/missing.mp4', {}, 'HEAD');
  assert.equal(head404.status, 404);
  assert.equal(head404.body, null);
  // Captions (and anything that is not an MP4) are the static asset response itself.
  const vtt = await get(env, '/media/sofatap-demo.en.vtt', { Range: 'bytes=0-1' });
  assert.equal(vtt.status, 200);
  assert.equal(vtt.headers.get('Accept-Ranges'), null);
  assert.equal(env.seen.at(-1).range, 'bytes=0-1');
});
