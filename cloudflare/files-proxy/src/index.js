// kicegg.com/files/{tag}/{asset}?name=… → suneung-files Worker 의 /{tag}/{asset}?name=…
const UPSTREAM = 'https://suneung-files.hdh061224.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/files/')) return new Response('Not found', { status: 404 });
    // dl=1: iOS 사파리는 PDF 면 attachment 헤더여도 미리보기로 연다 → 형식을 숨겨 다운로드로만 받게
    const forceDownload = url.searchParams.get('dl') === '1';
    url.searchParams.delete('dl');
    const upstream = new URL(url.pathname.slice('/files'.length) + url.search, UPSTREAM);
    const response = await env.FILES.fetch(new Request(upstream, request));
    if (!forceDownload || !response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/octet-stream');
    return new Response(response.body, { status: response.status, headers });
  },
};
