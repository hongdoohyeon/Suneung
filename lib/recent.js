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

// 메인 페이지 등에서 호출 — 최근 본 시험 5개 chip HTML 반환.
export function recentChipsHTML() {
  const list = load();
  if (list.length === 0) return '';
  const chips = list.slice(0, 5).map(e => {
    const url = `exam-${e.id}.html`;
    const title = e.title || '시험';
    const sub = e.sub || '';
    return `
      <a class="recent-chip" href="${url}">
        <span class="recent-chip__title">${esc(title)}</span>
        <span class="recent-chip__sub">${esc(sub)}</span>
      </a>`;
  }).join('');
  return `
    <section class="recent-row" aria-label="최근 본 시험">
      <h2 class="recent-row__title">최근 본 시험</h2>
      <div class="recent-row__scroller">${chips}</div>
    </section>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
