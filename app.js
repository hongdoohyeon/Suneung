'use strict';
import {
  CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, TAB_CONFIG,
  getTypeConf, getGroupConf, getTabConf, legacyTabKey, prettySub,
} from './config.js';
import {
  state, PAGE_SIZE,
  resetFilters, toggleMulti,
  getDisplayYear, availableGradeYears,
  filtered, subjectCounts, buildMockData,
  tabCurriculums, tabCurriculumConfs, tabSubjects, curriculumOfGradeYear,
} from './state.js';
import { renderAllAdSlots } from './lib/ads.js';

const tabConf = () => getTabConf(state.tab);

// 탭이 포함하는 모든 typeGroup 합집합 (UI 칩 렌더용)
// educationOnly 탭(고1/고2)은 평가원 칩 제외 — 교육청 학평만 노출.
const tabAvailableTypeGroups = () => {
  const conf = tabConf();
  const set = new Set();
  for (const c of tabCurriculumConfs()) {
    for (const tg of c.availableTypeGroups) set.add(tg);
  }
  if (conf?.educationOnly) {
    return [...set].filter(tg => tg === 'education');
  }
  return [...set];
};
// 탭이 단일 typeGroup + 모든 curriculum 이 singleType 일 때 → typeGroup 칩 숨김
// educationOnly 탭도 단일 typeGroup이므로 칩 숨김.
const tabIsSingleType = () => {
  const tgs = tabAvailableTypeGroups();
  if (tgs.length !== 1) return false;
  if (tabConf()?.educationOnly) return true;
  return tabCurriculumConfs().every(c => c.singleType);
};

// 정적 JSON 데이터 파일 — 백엔드 없이 data/exams.json 만 갱신하면 사이트가 갱신됨
const DATA_URL = 'data/exams.json';

const $ = id => document.getElementById(id);

// ── URL 파라미터 처리 ──────────────────────────────────────
function applyUrlTab() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('tab');
  if (!raw) return;
  // 옛 URL (?tab=2015 / ?tab=사관 등) 들어오면 새 탭 키로 매핑
  const tab = legacyTabKey(raw);
  if (!getTabConf(tab)) return;

  state.tab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tab === tab);
  });
  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    // senior 등: 첫 진입 시 디폴트 typeGroup 적용 (예: 고3 → 평가원 우선)
    state.typeGroup = tabConf().defaultTypeGroup;
  }
}

function syncUrlTab() {
  const url = new URL(location.href);
  url.searchParams.set('tab', state.tab);
  history.replaceState({}, '', url);
}

// ── 데이터 로드 ────────────────────────────────────────────
async function loadExams() {
  showSkeleton(true);
  let real = [];
  try {
    const res = await fetch(DATA_URL);
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
function scrollActiveTabIntoView() {
  const active = document.querySelector('.curriculum-nav .nav-tab.is-active');
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

$('curriculumTabs').addEventListener('click', e => {
  const btn = e.target.closest('.nav-tab');
  if (!btn) return;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  state.tab = btn.dataset.tab;
  resetFilters();

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    state.typeGroup = tabConf().defaultTypeGroup;
  }

  syncUrlTab();
  const doRender = () => { renderFilterPanel(); render(); };
  document.startViewTransition ? document.startViewTransition(doRender) : doRender();

  scrollActiveTabIntoView();
});

// 페이지 로드 시 활성 탭이 모바일 가로 스크롤에서 가운데로 오도록 (잘림 인지 완화)
addEventListener('DOMContentLoaded', () => {
  // smooth scroll보다 즉시 — 첫 진입 시 위치만 잡음
  const active = document.querySelector('.curriculum-nav .nav-tab.is-active');
  active?.scrollIntoView({ block: 'nearest', inline: 'center' });
});

// ── 필터 패널 전체 재구성 ──────────────────────────────────
function renderFilterPanel() {
  $('typeGroupBlock').style.display = tabIsSingleType() ? 'none' : '';

  renderTypeGroupChips();
  renderSubtypeChips();
  renderYearChips();
  renderSubjectFilter();
}

// ── 시험 주최 (그룹 pill) ──────────────────────────────────
function renderTypeGroupChips() {
  const container = $('typeGroupFilter');
  if (tabIsSingleType()) { container.innerHTML = ''; return; }

  const allowed = tabAvailableTypeGroups();
  const groups = EXAM_TYPE_CONFIG.filter(g => allowed.includes(g.groupKey));
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
  const g         = getGroupConf(state.typeGroup);
  // type 이 1개뿐인 그룹 (사관/경찰 1차시험, LEET/MEET 본시험) 은 칩 자체를 숨김 — 의미 없는 '전체/본시험' 두 칸 회피
  const skip = state.typeGroup === 'all' || tabIsSingleType() || (g?.types?.length ?? 0) <= 1;
  if (skip) {
    row.classList.remove('is-open');
    container.innerHTML = '';
    return;
  }
  const isTypeActive = (val) => {
    if (val === 'all') {
      return state.type === 'all' || (Array.isArray(state.type) && state.type.length === 0);
    }
    if (state.type === 'all') return false;
    if (Array.isArray(state.type)) return state.type.includes(val);
    return state.type === val;
  };
  container.innerHTML = [
    pill('all', '전체', isTypeActive('all')),
    ...g.types.map(t => pill(t.key, t.shortLabel ?? t.label, isTypeActive(t.key))),
  ].join('');
  row.classList.add('is-open');
}

$('typeFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  const val = btn.dataset.value;
  if (val === 'all') {
    state.type = 'all';
  } else {
    toggleMulti('type', val);
  }
  state.page = 1;
  renderSubtypeChips();
  render();
});

// ── 학년도 ─────────────────────────────────────────────────
// 학년도 라벨: 일반은 "2027학년도" / 교육청은 "2026년" / 28예비처럼 예비 curriculum 은 "28예비".
// LEET 의 'preliminary' sentinel (mock 데이터) 은 "예비".
function yearChipLabel(y, isEdu) {
  if (y === 'preliminary') return '예비';
  const conf = curriculumOfGradeYear(y);
  if (conf?.id === '예비' && typeof y === 'number') {
    return `${String(y).slice(-2)}예비`;
  }
  const disp = isEdu ? y - 1 : y;
  return `${disp}${isEdu ? '년' : '학년도'}`;
}

// 탭의 curriculum 들이 학년도 범위에서 겹치는지 — 겹치면 header 그룹화가 잘못됨
// (예: 사관·경찰대는 둘 다 2007~2026 → 모두 첫 conf로 매핑되어 "사관"만 표시).
function curriculumsOverlap() {
  const confs = tabCurriculumConfs();
  for (let i = 0; i < confs.length; i++) {
    for (let j = i + 1; j < confs.length; j++) {
      const [aMin, aMax] = confs[i].gradeYearRange;
      const [bMin, bMax] = confs[j].gradeYearRange;
      if (aMin <= bMax && bMin <= aMax) return true;
    }
  }
  return false;
}

function renderYearChips() {
  const container = $('yearFilter');
  const label     = $('yearLabel');
  const note      = $('yearNote');
  const isEdu     = state.typeGroup === 'education';

  label.textContent = isEdu ? '시행연도' : '학년도';
  note.textContent  = isEdu ? '교육청 기준' : '';

  const years = availableGradeYears();

  // 탭이 여러 curriculum 합치는 경우 학년도 영역에 "── 2015 개정 ──" 식 헤더 삽입.
  // 단, curriculum 들이 학년도 범위에서 겹치면 헤더가 잘못 그룹화하므로 숨김
  // (사관·경찰대 mp 탭, LEET·MEET gradschool 탭).
  const showHeaders = tabCurriculums().length > 1 && !curriculumsOverlap();

  const isYearActive = (val) => {
    if (val === 'all') {
      return state.gradeYear === 'all' || (Array.isArray(state.gradeYear) && state.gradeYear.length === 0);
    }
    if (state.gradeYear === 'all') return false;
    if (Array.isArray(state.gradeYear)) return state.gradeYear.includes(val);
    return state.gradeYear === val;
  };

  const out = [pill('all', '전체', isYearActive('all'), '', 'data-year="all"')];
  let lastCurrId = null;
  for (const y of years) {
    if (showHeaders) {
      const conf = curriculumOfGradeYear(y);
      const currId = conf?.id ?? null;
      if (currId && currId !== lastCurrId) {
        out.push(`<div class="year-row__header" role="presentation">${escHtml(conf.label)}</div>`);
        lastCurrId = currId;
      }
    }
    const value = y === 'preliminary' ? 'preliminary' : String(y);
    out.push(pill(value, yearChipLabel(y, isEdu), isYearActive(value), '', `data-year="${value}"`));
  }
  container.innerHTML = out.join('');
}

$('yearFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  const val = btn.dataset.year;
  if (val === 'all') {
    state.gradeYear = 'all';
  } else {
    toggleMulti('gradeYear', val);
  }
  state.page = 1;
  renderYearChips();
  render();
});

// ── 영역 (subject list) ────────────────────────────────────
function renderSubjectFilter() {
  const container = $('subjectFilter');
  const subjects  = tabSubjects();   // 탭의 모든 curriculum 영역 union
  const counts    = subjectCounts();

  const inner = Object.entries(subjects).map(([key, conf]) => {
    const hasSubs  = conf.subs.length > 0;
    const isActive = state.subject === key;
    const isOpen   = isActive && hasSubs;
    const cnt      = counts[key] ?? 0;

    const subList = conf.subs.map(s => `
      <button class="sub-row${state.subSubject === s ? ' is-active' : ''}" data-sub="${escAttr(s)}">${escHtml(prettySub(s))}</button>
    `).join('');

    return `<div class="subject-item"><button class="subject-row${hasSubs ? ' has-subs' : ''}${isActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}" data-subject="${escAttr(key)}" style="--subject-color:${conf.color};"><span class="subject-row__dot"></span><span class="subject-row__name">${escHtml(key)}</span><span class="subject-row__count">${cnt > 0 ? cnt : ''}</span><span class="subject-row__caret">›</span></button>${(hasSubs && isOpen) ? `<div class="subject-subs is-open"><div class="subject-subs__inner">${subList}</div></div>` : ''}</div>`;
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
    const hasSubs = (tabSubjects()[key]?.subs.length ?? 0) > 0;
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
$('paginationWrap').addEventListener('click', e => {
  const btn = e.target.closest('.pg-btn[data-pg]');
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.pg);
  renderCards();
  $('cardsGrid').scrollIntoView({ behavior: 'instant', block: 'start' });
});

// ── 모바일 필터 바텀시트 ────────────────────────────────────
// 데스크톱에서는 sticky 사이드바 유지, 모바일(≤960px)에서만 시트로 동작
function setSheetOpen(open) {
  const panel    = $('filterPanel');
  const backdrop = $('filterBackdrop');
  panel.classList.toggle('is-open', open);
  if (backdrop) {
    backdrop.classList.toggle('is-open', open);
    if (open) backdrop.removeAttribute('hidden');
    else      backdrop.setAttribute('hidden', '');
  }
  document.body.classList.toggle('is-sheet-open', open);

  [$('filterToggle'), $('filterToggleInline')].forEach(btn => {
    if (!btn) return;
    btn.setAttribute('aria-label',    open ? '필터 닫기' : '필터 열기');
    btn.setAttribute('aria-expanded', String(open));
  });
}
function isSheetOpen() {
  return $('filterPanel').classList.contains('is-open');
}
function toggleFilter() { setSheetOpen(!isSheetOpen()); }

$('filterToggle')?.addEventListener('click', toggleFilter);
$('filterToggleInline')?.addEventListener('click', toggleFilter);
$('filterSheetClose')?.addEventListener('click', () => setSheetOpen(false));
$('filterBackdrop')?.addEventListener('click',  () => setSheetOpen(false));
$('filterSheetApply')?.addEventListener('click', () => setSheetOpen(false));
$('filterSheetReset')?.addEventListener('click', () => {
  $('resetBtn')?.click();
});

// ESC 로 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isSheetOpen()) setSheetOpen(false);
});

// 데스크톱으로 리사이즈 시 시트/스크롤락 자동 해제
const mqlSheet = window.matchMedia('(min-width: 961px)');
const onMqlSheet = e => { if (e.matches) setSheetOpen(false); };
mqlSheet.addEventListener
  ? mqlSheet.addEventListener('change', onMqlSheet)
  : mqlSheet.addListener(onMqlSheet);

function updateFilterBadge() {
  const count = document.querySelectorAll('#activeTags .tag').length;
  [$('filterToggle'), $('filterToggleInline')].forEach(btn => {
    if (!btn) return;
    let badge = btn.querySelector('.filter-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'filter-badge'; btn.appendChild(badge); }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

// ── 카드 렌더 ──────────────────────────────────────────────
function renderCards() {
  const data     = filtered();
  const grid     = $('cardsGrid');
  const empty    = $('emptyState');
  const moreWrap = $('paginationWrap');
  const countEl  = $('resultCount');
  const isPlaceholder = Boolean(tabConf()?.placeholder);

  countEl.textContent = isPlaceholder ? '' : `${data.length.toLocaleString()}건`;
  updateExamSetLink(data);

  if (isPlaceholder || data.length === 0) {
    grid.style.display     = 'none';
    moreWrap.style.display = 'none';
    empty.style.display    = 'flex';
    const setLink = $('examSetLink');
    if (setLink) setLink.hidden = true;
    updateEmptyState(isPlaceholder);
    return;
  }
  empty.style.display = 'none';
  grid.style.display  = '';

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const shown = data.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  grid.innerHTML = shown.map((e, i) => cardHTML(e, i)).join('');
  renderPagination(state.page, totalPages, data.length);
}

function renderPagination(current, total, totalItems) {
  const wrap = $('paginationWrap');
  if (total <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';

  const WIN      = 5;
  const winIdx   = Math.floor((current - 1) / WIN);
  const winStart = winIdx * WIN + 1;
  const winEnd   = Math.min(winStart + WIN - 1, total);

  const nums = [];
  for (let p = winStart; p <= winEnd; p++) {
    nums.push(`<button class="pg-btn${p === current ? ' is-active' : ''}" data-pg="${p}">${p}</button>`);
  }

  wrap.innerHTML = `
    <div class="pagination">
      <button class="pg-btn pg-arrow" data-pg="${winStart - 1}" ${winStart <= 1 ? 'disabled' : ''}>‹</button>
      ${nums.join('')}
      <button class="pg-btn pg-arrow" data-pg="${winEnd + 1}" ${winEnd >= total ? 'disabled' : ''}>›</button>
    </div>
    <span class="pg-info">${totalItems.toLocaleString()}건 · ${current} / ${total}페이지</span>
  `;
}

function cardHTML(exam, idx = 0) {
  const conf    = tabSubjects()[exam.subject] ?? { color: '#9ca3af' };
  const tc      = getTypeConf(exam.type);
  const dy      = getDisplayYear(exam);
  const hasFile = Boolean(exam.questionUrl || exam.answerUrl);
  const isPrelim = exam.gradeYear === 'preliminary';

  const title = exam.subSubject ? prettySub(exam.subSubject) : exam.subject;
  // examYear 모드(학평): dy.label에 "N월"이 들어가므로 typeLabel 에서 month prefix 제거
  // → "2026년 3월 학력평가" (중복 X)
  const rawTypeLabel = tc?.label ?? '';
  const typeLabel = isPrelim
    ? '예비시험'
    : (tc?.displayMode === 'examYear' ? rawTypeLabel.replace(/^\d+월\s*/, '') : rawTypeLabel);
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

  const dl = name => name ? `download="${escAttr(name)}"` : 'download';
  const qBtn = exam.questionUrl
    ? `<a class="btn btn--primary" href="${exam.questionUrl}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지</a>`
    : `<button class="btn btn--primary" disabled>문제지</button>`;
  const aBtn = exam.answerUrl
    ? `<a class="btn" href="${exam.answerUrl}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답</a>`
    : `<button class="btn" disabled>정답</button>`;
  const sBtn = exam.solutionUrl
    ? `<a class="btn" href="${exam.solutionUrl}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설</a>`
    : '';

  const delay = `${Math.min(idx * 28, 220)}ms`;
  const ariaLabel = `${yearPart} ${title} 상세 보기`;
  return `
    <article class="card${hasFile ? ' has-files' : ''}" style="--subject-color:${conf.color};animation-delay:${delay};">
      <a class="card__link" href="exam-${exam.id}.html" aria-label="${escAttr(ariaLabel)}"></a>
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
  const isSingle = tabIsSingleType();

  // singleType 탭에서는 타입그룹/타입이 자동 선택이므로 태그 노출 생략
  if (state.typeGroup !== 'all' && !isSingle) {
    const g = getGroupConf(state.typeGroup);
    tags.push({ label: g?.groupLabel ?? state.typeGroup, key: 'typeGroup' });
  }
  if (state.type !== 'all' && !isSingle) {
    const types = Array.isArray(state.type) ? state.type : [state.type];
    const labels = types.map(t => getTypeConf(t)?.label ?? t);
    tags.push({ label: labels.join('·'), key: 'type' });
  }
  if (state.gradeYear !== 'all') {
    const years = Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear];
    const labels = years.map(y => {
      const v = y === 'preliminary' ? 'preliminary' : Number(y);
      return yearChipLabel(v, isEdu);
    });
    tags.push({ label: labels.join('·'), key: 'gradeYear' });
  }
  if (state.subject    !== 'all') tags.push({ label: state.subject,    key: 'subject' });
  if (state.subSubject !== 'all') tags.push({ label: prettySub(state.subSubject), key: 'subSubject' });
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
  resetFilters();
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  }
  renderFilterPanel();
  render();
}

// ── 스켈레톤 ───────────────────────────────────────────────
function showSkeleton(show) {
  $('skeleton').style.display      = show ? '' : 'none';
  $('cardsGrid').style.display     = show ? 'none' : '';
  $('emptyState').style.display    = 'none';
  $('paginationWrap').style.display  = 'none';
}

// ── 회차 단위 진입 링크 ────────────────────────────────────
// 사용자가 학년도(gradeYear) + 시험종류(type) 둘 다 명시적으로 선택했을 때만 노출.
function updateExamSetLink(data) {
  const link = $('examSetLink');
  if (!link) return;
  // 학년도와 시험종류가 모두 단일 값으로 선택된 경우에만 (다중 선택 시 회차 모호)
  const ySingle = state.gradeYear !== 'all' && (!Array.isArray(state.gradeYear) || state.gradeYear.length === 1);
  const tSingle = state.type !== 'all' && (!Array.isArray(state.type) || state.type.length === 1);
  if (!ySingle || !tSingle) { link.hidden = true; return; }
  if (!data?.length) { link.hidden = true; return; }
  const first = data[0];
  const params = new URLSearchParams({
    curriculum: first.curriculum,
    year: String(first.gradeYear),
    type: first.type,
  });
  // 학평은 학년(studentGrade)도 분리 — 결과가 단일 학년이면 grade 추가
  const sg = first.studentGrade ?? null;
  const sameGrade = data.every(e => (e.studentGrade ?? null) === sg);
  if (sg != null && sameGrade) params.set('grade', String(sg));
  link.href = `exam-set.html?${params.toString()}`;
  link.hidden = false;
}

// ── 빈 상태 라벨 — placeholder 탭 (검정고시/논술/입시자료) 와
//                  실제 "결과 없음" 을 분리. 고1/고2는 이제 활성화됨 ──
function updateEmptyState(isPlaceholder) {
  const empty = $('emptyState');
  const title = empty.querySelector('.empty__title');
  const sub   = empty.querySelector('.empty__sub');
  const btn   = $('emptyResetBtn');
  if (isPlaceholder) {
    const t = tabConf();
    if (title) title.textContent = `${t?.label ?? ''} 자료는 준비 중이에요`;
    if (sub)   sub.textContent   = '데이터가 채워지는 대로 이 페이지에서 바로 보실 수 있어요.';
    if (btn)   { btn.style.display = 'none'; btn.setAttribute('aria-hidden', 'true'); }
    empty.classList.add('is-placeholder');
  } else {
    if (title) title.textContent = '검색 결과가 없습니다';
    if (sub)   sub.textContent   = '필터 조건을 줄이거나 검색어를 변경해 보세요.';
    if (btn)   { btn.style.display = ''; btn.removeAttribute('aria-hidden'); }
    empty.classList.remove('is-placeholder');
  }
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

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
