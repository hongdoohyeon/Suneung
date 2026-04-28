'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf, getGroupConf } from './config.js';

const DATA_URL = 'data/gradecuts.json';
const $ = id => document.getElementById(id);

const state = {
  cuts: [],
  curriculum: null,   // '2015' | '2009' | '예비' | ...
  gradeYear:  null,   // number | 'preliminary'
  type:       null,   // 'csat' | 'june' | ...
  subject:    null,
  subSubject: null,
  score:      null,
};

// ── Init ──────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    state.cuts = res.ok ? await res.json() : [];
  } catch { state.cuts = []; }

  renderYearPills();
  renderTypePills();
  renderSubjectPills();
  renderSubSubjectPills();
  bindScoreInput();
  render();
}

// ── 칩 렌더 헬퍼 ──────────────────────────────────────────
function pill(value, label, active = false) {
  return `<button class="gc-pill${active ? ' is-active' : ''}" data-value="${value}">${label}</button>`;
}

// 학년도 — 데이터 안 있는 학년도는 비활성
function renderYearPills() {
  const years = [...new Set(state.cuts.map(c => c.gradeYear))]
    .sort((a, b) => {
      if (a === 'preliminary') return -1;
      if (b === 'preliminary') return 1;
      return Number(b) - Number(a);
    });
  const html = years.map(y => {
    const label = y === 'preliminary' ? '예비' : `${y}학년도`;
    return pill(y, label, state.gradeYear === y);
  }).join('');
  $('gcYearPills').innerHTML = html || '<span class="gc-empty-pills">데이터 준비 중</span>';
}

$('gcYearPills').addEventListener('click', e => {
  const btn = e.target.closest('.gc-pill');
  if (!btn) return;
  const v = btn.dataset.value;
  state.gradeYear = (v === 'preliminary') ? 'preliminary' : Number(v);
  state.type = state.subject = state.subSubject = null;
  renderYearPills();
  renderTypePills();
  renderSubjectPills();
  renderSubSubjectPills();
  render();
});

// 시험 종류
function renderTypePills() {
  if (state.gradeYear == null) {
    $('gcTypePills').innerHTML = '<span class="gc-hint">학년도를 먼저 선택하세요</span>';
    return;
  }
  const types = [...new Set(state.cuts
    .filter(c => c.gradeYear === state.gradeYear)
    .map(c => c.type))];

  // 시간순 정렬: csat(11) → oct(10) → sept(9) → jul(7) → june(6) → apr(4) → mar(3) → prelim(5)
  const monthOf = (t) => getTypeConf(t)?.month ?? 0;
  types.sort((a, b) => monthOf(b) - monthOf(a));

  $('gcTypePills').innerHTML = types.map(t => {
    const tc = getTypeConf(t);
    const label = tc ? `${tc.groupLabel} · ${tc.label}` : t;
    return pill(t, label, state.type === t);
  }).join('');
}

$('gcTypePills').addEventListener('click', e => {
  const btn = e.target.closest('.gc-pill');
  if (!btn) return;
  state.type = btn.dataset.value;
  state.subject = state.subSubject = null;
  renderTypePills();
  renderSubjectPills();
  renderSubSubjectPills();
  render();
});

// 영역 — config.js 순서대로 (있는 것만)
function renderSubjectPills() {
  if (!state.gradeYear || !state.type) {
    $('gcSubjectPills').innerHTML = '<span class="gc-hint">시험을 먼저 선택하세요</span>';
    return;
  }
  const subjectsInData = [...new Set(state.cuts
    .filter(c => c.gradeYear === state.gradeYear && c.type === state.type)
    .map(c => c.subject))];

  // 모든 curriculum subjects 순서를 모아 우선순위 부여
  const allOrder = [];
  for (const conf of Object.values(CURRICULUM_CONFIG)) {
    for (const s of Object.keys(conf.subjects)) {
      if (!allOrder.includes(s)) allOrder.push(s);
    }
  }
  const idxOf = s => {
    const i = allOrder.indexOf(s);
    return i === -1 ? 999 : i;
  };
  subjectsInData.sort((a, b) => idxOf(a) - idxOf(b));

  $('gcSubjectPills').innerHTML = subjectsInData.map(s =>
    pill(s, s, state.subject === s)
  ).join('');
}

$('gcSubjectPills').addEventListener('click', e => {
  const btn = e.target.closest('.gc-pill');
  if (!btn) return;
  state.subject = btn.dataset.value;
  state.subSubject = null;
  renderSubjectPills();
  renderSubSubjectPills();
  render();
});

// 선택과목 — 있을 때만 노출
function renderSubSubjectPills() {
  const field = $('gcSubSubjectField');
  if (!state.subject) {
    field.style.display = 'none';
    return;
  }
  const subs = [...new Set(state.cuts
    .filter(c =>
      c.gradeYear === state.gradeYear &&
      c.type      === state.type &&
      c.subject   === state.subject &&
      c.subSubject != null)
    .map(c => c.subSubject))];

  if (subs.length === 0) {
    field.style.display = 'none';
    return;
  }

  // config 정의 순서대로 정렬
  const allSubsOrder = [];
  for (const conf of Object.values(CURRICULUM_CONFIG)) {
    const def = conf.subjects[state.subject];
    if (def?.subs) {
      for (const x of def.subs) {
        if (!allSubsOrder.includes(x)) allSubsOrder.push(x);
      }
    }
  }
  const idxOf = s => {
    const i = allSubsOrder.indexOf(s);
    return i === -1 ? 999 : i;
  };
  subs.sort((a, b) => idxOf(a) - idxOf(b));

  field.style.display = '';
  $('gcSubSubjectPills').innerHTML = subs.map(s =>
    pill(s, s, state.subSubject === s)
  ).join('');
}

$('gcSubSubjectPills').addEventListener('click', e => {
  const btn = e.target.closest('.gc-pill');
  if (!btn) return;
  state.subSubject = btn.dataset.value;
  renderSubSubjectPills();
  render();
});

// 점수 입력
function bindScoreInput() {
  $('gcScore').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v === '') { state.score = null; render(); return; }
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      state.score = n;
    } else if (n > 100) {
      e.target.value = 100;
      state.score = 100;
    } else if (n < 0) {
      e.target.value = 0;
      state.score = 0;
    }
    render();
  });
}

// ── 매칭 데이터 찾기 ──────────────────────────────────────
function findCut() {
  if (!state.gradeYear || !state.type || !state.subject) return null;
  return state.cuts.find(c =>
    c.gradeYear === state.gradeYear &&
    c.type      === state.type &&
    c.subject   === state.subject &&
    ((c.subSubject ?? null) === (state.subSubject ?? null))
  ) ?? null;
}

// ── 등급 계산 ────────────────────────────────────────────
function computeGrade(score, cuts) {
  // cuts: 1~8등급 컷 (descending)
  // score >= cuts[i] 이면 i+1 등급
  for (let i = 0; i < cuts.length; i++) {
    if (score >= cuts[i]) return i + 1;
  }
  return 9;
}

const GRADE_COLORS = [
  '#0c5e3f', // 1등급 deep emerald
  '#15803d', // 2
  '#65a30d', // 3
  '#ca8a04', // 4
  '#ea580c', // 5
  '#dc2626', // 6
  '#b91c1c', // 7
  '#7f1d1d', // 8
  '#3f0e0e', // 9
];

// ── 렌더링 ────────────────────────────────────────────────
function render() {
  const cut    = findCut();
  const score  = state.score;
  const ready  = state.gradeYear && state.type && state.subject;
  const hasSub = !!cut;
  const hasInput = score != null;

  $('gcEmpty').style.display  = (ready && hasSub && hasInput) ? 'none' : (hasSub ? 'flex' : 'flex');
  $('gcNoData').style.display = (ready && !hasSub) ? 'flex' : 'none';
  $('gcOutput').style.display = (ready && hasSub && hasInput) ? 'block' : 'none';

  if (!ready) {
    $('gcEmpty').style.display = 'flex';
    return;
  }

  if (ready && !hasSub) {
    $('gcEmpty').style.display  = 'none';
    $('gcNoData').style.display = 'flex';
    return;
  }

  if (!hasInput) {
    $('gcEmpty').style.display = 'flex';
    return;
  }

  // 결과 출력
  const grade = computeGrade(score, cut.rawCuts);
  $('gcGradeNum').textContent = grade;
  $('gcGradeNum').style.color = GRADE_COLORS[grade - 1];

  const tc = getTypeConf(cut.type);
  const meta = `${cut.gradeYear === 'preliminary' ? '예비' : cut.gradeYear + '학년도'} · ${tc?.groupLabel ?? ''} ${tc?.label ?? ''} · ${cut.subject}${cut.subSubject ? ' / ' + cut.subSubject : ''}`;
  $('gcOutMeta').textContent = meta;

  // 다음/이전 등급컷과의 차이 계산
  let stat;
  if (grade === 1) {
    const margin = score - cut.rawCuts[0];
    stat = `1등급컷 ${cut.rawCuts[0]}점에서 +${margin}점`;
  } else if (grade === 9) {
    const above = cut.rawCuts[7];
    stat = `8등급컷 ${above}점까지 ${above - score}점 부족`;
  } else {
    const below = cut.rawCuts[grade - 1];   // 다음 등급으로 가려면
    const above = cut.rawCuts[grade - 2];   // 현재 등급의 컷
    stat = `${grade}등급컷 ${above}점에서 +${score - above}점 / ${grade - 1}등급까지 ${below + 1 - score}점 부족`;
    // 실제로는 score - cut[grade-2] = 현재 등급 안에서 위로 얼마, cut[grade-1]+1까지 - 사실상 cut[grade-2]가 자기 등급의 컷
    // 다시 정리: grade=2면 score >= cuts[1], score < cuts[0]
    // - cuts[grade-1] = cuts[1] = 2등급 컷 (자기 등급의 컷)
    // - cuts[grade-2] = cuts[0] = 1등급 컷 (한 등급 위)
    const myCut    = cut.rawCuts[grade - 1];  // 내 등급의 컷
    const upperCut = cut.rawCuts[grade - 2];  // 한 등급 위 컷
    stat = `${grade}등급컷 ${myCut}점에서 +${score - myCut}점 · ${grade - 1}등급까지 ${upperCut - score}점 부족`;
  }
  $('gcGradeStat').textContent = stat;

  renderGraph(cut.rawCuts, score, grade);
  renderCutsTable(cut.rawCuts, grade);
}

// 그래프: 9등급 가로 segment + 사용자 점수 마커
function renderGraph(cuts, score, grade) {
  // cuts: descending [c1, c2, ..., c8]
  // 등급별 점수 구간 (low, high):
  //   1등급: [c1, 100]
  //   2등급: [c2, c1)
  //   ...
  //   8등급: [c8, c7)
  //   9등급: [0, c8)
  const ranges = [];
  for (let g = 1; g <= 9; g++) {
    const high = g === 1 ? 100 : cuts[g - 2];
    const low  = g === 9 ? 0   : cuts[g - 1];
    ranges.push({ grade: g, low, high });
  }

  const trackHTML = ranges.map(r => {
    const width = ((r.high - r.low) / 100) * 100;
    const color = GRADE_COLORS[r.grade - 1];
    return `<div class="gc-seg" style="width:${width}%;background:${color};">
              <span class="gc-seg__num">${r.grade}</span>
            </div>`;
  }).join('');
  $('gcGraphTrack').innerHTML = trackHTML;

  // 등급컷 라인들 (주요 컷 포인트만)
  const cutHTML = cuts.map((c, i) =>
    `<div class="gc-cutline" style="left:${c}%;" title="${i + 1}등급 ${c}점">
       <span class="gc-cutline__num">${c}</span>
     </div>`
  ).join('');
  $('gcGraphCuts').innerHTML = cutHTML;

  // 마커
  const m = $('gcMarker');
  m.style.left = `${score}%`;
  $('gcMarkerLabel').textContent = `${score}점`;
}

function renderCutsTable(cuts, myGrade) {
  const rows = cuts.map((c, i) => {
    const g = i + 1;
    const isMy = g === myGrade;
    return `<div class="gc-cuts-table__row${isMy ? ' is-my' : ''}">
              <span class="gc-cuts-table__grade" style="color:${GRADE_COLORS[i]};">${g}등급</span>
              <span class="gc-cuts-table__score">${c}점</span>
            </div>`;
  }).join('');
  $('gcCutsTable').innerHTML = rows;
}

// ── 시작 ──────────────────────────────────────────────────
init();
