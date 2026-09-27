'use strict';
// Landing page bundle: replaces several tiny module scripts to avoid request waterfalls.
// D-day 로직은 lib/dday.js 에서 import (단일 진실 소스).
import { getDdayInfo } from './dday.js?v=f8f6a1e70391dec98cef';
import { renderAllAdSlots } from './ads.js?v=f8f6a1e70391dec98cef';
(function () {
  const RECENT_KEY = 'kicegg:recent-exams';
  const MOBILE_MQ = '(max-width: 600px)';

  // Dynamic values interpolated into HTML templates are escaped via esc();
  // the remaining tags/classes are static site markup.
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function mountDday() {
    const info = getDdayInfo();
    const nav = document.querySelector('.site-header .header-tools');
    if (nav && !nav.querySelector('.dday-chip')) {
      const chip = document.createElement('a');
      chip.className = 'dday-chip';
      chip.href = 'calendar.html';
      chip.title = info.full + ` (${info.targetLabel})`;
      chip.innerHTML = '<span class="dday-chip__label">수능</span><span class="dday-chip__value">' + esc(info.label) + '</span>';
      nav.insertBefore(chip, nav.querySelector('.theme-toggle'));
    }
    const slot = document.getElementById('ddayBanner');
    if (slot) {
      const weekday = ['일', '월', '화', '수', '목', '금', '토'][info.target.getDay()] + '요일';
      slot.innerHTML = `
        <div class="dday-line">
          <span class="dday-line__label">${esc(info.gradeYear)}학년도 수능</span>
          <span class="dday-line__sep">·</span>
          <span class="dday-line__value">${esc(info.label)}</span>
          <span class="dday-line__sep">·</span>
          <span class="dday-line__date">${esc(info.targetLabel)} (${weekday})</span>
        </div>`;
    }
  }

  function applyPlaceholder(inp) {
    const desktop = inp.dataset.placeholderDesktop ?? inp.placeholder;
    const mobile = inp.dataset.placeholderMobile ?? desktop;
    inp.placeholder = window.matchMedia(MOBILE_MQ).matches ? mobile : desktop;
  }

  function mountPlaceholder() {
    const inputs = document.querySelectorAll('input[data-placeholder-mobile]');
    for (const inp of inputs) {
      if (!inp.dataset.placeholderDesktop) inp.dataset.placeholderDesktop = inp.placeholder;
      applyPlaceholder(inp);
    }
    if (inputs.length) {
      window.addEventListener('resize', () => inputs.forEach(applyPlaceholder), { passive: true });
    }
  }

  function parseDate(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dayDiff(target, today) {
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((parseDate(target) - base) / 86400000);
  }

  function eventDates(ev) {
    if (ev.date) return [ev.date];
    if (ev.dateRange) return [ev.dateRange[0], ev.dateRange[1]];
    return [];
  }

  function nearestExam(events, today = new Date()) {
    let best = null;
    for (const ev of events.filter(e => e.type === 'exam')) {
      for (const d of eventDates(ev)) {
        const diff = dayDiff(d, today);
        if (diff < 0) continue;
        if (!best || diff < best.diff) best = { event: ev, date: d, diff };
      }
    }
    return best;
  }

  function examLabel(diff) {
    return diff === 0 ? 'D-DAY' : `D-${diff}`;
  }

  function mdLabel(d) {
    const dt = parseDate(d);
    const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
    return `${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')} (${wd})`;
  }

  function upcomingExams(events, today = new Date(), limit = 3) {
    const out = [];
    for (const ev of events.filter(e => e.type === 'exam')) {
      const d = eventDates(ev)[0];
      if (!d) continue;
      const diff = dayDiff(d, today);
      if (diff >= 0) out.push({ event: ev, date: d, diff });
    }
    return out.sort((a, b) => a.diff - b.diff).slice(0, limit);
  }

  async function mountUpcoming() {
    const banner = document.getElementById('ddayBanner');
    const list = document.getElementById('upcomingMount');
    try {
      const res = await fetch('data/calendar.json?v=f8f6a1e70391dec98cef');
      if (!res.ok) throw new Error('calendar');
      const events = (await res.json()).events || [];
      const near = nearestExam(events);
      if (banner && near) {
        const sub = document.createElement('a');
        sub.href = 'calendar.html';
        sub.className = 'dday-line__next';
        sub.innerHTML = `다음 시험 ${esc(near.event.title)} <strong>${esc(examLabel(near.diff))}</strong>`;
        banner.querySelector('.dday-line')?.appendChild(sub);
      }
      if (list) {
        const rows = upcomingExams(events);
        list.innerHTML = rows.length
          ? rows.map(r => `<a href="calendar.html"><span class="list-card__dd">${esc(examLabel(r.diff))}</span><span class="list-card__t">${esc(r.event.title)}</span><span class="list-card__s">${esc(mdLabel(r.date))}</span></a>`).join('')
          : '<p class="list-card__empty">예정된 시험이 없어요.</p>';
      }
    } catch {
      if (list) list.innerHTML = '<p class="list-card__empty"><a href="calendar.html">학사 일정</a>에서 확인하세요.</p>';
    }
  }

  function readRecent() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(e => e && Number.isInteger(e.id)) : [];
    } catch { return []; }
  }

  function mountRecent() {
    const el = document.getElementById('recentMount');
    const clear = document.getElementById('recentClear');
    if (!el) return;
    const list = readRecent().slice(0, 4);
    if (!list.length) return;
    el.innerHTML = list.map(e =>
      `<a href="exam-${e.id}.html"><span class="list-card__t">${esc(e.title || '시험')}</span><span class="list-card__s">${esc(e.sub || '')}</span></a>`
    ).join('');
    if (clear) {
      clear.hidden = false;
      clear.addEventListener('click', () => {
        try { localStorage.removeItem(RECENT_KEY); } catch {}
        el.innerHTML = '<p class="list-card__empty">최근 본 시험 기록을 지웠어요.</p>';
        clear.hidden = true;
      }, { once: true });
    }
  }

  async function mountSummary() {
    const countEl = document.getElementById('trustExamCount');
    try {
      const res = await fetch('data/site-summary.json?v=f8f6a1e70391dec98cef');
      if (!res.ok) return;
      const summary = await res.json();
      if (countEl && Number.isInteger(summary.archiveCount)) countEl.textContent = `${summary.archiveCount.toLocaleString('ko-KR')}건`;
    } catch {}
  }

  function init() {
    mountPlaceholder();
    mountDday();
    mountUpcoming();
    mountRecent();
    mountSummary();
    renderAllAdSlots();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
