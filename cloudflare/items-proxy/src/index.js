// 문항 검색 프록시 — 같은 도메인 경로로 받아 맥 서버에 넘김. 맥이 꺼져 있으면 점검 중(503)
const API = new Set(['search', 'item', 'passage', 'meta', 'health', 'event']);
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const down = () => json({ error: '문항 검색 점검 중', maintenance: true }, 503);

async function origin(env, path, timeout, ip = '', extra = {}) {
  const base = await env.CFG.get('origin', { cacheTtl: 60 });
  if (!base) return null;
  try {
    // 접속자 IP도 넘김 — Cloudflare 요청 제한이 느슨해서 맥 서버가 IP당 분당 30회를 직접 셈
    const r = await fetch(base + path, { headers: { 'X-Items-Key': env.ITEMS_KEY, 'X-Client-IP': ip, ...extra }, signal: AbortSignal.timeout(timeout) });
    if (r.status === 429) return r;
    return r.status >= 500 || r.status === 403 || r.status === 530 ? null : r;   // 530·502 = 터널 끊김·맥 꺼짐
  } catch { return null }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method !== 'GET') return json({ error: 'method' }, 405);

    // 이미지: 한 번 받으면 Cloudflare 캐시에 30일
    const im = url.pathname.match(/^\/qimg\/([\w-]{3,40})\.webp$/);
    if (im) {
      const cache = caches.default, key = new Request(url.origin + url.pathname + '?v=' + (url.searchParams.get('v') || ''));   // v를 올리면 크롭을 고친 이미지를 새로 받는다
      const hit = await cache.match(key); if (hit) return hit;
      const r = await origin(env, `/img/${im[1]}.webp?v=${encodeURIComponent(url.searchParams.get('v') || '2')}`, 20000);   // 원본 요청도 v별로(중간 캐시에 옛 크롭이 남지 않게)
      if (!r || !r.ok) return new Response('', { status: r ? r.status : 503 });
      const res = new Response(r.body, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=2592000, immutable' } });
      ctx.waitUntil(cache.put(key, res.clone())); return res;
    }

    const m = url.pathname.match(/^\/api\/items\/([a-z]+)$/);
    if (!m || !API.has(m[1])) return json({ error: 'not found' }, 404);
    const name = m[1];
    if (name === 'event') {
      // 클릭·필터 로그는 검색 한도(IP당 분당)를 깎지 않게 전체 한도만 느슨하게 확인
      const ok = (await env.GLOBAL.limit({ key: 'event' })).success;
      if (!ok) return json({ ok: false }, 429);
    } else if (name !== 'health' && name !== 'meta') {
      const ok = (await env.PER_IP.limit({ key: req.headers.get('cf-connecting-ip') || 'x' })).success && (await env.GLOBAL.limit({ key: 'all' })).success;
      if (!ok) return json({ error: '잠시 후 다시 시도해 주세요' }, 429);
    }

    // 로그에서 같은 방문의 검색·클릭을 잇는 익명 식별자(개인 정보 아님)
    const extra = {};
    const sid = req.headers.get('x-qs-sid'); if (sid) extra['X-QS-SID'] = sid.slice(0, 64);
    const rid = req.headers.get('x-qs-rid'); if (rid) extra['X-QS-RID'] = rid.slice(0, 64);

    // 검색은 Worker가 캐시하지 않음 — 맥 서버의 결과 캐시(5분)가 단일 기준이고,
    // 모든 검색이 원본 로그에 남아야 검색어·필터·클릭을 이어서 분석할 수 있음.
    const probe = url.searchParams.get('probe') === '1';
    const ttl = probe || name === 'search' || name === 'health' || name === 'event' ? 0 : name === 'meta' ? 600 : 300;
    const cache = caches.default, key = new Request(url.toString());
    if (ttl) { const hit = await cache.match(key); if (hit) return hit }
    const r = await origin(env, `/api/${name}${url.search}`, name === 'search' ? 15000 : 10000, req.headers.get('cf-connecting-ip') || '', extra);
    if (!r) return name === 'event' ? new Response(null, { status: 204 }) : down();
    const res = new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': ttl && r.ok ? `public, max-age=${ttl}` : 'no-store' } });
    if (ttl && r.ok) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
