import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from './src/index.js';
const PDF = new TextEncoder().encode('%PDF-1.7 abcdefghijklmnopqrstuvwxyz');
function fixture() {
  const calls = [];
  const env = { FILES: { async fetch(req) {
    calls.push({ method: req.method, range: req.headers.get('Range'), url: req.url, ifRange: req.headers.get('If-Range') });
    const headers = { 'Content-Type': 'application/pdf', 'Content-Length': String(PDF.length), 'Accept-Ranges': 'bytes', ETag: '"same"' };
    if (req.method === 'HEAD') return new Response(null, { headers });
    const range = req.headers.get('Range');
    if (req.headers.get('If-Range') && req.headers.get('If-Range') !== headers.ETag) return new Response(PDF, { headers });
    if (range?.startsWith('bytes=-')) return new Response('Bad range', { status: 501 });
    const m = /^bytes=(\d+)-(\d*)$/.exec(range || '');
    if (m) {
      const start = Number(m[1]), end = Math.min(Number(m[2] || PDF.length - 1), PDF.length - 1);
      if (start >= PDF.length) return new Response('Bad range', { status: 416 });
      const data = PDF.slice(start, end + 1);
      return new Response(data, { status: 206, headers: { ...headers, 'Content-Length': String(data.length), 'Content-Range': `bytes ${start}-${end}/${PDF.length}` } });
    }
    return new Response(PDF, { headers });
  } } };
  return { env, calls };
}
const request = (range, query = '', extra = {}) => new Request(`https://kicegg.com/files/tag/test.pdf${query}`, { headers: { ...(range ? { Range: range } : {}), ...extra } });
test('ordinary GET stays a single upstream call with original bytes', async () => {
  const { env, calls } = fixture(); const r = await proxy.fetch(request(), env);
  assert.equal(r.status, 200); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF); assert.equal(calls.length, 1);
});
test('suffix range translated into supported explicit range', async () => {
  const { env, calls } = fixture(); const r = await proxy.fetch(request('bytes=-8'), env);
  assert.equal(r.status, 206); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF.slice(-8));
  assert.equal(r.headers.get('Content-Range'), `bytes ${PDF.length - 8}-${PDF.length - 1}/${PDF.length}`);
  assert.equal(calls.at(-1).range, `bytes=${PDF.length - 8}-${PDF.length - 1}`);
});
test('suffix larger than asset clamps to full asset range', async () => {
  const { env } = fixture(); const r = await proxy.fetch(request('bytes=-99999999999999999999999999'), env);
  assert.equal(r.status, 206); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF);
});
test('unsatisfiable range reports total length', async () => {
  const { env } = fixture(); const r = await proxy.fetch(request(`bytes=${PDF.length}-`), env);
  assert.equal(r.status, 416); assert.equal(r.headers.get('Content-Range'), `bytes */${PDF.length}`);
});
test('zero suffix is unsatisfiable', async () => {
  const { env } = fixture(); const r = await proxy.fetch(request('bytes=-0'), env);
  assert.equal(r.status, 416); assert.equal(r.headers.get('Content-Range'), `bytes */${PDF.length}`);
});
test('If-Range mismatch remains a full response', async () => {
  const { env } = fixture(); const r = await proxy.fetch(request('bytes=-8', '', { 'If-Range': '"old"' }), env);
  assert.equal(r.status, 200); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF);
});
test('dl=1 retains byte range and query while only overriding successful MIME', async () => {
  const { env, calls } = fixture(); const r = await proxy.fetch(request('bytes=-8', '?dl=1&name=test.pdf'), env);
  assert.equal(r.status, 206); assert.equal(r.headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(new URL(calls.at(-1).url).search, '?name=test.pdf');
});
test('failed metadata request preserves upstream access failure', async () => {
  const env = { FILES: { fetch: async () => new Response('Denied', { status: 403 }) } };
  const r = await proxy.fetch(request('bytes=-8'), env); assert.equal(r.status, 403);
});
