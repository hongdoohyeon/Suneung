// kicegg.com/files/{tag}/{asset}?name=… → suneung-files Worker 의 /{tag}/{asset}?name=…
const UPSTREAM = 'https://suneung-files.hdh061224.workers.dev';

async function assetLength(request, env) {
  const headers = new Headers(request.headers);
  headers.delete('Range');
  headers.delete('If-Range');
  const head = await env.FILES.fetch(new Request(request, { method: 'HEAD', headers }));
  const raw = head.headers.get('Content-Length');
  if (!head.ok || !/^\d+$/.test(raw || '')) return null;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/files/')) return new Response('Not found', { status: 404 });
    // dl=1: iOS 사파리는 PDF 면 attachment 헤더여도 미리보기로 연다 → 형식을 숨겨 다운로드로만 받게
    const forceDownload = url.searchParams.get('dl') === '1';
    url.searchParams.delete('dl');
    const upstream = new URL(url.pathname.slice('/files'.length) + url.search, UPSTREAM);
    let forwarded = new Request(upstream, request);
    let length = null;
    const suffix = /^bytes=-(\d+)$/.exec(request.headers.get('Range') || '');
    // upstream 은 suffix Range 를 지원하지 않는다. 전체를 버퍼링하지 않고 길이만 확인해 명시 범위로 전달.
    if (request.method === 'GET' && suffix) {
      length = await assetLength(forwarded, env);
      if (length !== null) {
        const count = Math.min(Number(suffix[1]), length);
        const headers = new Headers(forwarded.headers);
        headers.set('Range', count ? `bytes=${length - count}-${length - 1}` : `bytes=${length}-`);
        forwarded = new Request(forwarded, { headers });
      }
    }
    let response = await env.FILES.fetch(forwarded);
    if (response.status === 416 && !response.headers.has('Content-Range')) {
      length ??= await assetLength(forwarded, env);
      if (length !== null) {
        const headers = new Headers(response.headers);
        headers.set('Content-Range', `bytes */${length}`);
        response = new Response(response.body, { status: response.status, headers });
      }
    }
    if (!forceDownload || !response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/octet-stream');
    return new Response(response.body, { status: response.status, headers });
  },
};
