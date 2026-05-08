// index.html — 이번 달 일정 + 가까운 시험 D-day 위젯.
import { loadCalendar, eventsInMonth, nearestExam, ddayLabel, eventColor, eventDateLabel } from './calendar.js?v=20260508a';

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

async function init() {
  let events;
  try { events = await loadCalendar(); }
  catch { return; }

  // 가까운 시험 D-day → ddayBanner 안에 sub-line으로 통합
  const today = new Date();
  const near = nearestExam(events, today);
  const banner = document.getElementById('ddayBanner');
  if (near && banner) {
    const sub = document.createElement('a');
    sub.href = 'calendar.html';
    sub.className = 'dday-banner__nextexam';
    sub.style.cssText = 'display:inline-block;margin-top:8px;padding:4px 10px;background:rgba(0,102,204,0.08);color:#0066cc;border-radius:12px;font-size:11.5px;font-weight:500;text-decoration:none;letter-spacing:-0.01em';
    sub.innerHTML = `📅 다음 시험 — ${escHtml(near.event.title)} · <strong>${ddayLabel(near.diff)}</strong>`;
    banner.querySelector('.dday-banner__inner')?.appendChild(sub);
  }

  // 이번 달 일정 위젯 (컴팩트)
  const mount = document.getElementById('calMonthMount');
  if (!mount) return;
  const y = today.getFullYear(), m = today.getMonth() + 1;
  const monthEvents = eventsInMonth(events, y, m).slice(0, 3);
  if (!monthEvents.length) return;

  const items = monthEvents.map(ev => `
    <li style="display:flex;gap:8px;padding:5px 10px;border-left:3px solid ${eventColor(ev)};background:#fafbfc;border-radius:3px;font-size:12px">
      <div style="font-weight:600;min-width:52px;color:#1e293b;font-variant-numeric:tabular-nums">${eventDateLabel(ev)}</div>
      <div style="flex:1">${escHtml(ev.title)}</div>
    </li>`).join('');

  mount.innerHTML = `
    <section style="margin-top:14px;padding:10px 14px;background:#fff;border:1px solid #e3e6ec;border-radius:8px;max-width:440px;margin-left:auto;margin-right:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h3 style="font-size:12.5px;margin:0;font-weight:600;color:#475569">📅 ${m}월 일정</h3>
        <a href="calendar.html" style="font-size:11px;color:#0066cc;text-decoration:none">전체 →</a>
      </div>
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:4px">${items}</ul>
    </section>`;
}

document.addEventListener('DOMContentLoaded', init);
