'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf } from './config.js';

const DATA_URL = 'data/gradecuts.json';
const $ = id => document.getElementById(id);

// 등급컷 계산기에서 지원하는 커리큘럼 목록 (28예비·사관·경찰대·MEET 제외)
const GC_CURRICULA = ['2015', '2009', 'LEET'];

// ── 상수 ───────────────────────────────────────────────────
// 9등급 누적 백분율 경계
const PCT_BOUNDARIES = [0, 4, 11, 23, 40, 60, 77, 89, 96, 100];

// 등급별 색상 (1=초록 → 9=적색)
const GRADE_COLORS = [
  '#0c5e3f', '#15803d', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#b91c1c', '#7f1d1d', '#3f0e0e',
];

// 영역별 슬롯 수 (사탐·과탐은 수능에서 2과목 선택)
function slotsFor(subjectKey) {
  return (subjectKey === '사회탐구' || subjectKey === '과학탐구') ? 2 : 1;
}

// 영역 만점 (개별 cut 데이터에 fullScore 있으면 우선)
function defaultFullScore(subjectKey) {
  if (subjectKey === '한국사') return 50;
  if (subjectKey === '사회탐구' || subjectKey === '과학탐구' || subjectKey === '직업탐구') return 50;
  return 100;
}

// ── 상태 ───────────────────────────────────────────────────
const state = {
  cuts: [],
  curriculum: '2015',
  gradeYear:  null,
  type:       null,
  // 영역 슬롯별 점수: key = 'subject:slotIndex' → { subSubject, score }
  scores:     {},
};

function currConf() { return CURRICULUM_CONFIG[state.curriculum]; }
const slotKey = (subj, idx) => `${subj}:${idx}`;
const getSlot = (subj, idx) => state.scores[slotKey(subj, idx)] ?? {};
function setSlot(subj, idx, patch) {
  const k = slotKey(subj, idx);
  state.scores[k] = { ...(state.scores[k] ?? {}), ...patch };
}

// ── 시작 ───────────────────────────────────────────────────
async function init() {
  const urlTab = new URLSearchParams(location.search).get('tab');
  if (urlTab && GC_CURRICULA.includes(urlTab)) state.curriculum = urlTab;

  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    state.cuts = res.ok ? await res.json() : [];
  } catch { state.cuts = []; }

  autoFillSingles();
  renderAll();
  bindGlobalEvents();
}

// 단일 옵션이면 자동 선택
function autoFillSingles() {
  const years = availableYears();
  if (state.gradeYear == null && years.length === 1) state.gradeYear = years[0];

  if (state.gradeYear != null && state.type == null) {
    const types = availableTypes();
    if (types.length === 1) state.type = types[0].key;
  }
}

// ── 옵션 목록 ─────────────────────────────────────────────
function availableYears() {
  const [min, max] = currConf().gradeYearRange;
  const years = [];
  for (let y = max; y >= min; y--) years.push(y);
  return years;
}

function availableTypes() {
  const conf = currConf();
  const types = [];
  for (const groupKey of conf.availableTypeGroups) {
    const g = EXAM_TYPE_CONFIG.find(x => x.groupKey === groupKey);
    if (!g) continue;
    for (const t of g.types) types.push({ key: t.key, label: t.label, group: g.groupLabel, month: t.month });
  }
  return types.sort((a, b) => b.month - a.month);
}

// ── 칩 ────────────────────────────────────────────────────
function pill(value, label, active = false, attrs = '') {
  return `<button class="pill${active ? ' is-active' : ''}" data-value="${value}" ${attrs}>${label}</button>`;
}

function renderAll() {
  renderCurriculumPills();
  renderYearPills();
  renderTypePills();
  renderContent();
}

function renderCurriculumPills() {
  const html = Object.entries(CURRICULUM_CONFIG)
    .filter(([key]) => GC_CURRICULA.includes(key))
    .map(([key, conf]) => pill(key, conf.label, state.curriculum === key))
    .join('');
  $('gcCurrPills').innerHTML = html;
}

function renderYearPills() {
  $('gcYearPills').innerHTML = availableYears().map(y =>
    pill(String(y), `${y}학년도`, state.gradeYear === y)
  ).join('');
}

function renderTypePills() {
  const types = availableTypes();
  $('gcTypePills').innerHTML = types.map(t =>
    pill(t.key, t.label, state.type === t.key)
  ).join('');
}

// ── 메인 컨텐츠 ───────────────────────────────────────────
function renderContent() {
  const ready = state.gradeYear != null && state.type;
  $('gcEmpty').style.display = ready ? 'none' : 'flex';
  $('gcExamWrap').style.display = ready ? 'block' : 'none';
  if (!ready) return;

  // 시험 타이틀
  const tc = getTypeConf(state.type);
  $('gcExamTitle').textContent =
    `${state.gradeYear}학년도 · ${tc?.groupLabel ?? ''} ${tc?.label ?? ''}`;

  renderSubjects();
  renderTotal();
}

function renderSubjects() {
  const conf = currConf();
  const html = Object.keys(conf.subjects).map(subj => subjectCardHTML(subj, conf)).join('');
  $('gcSubjGrid').innerHTML = html;
}

function subjectCardHTML(subj, conf) {
  const sc      = conf.subjects[subj];
  const slots   = slotsFor(subj);
  const isMulti = slots > 1;
  const slotsHTML = Array.from({ length: slots }, (_, i) => slotHTML(subj, i, sc, isMulti)).join('');
  return `
    <article class="subj-card${isMulti ? ' subj-card--multi' : ''}" data-subject="${subj}">
      <header class="subj-card__head">
        <span class="subj-card__icon" style="background:${sc.bg};">${sc.icon}</span>
        <h3 class="subj-card__title">${subj}</h3>
      </header>
      <div class="subj-card__body">${slotsHTML}</div>
    </article>
  `;
}

function slotHTML(subj, slotIdx, subjConf, isMulti) {
  const slot     = getSlot(subj, slotIdx);
  const hasSubs  = subjConf.subs.length > 0;
  const cut      = findCut(subj, slot.subSubject);
  const fullScore= cut?.fullScore ?? defaultFullScore(subj);
  const grade    = (slot.score != null && cut) ? computeGrade(slot.score, cut.rawCuts) : null;
  const pct      = grade != null ? computePercentile(slot.score, grade, cut.rawCuts, fullScore) : null;

  // 사탐/과탐: 이미 다른 슬롯에서 선택한 sub은 비활성화
  const otherSlot = isMulti ? getSlot(subj, slotIdx === 0 ? 1 : 0) : null;
  const otherSub  = otherSlot?.subSubject ?? null;

  let pillsHTML = '';
  if (hasSubs) {
    pillsHTML = `<div class="subj-slot__subs">${
      subjConf.subs.map(s => {
        const isActive   = slot.subSubject === s;
        const isDisabled = otherSub === s;
        return `<button class="pill${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}"
                  data-action="set-sub" data-subject="${subj}" data-slot="${slotIdx}" data-sub="${s}"
                  ${isDisabled ? 'disabled' : ''}>${s}</button>`;
      }).join('')
    }</div>`;
  }

  const scoreVal = slot.score ?? '';
  const numLabel = isMulti ? `<span class="subj-slot__num">${slotIdx + 1}과목</span>` : '';

  // 결과 / 미니 그래프 — cut 있고 score 있을 때만
  const hasResult = cut && grade != null;

  let resultHTML = '';
  if (hasResult) {
    resultHTML = `
      <div class="subj-slot__result">
        <span class="subj-result__grade" style="color:${GRADE_COLORS[grade - 1]}">${grade}</span>
        <span class="subj-result__suffix">등급</span>
        <span class="subj-result__sep">·</span>
        <span class="subj-result__pct">상위 ${pct.toFixed(1)}%</span>
      </div>
      ${miniBarHTML(cut.rawCuts, slot.score, grade, fullScore)}
    `;
  } else if (slot.subSubject || !hasSubs) {
    if (slot.score != null && !cut) {
      resultHTML = `<div class="subj-slot__hint">해당 영역의 등급컷 데이터가 없습니다</div>`;
    }
  }

  const inputDisabled = hasSubs && !slot.subSubject;
  const placeholder = inputDisabled
    ? '먼저 선택과목 선택'
    : `0~${fullScore}`;

  return `
    <div class="subj-slot" data-slot-key="${slotKey(subj, slotIdx)}">
      ${numLabel}
      ${pillsHTML}
      <div class="subj-slot__input-row">
        <input type="number" class="subj-input" min="0" max="${fullScore}"
          placeholder="${placeholder}"
          value="${scoreVal}"
          data-action="set-score" data-subject="${subj}" data-slot="${slotIdx}"
          ${inputDisabled ? 'disabled' : ''} />
        <span class="subj-input__unit">/ ${fullScore}</span>
      </div>
      ${resultHTML}
    </div>
  `;
}

// 미니 linear bar — cut tick + 사용자 marker
function miniBarHTML(cuts, score, grade, fullScore) {
  const pct = (v) => (v / fullScore) * 100;
  const ticks = cuts.map((c, i) =>
    `<span class="mini-bar__tick" style="left:${pct(c)}%;"></span>`
  ).join('');
  return `
    <div class="mini-bar">
      <div class="mini-bar__track" style="--bar-color:${GRADE_COLORS[grade - 1]};">
        ${ticks}
        <div class="mini-bar__marker" style="left:${pct(score)}%; --marker-color:${GRADE_COLORS[grade - 1]};">
          <span class="mini-bar__dot"></span>
        </div>
      </div>
      <div class="mini-bar__axis">
        <span>0</span>
        <span>${fullScore}</span>
      </div>
    </div>
  `;
}

// ── 매칭 ──────────────────────────────────────────────────
function findCut(subject, subSubject) {
  return state.cuts.find(c =>
    c.curriculum === state.curriculum &&
    c.gradeYear  === state.gradeYear &&
    c.type       === state.type &&
    c.subject    === subject &&
    ((c.subSubject ?? null) === (subSubject ?? null))
  ) ?? null;
}

// ── 계산 ──────────────────────────────────────────────────
function computeGrade(score, cuts) {
  for (let i = 0; i < cuts.length; i++) if (score >= cuts[i]) return i + 1;
  return 9;
}

function computePercentile(score, grade, cuts, fullScore) {
  const lower = grade === 9 ? 0          : cuts[grade - 1];
  const upper = grade === 1 ? fullScore  : cuts[grade - 2];
  const lo    = PCT_BOUNDARIES[grade - 1];
  const hi    = PCT_BOUNDARIES[grade];
  const range = upper - lower;
  if (range <= 0) return hi;
  const ratio = (score - lower) / range;
  return hi - ratio * (hi - lo);
}

// ── 종합 분석 ─────────────────────────────────────────────
function renderTotal() {
  const conf = currConf();
  const entries = [];   // { subject, slotIdx, subSubject, score, grade, pct, fullScore, color, cut }
  for (const subj of Object.keys(conf.subjects)) {
    const slots = slotsFor(subj);
    for (let i = 0; i < slots; i++) {
      const slot = getSlot(subj, i);
      if (slot.score == null) continue;
      const cut = findCut(subj, slot.subSubject);
      if (!cut) continue;
      const fullScore = cut.fullScore ?? defaultFullScore(subj);
      const grade = computeGrade(slot.score, cut.rawCuts);
      const pct   = computePercentile(slot.score, grade, cut.rawCuts, fullScore);
      entries.push({
        subject: subj, slotIdx: i, subSubject: slot.subSubject, score: slot.score,
        grade, pct, fullScore, color: GRADE_COLORS[grade - 1],
      });
    }
  }

  const card = $('gcTotalCard');
  if (entries.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  $('gcTotalHint').textContent = `${entries.length}개 영역 입력`;

  const avgGrade = entries.reduce((s, e) => s + e.grade, 0) / entries.length;
  const avgPct   = entries.reduce((s, e) => s + e.pct,   0) / entries.length;
  $('gcAvgGrade').textContent = avgGrade.toFixed(2);
  $('gcAvgPct').textContent   = `${avgPct.toFixed(1)}%`;

  // 영역별 막대 (등급 시각화)
  $('gcTotalBars').innerHTML = entries.map(e => {
    const label = `${e.subject}${e.subSubject ? ' / ' + e.subSubject : ''}`;
    return `
      <div class="total-bar">
        <div class="total-bar__label">${label}</div>
        <div class="total-bar__track">
          <div class="total-bar__fill" style="width:${(e.score / e.fullScore) * 100}%;background:${e.color};"></div>
        </div>
        <div class="total-bar__meta">
          <span class="total-bar__grade" style="color:${e.color};">${e.grade}등급</span>
          <span class="total-bar__pct">상위 ${e.pct.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── 이벤트 ────────────────────────────────────────────────
function bindGlobalEvents() {
  // 사이드바 (curriculum / year / type)
  $('gcCurrPills').addEventListener('click', e => {
    const btn = e.target.closest('.pill'); if (!btn) return;
    state.curriculum = btn.dataset.value;
    state.gradeYear = state.type = null;
    state.scores = {};
    autoFillSingles();
    syncUrl();
    renderAll();
  });

  $('gcYearPills').addEventListener('click', e => {
    const btn = e.target.closest('.pill'); if (!btn) return;
    state.gradeYear = Number(btn.dataset.value);
    state.type = null;
    state.scores = {};
    autoFillSingles();
    renderAll();
  });

  $('gcTypePills').addEventListener('click', e => {
    const btn = e.target.closest('.pill'); if (!btn) return;
    state.type = btn.dataset.value;
    state.scores = {};
    renderAll();
  });

  // 영역 카드 (이벤트 위임 — pill / input)
  $('gcSubjGrid').addEventListener('click', e => {
    const btn = e.target.closest('.pill[data-action="set-sub"]');
    if (!btn || btn.disabled) return;
    const subj = btn.dataset.subject;
    const idx  = Number(btn.dataset.slot);
    const sub  = btn.dataset.sub;
    const cur  = getSlot(subj, idx).subSubject;
    setSlot(subj, idx, { subSubject: cur === sub ? null : sub });
    renderSubjects();
    renderTotal();
  });

  $('gcSubjGrid').addEventListener('input', e => {
    const inp = e.target.closest('input[data-action="set-score"]');
    if (!inp) return;
    const subj = inp.dataset.subject;
    const idx  = Number(inp.dataset.slot);
    const v    = inp.value.trim();
    if (v === '') { setSlot(subj, idx, { score: null }); }
    else {
      let n = Number(v);
      if (!Number.isFinite(n)) return;
      const max = Number(inp.max) || 100;
      n = Math.min(max, Math.max(0, n));
      setSlot(subj, idx, { score: n });
    }
    // 입력 중에는 카드 전체 re-render 하면 input focus가 사라짐
    // → 대신 해당 슬롯만 부분 갱신
    refreshSlot(subj, idx);
    renderTotal();
  });

  $('gcResetBtn').addEventListener('click', () => {
    state.scores = {};
    renderSubjects();
    renderTotal();
  });
}

function refreshSlot(subj, idx) {
  const conf     = currConf();
  const sc       = conf.subjects[subj];
  const isMulti  = slotsFor(subj) > 1;
  const slotEl   = document.querySelector(`[data-slot-key="${slotKey(subj, idx)}"]`);
  if (!slotEl) return;

  // outerHTML 교체 시 input 포커스가 날아가므로 미리 저장했다가 복원
  const activeInp = slotEl.contains(document.activeElement) ? document.activeElement : null;
  const selStart  = activeInp?.selectionStart ?? null;

  slotEl.outerHTML = slotHTML(subj, idx, sc, isMulti);
  if (isMulti) {
    const otherIdx = idx === 0 ? 1 : 0;
    const otherEl  = document.querySelector(`[data-slot-key="${slotKey(subj, otherIdx)}"]`);
    if (otherEl) otherEl.outerHTML = slotHTML(subj, otherIdx, sc, isMulti);
  }

  if (activeInp) {
    const newInp = document.querySelector(`[data-slot-key="${slotKey(subj, idx)}"] input[data-action="set-score"]`);
    if (newInp) {
      newInp.focus();
      if (selStart !== null) try { newInp.setSelectionRange(selStart, selStart); } catch {}
    }
  }
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('tab', state.curriculum);
  history.replaceState({}, '', url);
}

init();
