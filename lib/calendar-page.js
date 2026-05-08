// calendar.html 전용 — 월간 grid + 일정 list 렌더.
import { loadCalendar, eventsInMonth, nearestExam, ddayLabel, eventColor, eventDateLabel } from './calendar.js?v=20260508a';

const $ = (id) => document.getElementById(id);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

let EVENTS = null;
let viewYear, viewMonth; // 현재 보고 있는 (year, month)

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function renderGrid() {
  $('monthLabel').textContent = `${viewYear}년 ${viewMonth}월`;
  const monthEvents = eventsInMonth(EVENTS, viewYear, viewMonth);
  const dayMap = {};
  for (const ev of monthEvents) {
    const dates = ev.date ? [ev.date] : [ev.dateRange[0], ev.dateRange[1]];
    for (const d of dates) {
      if (!d.startsWith(`${viewYear}-${String(viewMonth).padStart(2,'0')}`)) continue;
      const day = parseInt(d.slice(8, 10), 10);
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(ev);
    }
  }

  const firstDay = new Date(viewYear, viewMonth - 1, 1);
  const startOffset = firstDay.getDay();
  const lastDay = new Date(viewYear, viewMonth, 0).getDate();

  const today = new Date();
  const isCurMonth = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth;
  const todayDate = today.getDate();

  let html = '';
  for (const w of WEEKDAYS) html += `<div class="cal-h">${w}</div>`;
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-cell cal-cell--empty"></div>';
  for (let d = 1; d <= lastDay; d++) {
    const events = dayMap[d] || [];
    const isToday = isCurMonth && d === todayDate ? 'cal-cell--today' : '';
    const dots = events.slice(0, 4).map(e =>
      `<span class="cal-dot" style="background:${eventColor(e)}" title="${escHtml(e.title)}"></span>`
    ).join('');
    html += `
      <div class="cal-cell ${isToday}">
        <div class="cal-day">${d}</div>
        <div class="cal-dots">${dots}${events.length > 4 ? `<span class="cal-more">+${events.length - 4}</span>` : ''}</div>
      </div>`;
  }
  $('calendar').innerHTML = html;

  // 이번 달 list
  const list = monthEvents.map(ev => `
    <li class="cal-item" style="border-left-color:${eventColor(ev)}">
      <div class="cal-item__date">${eventDateLabel(ev)}</div>
      <div class="cal-item__body">
        <div class="cal-item__title">${escHtml(ev.title)}</div>
        ${ev.org ? `<div class="cal-item__sub">${escHtml(ev.org)}</div>` : ''}
      </div>
    </li>
  `).join('') || '<li class="cal-empty">이번 달 일정 없음.</li>';
  $('monthList').innerHTML = list;
}

function renderUpcoming() {
  // 오늘 이후 가까운 6개 일정
  const today = new Date();
  const t0 = today.getTime();
  const upcoming = EVENTS
    .map(ev => {
      const d = ev.date || (ev.dateRange && ev.dateRange[0]);
      if (!d) return null;
      const ms = (() => { const [y,m,dd] = d.split('-').map(Number); return new Date(y,m-1,dd).getTime(); })();
      return { ev, ms, dateStr: d };
    })
    .filter(x => x && x.ms >= t0 - 86400000)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 8);
  const html = upcoming.map(({ ev, ms, dateStr }) => {
    const diff = Math.floor((ms - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    return `
      <li class="cal-item" style="border-left-color:${eventColor(ev)}">
        <div class="cal-item__date">${eventDateLabel(ev)} <span class="cal-dday">${ddayLabel(diff)}</span></div>
        <div class="cal-item__body">
          <div class="cal-item__title">${escHtml(ev.title)}</div>
          ${ev.org ? `<div class="cal-item__sub">${escHtml(ev.org)}</div>` : ''}
        </div>
      </li>`;
  }).join('') || '<li class="cal-empty">예정된 일정 없음.</li>';
  $('upcomingList').innerHTML = html;
}

async function init() {
  try {
    EVENTS = await loadCalendar();
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth() + 1;
    renderGrid();
    renderUpcoming();
  } catch (e) {
    $('calendar').textContent = '캘린더 로드 실패: ' + e.message;
  }

  $('prevMonth').addEventListener('click', () => {
    viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; }
    renderGrid();
  });
  $('nextMonth').addEventListener('click', () => {
    viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; }
    renderGrid();
  });
  $('todayBtn').addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear(); viewMonth = t.getMonth() + 1;
    renderGrid();
  });
}

document.addEventListener('DOMContentLoaded', init);
