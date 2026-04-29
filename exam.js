'use strict';
import { CURRICULUM_CONFIG, getTypeConf } from './config.js';

// ── PDF.js (jsdelivr CDN, ESM) ─────────────────────────────
// 모바일에서도 안정적으로 동작하는 mozilla 공식 라이브러리.
// 무료 (MIT) — 별도 비용 없음. 단, PDF는 cross-origin이므로
// Cloudflare Worker 응답에 'Access-Control-Allow-Origin' 헤더가 필요함.
const PDFJS_VER = '4.7.76';
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

const $ = id => document.getElementById(id);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
));

// ── URL 확장자 추출 (?쿼리 스트립) ─────────────────────────
function urlExtension(url) {
  if (!url) return null;
  const path = String(url).split('?')[0];
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

// ── 메타 표시 문자열 ───────────────────────────────────────
function displayYear(item) {
  if (item.gradeYear === 'preliminary') return { label: '예비시험', suffix: '' };
  const tc = getTypeConf(item.type);
  if (tc?.displayMode === 'examYear') {
    return { label: `${item.examYear}년 ${item.month}월`, suffix: '' };
  }
  return { label: String(item.gradeYear), suffix: '학년도' };
}

function buildTitle(exam) {
  const tc = getTypeConf(exam.type);
  const dy = displayYear(exam);
  const subj = exam.subSubject ? `${exam.subject}(${exam.subSubject})` : exam.subject;
  const head = exam.gradeYear === 'preliminary'
    ? `예비시험`
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${tc?.label ?? ''}`
        : `${dy.label}${dy.suffix} ${tc?.label ?? ''}`);
  return `${head} · ${subj}`;
}

function buildSubtitle(exam) {
  const conf = CURRICULUM_CONFIG[exam.curriculum];
  const tc   = getTypeConf(exam.type);
  return [conf?.label, tc?.groupLabel].filter(Boolean).join(' · ');
}

// ── 헤드 렌더 ──────────────────────────────────────────────
function renderHead(exam) {
  document.title = `${buildTitle(exam)} — 기출자료실`;

  const tc = getTypeConf(exam.type);
  const dy = displayYear(exam);
  const yearChip = `<span class="chiplet chiplet--ink">${escHtml(dy.label)}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${escHtml(tc.label)}</span>`
    : '';
  const subjChip = `<span class="chiplet chiplet--soft">${escHtml(exam.subject)}${exam.subSubject ? ` · ${escHtml(exam.subSubject)}` : ''}</span>`;
  $('examChips').innerHTML = yearChip + typeChip + subjChip;

  $('examTitle').textContent = buildTitle(exam);
  $('examSub').textContent   = buildSubtitle(exam);

  // 다운로드 액션
  const dl = name => name ? `download="${escHtml(name)}"` : 'download';
  const buttons = [];
  if (exam.questionUrl) buttons.push(
    `<a class="btn btn--primary" href="${exam.questionUrl}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지 다운로드</a>`
  );
  if (exam.answerUrl) buttons.push(
    `<a class="btn" href="${exam.answerUrl}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답 다운로드</a>`
  );
  if (exam.solutionUrl) buttons.push(
    `<a class="btn" href="${exam.solutionUrl}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설 다운로드</a>`
  );
  $('examActions').innerHTML = buttons.join('');

  // archive 탭 복귀 링크에 curriculum 유지
  $('backLink').href = `archive.html?tab=${encodeURIComponent(exam.curriculum)}`;
}

// ── PDF 렌더 (단일 컬럼, 컨테이너 폭에 맞춰 축소) ──────────
async function renderPdfPage(pdf, pageNum, dpr, containerWidth) {
  const page = await pdf.getPage(pageNum);
  const baseVp = page.getViewport({ scale: 1 });
  const scale  = Math.min(2, containerWidth / baseVp.width);
  const vp     = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.className = 'preview__page';
  canvas.width  = Math.floor(vp.width * dpr);
  canvas.height = Math.floor(vp.height * dpr);
  canvas.style.width  = vp.width + 'px';
  canvas.style.height = vp.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

async function renderPdf(url, container, metaEl) {
  if (metaEl) metaEl.textContent = '불러오는 중…';
  try {
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;

    container.innerHTML = '';
    const total = pdf.numPages;
    if (metaEl) metaEl.textContent = `${total}쪽`;

    const containerWidth = container.clientWidth || 600;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // 첫 페이지만 즉시 렌더 — 나머지는 사용자가 '더보기' 눌러야 펼침
    const first = await renderPdfPage(pdf, 1, dpr, containerWidth);
    container.appendChild(first);

    if (total > 1) {
      const more = document.createElement('button');
      more.className = 'preview__more';
      more.type = 'button';
      more.textContent = `나머지 ${total - 1}쪽 펼치기`;
      more.addEventListener('click', async () => {
        more.disabled = true;
        more.textContent = '불러오는 중…';
        for (let i = 2; i <= total; i++) {
          const c = await renderPdfPage(pdf, i, dpr, containerWidth);
          container.insertBefore(c, more);
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

// ── HWP 등 미리보기 불가 포맷 ──────────────────────────────
function renderUnsupported(container, ext, downloadUrl, downloadName) {
  container.innerHTML = `
    <div class="preview__unsupported">
      <p class="preview__unsupported-title">${escHtml(ext.toUpperCase())} 파일은 미리보기를 지원하지 않아요</p>
      <p class="preview__unsupported-sub">한글뷰어 등 외부 프로그램으로 열어 주세요.</p>
      ${downloadUrl
        ? `<a class="btn btn--primary" href="${downloadUrl}" target="_blank" rel="noopener" download="${escHtml(downloadName ?? '')}" style="margin-top:10px;">파일 다운로드</a>`
        : ''}
    </div>`;
}

function renderEmpty(container) {
  container.innerHTML = `
    <div class="preview__empty">
      <p>아직 등록되지 않았어요.</p>
    </div>`;
}

// ── 탭 (문제 / 정보) — URL ?tab=info 동기화 ────────────────
function setupTabs() {
  const tabs  = document.querySelectorAll('.exam-tab');
  const panes = document.querySelectorAll('.exam-pane');
  if (tabs.length === 0) return;

  function activate(key) {
    tabs.forEach(t => {
      const on = t.dataset.tab === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    panes.forEach(p => { p.hidden = p.dataset.pane !== key; });
    const url = new URL(location.href);
    if (key === 'paper') url.searchParams.delete('tab');
    else url.searchParams.set('tab', key);
    history.replaceState({}, '', url);
  }

  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

  // 초기 탭: URL ?tab=info 면 정보, 아니면 문제(스포 방지)
  const params = new URLSearchParams(location.search);
  activate(params.get('tab') === 'info' ? 'info' : 'paper');
}

// ── KPI (옵셔널 데이터: exam.stats) ────────────────────────
function renderKpis(exam) {
  const s = exam.stats ?? {};
  const set = (id, raw, suffix = '') => {
    const el = $(id);
    if (!el) return;
    if (raw === null || raw === undefined || raw === '') { el.textContent = '—'; return; }
    const text = typeof raw === 'number' ? raw.toLocaleString('ko-KR') : String(raw);
    el.textContent = text + suffix;
  };
  set('kpiQuestions',  s.totalQuestions);
  set('kpiExaminees',  s.examinees, s.examinees ? '명' : '');
  set('kpiAvgRate',    s.avgRate,   s.avgRate   ? '%'  : '');
  set('kpi1stCut',     s.firstCut,  s.firstCut  ? '점' : '');
}

// ── 빠른정답 (옵셔널 데이터: exam.answers 배열) ────────────
function renderQuickAnswers(exam) {
  const wrap = $('quickAnswers');
  const body = $('quickAnswersBody');
  if (!Array.isArray(exam.answers) || exam.answers.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const cells = exam.answers.map((a, i) => `
    <div class="qa-cell">
      <span class="qa-cell__num">${i + 1}</span>
      <span class="qa-cell__ans">${escHtml(a)}</span>
    </div>
  `).join('');
  body.innerHTML = `<div class="qa-grid">${cells}</div>`;
}

// ── 본 진입점 ──────────────────────────────────────────────
async function main() {
  const params = new URLSearchParams(location.search);
  const idRaw  = params.get('id');
  const id     = Number(idRaw);

  if (!Number.isFinite(id) || id <= 0) {
    showError();
    return;
  }

  let exams = [];
  try {
    const res = await fetch('data/exams.json', { cache: 'no-cache' });
    if (res.ok) exams = await res.json();
  } catch { /* fall-through */ }

  const exam = exams.find(e => e.id === id);
  if (!exam) { showError(); return; }

  renderHead(exam);
  renderKpis(exam);
  renderQuickAnswers(exam);
  setupTabs();

  // 미리보기 렌더 (문제지만)
  const qViewer = $('previewQViewer'), qMeta = $('previewQMeta');
  if (!exam.questionUrl) {
    renderEmpty(qViewer); qMeta.textContent = '없음';
  } else {
    const ext = urlExtension(exam.questionUrl);
    if (ext === 'pdf') renderPdf(exam.questionUrl, qViewer, qMeta);
    else renderUnsupported(qViewer, ext ?? '파일', exam.questionUrl, exam.questionDownload);
  }
}

function showError() {
  $('examHead').hidden = true;
  document.querySelector('.exam__grid').hidden = true;
  $('examError').hidden = false;
  document.title = '자료를 찾을 수 없습니다 — 기출자료실';
}

main();
