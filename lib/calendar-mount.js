// index.html — 이번 달 일정 + 가까운 시험 D-day 위젯.
import { loadCalendar, eventsInMonth, nearestExam, ddayLabel, eventColor, eventDateLabel } from './calendar.js?v=20260508a';

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

async function init() {
  let events;
  try { events = await loadCalendar(); }
  catch { return; }

  // 가까운 시험 D-day → 기존 ddayBanner 위에 별도 chip
  const today = new Date();
  const near = nearestExam(events, today);
  const banner = document.getElementById('ddayBanner');
  if (near && banner) {
    const diff = near.diff;
    const dlabel = ddayLabel(diff);
    const chip = document.createElement('div');
    chip.className = 'dday-chip dday-chip--exam';
    chip.style.cssText = 'background:#e6f0fa;color:#0066cc;padding:6px 12px;border-radius:20px;display:inline-block;font-size:12px;margin-bottom:10px;font-weight:500';
    chip.innerHTML = `<a href="calendar.html" style="color:inherit;text-decoration:none">📅 ${escHtml(near.event.title)} · <strong>${dlabel}</strong></a>`;
    banner.parentElement.insertBefore(chip, banner);
  }

  // 이번 달 일정 위젯
  const mount = document.getElementById('calMonthMount');
  if (!mount) return;
  const y = today.getFullYear(), m = today.getMonth() + 1;
  const monthEvents = eventsInMonth(events, y, m).slice(0, 5);
  if (!monthEvents.length) return;

  const items = monthEvents.map(ev => `
    <li style="display:flex;gap:10px;padding:8px 12px;border-left:3px solid ${eventColor(ev)};background:#fafbfc;border-radius:4px">
      <div style="font-size:12px;font-weight:600;min-width:64px;color:#1e293b;font-variant-numeric:tabular-nums">${eventDateLabel(ev)}</div>
      <div style="flex:1;font-size:13px">${escHtml(ev.title)}</div>
    </li>`).join('');

  mount.innerHTML = `
    <section style="margin-top:24px;padding:14px 16px;background:#fff;border:1px solid #e3e6ec;border-radius:10px;max-width:520px;margin-left:auto;margin-right:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="font-size:14px;margin:0;font-weight:600">📅 ${y}년 ${m}월 일정</h3>
        <a href="calendar.html" style="font-size:11px;color:#0066cc;text-decoration:none">전체 보기 →</a>
      </div>
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">${items}</ul>
    </section>`;
}

document.addEventListener('DOMContentLoaded', init);
