// kicegg.com/files/{tag}/{asset}?name=… → suneung-files Worker 의 /{tag}/{asset}?name=…
const UPSTREAM = 'https://suneung-files.hdh061224.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/files/')) return new Response('Not found', { status: 404 });
    const upstream = new URL(url.pathname.slice('/files'.length) + url.search, UPSTREAM);
    return env.FILES.fetch(new Request(upstream, request));
  },
};
