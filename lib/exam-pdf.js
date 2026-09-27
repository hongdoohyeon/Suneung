'use strict';
// PDF 미리보기 — pdfjs 셀프호스팅(lib/vendor) lazy-load. 화면(필기·확대·전체화면)은 exam-viewer.js.

import { escHtml, safeUrl } from './dom.js?v=31e990ca80d6fe9880d7';
import { mountViewer } from './exam-viewer.js?v=31e990ca80d6fe9880d7';

// pdfjs-dist@4.10.38 — lib/vendor/pdfjs 에 커밋된 사본 (CDN 의존 제거, CSP 'self')
const PDFJS_BASE = new URL('./vendor/pdfjs', import.meta.url).href;

let pdfjsLibPromise = null;
async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const lib = await import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.mjs`);
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.mjs`;
      return lib;
    })();
  }
  return pdfjsLibPromise;
}

// URL 쿼리스트링 제거 후 확장자 추출 (?name=한국어.pdf 같은 케이스 대응).
export function urlExtension(url) {
  if (!url) return null;
  const path = String(url).split('?')[0];
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

export function renderPreviewCover(container, image) {
  const src = image ? safeUrl(image) : '';
  container.innerHTML = `<div class="preview__loading">
    ${src ? `<img class="preview__loading-image" src="${escHtml(src)}" alt="" aria-hidden="true" />` : '<p class="preview__loading-missing">대표 이미지가 준비되지 않았습니다.</p>'}
    <button class="preview__loading-action" type="button">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M6 3.75h8.5L19 8.25v11A1.75 1.75 0 0 1 17.25 21H6.75A1.75 1.75 0 0 1 5 19.25V5.5A1.75 1.75 0 0 1 6.75 3.75Z" stroke="currentColor" stroke-width="1.6"/><path d="M14 4v4.5h4.5M8.5 12h7M8.5 15.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>시험지 펼치기</span><span class="preview__loading-arrow" aria-hidden="true">→</span>
    </button>
  </div>`;
  return container.querySelector('.preview__loading-action');
}

export async function renderPdf(url, container, metaEl, opts = {}) {
  if (metaEl) metaEl.textContent = '불러오는 중…';
  try {
    const safe = safeUrl(url);
    if (!safe) throw new Error('안전하지 않은 파일 URL입니다.');
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ url: safe, withCredentials: false }).promise;

    await mountViewer({ pdf, container, metaEl, inkKey: opts.inkKey });
  } catch (err) {
    container.innerHTML = `
      <div class="preview__error">
        <p class="preview__error-title">미리보기를 불러오지 못했어요</p>
        <p class="preview__error-sub">연결을 확인하고 다시 시도하거나 파일을 직접 열어 주세요.</p>
        <button type="button" class="btn preview__retry">다시 시도</button>
        <a class="btn" href="${escHtml(safeUrl(url))}" target="_blank" rel="noopener">파일 직접 열기</a>
      </div>`;
    console.error('PDF 미리보기 실패:', err);
    container.querySelector('.preview__retry').addEventListener('click', () => renderPdf(url, container, metaEl, opts));
    if (metaEl) metaEl.textContent = '오류';
  }
}

// HWP 등 미리보기 불가 포맷 안내
export function renderUnsupported(container, ext, downloadUrl, downloadName) {
  const safeDownloadUrl = safeUrl(downloadUrl);
  container.innerHTML = `
    <div class="preview__unsupported">
      <p class="preview__unsupported-title">${escHtml(ext.toUpperCase())} 파일은 미리보기를 지원하지 않아요</p>
      <p class="preview__unsupported-sub">한글뷰어 등 외부 프로그램으로 열어 주세요.</p>
      ${safeDownloadUrl
        ? `<a class="btn btn--primary" href="${escHtml(safeDownloadUrl)}" download="${escHtml(downloadName ?? '')}" style="margin-top:10px;">파일 다운로드</a>`
        : ''}
    </div>`;
}

export function renderEmpty(container) {
  container.innerHTML = `
    <div class="preview__empty">
      <p>아직 등록되지 않았어요.</p>
    </div>`;
}
