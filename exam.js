'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub } from './config.js';

// ── PDF.js (jsdelivr CDN, ESM) ─────────────────────────────
// 모바일에서도 안정적으로 동작하는 mozilla 공식 라이브러리.
// 무료 (MIT) — 별도 비용 없음. 단, PDF는 cross-origin이므로
// Cloudflare Worker 응답에 'Access-Control-Allow-Origin' 헤더가 필요함.
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

const $ = id => document.getElementById(id);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
));

function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const u = new URL(raw);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? raw : '';
    } catch {
      return '';
    }
  }
  if (raw.startsWith('//')) return '';
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  return /^[\w./%+\-~()[\]]+(?:\?[^\s<>"']*)?(?:#[^\s<>"']*)?$/u.test(raw) ? raw : '';
}

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
  // examYear 모드(학평): dy.label에 "N월" 포함 → tc.label에서 month prefix 제거.
  const typeLbl = tc?.displayMode === 'examYear'
    ? (tc?.label ?? '').replace(/^\d+월\s*/, '')
    : (tc?.label ?? '');
  const head = exam.gradeYear === 'preliminary'
    ? `예비시험`
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${typeLbl}`
        : `${dy.label}${dy.suffix} ${typeLbl}`);
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
  // examYear 모드(학평): yearChip에 "N월"이 들어가므로 typeChip은 month prefix 제거.
  const typeLbl = tc?.displayMode === 'examYear'
    ? (tc?.label ?? '').replace(/^\d+월\s*/, '')
    : (tc?.label ?? '');
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${escHtml(typeLbl)}</span>`
    : '';
  const subjChip = `<span class="chiplet chiplet--soft">${escHtml(exam.subject)}${exam.subSubject ? ` · ${escHtml(prettySub(exam.subSubject))}` : ''}</span>`;
  $('examChips').innerHTML = yearChip + typeChip + subjChip;

  $('examTitle').textContent = buildTitle(exam);
  $('examSub').textContent   = buildSubtitle(exam);

  // 다운로드 액션
  const dl = name => name ? `download="${escHtml(name)}"` : 'download';
  const buttons = [];
  const questionUrl = safeUrl(exam.questionUrl);
  const answerUrl = safeUrl(exam.answerUrl);
  const solutionUrl = safeUrl(exam.solutionUrl);
  if (questionUrl) buttons.push(
    `<a class="btn btn--primary" href="${escHtml(questionUrl)}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지 다운로드</a>`
  );
  if (answerUrl) buttons.push(
    `<a class="btn" href="${escHtml(answerUrl)}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답 다운로드</a>`
  );
  if (solutionUrl) buttons.push(
    `<a class="btn" href="${escHtml(solutionUrl)}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설 다운로드</a>`
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
    const safe = safeUrl(url);
    if (!safe) throw new Error('안전하지 않은 파일 URL입니다.');
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ url: safe, withCredentials: false }).promise;

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

// ── 빠른정답 (옵셔널 데이터: exam.answers 배열) ────────────
function renderQuickAnswers(exam) {
  const body  = $('quickAnswersBody');
  const count = $('quickAnswersCount');
  if (!Array.isArray(exam.answers) || exam.answers.length === 0) {
    if (count) count.textContent = '준비 중';
    body.innerHTML = `<p class="exam-card__sub">이 시험의 정답 데이터가 아직 없어요. 답지 PDF는 위 [정답 다운로드] 버튼으로 받을 수 있어요.</p>`;
    return false;
  }
  // 빠진 답이 있으면 추출 신뢰도가 떨어진 것 — 라벨로 안내
  const missing = exam.answers.filter(a => a === '?').length;
  if (count) {
    count.textContent = missing > 0
      ? `총 ${exam.answers.length}문항 · ${missing}개 미확인`
      : `총 ${exam.answers.length}문항`;
  }
  const cells = exam.answers.map((a, i) => {
    const isMissing = a === '?';
    const display = isMissing ? '—' : escHtml(a);
    const title = isMissing ? ' title="정답 미제공 (PDF 추출 한계)"' : '';
    return `
    <div class="qa-cell${isMissing ? ' qa-cell--missing' : ''}"${title}>
      <span class="qa-cell__num">${i + 1}</span>
      <span class="qa-cell__ans">${display}</span>
    </div>`;
  }).join('');
  body.innerHTML = `<div class="qa-grid">${cells}</div>`;
  return true;
}

// ── 등급 분포 (정규분포 히스토그램 막대) ──
// 막대 N개로 표준정규분포 envelope 형성 + 등급별 색상.
// 누적 백분율 4·11·23·40·60·77·89·96 의 표준정규 z-score (1→8 등급 컷)
const GRADE_Z = [1.751, 1.227, 0.739, 0.253, -0.253, -0.739, -1.227, -1.751];

function gradeDistSVG(rawCuts, fullScore) {
  const W = 640, H = 220;
  const PAD_X = 28, PAD_TOP = 22, PAD_BOTTOM = 60;
  const innerW = W - 2 * PAD_X;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const baseY  = PAD_TOP + innerH;
  const Z_RANGE = 2.4;     // 너무 멀리 가면 막대가 안 보일 만큼 작아짐

  // 1등급(고성취) = 왼쪽. z 부호 뒤집어 x 매핑.
  const xOf = z => PAD_X + ((-z + Z_RANGE) / (2 * Z_RANGE)) * innerW;
  const pdf = z => Math.exp(-z * z / 2);

  // zBounds: 1등급 outer → 9등급 outer
  const zBounds = [Z_RANGE, ...GRADE_Z, -Z_RANGE];

  const gradeOf = z => {
    for (let g = 1; g <= 9; g++) {
      if (z <= zBounds[g - 1] && z > zBounds[g]) return g;
    }
    return 9;
  };

  // 막대: 36개 (가독성 + 분포 envelope 명확히)
  const N_BARS = 36;
  const slot = innerW / N_BARS;
  const gap = 1.6;
  const barW = slot - gap;

  // 정규화 (가장 큰 막대가 innerH 의 95% 까지 차도록)
  const maxPdf = pdf(0);
  const heightOf = z => (pdf(z) / maxPdf) * innerH * 0.96;

  let bars = '';
  for (let i = 0; i < N_BARS; i++) {
    const zCenter = Z_RANGE - ((i + 0.5) / N_BARS) * (2 * Z_RANGE);
    const h = heightOf(zCenter);
    const x = PAD_X + i * slot + gap / 2;
    const y = baseY - h;
    const g = gradeOf(zCenter);
    // h 가 너무 작으면 (edge) 1.5px 최소 보장
    const hh = Math.max(h, 1.5);
    bars += `<rect x="${x.toFixed(1)}" y="${(baseY - hh).toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}" class="grade-dist__bar grade-dist__bar--g${g}" rx="1"/>`;
  }

  // 베이스라인
  const baseLine = `<line x1="${PAD_X}" y1="${baseY.toFixed(1)}" x2="${W - PAD_X}" y2="${baseY.toFixed(1)}" class="grade-dist__baseline"/>`;

  // 컷 tick (1~8 등급 경계)
  const ticks = GRADE_Z.map(z => {
    const x = xOf(z).toFixed(1);
    return `<line x1="${x}" y1="${baseY.toFixed(1)}" x2="${x}" y2="${(baseY + 4).toFixed(1)}" class="grade-dist__tick"/>`;
  }).join('');

  // 컷 점수 라벨
  const cutLabels = rawCuts.map((c, i) => {
    const x = xOf(GRADE_Z[i]).toFixed(1);
    const label = (c == null) ? '·' : c;
    return `<text x="${x}" y="${(baseY + 16).toFixed(1)}" class="grade-dist__cut">${label}</text>`;
  }).join('');

  // 등급 번호 (각 영역 가운데, 컷 점수 아래 row)
  const gradeNums = [];
  for (let g = 1; g <= 9; g++) {
    const zMid = (zBounds[g - 1] + zBounds[g]) / 2;
    const x = xOf(zMid).toFixed(1);
    const y = (baseY + 36).toFixed(1);
    gradeNums.push(`<text x="${x}" y="${y}" class="grade-dist__num grade-dist__num--g${g}">${g}</text>`);
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" class="grade-dist__svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="등급별 원점수 컷 분포">
      ${bars}
      ${baseLine}
      ${ticks}
      ${cutLabels}
      ${gradeNums.join('')}
    </svg>
    <p class="grade-dist__legend">등급별 원점수 컷${fullScore ? ` · 만점 ${fullScore}점` : ''}</p>
  `;
}

function renderGradeDist(exam, allCuts) {
  const body = $('gradeDistBody');
  const hint = $('gradeDistHint');
  const cut = allCuts.find(c =>
    c.curriculum === exam.curriculum &&
    String(c.gradeYear) === String(exam.gradeYear) &&
    c.type === exam.type &&
    c.subject === exam.subject &&
    (c.subSubject ?? null) === (exam.subSubject ?? null)
  );
  // 무조건 원점수(rawCuts) 만 표시. 데이터 없으면 안내.
  const hasRaw = cut && Array.isArray(cut.rawCuts) && cut.rawCuts.some(v => v != null);
  if (!hasRaw) {
    if (hint) hint.textContent = '준비 중';
    body.innerHTML = `<p class="exam-card__sub">이 시험의 원점수 등급컷 데이터가 아직 없어요.</p>`;
    return false;
  }

  if (hint) hint.textContent = `1등급 컷 ${cut.rawCuts[0]}점${cut.absolute ? ' · 절대평가' : ''}`;
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

  let exams = [], gradecuts = [], answersMap = {};
  try {
    const [examRes, cutRes, ansRes] = await Promise.all([
      fetch('data/exams.json',     { cache: 'no-cache' }),
      fetch('data/gradecuts.json', { cache: 'no-cache' }),
      fetch('data/answers.json',   { cache: 'no-cache' }),
    ]);
    if (examRes.ok) exams      = await examRes.json();
    if (cutRes.ok)  gradecuts  = await cutRes.json();
    if (ansRes.ok)  answersMap = await ansRes.json();
  } catch { /* fall-through */ }

  const exam = exams.find(e => e.id === id);
  if (!exam) { showError(); return; }

  // 사전 추출된 정답이 있으면 합쳐 사용 (exam.answers 우선, 없으면 answersMap 폴백)
  if ((!Array.isArray(exam.answers) || exam.answers.length === 0) && answersMap[id]) {
    exam.answers = answersMap[id];
  }

  renderHead(exam);
  renderQuickAnswers(exam);
  renderGradeDist(exam, gradecuts);
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
  $('examSide').hidden = true;
  $('examMain').hidden = true;
  $('examError').hidden = false;
  document.title = '자료를 찾을 수 없습니다 — 기출해체분석기';
}

main();
