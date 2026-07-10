'use strict';
import {
  CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, TAB_CONFIG,
  getTypeConf, getGroupConf, getTabConf, legacyTabKey, prettySub,
} from './config.js?v=20260710a';
import {
  state, PAGE_SIZE,
  resetFilters, toggleMulti,
  getDisplayYear, availableGradeYears,
  filtered, subjectCounts, buildMockData,
  tabCurriculums, tabCurriculumConfs, tabSubjects, curriculumOfGradeYear,
} from './state.js?v=20260710a';
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
// 빌드 시 ID 재할당되므로 캐시 버스터 강제 (옛 캐시 ↔ 새 SSG 불일치 방지)
const DATA_URL = 'data/exams.json?v=20260710a';

const $ = id => document.getElementById(id);

// ── URL 파라미터 처리 ──────────────────────────────────────
// 모든 필터 상태를 URL searchParams 에 반영해 뒤로가기·새로고침·링크 공유 시 복원.
// 다중 선택은 쉼표로 직렬화. "all"·빈 상태는 URL에서 키 자체를 제거해 짧게 유지.

const URL_KEYS = ['tab','typeGroup','type','gradeYear','subject','subSubject','q','page'];

function serializeMulti(v) {
  if (v === 'all' || v == null) return '';
  if (Array.isArray(v)) return v.length ? v.join(',') : '';
  return String(v);
}
function parseMulti(s) {
  if (!s) return 'all';
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return 'all';
  return parts.length === 1 ? parts[0] : parts;
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);

  const rawTab = params.get('tab');
  if (rawTab) {
    const tab = legacyTabKey(rawTab);
    if (getTabConf(tab)) {
      state.tab = tab;
      document.querySelectorAll('.nav-tab').forEach(b => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('is-active', on);
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
  }

  // 탭 변경 후 default typeGroup 적용 — URL에 typeGroup 명시되어 있으면 곧 덮어씀
  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    state.typeGroup = tabConf().defaultTypeGroup;
  }

  // URL 파라미터를 알려진 값에 대해 화이트리스트 검증 — 임의 변조 시 stuck-state 방지
  if (params.has('typeGroup')) {
    const v = params.get('typeGroup') || 'all';
    state.typeGroup = (v === 'all' || tabAvailableTypeGroups().includes(v)) ? v : 'all';
  }
  if (params.has('type'))       state.type       = parseMulti(params.get('type'));
  if (params.has('gradeYear'))  state.gradeYear  = parseMulti(params.get('gradeYear'));
  // 예비 curriculum 학년도 URL은 type 파라미터가 없어도 실제 예비시험으로 복원한다.
  if (!params.has('type') && state.gradeYear !== 'all') {
    const years = Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear];
    if (years.some(y => curriculumOfGradeYear(Number(y))?.id === '예비')) state.type = ['prelim'];
  }
  if (params.has('subject'))    state.subject    = params.get('subject') || 'all';
  if (params.has('subSubject')) state.subSubject = params.get('subSubject') || 'all';

  const search = params.get('q') || params.get('search');
  if (search) {
    state.query = search.trim();
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = search;
      const clear = document.getElementById('clearSearch');
      if (clear) clear.style.display = 'flex';
    }
  } else {
    state.query = '';
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    const clear = document.getElementById('clearSearch');
    if (clear) clear.style.display = 'none';
  }

  const pageRaw = parseInt(params.get('page') || '1', 10);
  state.page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
}

// 옛 단일 함수 이름 유지 (호출부 호환)
const applyUrlTab = applyUrlState;

// 현재 state 로부터 다음 URL 을 계산만 (history 조작 X).
function buildUrlFromState() {
  const url = new URL(location.href);
  for (const k of URL_KEYS) url.searchParams.delete(k);

  url.searchParams.set('tab', state.tab);

  const tg = serializeMulti(state.typeGroup);
  if (tg && tg !== 'all') url.searchParams.set('typeGroup', tg);

  const t = serializeMulti(state.type);
  if (t) url.searchParams.set('type', t);

  const gy = serializeMulti(state.gradeYear);
  if (gy) url.searchParams.set('gradeYear', gy);

  if (state.subject    && state.subject    !== 'all') url.searchParams.set('subject', state.subject);
  if (state.subSubject && state.subSubject !== 'all') url.searchParams.set('subSubject', state.subSubject);
  if (state.query) url.searchParams.set('q', state.query);
  if (state.page > 1) url.searchParams.set('page', String(state.page));

  return url.toString();
}

// archive 의 현재 필터 상태를 sessionStorage 에 저장 — exam 상세 → 뒤로가기 시 복원에 사용
function persistArchiveState() {
  try {
    const u = new URL(buildUrlFromState());
    // 경로 + query 만 저장 (archive.html?... 그대로)
    sessionStorage.setItem('lastArchiveUrl', u.pathname.split('/').pop() + u.search);
  } catch {}
}

// 필터 변경 — 현재 history entry 의 URL 만 교체 (history 깊이 보존)
function syncUrl() {
  history.replaceState({}, '', buildUrlFromState());
  persistArchiveState();
}

// 탭 전환 등 큰 전환 — 새 history entry 추가하여 진정한 뒤로가기 가능
// 단, URL 이 그대로면 pushState 가 무의미한 중복 entry 를 만드니 skip.
function pushUrl() {
  const next = buildUrlFromState();
  if (next === location.href) return;
  history.pushState({}, '', next);
  persistArchiveState();
}

// 호환용 — 옛 syncUrlTab 호출부에서도 동작
const syncUrlTab = syncUrl;

// ── 데이터 로드 ────────────────────────────────────────────
function showDataError(msg) {
  // 상단 고정 배너로 데이터 로드 실패 안내. 사용자가 silent broken state 모르고 헤매는 것 방지.
  if (document.getElementById('dataErrorBanner')) return;
  const div = document.createElement('div');
  div.id = 'dataErrorBanner';
  // z-index 100 — site-header(80) 위. 모바일 padding은 작게.
  div.style.cssText = 'position:sticky;top:0;z-index:100;background:#fef3c7;color:#92400e;padding:10px 12px;text-align:center;font-size:13px;line-height:1.5;border-bottom:1px solid #fde68a';
  div.innerHTML = `<strong>⚠️ 데이터 로드 실패</strong> · ${msg} · <button type="button" class="data-reload" style="color:#92400e;text-decoration:underline;background:none;border:0;font:inherit;cursor:pointer;padding:0">새로고침</button>`;
  document.body.prepend(div);
  div.querySelector('.data-reload')?.addEventListener('click', () => location.reload());
}

async function loadExams() {
  showSkeleton(true);
  let real = [];
  let fetchFailed = false;
  try {
    const res = await fetch(DATA_URL);   // URL 의 ?v= 토큰으로 캐시 무효화 (no-store 불필요)
    if (res.ok) real = await res.json();
    else fetchFailed = true;
  } catch { fetchFailed = true; }

  if (fetchFailed) {
    showDataError('시험 목록을 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
  }
  // mock 은 로컬 개발 전용 — 운영에서 fetch 실패 시 mock 카드를 보여주면
  // id 가 실제 exam-{id}.html 과 어긋나 엉뚱한 시험으로 이동하게 됨.
  const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
  state.exams = (Array.isArray(real) && real.length > 0)
    ? real
    : (isLocalDev ? buildMockData() : []);

  // 헤더 메타: 시험 총 건수 + 최근 업데이트 일자 (reference 시험 제외)
  const realExams = state.exams.filter(e => e.typeGroup !== 'reference');
  const totalEl = document.getElementById('archiveTotalCount');
  if (totalEl) totalEl.textContent = realExams.length.toLocaleString('ko-KR');
  const updateEl = document.getElementById('archiveUpdateDate');
  if (updateEl) {
    // 가장 최근 examYear-month 조합 (gradeYear=9999 reference 제외)
    const dated = realExams.filter(e => e.examYear && e.month);
    if (dated.length) {
      const latest = dated.reduce((a, b) => (b.examYear*100 + b.month > a.examYear*100 + a.month) ? b : a);
      updateEl.textContent = `${latest.examYear}-${String(latest.month).padStart(2,'0')}`;
    }
  }

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
  document.querySelectorAll('.nav-tab').forEach(b => { b.classList.remove('is-active'); b.removeAttribute('aria-current'); });
  btn.classList.add('is-active');
  btn.setAttribute('aria-current', 'true');
  state.tab = btn.dataset.tab;
  resetFilters();
  state.yearExpanded = false;

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    state.typeGroup = tabConf().defaultTypeGroup;
  }

  pushUrl();   // 탭 전환은 history 쌓아 진정한 뒤로가기 가능
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
  renderTypeGroupChips();
  renderSubtypeChips();
  // '시험' 섹션은 typeGroup 칩 또는 세부유형(월) 칩이 하나라도 있을 때만 노출.
  // 종전에는 educationOnly 탭(고1/고2)에서 블록째 숨겨 월 필터까지 사라졌음.
  const hasGroupChips = !tabIsSingleType();
  const hasTypeChips  = $('subtypeRow').classList.contains('is-open');
  $('typeGroupBlock').style.display = (hasGroupChips || hasTypeChips) ? '' : 'none';

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
  syncUrl();
});

// ── 세부 유형 ──────────────────────────────────────────────
function renderSubtypeChips() {
  const row       = $('subtypeRow');
  const container = $('typeFilter');
  const g         = getGroupConf(state.typeGroup);
  // type 이 1개뿐인 그룹 (사관/경찰 1차시험, LEET/MEET 본시험) 은 칩 자체를 숨김 — 의미 없는 '전체/본시험' 두 칸 회피
  // educationOnly 탭(고1/고2)은 typeGroup 칩만 숨기고 월 chip 은 그대로 보여야 함 → tabIsSingleType() 조건 제외
  const skip = state.typeGroup === 'all' || (g?.types?.length ?? 0) <= 1;
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
  // 학년 탭별 학평 시행월 필터 — education 그룹은 type.studentGrades 와 탭의 educationGrades 교집합만 표시
  const tabConf = getTabConf(state.tab);
  let visibleTypes = g.types;
  if (state.typeGroup === 'education' && tabConf?.educationGrades) {
    const tabGrades = new Set(tabConf.educationGrades);
    visibleTypes = g.types.filter(t =>
      !t.studentGrades || t.studentGrades.some(sg => tabGrades.has(sg))
    );
  }
  container.innerHTML = [
    pill('all', '전체', isTypeActive('all')),
    ...visibleTypes.map(t => pill(t.key, t.shortLabel ?? t.label, isTypeActive(t.key))),
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
  syncUrl();
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
  const disp = isEdu ? (getTabConf(state.tab)?.key === 'senior' ? y - 1 : y) : y;
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
  // 학년도 너무 많을 때 (현재 1994~2026 = 33년) — 데스크톱·모바일 모두 "최근 N + 더보기"
  // 데스크톱 8개 / 모바일 5개
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
  const SHOW_INITIAL = isMobile ? 5 : 8;
  const COLLAPSE_THRESHOLD = SHOW_INITIAL + 2;
  const collapseEnabled = years.length > COLLAPSE_THRESHOLD;
  const expanded = state.yearExpanded;
  let visibleCount = 0;
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
    const hidden = collapseEnabled && !expanded && visibleCount >= SHOW_INITIAL ? ' year-pill--collapsed' : '';
    out.push(pill(value, yearChipLabel(y, isEdu), isYearActive(value),
                  hidden, `data-year="${value}"`));
    visibleCount++;
  }
  if (collapseEnabled) {
    out.push(`<button type="button" class="pill pill--more" id="yearMoreBtn" data-expanded="${expanded}">${expanded ? '접기' : '더보기'}</button>`);
  }
  container.innerHTML = out.join('');
}

$('yearFilter').addEventListener('click', e => {
  // 더보기 버튼 토글 — 상태에 저장하여 다른 필터 재렌더 시에도 유지
  if (e.target.id === 'yearMoreBtn') {
    state.yearExpanded = !state.yearExpanded;
    renderYearChips();
    return;
  }
  const btn = e.target.closest('.pill:not(.pill--more)');
  if (!btn) return;
  const val = btn.dataset.year;
  if (val === 'all') {
    state.gradeYear = 'all';
  } else {
    toggleMulti('gradeYear', val);
  }
  // 예비 curriculum 학년도(현재 2028) 선택 시 시험 종류도 자동 연동.
  // 과거의 'preliminary' sentinel이 아니라 실제 exams.json 학년도 값을 기준으로 판별한다.
  const selectedPrelimYear = val !== 'all' && curriculumOfGradeYear(Number(val))?.id === '예비';
  const hasSelectedPrelimYear = state.gradeYear !== 'all' &&
    (Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear])
      .some(y => curriculumOfGradeYear(Number(y))?.id === '예비');
  if (selectedPrelimYear && hasSelectedPrelimYear) {
    state.type = ['prelim'];
  } else if (!hasSelectedPrelimYear && Array.isArray(state.type) &&
             state.type.length === 1 && state.type[0] === 'prelim') {
    state.type = 'all';
  }
  state.page = 1;
  renderYearChips();
  render();
  syncUrl();
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
    syncUrl();
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
    syncUrl();
  }
});

// ── 검색 ──────────────────────────────────────────────────
let searchTimer;
$('searchInput').addEventListener('input', e => {
  const val = e.target.value;
  $('clearSearch').style.display = val ? 'flex' : 'none';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = val.trim();
    state.page = 1;
    render();
    syncUrl();
  }, 180);
});
$('clearSearch').addEventListener('click', () => {
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';
  state.query = '';
  state.page  = 1;
  render();
  syncUrl();
});

$('resetBtn').addEventListener('click', resetAll);
$('emptyResetBtn').addEventListener('click', resetAll);
$('paginationWrap').addEventListener('click', e => {
  const btn = e.target.closest('.pg-btn[data-pg]');
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.pg);
  renderCards();
  $('cardsGrid').scrollIntoView({ behavior: 'auto', block: 'start' });
  syncUrl();
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

// 모바일/데스크톱 경계 통과 시 학년도 칩 SHOW_INITIAL 재계산 — 회전·리사이즈 대응
const mqlMobile = window.matchMedia('(max-width: 600px)');
const onMqlMobile = () => { renderYearChips(); };
mqlMobile.addEventListener
  ? mqlMobile.addEventListener('change', onMqlMobile)
  : mqlMobile.addListener(onMqlMobile);

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
  // 모바일 필터 시트 "결과 N건 보기" 버튼 카운트 동기화
  const sheetCountEl = $('filterSheetCount');
  if (sheetCountEl) sheetCountEl.textContent = isPlaceholder ? '0' : data.length.toLocaleString();
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
  grid.innerHTML = shown.map((e, i) => { try { return cardHTML(e, i); } catch(_) { return ''; } }).join('');
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

// 영역명이 아니라 시험 형식·계열·자료유형을 나타내는 subSubject 들 — 카드 title 에 단독 노출하면
// 어느 영역인지 모름. "수학 (인문계)" / "영어 (듣기대본)" 처럼 영역과 합쳐 표시.
const LEGACY_SUB_FORMS = new Set(['인문계', '자연계', '예체능계', '1차', '2차', '듣기대본']);

function cardHTML(exam, idx = 0) {
  const conf    = tabSubjects()[exam.subject] ?? { color: '#9ca3af' };
  const tc      = getTypeConf(exam.type);
  const dy      = getDisplayYear(exam);
  const hasFile = Boolean(exam.questionUrl || exam.answerUrl);
  const isPrelim = exam.gradeYear === 'preliminary';

  const isLegacySub = exam.subSubject && LEGACY_SUB_FORMS.has(exam.subSubject);
  const title = isLegacySub
    ? `${exam.subject} (${prettySub(exam.subSubject)})`
    : (exam.subSubject ? prettySub(exam.subSubject) : exam.subject);
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
  // legacy 계열 표기는 title 에 이미 영역명 합쳐졌으므로 subtitle 중복 회피
  const subtitle = (exam.subSubject && !isLegacySub) ? `${exam.subject} · ${yearPart}` : yearPart;

  const yearChip = `<span class="chiplet chiplet--ink">${dy.label}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="chiplet chiplet--type" style="--chip-bg:${tc.badgeBg};--chip-color:${tc.badgeColor};">${typeLabel}</span>`
    : '';

  const dl = name => name ? `download="${escAttr(name)}"` : 'download';
  const qBtn = exam.questionUrl
    ? `<a class="btn btn--primary" href="${escAttr(exam.questionUrl)}" target="_blank" rel="noopener" ${dl(exam.questionDownload)}>문제지</a>`
    : `<button class="btn btn--primary" disabled>문제지</button>`;
  const aBtn = exam.answerUrl
    ? `<a class="btn" href="${escAttr(exam.answerUrl)}" target="_blank" rel="noopener" ${dl(exam.answerDownload)}>정답</a>`
    : `<button class="btn" disabled>정답</button>`;
  // 해설 PDF가 없으면 해설 button 자체 숨김 (disabled 회색 button 미표시)
  const sBtn = exam.solutionUrl
    ? `<a class="btn" href="${escAttr(exam.solutionUrl)}" target="_blank" rel="noopener" ${dl(exam.solutionDownload)}>해설</a>`
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
    // 예비시험 타입도 함께 해제 (학년도가 예비가 아니게 되므로)
    if (Array.isArray(state.type) && state.type.length === 1 && state.type[0] === 'prelim') state.type = 'all';
    renderYearChips();
    renderSubtypeChips();
  } else if (key === 'subject') {
    state.subject = state.subSubject = 'all';
    renderSubjectFilter();
  } else if (key === 'subSubject') {
    state.subSubject = 'all';
    renderSubjectFilter();
  }

  state.page = 1;
  render();
  syncUrl();
});

// ── 초기화 ─────────────────────────────────────────────────
function resetAll() {
  resetFilters();
  state.yearExpanded = false;
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  }
  renderFilterPanel();
  render();
  syncUrl();
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
// 회차 친화 URL 매핑 (build-data.py 의 set_friendly_filename 와 동일 규약)
const SET_CURR_SLUG = {
  '2015': 'kice', '2009': 'kice', '예비': 'kice',
  // 7차 이전 분리 키는 모두 기존 exam-set-pre2009-*.html 정적 페이지로 매핑 (SEO·링크 호환)
  '2007개정': 'pre2009', '7차': 'pre2009', '6차': 'pre2009', 'pre2009': 'pre2009',
  '사관': 'mil', '경찰대': 'police', 'LEET': 'leet', 'MEET': 'meet',
};
function setFriendlyURL(curr, year, type, grade) {
  const slug = SET_CURR_SLUG[curr] || String(curr).toLowerCase();
  return `exam-set-${slug}-${year}-${type}${grade ? `-g${grade}` : ''}.html`;
}

function updateExamSetLink(data) {
  const link = $('examSetLink');
  if (!link) return;
  // 학년도와 시험종류가 모두 단일 값으로 선택된 경우에만 (다중 선택 시 회차 모호)
  const ySingle = state.gradeYear !== 'all' && (!Array.isArray(state.gradeYear) || state.gradeYear.length === 1);
  const tSingle = state.type !== 'all' && (!Array.isArray(state.type) || state.type.length === 1);
  if (!ySingle || !tSingle) { link.hidden = true; return; }
  if (!data?.length) { link.hidden = true; return; }
  const first = data[0];
  // 학평은 학년(studentGrade)도 분리 — 결과가 단일 학년이면 grade 추가
  const sg = first.studentGrade ?? null;
  const sameGrade = data.every(e => (e.studentGrade ?? null) === sg);
  link.href = setFriendlyURL(first.curriculum, String(first.gradeYear), first.type,
                              (sg != null && sameGrade) ? sg : null);
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(str) { return escHtml(str); }

// ── 뒤로가기/앞으로가기: URL 변경 시 상태 재적용 ────────────
window.addEventListener('popstate', () => {
  // exams 아직 로드 중이면 스킵 — loadExams 가 applyUrlState 다시 호출함
  if (state.loading) return;
  applyUrlState();
  renderFilterPanel();
  render();
});

// ── 시작 ──────────────────────────────────────────────────
loadExams();

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
