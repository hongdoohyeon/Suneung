import test from 'node:test';
import assert from 'node:assert/strict';
const BODY = new TextEncoder().encode('ID3 abcdefghijklmnopqrstuvwxyz0123456789');
let store, calls, pending;
// Cloudflare 캐시 흉내: 전체 응답을 저장하고, Range 가 붙은 match 에는 206 으로 잘라 준다
globalThis.caches = { default: {
  async match(req) {
    const e = store.get(req.url); if (!e) return undefined;
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('Range') || '');
    if (!m) return new Response(e.body, { headers: e.headers });
    const s = +m[1], t = Math.min(+(m[2] || e.body.length - 1), e.body.length - 1);
    const h = new Headers(e.headers); h.set('Content-Range', `bytes ${s}-${t}/${e.body.length}`); h.set('Content-Length', String(t - s + 1));
    return new Response(e.body.slice(s, t + 1), { status: 206, headers: h });
  },
  async put(req, res) { store.set(req.url, { body: new Uint8Array(await res.arrayBuffer()), headers: [...res.headers] }); },
} };
globalThis.fetch = async (url, init = {}) => {
  const range = new Headers(init.headers).get('Range'); calls.push({ url: String(url), range });
  const base = { 'Content-Length': String(BODY.length), 'Set-Cookie': 'x=1' };
  const m = /^bytes=(\d+)-(\d*)$/.exec(range || '');
  if (!m) return new Response(BODY, { headers: base });
  const s = +m[1], t = Math.min(+(m[2] || BODY.length - 1), BODY.length - 1);
  return new Response(BODY.slice(s, t + 1), { status: 206, headers: { ...base, 'Content-Length': String(t - s + 1), 'Content-Range': `bytes ${s}-${t}/${BODY.length}` } });
};
const { default: proxy } = await import('./src/index.js');
const env = { PER_IP: { limit: async () => ({ success: true }) } };
const ctx = { waitUntil: p => pending.push(p) };
const get = (range, q = '') => proxy.fetch(new Request(`https://kicegg.com/files/tag/a.mp3${q}`, { headers: range ? { Range: range } : {} }), env, ctx);
const reset = () => { store = new Map(); calls = []; pending = []; };
const bytes = async r => new Uint8Array(await r.arrayBuffer());

test('첫 Range: 원본에서 받고, 뒤에서 전체를 캐시에 넣는다', async () => {
  reset(); const r = await get('bytes=4-9');
  assert.equal(r.status, 206); assert.deepEqual(await bytes(r), BODY.slice(4, 10));
  await Promise.all(pending);
  assert.deepEqual(calls.map(c => c.range), ['bytes=4-9', null]);
  assert.equal(store.size, 1);
  assert.ok(![...store.values()][0].headers.some(([k]) => k === 'set-cookie'));
});
test('두 번째 Range: 캐시에서 잘라 주고 원본을 부르지 않는다', async () => {
  reset(); await get('bytes=4-9'); await Promise.all(pending); calls = [];
  const r = await get('bytes=10-19', '?name=듣기.mp3');
  assert.equal(r.status, 206); assert.deepEqual(await bytes(r), BODY.slice(10, 20));
  assert.equal(r.headers.get('Content-Range'), `bytes 10-19/${BODY.length}`);
  assert.match(r.headers.get('Content-Disposition'), /^inline; .*%EB%93%A3%EA%B8%B0\.mp3$/);
  assert.equal(calls.length, 0);
});
test('전체 받기로 캐시된 파일도 Range 가 캐시를 탄다', async () => {
  reset(); const f = await get(); assert.deepEqual(await bytes(f), BODY); await Promise.all(pending); calls = [];
  const r = await get('bytes=0-3'); assert.deepEqual(await bytes(r), BODY.slice(0, 4)); assert.equal(calls.length, 0);
});
test('끝에서부터(suffix) Range 도 캐시에서 나간다', async () => {
  reset(); await get(); await Promise.all(pending); calls = [];
  const r = await get('bytes=-8'); assert.equal(r.status, 206); assert.deepEqual(await bytes(r), BODY.slice(-8)); assert.equal(calls.length, 0);
});
test('원본이 404 면 그대로 404, 캐시에 아무것도 안 넣는다', async () => {
  reset(); const real = globalThis.fetch; globalThis.fetch = async () => new Response('no', { status: 404 });
  try { const r = await get('bytes=0-3'); assert.equal(r.status, 404); await Promise.all(pending); assert.equal(store.size, 0); } finally { globalThis.fetch = real; }
});
