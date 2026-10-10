// 아이폰 사파리용 저장 중계 — 페이지에서 만든 파일(blob)을 사파리는 '진짜 다운로드'로 다루지 않아
// 주소창 다운로드 표시가 안 뜬다. 페이지가 캐시에 넣어 둔 파일을 /__save/… 이동 요청에 attachment 로 돌려준다.
// 그 밖의 요청은 전혀 건드리지 않는다.
const CACHE = 'kicegg-save';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/__save/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url.pathname);
    if (!hit) return new Response('저장할 파일을 찾지 못했어요. 다시 받아 주세요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    await cache.delete(url.pathname);
    return hit;
  })());
});
