'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub } from './config.js';
import { escHtml as _escHtml, escAttr, safeUrl as _safeUrl, $ as _$ } from './lib/dom.js';
import { setMeta, setMetaProp, setCanonical, injectJsonLd as _injectJsonLd, applySeo } from './lib/seo.js';

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

// 공통 헬퍼는 lib/dom.js, lib/seo.js 에서 import. 로컬 별칭만 유지 (호환성).
const $ = _$;
const escHtml = _escHtml;
const safeUrl = _safeUrl;
const injectJsonLd = (payload) => _injectJsonLd('jsonld-exam', payload);

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
  const title = buildTitle(exam);
  document.title = `${title} — 기출해체분석기`;
  // ── SEO: 동적 meta description / OG title / canonical ──
  const sub = buildSubtitle(exam);
  const desc = `${title} 문제지·정답·해설 PDF. ${sub}.`;
  setMeta('description', desc);
  setMetaProp('og:title', `${title} — 기출해체분석기`);
  setMetaProp('og:description', desc);
  setMetaProp('og:url', location.href);
  // JSON-LD LearningResource — search engine 구조화 데이터
  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: title,
    description: desc,
    url: location.href,
    inLanguage: 'ko',
    learningResourceType: '기출문제',
    educationalLevel: '고등학교',
    isPartOf: { '@type': 'WebSite', name: '기출해체분석기',
                url: 'https://hongdoohyeon.github.io/Suneung/' },
    ...(exam.questionUrl ? { hasPart: [
      { '@type': 'DigitalDocument', name: '문제지', url: exam.questionUrl, encodingFormat: 'application/pdf' },
      ...(exam.answerUrl ? [{ '@type': 'DigitalDocument', name: '정답', url: exam.answerUrl, encodingFormat: 'application/pdf' }] : []),
    ] } : {}),
  });
  // 회차 진입 link (사이드바)
  const setLink = document.getElementById('examSetSideLink');
  if (setLink && exam.curriculum && exam.gradeYear && exam.type) {
    const params = new URLSearchParams({
      curriculum: exam.curriculum,
      year: String(exam.gradeYear),
      type: exam.type,
    });
    if (exam.studentGrade != null) params.set('grade', String(exam.studentGrade));
    setLink.href = `exam-set.html?${params.toString()}`;
    setLink.hidden = false;
  }

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

// ── PDF 렌더 ────────────────────────────────────────────────
// 페이지별 placeholder 슬롯을 먼저 깔고, IntersectionObserver 로 viewport 진입한
// 페이지만 실제 canvas 렌더 → 모바일 저사양 멈춤 방지 + 즉시 첫 paint.

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

// 페이지 단건 렌더 (canvas 새로 생성). zoom 배수 적용.
async function renderPdfPage(pdf, pageNum, dpr, containerWidth, zoom = 1) {
  const page = await pdf.getPage(pageNum);
  const baseVp = page.getViewport({ scale: 1 });
  const fitScale = Math.min(2, containerWidth / baseVp.width);
  const scale = fitScale * zoom;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.className = 'preview__page';
  canvas.width = Math.floor(vp.width * dpr);
  canvas.height = Math.floor(vp.height * dpr);
  canvas.style.aspectRatio = `${vp.width} / ${vp.height}`;
  const ctx = canvas.getContext('2d');
  await page.render({
    canvasContext: ctx,
    viewport: vp,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
  }).promise;
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
    let zoom = 1;
    const renderedPages = []; // {n, canvas} 렌더된 페이지 목록 (zoom 변경 시 재렌더)

    // 줌 컨트롤 (preview 상단 — 데스크톱)
    // 모바일은 브라우저 핀치 줌 사용 (viewport meta 에서 user-scalable 허용).
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

    // 첫 페이지만 즉시 렌더 — 나머지는 사용자가 '더보기' 눌러야 펼침 (옛 동작 복귀)
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

  // 초기 탭: URL ?tab=info 면 정보, 아니면 문제(default).
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

// 실제 KICE 도수분포 → SVG. 표준점수 키 dict { score: { male, female } }.
// 표시는 표준점수 x축, 인원수 y축 (남녀 합산).
function realDistSVG(distribution, cut) {
  const entries = Object.entries(distribution)
    .map(([k, v]) => ({ std: Number(k), n: (v.male ?? 0) + (v.female ?? 0) }))
    .filter(d => Number.isFinite(d.std) && d.n >= 0)
    .sort((a, b) => a.std - b.std);
  if (entries.length === 0) return '';
  const W = 640, H = 220, PAD_X = 28, PAD_TOP = 22, PAD_BOTTOM = 60;
  const innerW = W - 2 * PAD_X;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const baseY = PAD_TOP + innerH;
  const minS = entries[0].std, maxS = entries[entries.length - 1].std;
  const xOf = s => PAD_X + ((s - minS) / Math.max(1, maxS - minS)) * innerW;
  const maxN = Math.max(...entries.map(d => d.n));
  const hOf = n => (n / maxN) * innerH * 0.96;
  const slot = innerW / entries.length;
  const barW = Math.max(1, slot - 1.4);
  const bars = entries.map(d => {
    const h = hOf(d.n);
    const x = xOf(d.std) - barW / 2;
    return `<rect x="${x.toFixed(2)}" y="${(baseY - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="var(--pop)" opacity="0.78"/>`;
  }).join('');
  const baseLine = `<line x1="${PAD_X}" y1="${baseY}" x2="${W - PAD_X}" y2="${baseY}" stroke="var(--line-strong)" stroke-width="1"/>`;
  const ticks = [minS, Math.round((minS + maxS) / 2), maxS].map(s =>
    `<text x="${xOf(s)}" y="${baseY + 16}" text-anchor="middle" fill="var(--ink-3)" font-size="11">${s}</text>`).join('');
  return `<svg class="grade-dist" viewBox="0 0 ${W} ${H}" role="img" aria-label="실제 표준점수 도수분포">
    ${bars}${baseLine}${ticks}
  </svg>
  <p class="grade-dist__legend">실제 표준점수 도수분포 · 출처 KICE</p>`;
}

function renderGradeDist(exam, allCuts, distData) {
  const body = $('gradeDistBody');
  const hint = $('gradeDistHint');

  // (1) 실제 도수분포 데이터 매칭 (KICE 공식)
  if (Array.isArray(distData)) {
    const real = distData.find(d =>
      Number(d.year) === Number(exam.gradeYear) &&
      d.type === exam.type &&
      d.subject === exam.subject &&
      (d.subSubject ?? null) === (exam.subSubject ?? null)
    );
    if (real?.distribution) {
      if (hint) hint.textContent = '실제 도수분포 (KICE)';
      body.innerHTML = realDistSVG(real.distribution);
      return true;
    }
  }

  // (2) 등급컷 기반 정규분포 추정 (envelope)
  const cut = allCuts.find(c =>
    c.curriculum === exam.curriculum &&
    String(c.gradeYear) === String(exam.gradeYear) &&
    c.type === exam.type &&
    c.subject === exam.subject &&
    (c.subSubject ?? null) === (exam.subSubject ?? null)
  );
  const hasRaw = cut && Array.isArray(cut.rawCuts) && cut.rawCuts.some(v => v != null);
  if (!hasRaw) {
    if (hint) hint.textContent = '준비 중';
    body.innerHTML = `<p class="exam-card__sub">이 시험의 원점수 등급컷 데이터가 아직 없어요.</p>`;
    return false;
  }

  // 실제 분포가 아닌 등급컷 경계만 알 때의 추정 envelope임을 명시
  if (hint) hint.textContent = `1등급 컷 ${cut.rawCuts[0]}점${cut.absolute ? ' · 절대평가' : ''} · 추정`;
  body.innerHTML = gradeDistSVG(cut.rawCuts, cut.fullScore ?? 100)
    + '<p class="grade-dist__legend">참고용 정규분포 모델 (실제 시험 분포 아님)</p>';
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

  // 단건 lazy fetch 우선: data/exam/{id}.json (~1KB) 만 받음.
  // 미존재 시 통합 data/exams.json (~2MB) 로 폴백.
  let exam = null, gradecuts = [], answersMap = {}, scoreDist = [];
  try {
    const [singleRes, cutRes, ansRes, distRes] = await Promise.all([
      fetch(`data/exam/${id}.json`, { cache: 'no-cache' }),
      fetch('data/gradecuts.json',  { cache: 'no-cache' }),
      fetch('data/answers.json',    { cache: 'no-cache' }),
      fetch('data/score-distribution.json', { cache: 'no-cache' }),
    ]);
    if (singleRes.ok) exam = await singleRes.json();
    if (cutRes.ok)    gradecuts  = await cutRes.json();
    if (ansRes.ok)    answersMap = await ansRes.json();
    if (distRes.ok)   scoreDist  = await distRes.json();
  } catch { /* fall-through */ }

  // 단건 split 미배포 환경 폴백: 통합 exams.json
  if (!exam) {
    try {
      const res = await fetch('data/exams.json', { cache: 'no-cache' });
      if (res.ok) {
        const exams = await res.json();
        exam = exams.find(e => e.id === id) ?? null;
      }
    } catch { /* fall-through */ }
  }

  if (!exam) { showError(); return; }

  // 사전 추출된 정답이 있으면 합쳐 사용 (exam.answers 우선, 없으면 answersMap 폴백)
  if ((!Array.isArray(exam.answers) || exam.answers.length === 0) && answersMap[id]) {
    exam.answers = answersMap[id];
  }

  renderHead(exam);
  renderQuickAnswers(exam);
  renderGradeDist(exam, gradecuts, scoreDist);
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
