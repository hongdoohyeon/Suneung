// 문항 검색 프록시 — 같은 도메인 경로로 받아 맥 서버에 넘김. 맥이 꺼져 있으면 점검 중(503)
const API = new Set(['search', 'item', 'passage', 'meta', 'health']);
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const down = () => json({ error: '문항 검색 점검 중', maintenance: true }, 503);

async function origin(env, path, timeout, ip = '') {
  const base = await env.CFG.get('origin', { cacheTtl: 60 });
  if (!base) return null;
  try {
    // 접속자 IP도 넘김 — Cloudflare 요청 제한이 느슨해서 맥 서버가 IP당 분당 30회를 직접 셈
    const r = await fetch(base + path, { headers: { 'X-Items-Key': env.ITEMS_KEY, 'X-Client-IP': ip }, signal: AbortSignal.timeout(timeout) });
    if (r.status === 429) return r;
    return r.status >= 500 || r.status === 403 || r.status === 530 ? null : r;   // 530 = 터널 끊김
  } catch { return null }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method !== 'GET') return json({ error: 'method' }, 405);

    // 이미지: 한 번 받으면 Cloudflare 캐시에 30일
    const im = url.pathname.match(/^\/qimg\/([\w-]{3,40})\.webp$/);
    if (im) {
      const cache = caches.default, key = new Request(url.origin + url.pathname);
      const hit = await cache.match(key); if (hit) return hit;
      const r = await origin(env, `/img/${im[1]}.webp?v=2`, 20000);
      if (!r || !r.ok) return new Response('', { status: r ? r.status : 503 });
      const res = new Response(r.body, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=2592000, immutable' } });
      ctx.waitUntil(cache.put(key, res.clone())); return res;
    }

    const m = url.pathname.match(/^\/api\/items\/([a-z]+)$/);
    if (!m || !API.has(m[1])) return json({ error: 'not found' }, 404);
    if (m[1] !== 'health' && m[1] !== 'meta') {
      const ok = (await env.PER_IP.limit({ key: req.headers.get('cf-connecting-ip') || 'x' })).success && (await env.GLOBAL.limit({ key: 'all' })).success;
      if (!ok) return json({ error: '잠시 후 다시 시도해 주세요' }, 429);
    }
    // 같은 검색은 5분, 목록 정보(meta)는 10분 캐시 — 맥 부담 줄이기
    const cache = caches.default, key = new Request(url.toString()), ttl = m[1] === 'meta' ? 600 : m[1] === 'health' ? 0 : 300;
    if (ttl) { const hit = await cache.match(key); if (hit) return hit }
    const r = await origin(env, `/api/${m[1]}${url.search}`, 15000, req.headers.get('cf-connecting-ip') || '');
    if (!r) return down();
    const res = new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': ttl && r.ok ? `public, max-age=${ttl}` : 'no-store' } });
    if (ttl && r.ok) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
