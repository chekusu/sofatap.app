// Production Worker (wrangler.jsonc). It runs first only under /media/ and /exports/
// (run_worker_first) and changes nothing but MP4 responses; posters, captions and every other
// request are answered by static assets as they are.
// Static assets answer a Range request with the whole file, which stops browsers from seeking,
// so this adds byte ranges on top of the unchanged asset response: same bytes, same headers
// (type, ETag, cache, the exports' attachment disposition), plus 206/416 and Accept-Ranges.

import { parseRange } from './range.mjs';

const MP4 = /^\/(?:media|exports)\/[^/]+\.mp4$/;

// If-Range: the range applies only while the client's validator still matches (strong ETag
// comparison, or the exact Last-Modified date); otherwise the whole file is sent.
function ifRangeMatches(request, response) {
  const value = request.headers.get('If-Range');
  if (!value) return true;
  const etag = response.headers.get('ETag');
  if (value.startsWith('"') || value.startsWith('W/')) return Boolean(etag) && !etag.startsWith('W/') && !value.startsWith('W/') && value === etag;
  const modified = response.headers.get('Last-Modified');
  return Boolean(modified) && value === modified;
}

// The bytes [start, end] of a stream, passed through without buffering the file.
function slice(body, start, end) {
  let offset = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      const from = Math.max(start - offset, 0);
      const to = Math.min(end + 1 - offset, chunk.byteLength);
      if (from < to) controller.enqueue(chunk.subarray(from, to));
      offset += chunk.byteLength;
      if (offset > end) controller.terminate();
    },
  }));
}

// The Workers runtime only sends a stream's Content-Length when it is a FixedLengthStream
// (a set header is otherwise replaced by chunked encoding); elsewhere (tests) the stream is used as is.
function fixedLength(stream, length) {
  if (typeof FixedLengthStream !== 'function' || length === null || !Number.isFinite(length)) return stream;
  const fixed = new FixedLengthStream(length);
  stream.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!MP4.test(pathname) || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);
    const range = request.headers.get('Range');
    // Ask static assets for the whole file, exactly as before (Range and If-Range removed).
    const headers = new Headers(request.headers);
    headers.delete('Range');
    headers.delete('If-Range');
    // Uncompressed, so byte positions are positions in the file itself.
    headers.set('Accept-Encoding', 'identity');
    // GET even for HEAD, so the length is known either way; a HEAD reply drops the body.
    const full = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers }));
    if (full.status !== 200) {
      // Not found, not modified and so on pass through as they are (no body for HEAD).
      if (request.method !== 'HEAD') return full;
      await full.body?.cancel().catch(() => {});
      return new Response(null, { status: full.status, headers: full.headers });
    }
    const out = new Headers(full.headers);
    out.set('Accept-Ranges', 'bytes');
    const known = full.headers.get('Content-Length');
    let size = known === null ? null : Number(known);
    let body = full.body;
    const wanted = range && ifRangeMatches(request, full);
    if ((wanted || request.method === 'HEAD') && (size === null || !Number.isFinite(size))) {
      // No length given: read the file once to know it (a range needs it; HEAD reports it).
      const bytes = new Uint8Array(await full.arrayBuffer());
      size = bytes.byteLength;
      body = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
    }
    const span = wanted ? parseRange(range, size) : null;
    if (span === null) {
      if (request.method === 'HEAD') {
        await body?.cancel().catch(() => {});
        out.set('Content-Length', String(size));
        return new Response(null, { status: 200, headers: out });
      }
      return new Response(fixedLength(body, size), { status: 200, headers: out });
    }
    if (span === 'unsatisfiable' || request.method === 'HEAD') await body?.cancel().catch(() => {});
    if (span === 'unsatisfiable') {
      out.set('Content-Range', `bytes */${size}`);
      out.set('Content-Length', '0');
      out.delete('Content-Type');
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(0), { status: 416, headers: out });
    }
    out.set('Content-Range', `bytes ${span.start}-${span.end}/${size}`);
    out.set('Content-Length', String(span.end - span.start + 1));
    return new Response(request.method === 'HEAD' ? null : fixedLength(slice(body, span.start, span.end), span.end - span.start + 1), { status: 206, headers: out });
  },
};
