// 시험지 만들기 프록시 — kicegg.com/paper/… 를 받아 맥 편집 서버에 넘긴다 (앞의 /paper 를 떼고).
// 편집기가 쓰는 사이트 자산(/paper/k/style.css 등)은 맥 대신 사이트 자체에서 가져온다.
// 맥이 꺼져 있으면 화면은 '점검 중', API는 503.
const DOWN_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>시험지 만들기 · 점검 중</title><link rel="stylesheet" href="/style.css">
<body style="display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center;padding:24px">
<div><h1 style="font-size:22px;margin:0 0 8px">시험지 만들기 점검 중</h1>
<p style="color:var(--ink-4,#777);margin:0 0 18px">잠시 후 다시 열어 주세요. 그동안 기출검색·문항 검색은 그대로 쓸 수 있어요.</p>
<a class="btn" href="/">기출검색으로</a></div></body></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/paper') return Response.redirect(url.origin + '/paper/' + url.search + url.hash, 301);
    const rest = url.pathname.slice('/paper'.length) || '/';
    if (rest.startsWith('/k/')) return fetch(url.origin + rest.slice(2), { cf: { cacheTtl: 600 } });   // 사이트 자산
    if (!['GET', 'POST'].includes(req.method)) return new Response('method', { status: 405 });
    const h = new Headers();
    for (const k of ['content-type', 'x-paper-session', 'x-paper-name', 'accept']) { const v = req.headers.get(k); if (v) h.set(k, v); }
    h.set('X-Paper-Key', env.PAPER_KEY);
    h.set('X-Client-IP', req.headers.get('cf-connecting-ip') || '');
    let r;
    try {
      r = await fetch(env.ORIGIN + rest + url.search, { method: req.method, headers: h, body: req.method === 'POST' ? req.body : undefined,
                                                         signal: AbortSignal.timeout(rest.startsWith('/api/build') ? 60000 : 30000) });
    } catch { r = null }
    if (!r || r.status === 530 || r.status === 502 || r.status === 403 && !rest.startsWith('/api/')) {
      return rest === '/' || rest === '/index.html'
        ? new Response(DOWN_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
        : new Response(JSON.stringify({ error: '시험지 만들기 점검 중', maintenance: true }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    const out = new Headers(r.headers);
    out.delete('set-cookie');
    // 편집기 화면·스크립트는 고치면 바로 바뀌어야 해서 브라우저가 묵혀 두지 않게 (사이트 HTML 기본은 10분)
    if (rest === '/' || rest === '/index.html' || rest === '/app.js') out.set('cache-control', 'no-cache');
    return new Response(r.body, { status: r.status, headers: out });
  },
};
