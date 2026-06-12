// 입시·시험 캘린더 — fetch + 렌더 helpers.
// 사용처:
//   1) calendar.html (전체 캘린더)
//   2) index.html (이번 달 요약 + 가장 가까운 시험 D-day)

let CACHE = null;

export async function loadCalendar() {
  if (CACHE) return CACHE;
  const r = await fetch('data/calendar.json?v=20260612a');
  if (!r.ok) throw new Error('calendar fetch failed');
  CACHE = (await r.json()).events;
  return CACHE;
}

// 단일 일정의 발생 날짜 list (date 또는 dateRange)
function eventDates(ev) {
  if (ev.date) return [ev.date];
  if (ev.dateRange) {
    const [a, b] = ev.dateRange;
    return [a, b]; // 시작·종료 둘만 표시 (range)
  }
  return [];
}

function parseDate(s) {
  // YYYY-MM-DD → Date (KST 자정)
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayDiff(target, today) {
  const ms = parseDate(target) - new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor(ms / 86400000);
}

// 가장 가까운 시험 (오늘 이후 ≥0일)
export function nearestExam(events, today = new Date()) {
  const exams = events.filter(e => e.type === 'exam');
  let best = null;
  for (const ev of exams) {
    for (const d of eventDates(ev)) {
      const diff = dayDiff(d, today);
      if (diff < 0) continue;
      if (!best || diff < best.diff) {
        best = { event: ev, date: d, diff };
      }
    }
  }
  return best;
}

// 특정 (year, month) 의 일정 list — date 또는 range 가 그 달에 걸침
export function eventsInMonth(events, year, month) {
  const ymStr = `${year}-${String(month).padStart(2, '0')}`;
  return events.filter(ev => {
    if (ev.date) return ev.date.startsWith(ymStr);
    if (ev.dateRange) {
      const [a, b] = ev.dateRange;
      // 시작 또는 종료 또는 중간이 그 달이면 포함
      return a.startsWith(ymStr) || b.startsWith(ymStr) || (a < `${ymStr}-01` && b > `${ymStr}-31`);
    }
    return false;
  }).sort((a, b) => (a.date || a.dateRange[0]).localeCompare(b.date || b.dateRange[0]));
}

// HTML helper — D-day 라벨
export function ddayLabel(diff) {
  if (diff === 0) return 'D-DAY';
  if (diff > 0) return `D-${diff}`;
  return `D+${-diff}`;
}

// 카테고리 색
export const CAT_COLORS = {
  csat: '#dc2626',          // 빨강 — 수능
  kice: '#0066cc',          // 파랑 — 평가원
  edu: '#475569',           // 슬레이트 — 학평
  '수시': '#10b981',         // 초록 — 수시
  '정시': '#f59e0b',         // 황금 — 정시
};

export function eventColor(ev) {
  return CAT_COLORS[ev.category] || '#6b7280';
}

// 단일 일정의 표시 라벨
export function eventDateLabel(ev) {
  if (ev.date) {
    const [y, m, d] = ev.date.split('-');
    return `${m.replace(/^0/, '')}.${d}`;
  }
  if (ev.dateRange) {
    const [a, b] = ev.dateRange;
    const [, am, ad] = a.split('-');
    const [, bm, bd] = b.split('-');
    if (am === bm) return `${am.replace(/^0/, '')}.${ad}~${bd}`;
    return `${am.replace(/^0/, '')}.${ad}~${bm.replace(/^0/, '')}.${bd}`;
  }
  return '';
}
