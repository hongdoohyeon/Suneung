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
    // iOS 사파리는 같은 도메인 링크 + attachment 헤더면 바로 '다운로드' 를 띄운다 → 가로채지 않는다
    if (IS_IOS && url.hostname === location.hostname) return;

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
