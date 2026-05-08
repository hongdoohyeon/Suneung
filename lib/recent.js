'use strict';
// 최근 본 시험 — localStorage 기반 (회원가입 X). 최대 8건 LRU.

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

// 메인 페이지 — 박스 없는 가벼운 inline chip 라인.
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
      <span class="recent-row__label">최근</span>
      <div class="recent-row__chips">${items}</div>
    </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
