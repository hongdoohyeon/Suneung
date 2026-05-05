'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub } from './config.js';
import { escHtml as _escHtml, escAttr, safeUrl as _safeUrl, $ as _$ } from './lib/dom.js';
import { setMeta, setMetaProp, setCanonical, injectJsonLd as _injectJsonLd, applySeo } from './lib/seo.js';
import { renderAllAdSlots } from './lib/ads.js';
import { renderPdf, renderUnsupported, renderEmpty, urlExtension } from './lib/exam-pdf.js';
import { renderGradeDist } from './lib/exam-gradedist.js';

// 공통 헬퍼는 lib/dom.js, lib/seo.js 에서 import. 로컬 별칭만 유지 (호환성).
const $ = _$;
const escHtml = _escHtml;
const safeUrl = _safeUrl;
const injectJsonLd = (payload) => _injectJsonLd('jsonld-exam', payload);

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
  // canonical: 동적 ?id 페이지든 SSG /exam-N.html이든 항상 SSG URL을 표준으로 지정
  const canonicalUrl = `https://kicegg.com/exam-${exam.id}.html`;
  setMeta('description', desc);
  setCanonical(canonicalUrl);
  setMetaProp('og:title', `${title} — 기출해체분석기`);
  setMetaProp('og:description', desc);
  setMetaProp('og:url', canonicalUrl);
  // JSON-LD LearningResource — search engine 구조화 데이터
  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: title,
    description: desc,
    url: canonicalUrl,
    inLanguage: 'ko',
    learningResourceType: '기출문제',
    educationalLevel: '고등학교',
    isPartOf: { '@type': 'WebSite', name: '기출해체분석기',
                url: 'https://kicegg.com/' },
    ...(exam.questionUrl ? { hasPart: [
      { '@type': 'DigitalDocument', name: '문제지', url: exam.questionUrl, encodingFormat: 'application/pdf' },
      ...(exam.answerUrl ? [{ '@type': 'DigitalDocument', name: '정답', url: exam.answerUrl, encodingFormat: 'application/pdf' }] : []),
      ...(exam.listenUrl ? [{ '@type': 'AudioObject', name: '영어 듣기 mp3', contentUrl: exam.listenUrl, encodingFormat: 'audio/mpeg' }] : []),
      ...(exam.scriptUrl ? [{ '@type': 'DigitalDocument', name: '듣기 스크립트', url: exam.scriptUrl, encodingFormat: 'application/pdf' }] : []),
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
  const listenUrl = safeUrl(exam.listenUrl);
  const scriptUrl = safeUrl(exam.scriptUrl);
  if (questionUrl) buttons.push(
    `<a class="btn btn--primary" href="${escHtml(questionUrl)}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지 다운로드</a>`
  );
  if (answerUrl) buttons.push(
    `<a class="btn" href="${escHtml(answerUrl)}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답 다운로드</a>`
  );
  if (solutionUrl) buttons.push(
    `<a class="btn" href="${escHtml(solutionUrl)}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설 다운로드</a>`
  );
  if (scriptUrl) buttons.push(
    `<a class="btn" href="${escHtml(scriptUrl)}" target="_blank" rel="noopener" ${dl(exam.scriptDownload)}>듣기 스크립트</a>`
  );
  $('examActions').innerHTML = buttons.join('');

  // 영어 듣기 mp3: 사이드바 actions 아래에 inline audio player 삽입.
  // 영어 시험인데 듣기가 없는 평가원/학평 회차는 "자료 없음" 표시.
  // 사관·경찰은 원본 시험에 듣기 자체가 없으므로 안내 생략.
  const actionsEl = $('examActions');
  const hasListening = exam.subject === '영어' &&
                       exam.typeGroup !== 'military' && exam.typeGroup !== 'police';
  if (actionsEl && hasListening) {
    const audioBlock = document.createElement('div');
    audioBlock.className = 'exam__listen';
    if (listenUrl) {
      audioBlock.innerHTML = `
        <div class="exam__listen-head">
          <span class="exam__listen-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z"/>
              <path d="M3 19a2 2 0 0 0 2 2h1v-7H3z"/>
            </svg>
          </span>
          <span>영어 듣기 음원</span>
        </div>
        <audio controls preload="metadata" src="${escHtml(listenUrl)}" class="exam__listen-audio"></audio>
        <a class="exam__listen-dl" href="${escHtml(listenUrl)}" target="_blank" rel="noopener" ${dl(exam.listenDownload)}>mp3 다운로드</a>
      `;
    } else {
      audioBlock.classList.add('exam__listen--empty');
      audioBlock.innerHTML = `
        <div class="exam__listen-head">
          <span>영어 듣기 음원</span>
        </div>
        <p class="exam__listen-empty">
          이 회차는 듣기 음원 자료가 공개되지 않았어요.
        </p>
      `;
    }
    actionsEl.appendChild(audioBlock);
  }

  // archive 탭 복귀 링크에 curriculum 유지
  $('backLink').href = `archive.html?tab=${encodeURIComponent(exam.curriculum)}`;
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

  // 초기 탭:
  //   - URL ?tab=info → 정보
  //   - URL ?tab=paper → 문제
  //   - 명시 없으면 데스크톱은 'paper' (PDF 우선), 모바일은 'info' (빠답·등급 우선)
  const params = new URLSearchParams(location.search);
  const explicit = params.get('tab');
  let initial;
  if (explicit === 'info' || explicit === 'paper') {
    initial = explicit;
  } else {
    initial = window.innerWidth <= 600 ? 'info' : 'paper';
  }
  activate(initial);
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
// URL → 시험 ID 추출.
// 정적 SSG 페이지(/exam-123.html)는 pathname에서, 레거시 동적(?id=N)은 query에서.
function readExamId() {
  const m = location.pathname.match(/exam-(\d+)\.html$/);
  if (m) return Number(m[1]);
  return Number(new URLSearchParams(location.search).get('id'));
}

// ── 본 진입점 ──────────────────────────────────────────────
async function main() {
  const id = readExamId();

  if (!Number.isFinite(id) || id <= 0) {
    showError();
    return;
  }

  // 단건 lazy fetch 우선: data/exam/{id}.json (~1KB) 만 받음.
  // 미존재 시 통합 data/exams.json (~2MB) 로 폴백.
  let exam = null, gradecuts = [], answersMap = {}, scoreDist = [];
  try {
    const [singleRes, cutRes, ansRes, distRes] = await Promise.all([
      fetch(`data/exam/${id}.json`),
      fetch('data/gradecuts.json'),
      fetch('data/answers.json'),
      fetch('data/score-distribution.json'),
    ]);
    if (singleRes.ok) exam = await singleRes.json();
    if (cutRes.ok)    gradecuts  = await cutRes.json();
    if (ansRes.ok)    answersMap = await ansRes.json();
    if (distRes.ok)   scoreDist  = await distRes.json();
  } catch { /* fall-through */ }

  // 단건 split 미배포 환경 폴백: 통합 exams.json
  if (!exam) {
    try {
      const res = await fetch('data/exams.json');
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

  // PDF 미리보기는 'paper' 탭이 처음 활성화될 때만 렌더 (lazy).
  // 모바일 기본 탭이 'info'라 안 누르면 600KB pdfjs 로드 안 됨.
  const qViewer = $('previewQViewer'), qMeta = $('previewQMeta');
  let pdfStarted = false;
  function ensurePdfStarted() {
    if (pdfStarted) return;
    pdfStarted = true;
    if (!exam.questionUrl) {
      renderEmpty(qViewer); qMeta.textContent = '없음';
      return;
    }
    const ext = urlExtension(exam.questionUrl);
    if (ext === 'pdf') renderPdf(exam.questionUrl, qViewer, qMeta);
    else renderUnsupported(qViewer, ext ?? '파일', exam.questionUrl, exam.questionDownload);
  }
  setupTabs(key => {
    if (key === 'paper') ensurePdfStarted();
  });
}

function showError() {
  $('examSide').hidden = true;
  $('examMain').hidden = true;
  $('examError').hidden = false;
  document.title = '자료를 찾을 수 없습니다 — 기출해체분석기';
}

main();

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
