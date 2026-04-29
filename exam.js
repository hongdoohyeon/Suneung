'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub } from './config.js';

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
  const subj = exam.subSubject ? `${exam.subject}(${prettySub(exam.subSubject)})` : exam.subject;
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
  document.title = `${buildTitle(exam)} — 기출해체분석기`;

  const tc = getTypeConf(exam.type);
  const dy = displayYear(exam);
  const yearChip = `<span class="chiplet chiplet--ink">${escHtml(dy.label)}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${escHtml(tc.label)}</span>`
    : '';
  const subjChip = `<span class="chiplet chiplet--soft">${escHtml(exam.subject)}${exam.subSubject ? ` · ${escHtml(prettySub(exam.subSubject))}` : ''}</span>`;
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
  // 표시 크기는 CSS(max-width / max-height)에 위임, 비율은 aspect-ratio로 보존
  canvas.style.aspectRatio = `${vp.width} / ${vp.height}`;
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
function setupTabs(onActivate) {
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
    panes.forEach(p => {
      const on = p.dataset.pane === key;
      p.hidden = !on;
      p.style.display = on ? '' : 'none';   // CSS specificity 충돌 회피용 강제
    });
    const url = new URL(location.href);
    if (key === 'paper') url.searchParams.delete('tab');
    else url.searchParams.set('tab', key);
    history.replaceState({}, '', url);
    if (typeof onActivate === 'function') onActivate(key);
  }

  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

  // 초기 탭: URL ?tab=info 면 정보, 아니면 문제(스포 방지)
  const params = new URLSearchParams(location.search);
  activate(params.get('tab') === 'info' ? 'info' : 'paper');
}

// ── 답지 PDF 에서 정답 자동 추출 (런타임 PDF.js 텍스트 파싱) ──
const CIRCLED_TO_NUM = { '①':'1', '②':'2', '③':'3', '④':'4', '⑤':'5' };

function parseAnswersFromText(text) {
  const t = String(text || '');
  const pairs = new Map();
  // 패턴: (번호 1~50) (구분자 .) 번 공백 등) (원숫자 ①~⑤)
  // (?!\s*[점등]) 으로 "①점", "①등" 같은 거짓 매칭 회피
  const re = /(?:^|[^\d])(\d{1,2})\s*(?:번호|번|[.)]|\s)\s*([①②③④⑤])(?!\s*[점등])/g;
  let m;
  while ((m = re.exec(t)) != null) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 50 && !pairs.has(num)) {
      pairs.set(num, CIRCLED_TO_NUM[m[2]]);
    }
  }
  if (pairs.size < 5) return null;
  const max = Math.max(...pairs.keys());
  const arr = [];
  let missing = 0;
  for (let i = 1; i <= max; i++) {
    if (pairs.has(i)) arr.push(pairs.get(i));
    else { arr.push('?'); missing++; }
  }
  // 구멍이 너무 많으면 신뢰 X
  if (missing > Math.max(2, Math.floor(arr.length * 0.2))) return null;
  return arr;
}

async function fetchAnswersFromPdf(url) {
  if (!url) return null;
  try {
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    const limit = Math.min(pdf.numPages, 4);   // 답지는 보통 1~3쪽
    let text = '';
    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += ' ' + tc.items.map(it => it.str).join(' ');
    }
    return parseAnswersFromText(text);
  } catch {
    return null;
  }
}

// 정보 탭 첫 활성화 시 한 번만 시도 (lazy)
let _answersTried = false;
async function ensureAnswers(exam) {
  if (_answersTried) return;
  _answersTried = true;
  if (Array.isArray(exam.answers) && exam.answers.length > 0) return;
  if (!exam.answerUrl) return;

  const wrap  = $('quickAnswers');
  const body  = $('quickAnswersBody');
  const count = $('quickAnswersCount');
  wrap.hidden = false;
  if (count) count.textContent = '추출 중…';
  body.innerHTML = '<div class="qa-loading">답지 PDF에서 정답을 뽑는 중…</div>';

  const answers = await fetchAnswersFromPdf(exam.answerUrl);
  if (!answers) {
    wrap.hidden = true;
    return;
  }
  exam.answers = answers;
  renderQuickAnswers(exam);
  // 정보 탭 빈 안내 카드는 빠른정답 추가됐으니 숨김
  const empty = $('paneIEmpty');
  if (empty) empty.hidden = true;
}

// ── 빠른정답 (옵셔널 데이터: exam.answers 배열) ────────────
function renderQuickAnswers(exam) {
  const wrap  = $('quickAnswers');
  const body  = $('quickAnswersBody');
  const count = $('quickAnswersCount');
  if (!Array.isArray(exam.answers) || exam.answers.length === 0) {
    wrap.hidden = true;
    return false;
  }
  wrap.hidden = false;
  // 빠진 답이 있으면 추출 신뢰도가 떨어진 것 — 라벨로 안내
  const missing = exam.answers.filter(a => a === '?').length;
  if (count) {
    count.textContent = missing > 0
      ? `총 ${exam.answers.length}문항 · ${missing}개 미확인`
      : `총 ${exam.answers.length}문항`;
  }
  const cells = exam.answers.map((a, i) => `
    <div class="qa-cell">
      <span class="qa-cell__num">${i + 1}</span>
      <span class="qa-cell__ans">${escHtml(a)}</span>
    </div>
  `).join('');
  body.innerHTML = `<div class="qa-grid">${cells}</div>`;
  return true;
}

// ── 등급 분포 (정규분포 곡선 + 등급별 영역 + 컷 점수 라벨) ──
const GRADE_COLORS = [
  '#0c5e3f', '#15803d', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#b91c1c', '#7f1d1d', '#3f0e0e',
];
// 누적 백분율 4·11·23·40·60·77·89·96 의 표준정규 z-score (1→8 등급 컷)
const GRADE_Z = [1.751, 1.227, 0.739, 0.253, -0.253, -0.739, -1.227, -1.751];

function gradeDistSVG(rawCuts, fullScore) {
  const W = 600, H = 200;
  const PAD_X = 16, PAD_TOP = 18, PAD_BOTTOM = 30;
  const innerW = W - 2 * PAD_X;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const baseY  = PAD_TOP + innerH;
  const Z_RANGE = 2.6;

  const xOf = z => PAD_X + ((z + Z_RANGE) / (2 * Z_RANGE)) * innerW;
  const pdf = z => Math.exp(-z * z / 2);
  const yOf = z => PAD_TOP + innerH * (1 - pdf(z));

  // 9개 등급 영역 경계 — z 작은(왼=낮은점수=9등급) → 큰(오=높은점수=1등급)
  const zBounds = [-Z_RANGE, ...[...GRADE_Z].slice().reverse(), Z_RANGE];

  const areaPath = (zStart, zEnd) => {
    const N = 24;
    const pts = [];
    pts.push(`M ${xOf(zStart).toFixed(1)} ${baseY.toFixed(1)}`);
    for (let i = 0; i <= N; i++) {
      const z = zStart + (i / N) * (zEnd - zStart);
      pts.push(`L ${xOf(z).toFixed(1)} ${yOf(z).toFixed(1)}`);
    }
    pts.push(`L ${xOf(zEnd).toFixed(1)} ${baseY.toFixed(1)} Z`);
    return pts.join(' ');
  };

  let areas = '';
  for (let g = 1; g <= 9; g++) {
    const zStart = zBounds[9 - g];
    const zEnd   = zBounds[10 - g];
    areas += `<path d="${areaPath(zStart, zEnd)}" fill="${GRADE_COLORS[g - 1]}" opacity="0.88"/>`;
  }

  // 영역 경계 세로 점선 (1~8등급 컷 위치)
  const dividers = GRADE_Z.map(z =>
    `<line x1="${xOf(z).toFixed(1)}" y1="${baseY.toFixed(1)}" x2="${xOf(z).toFixed(1)}" y2="${yOf(z).toFixed(1)}"
           stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="2 2"/>`
  ).join('');

  // 곡선 outline
  const N = 80;
  const curvePts = [`M ${xOf(-Z_RANGE).toFixed(1)} ${yOf(-Z_RANGE).toFixed(1)}`];
  for (let i = 1; i <= N; i++) {
    const z = -Z_RANGE + (i / N) * (2 * Z_RANGE);
    curvePts.push(`L ${xOf(z).toFixed(1)} ${yOf(z).toFixed(1)}`);
  }
  const curve = `<path d="${curvePts.join(' ')}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>`;

  // 등급 번호 라벨 (영역 가운데, 곡선 위)
  const gradeNums = [];
  for (let g = 1; g <= 9; g++) {
    const zStart = zBounds[9 - g];
    const zEnd   = zBounds[10 - g];
    const zMid   = (zStart + zEnd) / 2;
    const x = xOf(zMid).toFixed(1);
    const y = (yOf(zMid) - 5).toFixed(1);
    gradeNums.push(`<text x="${x}" y="${y}" class="grade-dist__num">${g}</text>`);
  }

  // 등급 컷 점수 라벨 (1~8 컷, 곡선 밑)
  const cutLabels = rawCuts.map((c, i) => {
    const x = xOf(GRADE_Z[i]).toFixed(1);
    const y = (baseY + 16).toFixed(1);
    return `<text x="${x}" y="${y}" class="grade-dist__cut">${c}</text>`;
  }).join('');

  // 베이스라인
  const baseLine = `<line x1="${PAD_X}" y1="${baseY.toFixed(1)}" x2="${W - PAD_X}" y2="${baseY.toFixed(1)}"
                          stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`;

  return `
    <svg viewBox="0 0 ${W} ${H}" class="grade-dist__svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${areas}
      ${dividers}
      ${curve}
      ${baseLine}
      ${gradeNums.join('')}
      ${cutLabels}
    </svg>
    <p class="grade-dist__legend">등급별 원점수 컷 ${fullScore && fullScore !== 100 ? `· 만점 ${fullScore}점` : ''}</p>
  `;
}

function renderGradeDist(exam, allCuts) {
  const wrap = $('gradeDist');
  const body = $('gradeDistBody');
  const hint = $('gradeDistHint');
  const cut = allCuts.find(c =>
    c.curriculum === exam.curriculum &&
    String(c.gradeYear) === String(exam.gradeYear) &&
    c.type === exam.type &&
    c.subject === exam.subject &&
    (c.subSubject ?? null) === (exam.subSubject ?? null)
  );
  if (!cut || !Array.isArray(cut.rawCuts) || cut.rawCuts.length !== 8) {
    wrap.hidden = true;
    return false;
  }
  wrap.hidden = false;
  if (hint) hint.textContent = `1등급 컷 ${cut.rawCuts[0]}점`;
  body.innerHTML = gradeDistSVG(cut.rawCuts, cut.fullScore ?? 100);
  return true;
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

  let exams = [], gradecuts = [];
  try {
    const [examRes, cutRes] = await Promise.all([
      fetch('data/exams.json',     { cache: 'no-cache' }),
      fetch('data/gradecuts.json', { cache: 'no-cache' }),
    ]);
    if (examRes.ok) exams     = await examRes.json();
    if (cutRes.ok)  gradecuts = await cutRes.json();
  } catch { /* fall-through */ }

  const exam = exams.find(e => e.id === id);
  if (!exam) { showError(); return; }

  renderHead(exam);
  const hasQA   = renderQuickAnswers(exam);
  const hasDist = renderGradeDist(exam, gradecuts);
  $('paneIEmpty').hidden = hasQA || hasDist;
  // 정보 탭 첫 활성화 시, 빠른정답 데이터가 없으면 답지 PDF에서 자동 추출 시도
  setupTabs(key => { if (key === 'info') ensureAnswers(exam); });

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
  $('examSide').hidden = true;
  $('examMain').hidden = true;
  $('examError').hidden = false;
  document.title = '자료를 찾을 수 없습니다 — 기출해체분석기';
}

main();
