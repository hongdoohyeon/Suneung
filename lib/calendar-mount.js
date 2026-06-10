// index.html — 가까운 시험 D-day 라인 추가.
import { loadCalendar, nearestExam, ddayLabel } from './calendar.js?v=20260611a';

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

async function init() {
  let events;
  try { events = await loadCalendar(); }
  catch { return; }

  const today = new Date();
  const near = nearestExam(events, today);
  const banner = document.getElementById('ddayBanner');
  if (!near || !banner) return;
  const sub = document.createElement('a');
  sub.href = 'calendar.html';
  sub.className = 'dday-line__next';
  sub.innerHTML = `다음 시험 — ${escHtml(near.event.title)} <strong>${ddayLabel(near.diff)}</strong>`;
  banner.querySelector('.dday-line')?.appendChild(sub);
}

document.addEventListener('DOMContentLoaded', init);
