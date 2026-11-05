// kicegg.com/files/{tag}/{asset}?name=… → suneung-files Worker 의 /{tag}/{asset}?name=…
const UPSTREAM = 'https://suneung-files.hdh061224.workers.dev';

const CACHE_SECONDS = 86400; // 1일

// 허용 확장자별 Content-Type + 기본 Disposition
const ALLOWED_TYPES = {
  pdf: { contentType: "application/pdf", defaultDisposition: "attachment" },
  mp3: { contentType: "audio/mpeg", defaultDisposition: "inline" },
};

// 기존 suneung-files Worker 로직을 그대로 옮김 — 서비스 바인딩 호출(=Worker 호출 2번)을 1번으로 줄이려고.
// request.url 은 예전처럼 workers.dev 주소(/{tag}/{asset})로 들어온다. 캐시 키도 그 주소 기준.
async function serveFile(request, ctx) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const extMatch = url.pathname.toLowerCase().match(/\.(pdf|mp3)$/);
  if (!extMatch) return new Response("Only PDF/MP3 files are allowed", { status: 400 });
  const ext = extMatch[1];
  const typeInfo = ALLOWED_TYPES[ext];
  if (url.pathname.includes("..") || url.pathname.includes("\\") || url.pathname.includes("//")) {
    return new Response("Invalid path", { status: 400 });
  }
  const fileName = sanitizeFileName(url.searchParams.get("name") || `download.${ext}`);
  const explicitInline = url.searchParams.get("preview") === "1" || url.searchParams.get("inline") === "1";
  const explicitDownload = url.searchParams.get("download") === "1";
  const isInline = explicitInline || (!explicitDownload && typeInfo.defaultDisposition === "inline");
  const ghUrl = "https://github.com/hongdoohyeon/Suneung/releases/download" + url.pathname;
  const range = request.headers.get("Range");
  const ua = request.headers.get("User-Agent") || "Suneung-Download-Proxy";

  if (range) {
    const originResp = await fetch(ghUrl, { method: request.method, redirect: "follow", headers: { Range: range, "User-Agent": ua } });
    if (!originResp.ok && originResp.status !== 206) return new Response("Not found", { status: originResp.status });
    const out = buildResponseHeaders(originResp.headers, { fileName, isInline, ext, typeInfo });
    return new Response(request.method === "HEAD" ? null : originResp.body, { status: originResp.status, headers: out });
  }

  const cacheKeyUrl = new URL(request.url);
  for (const k of ["name", "preview", "inline", "download"]) cacheKeyUrl.searchParams.delete(k);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const cache = caches.default;
  let cached = await cache.match(cacheKey);
  if (!cached) {
    const originResp = await fetch(ghUrl, { method: "GET", redirect: "follow", headers: { "User-Agent": ua } });
    if (!originResp.ok) return new Response("Not found", { status: originResp.status });
    const ch = new Headers(originResp.headers);
    ch.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    ch.set("Access-Control-Allow-Origin", "*");
    ch.set("Accept-Ranges", "bytes");
    ch.set("Content-Type", typeInfo.contentType);
    ch.delete("Content-Disposition");
    ch.delete("Set-Cookie");
    ch.delete("Content-Security-Policy");
    cached = new Response(originResp.body, { status: originResp.status, headers: ch });
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  }
  const out = buildResponseHeaders(cached.headers, { fileName, isInline, ext, typeInfo });
  if (request.method === "HEAD") return new Response(null, { status: cached.status, headers: out });
  return new Response(cached.body, { status: cached.status, headers: out });
}

function buildResponseHeaders(baseHeaders, { fileName, isInline, ext, typeInfo }) {
  const h = new Headers(baseHeaders);
  h.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Accept-Ranges", "bytes");
  h.set("Content-Type", typeInfo.contentType);
  h.delete("Set-Cookie");
  h.delete("Content-Security-Policy");
  h.set("Content-Disposition", `${isInline ? "inline" : "attachment"}; filename="download.${ext}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return h;
}

function sanitizeFileName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function assetLength(request, ctx) {
  const headers = new Headers(request.headers);
  headers.delete('Range');
  headers.delete('If-Range');
  const head = await serveFile(new Request(request, { method: 'HEAD', headers }), ctx);
  const raw = head.headers.get('Content-Length');
  if (!head.ok || !/^\d+$/.test(raw || '')) return null;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : null;
}

export default {
  async fetch(request, env, ctx) {
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
      length = await assetLength(forwarded, ctx);
      if (length !== null) {
        const count = Math.min(Number(suffix[1]), length);
        const headers = new Headers(forwarded.headers);
        headers.set('Range', count ? `bytes=${length - count}-${length - 1}` : `bytes=${length}-`);
        forwarded = new Request(forwarded, { headers });
      }
    }
    let response = await serveFile(forwarded, ctx);
    if (response.status === 416 && !response.headers.has('Content-Range')) {
      length ??= await assetLength(forwarded, ctx);
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
