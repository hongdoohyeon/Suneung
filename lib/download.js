'use strict';

const FORCE_DOWNLOAD_HOSTS = new Set([
  'suneung-files.hdh061224.workers.dev',
  'wdown.ebsi.co.kr',
]);

function downloadName(link, url) {
  return link.getAttribute('download') || decodeURIComponent(url.pathname.split('/').pop()) || 'download';
}

export function enableForcedDownloads(root = document) {
  root.addEventListener('click', async event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a[download]');
    if (!link || link.dataset.downloading === 'true') return;

    const url = new URL(link.href, location.href);
    if (!FORCE_DOWNLOAD_HOSTS.has(url.hostname)) return;

    event.preventDefault();
    link.dataset.downloading = 'true';
    link.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const objectUrl = URL.createObjectURL(await response.blob());
      const downloader = document.createElement('a');
      downloader.href = objectUrl;
      downloader.download = downloadName(link, url);
      document.body.appendChild(downloader);
      downloader.click();
      downloader.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.error('PDF 다운로드 실패:', error);
      alert('파일을 바로 다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      delete link.dataset.downloading;
      link.removeAttribute('aria-busy');
    }
  });
}
