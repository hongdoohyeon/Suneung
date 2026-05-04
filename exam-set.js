'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub, legacyTabKey } from './config.js';

const $ = id => document.getElementById(id);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
));
const escAttr = escHtml;

function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const u = new URL(raw);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? raw : '';
    } catch { return ''; }
  }
  if (raw.startsWith('//')) return '';
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  return /^[\w./%+\-~()[\]]+(?:\?[^\s<>"']*)?(?:#[^\s<>"']*)?$/u.test(raw) ? raw : '';
}

// ── 표시 라벨 ─────────────────────────────────────────────
function displayYear(item) {
  if (item.gradeYear === 'preliminary') return { label: '예비시험', suffix: '' };
  const tc = getTypeConf(item.type);
  if (tc?.displayMode === 'examYear') {
    return { label: `${item.examYear}년 ${item.month}월`, suffix: '' };
  }
  return { label: String(item.gradeYear), suffix: '학년도' };
}

function buildTitle(curriculum, gradeYear, sample) {
  const tc = getTypeConf(sample.type);
  if (gradeYear === 'preliminary') {
    return `예비시험 ${tc?.label ?? ''}`.trim();
  }
  if (tc?.displayMode === 'examYear') {
    return `${sample.examYear}년 ${sample.month}월 ${tc?.label ?? ''}`.trim();
  }
  // 28학년도 예비 (curriculum='예비') 등은 conf.label 자체가 "28학년도 예비"
  if (curriculum === '예비') {
    const conf = CURRICULUM_CONFIG['예비'];
    return `${conf?.label ?? `${gradeYear}학년도`} ${tc?.label ?? ''}`.trim();
  }
  return `${gradeYear}학년도 ${tc?.label ?? ''}`.trim();
}

function buildSubtitle(curriculum, type) {
  const conf = CURRICULUM_CONFIG[curriculum];
  const tc = getTypeConf(type);
  // 28학년도 예비는 title에 이미 "28학년도 예비" 가 들어가므로 sub에서는 rangeLabel(2022 개정 · 평가원 예시문항) 노출
  if (curriculum === '예비') {
    return [conf?.rangeLabel, tc?.groupLabel].filter(Boolean).join(' · ');
  }
  return [conf?.label, tc?.groupLabel].filter(Boolean).join(' · ');
}

// ── 카드 (영역 단위) ──────────────────────────────────────
function cardHTML(exam) {
  const conf = CURRICULUM_CONFIG[exam.curriculum];
  const subjConf = conf?.subjects?.[exam.subject] ?? { color: '#9ca3af', bg: 'var(--surface-2)' };
  const hasFile = Boolean(exam.questionUrl || exam.answerUrl);

  const title    = exam.subSubject ? prettySub(exam.subSubject) : exam.subject;
  const subtitle = exam.subSubject ? exam.subject : '';

  const subjChip = `<span class="chiplet chiplet--type" style="--chip-bg:${subjConf.bg};--chip-color:${subjConf.color};">${escHtml(exam.subject)}</span>`;

  const dl = name => name ? `download="${escAttr(name)}"` : 'download';
  const qUrl = safeUrl(exam.questionUrl);
  const aUrl = safeUrl(exam.answerUrl);
  const sUrl = safeUrl(exam.solutionUrl);
  const qBtn = qUrl
    ? `<a class="btn btn--primary" href="${escAttr(qUrl)}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지</a>`
    : `<button class="btn btn--primary" disabled>문제지</button>`;
  const aBtn = aUrl
    ? `<a class="btn" href="${escAttr(aUrl)}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답</a>`
    : `<button class="btn" disabled>정답</button>`;
  const sBtn = sUrl
    ? `<a class="btn" href="${escAttr(sUrl)}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설</a>`
    : '';

  const ariaLabel = `${exam.subject}${exam.subSubject ? ' ' + prettySub(exam.subSubject) : ''} 상세 보기`;
  return `
    <article class="card${hasFile ? ' has-files' : ''}" style="--subject-color:${subjConf.color};">
      <a class="card__link" href="exam.html?id=${exam.id}" aria-label="${escAttr(ariaLabel)}"></a>
      <div class="card__meta">${subjChip}</div>
      <h4 class="card__title" title="${escAttr(title)}">${escHtml(title)}</h4>
      <p class="card__sub">${escHtml(subtitle)}</p>
      <div class="card__divider"></div>
      <div class="card__actions">${qBtn}${aBtn}${sBtn}</div>
    </article>
  `;
}

// ── 헤더 렌더 ─────────────────────────────────────────────
function renderHead(curriculum, gradeYear, type, items) {
  const conf = CURRICULUM_CONFIG[curriculum];
  const tc = getTypeConf(type);
  const sample = items[0];
  const dy = displayYear(sample);

  const yearChip = `<span class="chiplet chiplet--ink">${escHtml(dy.label)}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${escHtml(tc.label)}</span>`
    : '';
  const currChip = conf
    ? `<span class="chiplet chiplet--soft">${escHtml(conf.label)}</span>`
    : '';
  $('examsetChips').innerHTML = yearChip + typeChip + currChip;

  const title = buildTitle(curriculum, gradeYear, sample);
  const sub   = buildSubtitle(curriculum, type);
  $('examsetTitle').textContent = title;
  $('examsetSub').textContent   = sub;
  document.title = `${title} — 기출해체분석기`;

  $('examsetCount').textContent = `총 ${items.length}개 영역`;

  // archive 복귀 링크: curriculum이 속한 탭으로 (legacyTabKey 재사용)
  const tabKey = legacyTabKey(curriculum) || 'senior';
  $('backLink').href = `archive.html?tab=${encodeURIComponent(tabKey)}`;
}

function showError() {
  $('examsetHead').hidden = true;
  $('examsetGrid').hidden = true;
  $('examsetError').hidden = false;
  document.title = '시험을 찾을 수 없습니다 — 기출해체분석기';
}

// ── 본 진입점 ─────────────────────────────────────────────
async function main() {
  const params = new URLSearchParams(location.search);
  const curriculum = params.get('curriculum');
  const yearRaw    = params.get('year');
  const type       = params.get('type');

  if (!curriculum || !yearRaw || !type) { showError(); return; }
  if (!CURRICULUM_CONFIG[curriculum] || !getTypeConf(type)) { showError(); return; }

  let gradeYear;
  if (yearRaw === 'preliminary') {
    gradeYear = 'preliminary';
  } else {
    const n = Number(yearRaw);
    if (!Number.isFinite(n) || n <= 0) { showError(); return; }
    gradeYear = n;
  }

  let exams = [];
  try {
    const res = await fetch('data/exams.json', { cache: 'no-cache' });
    if (res.ok) exams = await res.json();
  } catch { /* fall-through */ }

  const items = exams.filter(e =>
    e.curriculum === curriculum &&
    String(e.gradeYear) === String(gradeYear) &&
    e.type === type
  );
  if (items.length === 0) { showError(); return; }

  // 정렬: subject (curriculum.subjects 정의 순) → subSubject (subjConf.subs 정의 순)
  const conf = CURRICULUM_CONFIG[curriculum];
  const subjectKeys = Object.keys(conf?.subjects ?? {});
  const idxOrLast = (arr, v) => {
    const i = arr.indexOf(v);
    return i === -1 ? 999 : i;
  };
  items.sort((a, b) => {
    const sa = idxOrLast(subjectKeys, a.subject);
    const sb = idxOrLast(subjectKeys, b.subject);
    if (sa !== sb) return sa - sb;
    const subs = conf?.subjects?.[a.subject]?.subs ?? [];
    return idxOrLast(subs, a.subSubject) - idxOrLast(subs, b.subSubject);
  });

  renderHead(curriculum, gradeYear, type, items);
  $('examsetGrid').innerHTML = items.map(e => cardHTML(e)).join('');
}

main();
