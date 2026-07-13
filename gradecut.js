'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf, prettySub } from './config.js?v=20260713a';
import { renderAllAdSlots } from './lib/ads.js?v=20260713a';
import { mountLineup } from './lib/lineup-mount.js?v=20260713a';

const DATA_URL = 'data/gradecuts.json?v=20260713a';
const $ = id => document.getElementById(id);

// 모의지원에서 지원하는 커리큘럼 목록.
// 제외: 09개정(2014~2021, 옛 교육과정), LEET, 28예비, MEET·사관·경찰대.
// 현재 입시(15개정) 만.
const GC_CURRICULA = ['2015'];

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
function showDataError(msg) {
  if (document.getElementById('dataErrorBanner')) return;
  const div = document.createElement('div');
  div.id = 'dataErrorBanner';
  div.style.cssText = 'position:sticky;top:0;z-index:100;background:#fef3c7;color:#92400e;padding:10px 12px;text-align:center;font-size:13px;line-height:1.5;border-bottom:1px solid #fde68a';
  div.innerHTML = `<strong>⚠️ 데이터 로드 실패</strong> · ${msg} · <button type="button" class="data-reload" style="color:#92400e;text-decoration:underline;background:none;border:0;font:inherit;cursor:pointer;padding:0">새로고침</button>`;
  document.body.prepend(div);
  div.querySelector('.data-reload')?.addEventListener('click', () => location.reload());
}

async function init() {
  const params = new URLSearchParams(location.search);
  const urlTab = params.get('tab');
  if (urlTab && GC_CURRICULA.includes(urlTab)) state.curriculum = urlTab;
  // URL에서 year/type 복원 — 새로고침·공유 시 입력 유지
  const urlYear = parseInt(params.get('year'), 10);
  if (Number.isFinite(urlYear)) state.gradeYear = urlYear;
  const urlType = params.get('type');
  if (urlType) state.type = urlType;

  let fetchFailed = false;
  try {
    const res = await fetch(DATA_URL);
    if (res.ok) state.cuts = await res.json();
    else { state.cuts = []; fetchFailed = true; }
  } catch { state.cuts = []; fetchFailed = true; }

  if (fetchFailed) {
    showDataError('등급컷 데이터를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
  }

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

// 모의지원 = 고3 시험만. 평가원(suneung) + 교육청 학평(education) 중 고3 시험만.
// 고1·고2 학평은 type 코드(jun/sep/nov)로 필터하여 제외.
const GC_HIGH3_EDU_TYPES = new Set(['mar', 'apr', 'jul', 'oct']);  // 고3 학평 시행월

function availableTypes() {
  const conf = currConf();
  const types = [];
  for (const groupKey of conf.availableTypeGroups) {
    if (groupKey !== 'suneung' && groupKey !== 'education') continue;
    const g = EXAM_TYPE_CONFIG.find(x => x.groupKey === groupKey);
    if (!g) continue;
    for (const t of g.types) {
      if (t.key === 'prelim') continue;
      // 학평: 고3 시행월(3/4/7/10)만. 6/9/11월은 고1·고2 → 제외.
      if (groupKey === 'education' && !GC_HIGH3_EDU_TYPES.has(t.key)) continue;
      types.push({ key: t.key, label: t.label, group: g.groupLabel, month: t.month });
    }
  }
  return types.sort((a, b) => b.month - a.month);
}

// ── 칩 ────────────────────────────────────────────────────
function pill(value, label, active = false, attrs = '') {
  return `<button class="pill${active ? ' is-active' : ''}" data-value="${value}" aria-pressed="${active}" ${attrs}>${label}</button>`;
}

function renderAll() {
  renderCurriculumPills();
  renderYearPills();
  renderTypePills();
  renderContent();
}

function renderCurriculumPills() {
  const html = GC_CURRICULA
    .filter(key => CURRICULUM_CONFIG[key])
    .map(key => pill(key, CURRICULUM_CONFIG[key].label, state.curriculum === key))
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
  renderProgress();
}

function renderProgress() {
  const conf = currConf();
  if (!conf) return;
  const subjects = Object.keys(conf.subjects);
  const totalSlots = subjects.reduce((acc, s) => acc + slotsFor(s), 0);
  let filled = 0;
  for (const subj of subjects) {
    const slots = slotsFor(subj);
    for (let i = 0; i < slots; i++) {
      const slot = getSlot(subj, i);
      if (slot.score != null) filled++;
    }
  }
  const el = $('gcProgress');
  if (!el) return;
  el.textContent = `입력 ${filled}/${totalSlots}개 영역 · 탐구 최대 2과목 · 입력 즉시 계산`;
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

// 탐구 영역(사탐+과탐 통합)에 점수까지 입력된 슬롯 수.
// 수능 탐구는 합쳐서 2과목 선택이라, 2개 채우면 나머지 슬롯은 비활성화.
function inquiryFilledCount() {
  let n = 0;
  for (const subj of ['사회탐구', '과학탐구']) {
    for (let i = 0; i < slotsFor(subj); i++) {
      const s = getSlot(subj, i);
      if (s.subSubject && s.score != null) n++;
    }
  }
  return n;
}
function isInquirySubject(subj) {
  return subj === '사회탐구' || subj === '과학탐구';
}

function slotHTML(subj, slotIdx, subjConf, isMulti) {
  const slot     = getSlot(subj, slotIdx);
  const hasSubs  = subjConf.subs.length > 0;
  const cut      = findCut(subj, slot.subSubject);
  const fullScore= cut?.fullScore ?? defaultFullScore(subj);
  const grade    = (slot.score != null && cut) ? computeGrade(slot.score, cut.rawCuts) : null;
  // 절대평가(영어/한국사)는 백분위 개념 자체가 없음 — UI에서 숨김.
  const pct      = (grade != null && !cut?.absolute) ? computePercentile(slot.score, grade, cut.rawCuts, fullScore) : null;

  // 같은 영역 다른 슬롯에서 선택한 sub은 중복 방지로 비활성화
  const otherSlot = isMulti ? getSlot(subj, slotIdx === 0 ? 1 : 0) : null;
  const otherSub  = otherSlot?.subSubject ?? null;

  // 탐구 그룹(사탐+과탐) 합쳐 2과목 채워졌고 이 슬롯은 아직 미입력이면 비활성.
  const slotFilled = !!(slot.subSubject && slot.score != null);
  const inquiryLocked = isInquirySubject(subj) && !slotFilled && inquiryFilledCount() >= 2;

  let pillsHTML = '';
  if (hasSubs) {
    pillsHTML = `<div class="subj-slot__subs">${
      subjConf.subs.map(s => {
        const isActive   = slot.subSubject === s;
        // 비활성: 다른 슬롯에 선택됨 OR 탐구 2과목 다 찬 상태에서 미입력 슬롯
        const isDisabled = (otherSub === s) || inquiryLocked;
        return `<button class="pill${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}"
                  data-action="set-sub" data-subject="${subj}" data-slot="${slotIdx}" data-sub="${s}"
                  aria-pressed="${isActive}" ${isDisabled ? 'disabled' : ''}>${prettySub(s)}</button>`;
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
        ${pct != null ? `<span class="subj-result__sep">·</span>
        <span class="subj-result__pct">상위 ${pct.toFixed(1)}%</span>` : ''}
      </div>
      ${miniBarHTML(cut.rawCuts, slot.score, grade, fullScore)}
    `;
  } else if (slot.subSubject || !hasSubs) {
    if (slot.score != null && !cut) {
      resultHTML = `<div class="subj-slot__hint">해당 영역의 등급컷 데이터가 없습니다</div>`;
    }
  }

  // 입력 비활성: 선택과목 미지정 OR 탐구 2과목 다 차서 잠긴 슬롯
  const inputDisabled = (hasSubs && !slot.subSubject) || inquiryLocked;
  const placeholder = inquiryLocked
    ? '탐구 2과목까지'
    : (inputDisabled ? '먼저 선택과목 선택' : `0~${fullScore}`);

  return `
    <div class="subj-slot" data-slot-key="${slotKey(subj, slotIdx)}">
      ${numLabel}
      ${pillsHTML}
      <div class="subj-slot__input-row">
        <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next"
          class="subj-input" maxlength="3"
          aria-label="${subj}${slot.subSubject ? ` ${prettySub(slot.subSubject)}` : ''}${isMulti ? ` ${slotIdx + 1}과목` : ''} 원점수"
          placeholder="${placeholder}"
          value="${scoreVal}"
          data-action="set-score" data-subject="${subj}" data-slot="${slotIdx}"
          data-max="${fullScore}"
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
  return state.cuts.find(c => {
    if (c.curriculum !== state.curriculum) return false;
    if (c.gradeYear  !== state.gradeYear)  return false;
    if (c.type       !== state.type)       return false;
    if (c.subject    !== subject)          return false;
    if ((c.subSubject ?? null) !== (subSubject ?? null)) return false;
    // 모의지원 = 고3. 학평 cut 은 studentGrade=3 만 (없으면 평가원이라 무시).
    if (c.typeGroup === 'education' && (c.studentGrade ?? 3) !== 3) return false;
    // rawCuts 8개 모두 유효해야 등급/백분위 계산 가능. 미완성 데이터 = NaN% 원인.
    if (!Array.isArray(c.rawCuts) || c.rawCuts.length < 8) return false;
    if (c.rawCuts.some(v => v == null || !Number.isFinite(v))) return false;
    return true;
  }) ?? null;
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
function renderTotal() { renderProgressMaybe(); _renderTotal(); }
function renderProgressMaybe() { try { renderProgress(); } catch {} }
function _renderTotal() {
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
      const pct   = cut.absolute ? null : computePercentile(slot.score, grade, cut.rawCuts, fullScore);
      entries.push({
        subject: subj, slotIdx: i, subSubject: slot.subSubject, score: slot.score,
        grade, pct, fullScore, color: GRADE_COLORS[grade - 1],
      });
    }
  }

  const card = $('gcTotalCard');
  if (entries.length === 0) {
    card.style.display = 'none';
    mountLineup([]);
    return;
  }
  card.style.display = 'block';
  mountLineup(entries);

  $('gcTotalHint').textContent = `${entries.length}개 영역 입력`;

  const avgGrade = entries.reduce((s, e) => s + e.grade, 0) / entries.length;
  // 절대평가(영어·한국사)는 pct=null — 평균/표시에서 제외(null 전파로 NaN·TypeError 방지).
  const pctEntries = entries.filter(e => e.pct != null);
  const avgPct = pctEntries.length
    ? pctEntries.reduce((s, e) => s + e.pct, 0) / pctEntries.length
    : null;
  $('gcAvgGrade').textContent = avgGrade.toFixed(2);
  $('gcAvgPct').textContent   = avgPct == null ? '—' : `${avgPct.toFixed(1)}%`;

  // 영역별 막대 (등급 시각화)
  $('gcTotalBars').innerHTML = entries.map(e => {
    const label = `${e.subject}${e.subSubject ? ' / ' + prettySub(e.subSubject) : ''}`;
    return `
      <div class="total-bar">
        <div class="total-bar__label">${label}</div>
        <div class="total-bar__track">
          <div class="total-bar__fill" style="width:${(e.score / e.fullScore) * 100}%;background:${e.color};"></div>
        </div>
        <div class="total-bar__meta">
          <span class="total-bar__grade" style="color:${e.color};">${e.grade}등급</span>
          <span class="total-bar__pct">${e.pct == null ? '절대평가' : `상위 ${e.pct.toFixed(1)}%`}</span>
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
    syncUrl();
    renderAll();
  });

  $('gcTypePills').addEventListener('click', e => {
    const btn = e.target.closest('.pill'); if (!btn) return;
    state.type = btn.dataset.value;
    state.scores = {};
    syncUrl();
    renderAll();
    toggleFilter(false);
  });

  // 영역 카드 (이벤트 위임 — pill / input)
  $('gcSubjGrid').addEventListener('click', e => {
    const btn = e.target.closest('.pill[data-action="set-sub"]');
    if (!btn || btn.disabled) return;
    const subj = btn.dataset.subject;
    const idx  = Number(btn.dataset.slot);
    const sub  = btn.dataset.sub;
    const cur  = getSlot(subj, idx).subSubject;
    setSlot(subj, idx, { subSubject: cur === sub ? null : sub, score: null });
    renderSubjects();
    renderTotal();
  });

  // 모바일: 점수 입력 focus 시 키보드가 입력칸을 가리지 않게 가운데로 스크롤
  $('gcSubjGrid').addEventListener('focusin', e => {
    const inp = e.target.closest('input[data-action="set-score"]');
    if (!inp) return;
    if (window.innerWidth > 600) return;
    setTimeout(() => {
      try { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }, 200);  // 모바일 키보드 애니메이션 후
  });

  $('gcSubjGrid').addEventListener('input', e => {
    const inp = e.target.closest('input[data-action="set-score"]');
    if (!inp) return;
    const subj = inp.dataset.subject;
    const idx  = Number(inp.dataset.slot);

    // 숫자만 허용 (text input이라 클라이언트에서 sanitize)
    const cleaned = inp.value.replace(/[^0-9]/g, '');
    if (cleaned !== inp.value) {
      const pos = (inp.selectionEnd ?? cleaned.length) - (inp.value.length - cleaned.length);
      inp.value = cleaned;
      try { inp.setSelectionRange(pos, pos); } catch {}
    }

    const v = cleaned.trim();
    if (v === '') {
      setSlot(subj, idx, { score: null });
    } else {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      const max = Number(inp.dataset.max) || 100;
      const clamped = Math.min(max, Math.max(0, n));
      if (clamped !== n) {
        // value 보정 + cursor 끝으로
        inp.value = String(clamped);
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {}
      }
      setSlot(subj, idx, { score: clamped });
    }

    // 결과 영역만 갱신 (input은 건드리지 않아 cursor 위치 자연 유지)
    refreshSlotResult(subj, idx);
    renderTotal();

    // 탐구 입력 시: 다른 탐구 슬롯의 활성/비활성 상태가 변할 수 있으므로 전체 재렌더.
    // text input은 selectionStart/End 가 정확히 작동 → cursor 위치 정확히 복원.
    if (isInquirySubject(subj)) {
      const cursorPos = inp.selectionEnd ?? inp.value.length;
      renderSubjects();
      const restored = document.querySelector(
        `input[data-action="set-score"][data-subject="${inp.dataset.subject}"][data-slot="${inp.dataset.slot}"]`
      );
      if (restored && !restored.disabled) {
        restored.focus();
        try { restored.setSelectionRange(cursorPos, cursorPos); } catch {}
      }
    }
  });

  $('gcResetBtn').addEventListener('click', () => {
    state.scores = {};
    renderSubjects();
    renderTotal();
  });

  // 모바일 필터 시트: backdrop·스크롤 잠금·포커스 복귀 포함
  let filterReturnFocus = null;
  function toggleFilter(force, trigger = null) {
    const panel = $('filterPanel');
    if (!window.matchMedia('(max-width: 960px)').matches) {
      panel.classList.remove('is-open');
      const backdrop = $('filterBackdrop');
      backdrop?.classList.remove('is-open');
      backdrop?.setAttribute('hidden', '');
      document.body.classList.remove('is-sheet-open');
      document.querySelector('.content').inert = false;
      panel.setAttribute('role', 'region');
      panel.removeAttribute('aria-modal');
      return false;
    }
    const isOpen = force === undefined ? !panel.classList.contains('is-open') : Boolean(force);
    panel.classList.toggle('is-open', isOpen);
    const backdrop = $('filterBackdrop');
    backdrop?.classList.toggle('is-open', isOpen);
    if (backdrop) isOpen ? backdrop.removeAttribute('hidden') : backdrop.setAttribute('hidden', '');
    document.body.classList.toggle('is-sheet-open', isOpen);
    const btn = $('filterToggle');
    if (btn) {
      btn.setAttribute('aria-label', isOpen ? '시험 선택 닫기' : '시험 선택 열기');
      btn.setAttribute('aria-expanded', String(isOpen));
    }
    if (isOpen) {
      filterReturnFocus = trigger || document.activeElement;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      document.querySelector('.content').inert = true;
      requestAnimationFrame(() => $('filterSheetClose')?.focus());
    } else {
      panel.setAttribute('role', 'region');
      panel.removeAttribute('aria-modal');
      document.querySelector('.content').inert = false;
      if (filterReturnFocus?.isConnected) filterReturnFocus.focus();
    }
  }
  $('filterToggle')?.addEventListener('click', e => toggleFilter(undefined, e.currentTarget));
  $('filterSheetClose')?.addEventListener('click', () => toggleFilter(false));
  $('filterBackdrop')?.addEventListener('click', () => toggleFilter(false));
  const filterMq = window.matchMedia('(min-width: 961px)');
  filterMq.addEventListener?.('change', e => { if (e.matches) toggleFilter(false); });
  document.addEventListener('keydown', e => {
    const open = $('filterPanel').classList.contains('is-open');
    if (e.key === 'Escape' && open) { toggleFilter(false); return; }
    if (e.key === 'Tab' && open) {
      const focusable = [...$('filterPanel').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')]
        .filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('gcEmptyCta')?.addEventListener('click', e => {
    toggleFilter(true, e.currentTarget);
    $('filterPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('gcChangeBtn')?.addEventListener('click', e => {
    toggleFilter(true, e.currentTarget);
    $('filterPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// 선택과목(pill) 변경 시: 슬롯 전체 교체 (input 비활성화 상태 포함)
function refreshSlot(subj, idx) {
  const conf    = currConf();
  const sc      = conf.subjects[subj];
  const isMulti = slotsFor(subj) > 1;
  const slotEl  = document.querySelector(`[data-slot-key="${slotKey(subj, idx)}"]`);
  if (!slotEl) return;
  slotEl.outerHTML = slotHTML(subj, idx, sc, isMulti);
  if (isMulti) {
    const otherIdx = idx === 0 ? 1 : 0;
    const otherEl  = document.querySelector(`[data-slot-key="${slotKey(subj, otherIdx)}"]`);
    if (otherEl) otherEl.outerHTML = slotHTML(subj, otherIdx, sc, isMulti);
  }
}

// 점수 입력 시: input은 건드리지 않고 결과 영역(등급/백분위/그래프)만 갱신
function refreshSlotResult(subj, idx) {
  const slotEl = document.querySelector(`[data-slot-key="${slotKey(subj, idx)}"]`);
  if (!slotEl) return;

  // 기존 결과 영역 제거
  slotEl.querySelector('.subj-slot__result')?.remove();
  slotEl.querySelector('.mini-bar')?.remove();
  slotEl.querySelector('.subj-slot__hint')?.remove();

  const slot      = getSlot(subj, idx);
  const cut       = findCut(subj, slot.subSubject);
  const fullScore = cut?.fullScore ?? defaultFullScore(subj);

  if (cut && slot.score != null) {
    const grade = computeGrade(slot.score, cut.rawCuts);
    const pct   = cut.absolute ? null : computePercentile(slot.score, grade, cut.rawCuts, fullScore);
    const pctHTML = pct != null
      ? `<span class="subj-result__sep">·</span><span class="subj-result__pct">상위 ${pct.toFixed(1)}%</span>`
      : '';
    const frag  = document.createRange().createContextualFragment(`
      <div class="subj-slot__result">
        <span class="subj-result__grade" style="color:${GRADE_COLORS[grade - 1]}">${grade}</span>
        <span class="subj-result__suffix">등급</span>
        ${pctHTML}
      </div>
      ${miniBarHTML(cut.rawCuts, slot.score, grade, fullScore)}
    `);
    slotEl.append(frag);
  } else if (slot.score != null && !cut) {
    const hint = document.createElement('div');
    hint.className = 'subj-slot__hint';
    hint.textContent = '해당 영역의 등급컷 데이터가 없습니다';
    slotEl.appendChild(hint);
  }
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('tab', state.curriculum);
  if (state.gradeYear != null) url.searchParams.set('year', String(state.gradeYear));
  else url.searchParams.delete('year');
  if (state.type) url.searchParams.set('type', state.type);
  else url.searchParams.delete('type');
  history.replaceState({}, '', url);
}

init();

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
