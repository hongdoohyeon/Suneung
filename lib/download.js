'use strict';

const FORCE_DOWNLOAD_HOSTS = new Set([
  'suneung-files.hdh061224.workers.dev',
]);
const IN_APP_BROWSER = /; wv\)|KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|everytimeApp|DaumApps|whale\/.*inapp/i;
// 앱 안 브라우저는 blob: 저장(saveBlob)을 못 한다 — 합쳐 받기 등은 이 값으로 막고 안내한다
export const IS_IN_APP = IN_APP_BROWSER.test(navigator.userAgent);
// iOS(아이패드 데스크톱 모드 포함)는 PDF blob 을 a[download] 로 넘기면 저장 대신 미리보기로 연다
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function downloadName(link, url) {
  return link.getAttribute('download')
    || url.searchParams.get('name')
    || decodeURIComponent(url.pathname.split('/').pop())
    || 'download';
}

// iOS: 서비스 워커를 거쳐 서버에서 받는 것처럼 저장(save-sw.js) → 사파리 주소창 다운로드 표시가 뜬다.
// 서비스 워커를 못 쓰면 false — 부른 쪽이 saveBlob 으로 넘어간다
export async function saveViaWorker(blob, name) {
  if (!IS_IOS || !('serviceWorker' in navigator) || !('caches' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.register('/save-sw.js?v=59940224a4758f475bbb', { scope: '/' });
    const sw = reg.active || await new Promise(resolve => {
      const w = reg.installing || reg.waiting;
      w.addEventListener('statechange', () => { if (w.state === 'activated') resolve(w); });
    });
    if (!sw) return false;
    // 주소 끝에 파일 이름을 둔다 — 사파리가 헤더 이름을 못 읽어도 주소 끝 이름(.pdf)으로 저장하게
    const path = `/__save/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}/${encodeURIComponent(name)}`;
    const cache = await caches.open('kicegg-save');
    await cache.put(path, new Response(blob, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(blob.size),
      'Content-Disposition': `attachment; filename="download${name.match(/\.\w+$/)?.[0] || ''}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    } }));
    location.assign(path);
    return true;
  } catch (err) {
    console.error('저장 중계 실패:', err);
    return false;
  }
}

export function saveBlob(blob, name) {
  // iOS 는 형식을 모르는 파일이어야 미리보기 없이 '다운로드' 로 받는다
  if (IS_IOS && blob.type === 'application/pdf') blob = new Blob([blob], { type: 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const downloader = document.createElement('a');
  downloader.href = objectUrl;
  downloader.download = name;
  document.body.appendChild(downloader);
  downloader.click();
  downloader.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function enableForcedDownloads(root = document) {
  root.addEventListener('click', async event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a[download]');
    if (!link || link.dataset.downloading === 'true') return;

    const url = new URL(link.href, location.href);
    if (!FORCE_DOWNLOAD_HOSTS.has(url.hostname) && !(url.hostname === 'kicegg.com' && url.pathname.startsWith('/files/'))) return;
    // 앱 안 브라우저(안드로이드 WebView·카톡·네이버 등)는 blob: 저장을 못 함 → 링크 그대로 열어 서버의 attachment 헤더로 받게 둔다
    if (IS_IN_APP) return;
    // iOS 사파리는 PDF 를 attachment 로 줘도 미리보기로 연다 → dl=1 로 형식을 숨긴 주소로 바로 이동(다운로드만 뜸)
    if (IS_IOS && url.hostname === location.hostname) {
      event.preventDefault();
      url.searchParams.set('dl', '1');
      location.assign(url.href);
      return;
    }

    event.preventDefault();
    link.dataset.downloading = 'true';
    link.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      saveBlob(await response.blob(), downloadName(link, url));
    } catch (error) {
      console.error('PDF 다운로드 실패:', error);
      alert('파일을 바로 내려받지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      delete link.dataset.downloading;
      link.removeAttribute('aria-busy');
    }
  });
}
