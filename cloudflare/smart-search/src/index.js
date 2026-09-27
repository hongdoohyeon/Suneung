// kicegg.com/api/search?q=… — 자연어 검색어를 기출검색 필터로 바꿔 준다.
// 순서: 입력 검사 → 캐시 → 호출 상한 → JEV(TypeSafe) → 캐시 저장. JEV 가 막히면 규칙 결과만 돌려준다.
import { ruleParse, toFilters, JEV_QUESTIONS } from './parse.js';
import { handleReport } from './report.js';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const CACHE_TTL = 7 * 24 * 3600;
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/report') return handleReport(request, env, ctx);
    if (url.pathname !== '/api/search') return json({ error: 'not_found' }, 404);
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    // 다른 사이트에서 가져다 쓰지 못하게 (브라우저가 붙이는 헤더)
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return json({ error: 'forbidden' }, 403);

    const q = (url.searchParams.get('q') || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length < 2 || q.length > 80) return json({ error: 'query_length' }, 400);

    const rule = ruleParse(q);
    // 규칙이 다 알아들었으면 JEV 를 부르지 않는다(비용 0)
    if (!rule.unknown) return json({ q, source: 'rules', filters: toFilters(rule, null) }, 200, { 'cache-control': 'public, max-age=86400' });
    const cacheKey = new Request(`https://kicegg.com/api/search?v=2&q=${encodeURIComponent(q.toLowerCase())}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, hit);

    const ip = request.headers.get('cf-connecting-ip') || 'anon';
    const [perIp, global] = await Promise.all([env.PER_IP.limit({ key: ip }), env.GLOBAL.limit({ key: 'all' })]);
    if (!perIp.success || !global.success || !env.TYPESAFE_API_KEY) {
      return json({ q, source: 'rules', filters: toFilters(rule, null) });
    }

    let ans = null;
    try {
      const r = await fetch(JEV_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state: q, questions: JEV_QUESTIONS }),
        signal: AbortSignal.timeout(2500),
      });
      if (r.ok) ans = (await r.json()).answers;
      else console.log('jev status', r.status);
    } catch (e) { console.log('jev error', e.name); }
    if (!ans) return json({ q, source: 'rules', filters: toFilters(rule, null) });

    const res = json({ q, source: 'jev', filters: toFilters(rule, ans) }, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
