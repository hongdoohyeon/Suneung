'use strict';
// 최근 본 시험 — localStorage 기반 (회원가입 X). 최대 8건 LRU.
// empty fallback: 최근 본 시험이 없으면 최근 업데이트 자료를 보여줌.

const KEY = 'kicegg:recent-exams';
const MAX = 8;

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function load() {
  try {
    const arr = safeParse(localStorage.getItem(KEY));
    return Array.isArray(arr) ? arr.filter(e => e && Number.isInteger(e.id)) : [];
  } catch { return []; }
}

function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX))); } catch {}
}

// 시험 단건 페이지 진입 시 호출. exam item에서 표시용 메타 추출 → 저장.
export function pushRecent(exam) {
  if (!exam || !exam.id) return;
  const entry = {
    id: exam.id,
    title: exam.subject + (exam.subSubject ? ' ' + exam.subSubject : ''),
    sub: buildSub(exam),
    typeGroup: exam.typeGroup,
    ts: Date.now(),
  };
  const list = load().filter(e => e.id !== exam.id);
  list.unshift(entry);
  save(list);
}

function buildSub(exam) {
  if (exam.typeGroup === 'education') {
    const sg = exam.studentGrade ? `고${exam.studentGrade}` : '';
    return `${exam.examYear}년 ${exam.month}월 ${sg} 학평`.trim();
  }
  if (exam.typeGroup === 'suneung') {
    const t = ({ csat: '수능', sept: '9모', june: '6모', prelim: '예비' })[exam.type] || '';
    return `${exam.gradeYear}학년도 ${t}`.trim();
  }
  if (exam.typeGroup === 'military') return `${exam.gradeYear}학년도 사관학교`;
  if (exam.typeGroup === 'police')   return `${exam.gradeYear}학년도 경찰대`;
  if (exam.typeGroup === 'leet')     return `${exam.gradeYear}학년도 LEET`;
  if (exam.typeGroup === 'meet')     return `${exam.gradeYear}학년도 MEET`;
  return '';
}

// 최근 본 시험 chip 라인 (있을 때).
export function recentChipsHTML() {
  const list = load();
  if (list.length === 0) return '';
  const items = list.slice(0, 4).map(e => {
    const url = `exam-${e.id}.html`;
    const label = e.sub ? `${e.sub} ${e.title}` : (e.title || '시험');
    return `<a href="${url}" class="recent-chip">${esc(label)}</a>`;
  }).join('');
  return `
    <div class="recent-row" aria-label="최근 본 시험">
      <span class="recent-row__label">최근 본 시험</span>
      <div class="recent-row__chips">${items}</div>
    </div>`;
}

// 메인 페이지 mount — 최근 업데이트 chip + trust 신호 동시 채움.
// pushRecent 이력이 없을 때만 chip을 fallback으로 보여줌.
let _examsCache = null;
async function fetchExams() {
  if (_examsCache) return _examsCache;
  try {
    const res = await fetch('data/exams.json');
    if (!res.ok) return null;
    _examsCache = await res.json();
    return _examsCache;
  } catch { return null; }
}

export async function recentUpdatesHTML(limit = 4) {
  const exams = await fetchExams();
  if (!Array.isArray(exams) || exams.length === 0) return '';

  const sorted = [...exams].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, limit);
  const items = sorted.map(e => {
    const url = `exam-${e.id}.html`;
    const sub = subFromExam(e);
    const title = (e.subject || '') + (e.subSubject ? ' ' + e.subSubject : '');
    const label = sub ? `${sub} ${title}` : title;
    return `<a href="${url}" class="recent-chip">${esc(label)}</a>`;
  }).join('');
  return `
    <div class="recent-row" aria-label="최근 업데이트">
      <span class="recent-row__label">최근 업데이트</span>
      <div class="recent-row__chips">${items}</div>
    </div>`;
}

// 자료 총 수 + 가장 최근 시행 시험의 라벨.
// 정렬 기준: examYear*100 + month (시행 시기) — id 가 아닌 실제 시험 일자 기준
export async function trustStats() {
  const exams = await fetchExams();
  if (!Array.isArray(exams) || exams.length === 0) {
    return { count: null, updateLabel: null };
  }
  const tsKey = (e) => {
    // reference(통계자료)는 시기 의미 없음 → 매우 작은 값으로 (제외 효과)
    if (e.typeGroup === 'reference') return -1;
    // 예비/예시문항 (gradeYear='preliminary' or 2028 prelim) — 시행되지 않은 미래 자료, 제외
    if (e.gradeYear === 'preliminary' || e.type === 'prelim') return -1;
    const ey = (typeof e.examYear === 'number' && e.examYear > 1990) ? e.examYear
            : (typeof e.gradeYear === 'number' ? e.gradeYear - 1 : 0);
    const m  = (typeof e.month === 'number' && e.month > 0) ? e.month : 0;
    return ey * 100 + m;
  };
  const sorted = [...exams].sort((a, b) => tsKey(b) - tsKey(a));
  const latest = sorted[0];
  let updateLabel = null;
  if (latest.typeGroup === 'education' && latest.examYear && latest.month) {
    const sg = latest.studentGrade ? `고${latest.studentGrade}` : '';
    updateLabel = `${latest.examYear}.${String(latest.month).padStart(2, '0')} ${sg} 학평`.trim();
  } else if (latest.typeGroup === 'suneung') {
    const t = ({ csat: '수능', sept: '9모', june: '6모' })[latest.type] || '';
    updateLabel = `${latest.gradeYear}학년도 ${t}`.trim();
  } else if (latest.gradeYear) {
    updateLabel = `${latest.gradeYear}학년도`;
  }
  return { count: exams.length, updateLabel };
}

function subFromExam(e) {
  if (e.typeGroup === 'education') {
    const sg = e.studentGrade ? `고${e.studentGrade}` : '';
    return `${e.examYear}년 ${e.month}월 ${sg} 학평`.trim();
  }
  if (e.typeGroup === 'suneung') {
    const t = ({ csat: '수능', sept: '9모', june: '6모', prelim: '예비' })[e.type] || '';
    return `${e.gradeYear}학년도 ${t}`.trim();
  }
  if (e.typeGroup === 'military') return `${e.gradeYear}학년도 사관학교`;
  if (e.typeGroup === 'police')   return `${e.gradeYear}학년도 경찰대`;
  if (e.typeGroup === 'leet')     return `${e.gradeYear}학년도 LEET`;
  if (e.typeGroup === 'meet')     return `${e.gradeYear}학년도 MEET`;
  return '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
