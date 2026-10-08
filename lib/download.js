'use strict';

const FORCE_DOWNLOAD_HOSTS = new Set([
  'suneung-files.hdh061224.workers.dev',
]);
const IN_APP_BROWSER = /; wv\)|KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|everytimeApp|DaumApps|whale\/.*inapp/i;

function downloadName(link, url) {
  return link.getAttribute('download')
    || url.searchParams.get('name')
    || decodeURIComponent(url.pathname.split('/').pop())
    || 'download';
}

export function saveBlob(blob, name) {
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
    if (IN_APP_BROWSER.test(navigator.userAgent)) return;

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
