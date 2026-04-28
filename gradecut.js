'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf, getGroupConf } from './config.js';

const DATA_URL = 'data/gradecuts.json';
const $ = id => document.getElementById(id);

const state = {
  cuts: [],
  curriculum: '2015',   // 기본 탭. URL ?tab= 로 덮어쓸 수 있음
  gradeYear:  null,
  type:       null,
  subject:    null,
  subSubject: null,
  score:      null,
};

// 9등급별 색상 (1=짙은 초록 → 9=짙은 적색)
const GRADE_COLORS = [
  '#0c5e3f', '#15803d', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#b91c1c', '#7f1d1d', '#3f0e0e',
];

// 9등급 누적 백분율 경계 (1등급 4%, 2등급 누적 11%, ...)
const PCT_BOUNDARIES = [0, 4, 11, 23, 40, 60, 77, 89, 96, 100];

// ── 시작 ──────────────────────────────────────────────────
async function init() {
  // URL ?tab= 처리
  const urlTab = new URLSearchParams(location.search).get('tab');
  if (urlTab && CURRICULUM_CONFIG[urlTab]) state.curriculum = urlTab;
  setActiveTab(state.curriculum);

  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    state.cuts = res.ok ? await res.json() : [];
  } catch { state.cuts = []; }

  // 단일 옵션이면 자동 선택 (UI 흐름 부드럽게)
  autoFillSingles();
  renderAll();
  bindScoreInput();
  bindCurriculumTabs();
}

function currConf() { return CURRICULUM_CONFIG[state.curriculum]; }

function setActiveTab(curr) {
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.curriculum === curr);
  });
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('tab', state.curriculum);
  history.replaceState({}, '', url);
}

// ── 교육과정 탭 ────────────────────────────────────────────
function bindCurriculumTabs() {
  $('curriculumTabs').addEventListener('click', e => {
    const btn = e.target.closest('.nav-tab');
    if (!btn) return;
    state.curriculum = btn.dataset.curriculum;
    state.gradeYear = state.type = state.subject = state.subSubject = null;
    setActiveTab(state.curriculum);
    syncUrl();
    autoFillSingles();
    renderAll();
  });
}

// ── 자동 선택 (단일 옵션이면 클릭 없이 진행) ──────────────
function autoFillSingles() {
  const conf = currConf();

  const years = availableYears();
  if (state.gradeYear == null && years.length === 1) state.gradeYear = years[0];

  if (state.gradeYear != null && state.type == null) {
    const types = availableTypes();
    if (types.length === 1) state.type = types[0].key;
  }

  if (state.subject == null) {
    const subjects = Object.keys(conf.subjects);
    if (subjects.length === 1) state.subject = subjects[0];
  }

  if (state.subject && state.subSubject == null) {
    const subs = conf.subjects[state.subject]?.subs ?? [];
    if (subs.length === 1) state.subSubject = subs[0];
  }
}

// ── 옵션 목록 헬퍼 ────────────────────────────────────────
function availableYears() {
  const conf = currConf();
  const [min, max] = conf.gradeYearRange;
  const years = [];
  for (let y = max; y >= min; y--) years.push(y);
  return years;
}

function availableTypes() {
  const conf = currConf();
  const types = [];
  for (const groupKey of conf.availableTypeGroups) {
    const group = EXAM_TYPE_CONFIG.find(g => g.groupKey === groupKey);
    if (!group) continue;
    for (const t of group.types) {
      types.push({ key: t.key, label: t.label, group: group.groupLabel, month: t.month });
    }
  }
  // 시간 역순: 11(수능) → 10 → 9 → 7 → ...
  types.sort((a, b) => b.month - a.month);
  return types;
}

// ── 칩 렌더 ───────────────────────────────────────────────
function pill(value, label, active = false, sub = '') {
  const subSpan = sub ? `<span class="pill__sub">${sub}</span>` : '';
  return `<button class="pill${active ? ' is-active' : ''}" data-value="${value}">${label}${subSpan}</button>`;
}

function renderAll() {
  renderYearPills();
  renderTypePills();
  renderSubjectPills();
  renderSubSubjectPills();
  render();
}

function renderYearPills() {
  const years = availableYears();
  $('gcYearPills').innerHTML = years.map(y =>
    pill(String(y), `${y}학년도`, state.gradeYear === y)
  ).join('');
}

$('gcYearPills').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.gradeYear = Number(btn.dataset.value);
  state.type = null;
  autoFillSingles();
  renderAll();
});

function renderTypePills() {
  const types = availableTypes();
  $('gcTypePills').innerHTML = types.map(t =>
    pill(t.key, t.label, state.type === t.key)
  ).join('');
}

$('gcTypePills').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.type = btn.dataset.value;
  autoFillSingles();
  renderAll();
});

function renderSubjectPills() {
  const conf = currConf();
  const subjects = Object.keys(conf.subjects);
  $('gcSubjectPills').innerHTML = subjects.map(s =>
    pill(s, s, state.subject === s)
  ).join('');
}

$('gcSubjectPills').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.subject = btn.dataset.value;
  state.subSubject = null;
  autoFillSingles();
  renderAll();
});

function renderSubSubjectPills() {
  const conf = currConf();
  const field = $('gcSubSubjectField');
  if (!state.subject) { field.style.display = 'none'; return; }
  const subs = conf.subjects[state.subject]?.subs ?? [];
  if (subs.length === 0) { field.style.display = 'none'; return; }
  field.style.display = '';
  $('gcSubSubjectPills').innerHTML = subs.map(s =>
    pill(s, s, state.subSubject === s)
  ).join('');
}

$('gcSubSubjectPills').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.subSubject = btn.dataset.value;
  render();
});

// ── 점수 입력 ─────────────────────────────────────────────
function bindScoreInput() {
  $('gcScore').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v === '') { state.score = null; render(); return; }
    let n = Number(v);
    if (!Number.isFinite(n)) { state.score = null; render(); return; }
    n = Math.min(100, Math.max(0, n));
    if (String(n) !== v && (n === 0 || n === 100)) e.target.value = n;
    state.score = n;
    render();
  });
}

// ── 매칭 ──────────────────────────────────────────────────
function findCut() {
  if (state.gradeYear == null || !state.type || !state.subject) return null;
  return state.cuts.find(c =>
    c.curriculum === state.curriculum &&
    c.gradeYear  === state.gradeYear &&
    c.type       === state.type &&
    c.subject    === state.subject &&
    ((c.subSubject ?? null) === (state.subSubject ?? null))
  ) ?? null;
}

// ── 등급/백분율 계산 ──────────────────────────────────────
function computeGrade(score, cuts) {
  for (let i = 0; i < cuts.length; i++) {
    if (score >= cuts[i]) return i + 1;
  }
  return 9;
}

function computePercentile(score, grade, cuts) {
  // 자기 등급 안에서 위치 → PCT_BOUNDARIES 안에서 보간
  const lower = grade === 9 ? 0   : cuts[grade - 1];      // 자기 등급 컷
  const upper = grade === 1 ? 100 : cuts[grade - 2];      // 한 등급 위 컷 (또는 100)
  const lo    = PCT_BOUNDARIES[grade - 1];                 // 더 좋은 백분율
  const hi    = PCT_BOUNDARIES[grade];                     // 더 나쁜 백분율
  const range = upper - lower;
  if (range <= 0) return hi;
  const ratio = (score - lower) / range;                   // 0(컷 동점) ~ 1(다음 등급 직전)
  return hi - ratio * (hi - lo);                           // 점수 높을수록 더 좋은 백분율
}

// ── 렌더 ─────────────────────────────────────────────────
function render() {
  const cut       = findCut();
  const ready     = state.gradeYear != null && state.type && state.subject;
  const subOk     = !state.subject ||
                    (currConf().subjects[state.subject]?.subs.length ?? 0) === 0 ||
                    state.subSubject != null;
  const allReady  = ready && subOk;

  if (!allReady) {
    $('gcEmpty').style.display  = 'flex';
    $('gcNoData').style.display = 'none';
    $('gcOutput').style.display = 'none';
    return;
  }
  if (!cut) {
    $('gcEmpty').style.display  = 'none';
    $('gcNoData').style.display = 'flex';
    $('gcOutput').style.display = 'none';
    return;
  }
  if (state.score == null) {
    $('gcEmpty').style.display  = 'flex';
    $('gcNoData').style.display = 'none';
    $('gcOutput').style.display = 'none';
    return;
  }

  // 결과 출력
  $('gcEmpty').style.display  = 'none';
  $('gcNoData').style.display = 'none';
  $('gcOutput').style.display = 'block';

  const score = state.score;
  const grade = computeGrade(score, cut.rawCuts);
  const pct   = computePercentile(score, grade, cut.rawCuts);

  $('gcGradeNum').textContent = grade;
  $('gcGradeNum').style.color = GRADE_COLORS[grade - 1];
  $('gcPctNum').textContent   = pct.toFixed(1);
  $('gcPctNum').style.color   = GRADE_COLORS[grade - 1];

  const tc = getTypeConf(cut.type);
  $('gcOutMeta').textContent =
    `${cut.gradeYear}학년도 · ${tc?.groupLabel ?? ''} ${tc?.label ?? ''}` +
    ` · ${cut.subject}${cut.subSubject ? ' / ' + cut.subSubject : ''}`;

  $('gcGradeStat').textContent = makeStatText(score, grade, cut.rawCuts);

  renderGraph(cut.rawCuts, score, grade);
  renderPctGraph(pct, grade);
  renderCutsTable(cut.rawCuts, grade);
}

function makeStatText(score, grade, cuts) {
  if (grade === 1) {
    return `1등급컷 ${cuts[0]}점에서 +${score - cuts[0]}점`;
  }
  if (grade === 9) {
    return `8등급컷 ${cuts[7]}점까지 ${cuts[7] - score}점 부족`;
  }
  const myCut    = cuts[grade - 1];
  const upperCut = cuts[grade - 2];
  return `${grade}등급컷 ${myCut}점에서 +${score - myCut}점 · ${grade - 1}등급까지 ${upperCut - score}점 부족`;
}

// ── 그래프 ───────────────────────────────────────────────
function renderGraph(cuts, score, grade) {
  // 9등급 → 1등급 (왼쪽 점수 낮음 → 오른쪽 점수 높음)
  const ranges = [];
  for (let g = 9; g >= 1; g--) {
    const lo = g === 9 ? 0   : cuts[g - 1];
    const hi = g === 1 ? 100 : cuts[g - 2];
    ranges.push({ grade: g, lo, hi });
  }

  $('gcGraphTrack').innerHTML = ranges.map(r => {
    const width = ((r.hi - r.lo) / 100) * 100;
    const isMy  = r.grade === grade;
    return `<div class="gc-seg${isMy ? ' is-my' : ''}" style="width:${width}%;background:${GRADE_COLORS[r.grade - 1]};">
              <span class="gc-seg__num">${r.grade}</span>
            </div>`;
  }).join('');

  $('gcGraphCuts').innerHTML = cuts.map((c, i) =>
    `<div class="gc-cutline" style="left:${c}%;">
       <span class="gc-cutline__num">${c}</span>
     </div>`
  ).join('');

  $('gcMarker').style.left = `${score}%`;
  $('gcMarkerLabel').textContent = `${score}점`;
}

function renderPctGraph(pct, grade) {
  // 9개 백분율 구간 색상 segment
  const segs = [];
  for (let g = 1; g <= 9; g++) {
    const lo = PCT_BOUNDARIES[g - 1];
    const hi = PCT_BOUNDARIES[g];
    const width = hi - lo;
    segs.push(`<div class="gc-pct-seg" style="width:${width}%;background:${GRADE_COLORS[g - 1]};opacity:${g === grade ? 1 : 0.45};"></div>`);
  }
  $('gcPctSegments').innerHTML = segs.join('');

  $('gcPctMarker').style.left = `${pct}%`;
  $('gcPctMarkerLabel').textContent = `상위 ${pct.toFixed(1)}%`;
}

function renderCutsTable(cuts, myGrade) {
  $('gcCutsTable').innerHTML = cuts.map((c, i) => {
    const g = i + 1;
    const isMy = g === myGrade;
    return `<div class="gc-cuts-table__row${isMy ? ' is-my' : ''}">
              <span class="gc-cuts-table__grade" style="color:${GRADE_COLORS[i]};">${g}등급</span>
              <span class="gc-cuts-table__score">${c}점</span>
            </div>`;
  }).join('');
}

init();
