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

  // 이번 달 일정 위젯 (.widget-card 공통 스타일)
  const mount = document.getElementById('calMonthMount');
  if (!mount) return;
  const y = today.getFullYear(), m = today.getMonth() + 1;
  const monthEvents = eventsInMonth(events, y, m).slice(0, 3);
  if (!monthEvents.length) return;

  const items = monthEvents.map(ev => `
    <li class="widget-item" style="border-left-color:${eventColor(ev)}">
      <span class="widget-item__date">${eventDateLabel(ev)}</span>
      <span class="widget-item__title">${escHtml(ev.title)}</span>
    </li>`).join('');

  mount.innerHTML = `
    <section class="widget-card">
      <header class="widget-card__head">
        <h3>📅 ${m}월 일정</h3>
        <a href="calendar.html">전체 →</a>
      </header>
      <ul class="widget-card__list">${items}</ul>
    </section>`;
}

document.addEventListener('DOMContentLoaded', init);
