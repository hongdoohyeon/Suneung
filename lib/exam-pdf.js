'use strict';
// PDF 미리보기 — pdfjs CDN lazy-load + viewport 적응형 렌더 + 줌 컨트롤.

import { escHtml, safeUrl } from './dom.js';

const PDFJS_VER = '4.10.38';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build`;

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

// 단일 페이지 캔버스 렌더 — zoom 배수 적용.
// canvas.style.width = vp.width(px) 명시 → 줌 = 화면 크기.
// canvas.style.height 는 미명시 + aspectRatio 로 비율 보장.
async function renderPdfPage(pdf, pageNum, dpr, containerWidth, zoom = 1) {
  const page = await pdf.getPage(pageNum);
  const baseVp = page.getViewport({ scale: 1 });
  const fitScale = Math.min(2, containerWidth / baseVp.width);
  const scale = fitScale * zoom;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.className = 'preview__page';
  canvas.width  = Math.floor(vp.width  * dpr);
  canvas.height = Math.floor(vp.height * dpr);
  canvas.style.width = `${Math.round(vp.width)}px`;
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${vp.width} / ${vp.height}`;
  canvas.style.maxWidth = zoom > 1 ? 'none' : '100%';
  canvas.style.maxHeight = 'none';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

export async function renderPdf(url, container, metaEl) {
  if (metaEl) metaEl.textContent = '불러오는 중…';
  try {
    const safe = safeUrl(url);
    if (!safe) throw new Error('안전하지 않은 파일 URL입니다.');
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ url: safe, withCredentials: false }).promise;

    container.innerHTML = '';
    const total = pdf.numPages;
    if (metaEl) metaEl.textContent = `${total}쪽`;

    // 모바일에서 container.clientWidth가 layout 미정착으로 작게 잡히는 케이스 회피
    const isMobile = window.innerWidth <= 600;
    const measured = container.clientWidth || 0;
    const containerWidth = isMobile
      ? Math.max(measured, window.innerWidth - 28)
      : (measured || 600);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let zoom = 1;
    const renderedPages = [];

    // 줌 컨트롤 (데스크톱) — 모바일은 브라우저 핀치 줌
    const ctrls = document.createElement('div');
    ctrls.className = 'preview__zoom preview__zoom--top';
    ctrls.innerHTML = `
      <button type="button" class="preview__zoom-btn" data-act="out" aria-label="축소">−</button>
      <button type="button" class="preview__zoom-btn preview__zoom-pct" data-act="reset" aria-label="100% 보기">100%</button>
      <button type="button" class="preview__zoom-btn" data-act="in" aria-label="확대">+</button>`;
    container.parentElement?.querySelector('.preview__head')?.appendChild(ctrls);
    const pctEl = ctrls.querySelector('.preview__zoom-pct');

    async function rerenderAll() {
      pctEl.textContent = `${Math.round(zoom * 100)}%`;
      for (const item of renderedPages) {
        const newCanvas = await renderPdfPage(pdf, item.n, dpr, containerWidth, zoom);
        if (item.canvas.parentNode) item.canvas.parentNode.replaceChild(newCanvas, item.canvas);
        item.canvas = newCanvas;
      }
    }
    function applyZoom(z) {
      zoom = Math.max(0.5, Math.min(2.5, z));
      rerenderAll().catch(() => {});
    }
    ctrls.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'in')    applyZoom(zoom + 0.1);
      else if (act === 'out')   applyZoom(zoom - 0.1);
      else if (act === 'reset') applyZoom(1);
    });
    function onKey(e) {
      if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
      if (e.key === '+' || e.key === '=') { applyZoom(zoom + 0.1); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { applyZoom(zoom - 0.1); e.preventDefault(); }
      else if (e.key === '0') { applyZoom(1); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);

    // 첫 페이지 즉시 + '나머지 N쪽 펼치기' 버튼
    const first = await renderPdfPage(pdf, 1, dpr, containerWidth, zoom);
    container.appendChild(first);
    renderedPages.push({ n: 1, canvas: first });

    if (total > 1) {
      const more = document.createElement('button');
      more.className = 'preview__more';
      more.type = 'button';
      more.textContent = `나머지 ${total - 1}쪽 펼치기`;
      more.addEventListener('click', async () => {
        more.disabled = true;
        more.textContent = '불러오는 중…';
        for (let i = 2; i <= total; i++) {
          const c = await renderPdfPage(pdf, i, dpr, containerWidth, zoom);
          container.insertBefore(c, more);
          renderedPages.push({ n: i, canvas: c });
        }
        more.remove();
      }, { once: true });
      container.appendChild(more);
    }
  } catch (err) {
    container.innerHTML = `
      <div class="preview__error">
        <p class="preview__error-title">미리보기를 불러오지 못했어요</p>
        <p class="preview__error-sub">파일 서버의 CORS 헤더(<code>Access-Control-Allow-Origin</code>) 설정이 필요할 수 있어요.</p>
        <p class="preview__error-detail">${escHtml(err.message || String(err))}</p>
      </div>`;
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
        ? `<a class="btn btn--primary" href="${escHtml(safeDownloadUrl)}" target="_blank" rel="noopener" download="${escHtml(downloadName ?? '')}" style="margin-top:10px;">파일 다운로드</a>`
        : ''}
    </div>`;
}

export function renderEmpty(container) {
  container.innerHTML = `
    <div class="preview__empty">
      <p>아직 등록되지 않았어요.</p>
    </div>`;
}
