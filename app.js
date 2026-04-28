'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf, getGroupConf } from './config.js';
import {
  state, PAGE_SIZE,
  resetFilters, currConf,
  getDisplayYear, availableGradeYears,
  filtered, subjectCounts, buildMockData,
} from './state.js';

// 정적 JSON 데이터 파일 — 백엔드 없이 data/exams.json 만 갱신하면 사이트가 갱신됨
const DATA_URL = 'data/exams.json';

const $ = id => document.getElementById(id);

// ── URL 파라미터 처리 ──────────────────────────────────────
function applyUrlTab() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab && CURRICULUM_CONFIG[tab]) {
    state.curriculum = tab;
    document.querySelectorAll('.nav-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.curriculum === tab);
    });
    const conf = currConf();
    if (conf.singleType) {
      const tg = conf.availableTypeGroups[0];
      state.typeGroup = tg;
      state.type      = getGroupConf(tg)?.types[0]?.key ?? 'all';
    }
  }
}

function syncUrlTab() {
  const url = new URL(location.href);
  url.searchParams.set('tab', state.curriculum);
  history.replaceState({}, '', url);
}

// ── 데이터 로드 ────────────────────────────────────────────
async function loadExams() {
  showSkeleton(true);
  let real = [];
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (res.ok) real = await res.json();
  } catch { /* 파일 없음 → 목업 사용 */ }

  state.exams = (Array.isArray(real) && real.length > 0) ? real : buildMockData();

  applyUrlTab();   // URL ?tab=... 가 있으면 해당 탭으로 진입

  state.loading = false;
  showSkeleton(false);
  renderFilterPanel();
  render();
}

// ── 렌더링 조율 ────────────────────────────────────────────
function render(skipSubjectFilter = false) {
  renderCards();
  renderActiveTags();
  updateFilterBadge();
  if (!skipSubjectFilter) renderSubjectFilter();
}

// ── 교육과정 탭 ─────────────────────────────────────────────
$('curriculumTabs').addEventListener('click', e => {
  const btn = e.target.closest('.nav-tab');
  if (!btn) return;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  state.curriculum = btn.dataset.curriculum;
  resetFilters();

  const conf = currConf();
  if (conf.singleType) {
    const tg = conf.availableTypeGroups[0];
    state.typeGroup = tg;
    state.type      = getGroupConf(tg)?.types[0]?.key ?? 'all';
  }

  syncUrlTab();
  const doRender = () => { renderFilterPanel(); render(); };
  document.startViewTransition ? document.startViewTransition(doRender) : doRender();
});

// ── 필터 패널 전체 재구성 ──────────────────────────────────
function renderFilterPanel() {
  const conf = currConf();
  $('typeGroupBlock').style.display = conf.singleType ? 'none' : '';

  renderTypeGroupChips();
  renderSubtypeChips();
  renderYearChips();
  renderSubjectFilter();
}

// ── 시험 주최 (그룹 pill) ──────────────────────────────────
function renderTypeGroupChips() {
  const conf      = currConf();
  const container = $('typeGroupFilter');
  if (conf.singleType) { container.innerHTML = ''; return; }

  const groups = EXAM_TYPE_CONFIG.filter(g => conf.availableTypeGroups.includes(g.groupKey));
  const html = [
    pill('all', '전체', state.typeGroup === 'all', 'is-group'),
    ...groups.map(g =>
      pill(g.groupKey, g.groupLabel, state.typeGroup === g.groupKey, 'is-group',
           `style="--pill-color:${g.groupColor};"`)
    ),
  ].join('');
  container.innerHTML = html;
}

$('typeGroupFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.typeGroup  = btn.dataset.value;
  state.type       = 'all';
  state.gradeYear  = 'all';
  state.subSubject = 'all';
  state.page       = 1;
  renderTypeGroupChips();
  renderSubtypeChips();
  renderYearChips();
  render();
});

// ── 세부 유형 ──────────────────────────────────────────────
function renderSubtypeChips() {
  const row       = $('subtypeRow');
  const container = $('typeFilter');
  if (state.typeGroup === 'all' || currConf().singleType) {
    row.classList.remove('is-open');
    container.innerHTML = '';
    return;
  }
  const g = getGroupConf(state.typeGroup);
  container.innerHTML = [
    pill('all', '전체', state.type === 'all'),
    ...(g?.types ?? []).map(t => pill(t.key, t.label, state.type === t.key)),
  ].join('');
  row.classList.add('is-open');
}

$('typeFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.type = btn.dataset.value;
  state.page = 1;
  renderSubtypeChips();
  render();
});

// ── 학년도 ─────────────────────────────────────────────────
function renderYearChips() {
  const container = $('yearFilter');
  const label     = $('yearLabel');
  const note      = $('yearNote');
  const isEdu     = state.typeGroup === 'education';

  label.textContent = isEdu ? '시행연도' : '학년도';
  note.textContent  = isEdu ? '교육청 기준' : '';

  const years  = availableGradeYears();
  const suffix = isEdu ? '년' : '학년도';

  const all  = pill('all', '전체', state.gradeYear === 'all', '', 'data-year="all"');
  const rest = years.map(y => {
    if (y === 'preliminary') {
      return pill('preliminary', '예비', state.gradeYear === 'preliminary', '', 'data-year="preliminary"');
    }
    const disp = isEdu ? y - 1 : y;
    return pill(String(y), `${disp}${suffix}`, state.gradeYear === String(y), '', `data-year="${y}"`);
  });
  container.innerHTML = [all, ...rest].join('');
}

$('yearFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.gradeYear = btn.dataset.year;
  state.page      = 1;
  renderYearChips();
  render();
});

// ── 영역 (subject list) ────────────────────────────────────
function renderSubjectFilter() {
  const container = $('subjectFilter');
  const subjects  = currConf().subjects;
  const counts    = subjectCounts();

  const inner = Object.entries(subjects).map(([key, conf]) => {
    const hasSubs  = conf.subs.length > 0;
    const isActive = state.subject === key;
    const isOpen   = isActive && hasSubs;
    const cnt      = counts[key] ?? 0;

    const subList = conf.subs.map(s => `
      <button class="sub-row${state.subSubject === s ? ' is-active' : ''}" data-sub="${escAttr(s)}">${escHtml(s)}</button>
    `).join('');

    return `
      <button class="subject-row${hasSubs ? ' has-subs' : ''}${isActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}"
              data-subject="${escAttr(key)}" style="--subject-color:${conf.color};">
        <span class="subject-row__dot"></span>
        <span class="subject-row__name">${escHtml(key)}</span>
        ${cnt > 0 ? `<span class="subject-row__count">${cnt}</span>` : ''}
        <span class="subject-row__caret">›</span>
      </button>
      ${hasSubs ? `<div class="subject-subs ${isOpen ? 'is-open' : ''}"><div class="subject-subs__inner">${subList}</div></div>` : ''}
    `;
  }).join('');

  container.innerHTML = `<div class="subject-list">${inner}</div>`;
}

$('subjectFilter').addEventListener('click', e => {
  const subRow = e.target.closest('.sub-row');
  const subjBtn = e.target.closest('.subject-row');

  if (subRow) {
    const sub = subRow.dataset.sub;
    state.subSubject = state.subSubject === sub ? 'all' : sub;
    state.page = 1;
    renderSubjectFilter();
    render(true);
    return;
  }
  if (subjBtn) {
    const key     = subjBtn.dataset.subject;
    const hasSubs = (currConf().subjects[key]?.subs.length ?? 0) > 0;
    if (state.subject === key) {
      state.subject = state.subSubject = 'all';
    } else {
      state.subject    = key;
      state.subSubject = 'all';
    }
    if (!hasSubs) state.subSubject = 'all';
    state.page = 1;
    renderSubjectFilter();
    render(true);
  }
});

// ── 검색 ──────────────────────────────────────────────────
let searchTimer;
$('searchInput').addEventListener('input', e => {
  const val = e.target.value;
  $('clearSearch').style.display = val ? 'flex' : 'none';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = val.trim(); state.page = 1; render(); }, 180);
});
$('clearSearch').addEventListener('click', () => {
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';
  state.query = '';
  state.page  = 1;
  render();
});

$('resetBtn').addEventListener('click', resetAll);
$('emptyResetBtn').addEventListener('click', resetAll);
$('loadMoreBtn').addEventListener('click', () => { state.page++; renderCards(); });

// 모바일 필터 토글
$('filterToggle')?.addEventListener('click', () => {
  const panel  = $('filterPanel');
  const isOpen = panel.classList.toggle('is-open');
  const btn    = $('filterToggle');
  btn.setAttribute('aria-label',    isOpen ? '필터 닫기' : '필터 열기');
  btn.setAttribute('aria-expanded', String(isOpen));
});

function updateFilterBadge() {
  const btn = $('filterToggle');
  if (!btn) return;
  const count = document.querySelectorAll('#activeTags .tag').length;
  let badge   = btn.querySelector('.filter-badge');
  if (count > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'filter-badge'; btn.appendChild(badge); }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

// ── 카드 렌더 ──────────────────────────────────────────────
function renderCards() {
  const data     = filtered();
  const grid     = $('cardsGrid');
  const empty    = $('emptyState');
  const moreWrap = $('loadMoreWrap');
  const countEl  = $('resultCount');

  countEl.textContent = `${data.length.toLocaleString()}건`;

  if (data.length === 0) {
    grid.style.display     = 'none';
    moreWrap.style.display = 'none';
    empty.style.display    = 'flex';
    return;
  }
  empty.style.display = 'none';
  grid.style.display  = 'grid';

  const shown = data.slice(0, state.page * PAGE_SIZE);
  grid.innerHTML = shown.map((e, i) => cardHTML(e, i)).join('');

  const remaining = data.length - shown.length;
  if (remaining > 0) {
    const pct = (shown.length / data.length * 100).toFixed(0);
    $('loadProgress').style.setProperty('--progress', `${pct}%`);
    $('loadMoreBtn').textContent = `${remaining}건 더 보기`;
    $('loadMoreInfo').textContent = `${shown.length} / ${data.length}`;
    moreWrap.style.display = 'flex';
  } else {
    moreWrap.style.display = 'none';
  }
}

function cardHTML(exam, idx = 0) {
  const conf    = currConf().subjects[exam.subject] ?? { color: '#9ca3af' };
  const tc      = getTypeConf(exam.type);
  const dy      = getDisplayYear(exam);
  const hasFile = Boolean(exam.questionUrl || exam.answerUrl);
  const isPrelim = exam.gradeYear === 'preliminary';

  const title = exam.subSubject ?? exam.subject;
  const typeLabel = isPrelim ? '예비시험' : (tc?.label ?? '');
  const yearPart = isPrelim
    ? '예비시험'
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${typeLabel}`
        : `${dy.label}학년도 ${typeLabel}`);
  const subtitle = exam.subSubject ? `${exam.subject} · ${yearPart}` : yearPart;

  const yearChip = `<span class="chiplet chiplet--ink">${dy.label}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${typeLabel}</span>`
    : '';

  const qBtn = exam.questionUrl
    ? `<a class="btn btn--primary" href="${exam.questionUrl}" target="_blank" rel="noopener" download>문제지</a>`
    : `<button class="btn btn--primary" disabled>문제지</button>`;
  const aBtn = exam.answerUrl
    ? `<a class="btn" href="${exam.answerUrl}" target="_blank" rel="noopener" download>정답</a>`
    : `<button class="btn" disabled>정답</button>`;
  const sBtn = exam.solutionUrl
    ? `<a class="btn" href="${exam.solutionUrl}" target="_blank" rel="noopener" download>해설</a>`
    : '';

  const delay = `${Math.min(idx * 28, 220)}ms`;
  return `
    <article class="card${hasFile ? ' has-files' : ''}" style="--subject-color:${conf.color};animation-delay:${delay};">
      <div class="card__meta">${yearChip}${typeChip}</div>
      <h4 class="card__title" title="${escAttr(title)}">${escHtml(title)}</h4>
      <p class="card__sub">${escHtml(subtitle)}</p>
      <div class="card__divider"></div>
      <div class="card__actions">${qBtn}${aBtn}${sBtn}</div>
    </article>
  `;
}

// ── 활성 태그 ──────────────────────────────────────────────
function renderActiveTags() {
  const container = $('activeTags');
  const tags = [];
  const isEdu = state.typeGroup === 'education';
  const isSingle = currConf().singleType;

  // singleType 탭에서는 타입그룹/타입이 자동 선택이므로 태그 노출 생략
  if (state.typeGroup !== 'all' && !isSingle) {
    const g = getGroupConf(state.typeGroup);
    tags.push({ label: g?.groupLabel ?? state.typeGroup, key: 'typeGroup' });
  }
  if (state.type !== 'all' && !isSingle) {
    const tc = getTypeConf(state.type);
    tags.push({ label: tc?.label ?? state.type, key: 'type' });
  }
  if (state.gradeYear !== 'all') {
    if (state.gradeYear === 'preliminary') {
      tags.push({ label: '예비', key: 'gradeYear' });
    } else {
      const disp   = isEdu ? Number(state.gradeYear) - 1 : state.gradeYear;
      const suffix = isEdu ? '년' : '학년도';
      tags.push({ label: `${disp}${suffix}`, key: 'gradeYear' });
    }
  }
  if (state.subject    !== 'all') tags.push({ label: state.subject,    key: 'subject' });
  if (state.subSubject !== 'all') tags.push({ label: state.subSubject, key: 'subSubject' });
  if (state.query) tags.push({ label: `"${state.query}"`, key: 'query' });

  container.innerHTML = tags.map(t => `
    <span class="tag">${escHtml(t.label)}<button data-clear="${t.key}" aria-label="제거">×</button></span>
  `).join('');
}

$('activeTags').addEventListener('click', e => {
  const btn = e.target.closest('button[data-clear]');
  if (!btn) return;
  const key = btn.dataset.clear;

  if (key === 'query') {
    state.query = '';
    $('searchInput').value = '';
    $('clearSearch').style.display = 'none';
  } else if (key === 'typeGroup') {
    state.typeGroup = state.type = 'all';
    renderTypeGroupChips();
    renderSubtypeChips();
    renderYearChips();
  } else if (key === 'type') {
    state.type = 'all';
    renderSubtypeChips();
  } else if (key === 'gradeYear') {
    state.gradeYear = 'all';
    renderYearChips();
  } else if (key === 'subject') {
    state.subject = state.subSubject = 'all';
    renderSubjectFilter();
  } else if (key === 'subSubject') {
    state.subSubject = 'all';
    renderSubjectFilter();
  }

  state.page = 1;
  render();
});

// ── 초기화 ─────────────────────────────────────────────────
function resetAll() {
  const conf = currConf();
  resetFilters();
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';

  if (conf.singleType) {
    const tg = conf.availableTypeGroups[0];
    state.typeGroup = tg;
    state.type      = getGroupConf(tg)?.types[0]?.key ?? 'all';
  }
  renderFilterPanel();
  render();
}

// ── 스켈레톤 ───────────────────────────────────────────────
function showSkeleton(show) {
  $('skeleton').style.display      = show ? 'grid' : 'none';
  $('cardsGrid').style.display     = show ? 'none' : 'grid';
  $('emptyState').style.display    = 'none';
  $('loadMoreWrap').style.display  = 'none';
}

// ── helpers ───────────────────────────────────────────────
function pill(value, label, active, extra = '', attrs = '') {
  return `<button class="pill${extra ? ' ' + extra : ''}${active ? ' is-active' : ''}"
            data-value="${escAttr(value)}" ${attrs}>${escHtml(label)}</button>`;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return escHtml(str); }

// ── 시작 ──────────────────────────────────────────────────
loadExams();

// Lenis smooth scroll — non-blocking, graceful degradation
import('https://cdn.jsdelivr.net/npm/lenis@1.1.13/+esm')
  .then(({ default: Lenis }) => {
    const lenis = new Lenis({ lerp: 0.085 });
    const tick  = t => { lenis.raf(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })
  .catch(() => {});
