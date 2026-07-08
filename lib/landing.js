'use strict';
// Landing page bundle: replaces several tiny module scripts to avoid request waterfalls.
// D-day 로직은 lib/dday.js 에서 import (단일 진실 소스).
import { getDdayInfo } from './dday.js';
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
    const nav = document.querySelector('.site-header__inner .header-nav');
    if (nav && !nav.querySelector('.dday-chip')) {
      const chip = document.createElement('a');
      chip.className = 'dday-chip';
      chip.href = '/';
      chip.title = info.full + ` (${info.targetLabel})`;
      chip.innerHTML = '<span class="dday-chip__label">수능</span><span class="dday-chip__value">' + esc(info.label) + '</span>';
      nav.appendChild(chip);
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

  async function mountNextExam() {
    const banner = document.getElementById('ddayBanner');
    if (!banner) return;
    try {
      const res = await fetch('data/calendar.json?v=20260612b');
      if (!res.ok) return;
      const near = nearestExam((await res.json()).events || []);
      if (!near) return;
      const sub = document.createElement('a');
      sub.href = 'calendar.html';
      sub.className = 'dday-line__next';
      const label = near.diff === 0 ? 'D-DAY' : (near.diff > 0 ? `D-${near.diff}` : `D+${-near.diff}`);
      sub.innerHTML = `다음 시험 — ${esc(near.event.title)} <strong>${esc(label)}</strong>`;
      banner.querySelector('.dday-line')?.appendChild(sub);
    } catch {}
  }

  function recentChipsHTML() {
    let list = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (Array.isArray(parsed)) list = parsed.filter(e => e && Number.isInteger(e.id));
    } catch {}
    if (!list.length) return '';
    const items = list.slice(0, 4).map(e => {
      const label = e.sub ? `${e.sub} ${e.title}` : (e.title || '시험');
      return `<a href="exam-${e.id}.html" class="recent-chip">${esc(label)}</a>`;
    }).join('');
    return `<div class="recent-row" aria-label="최근 본 시험"><span class="recent-row__label">최근 본 시험</span><div class="recent-row__chips">${items}</div></div>`;
  }

  async function mountSummary() {
    const recentEl = document.getElementById('recentMount');
    const countEl = document.getElementById('trustExamCount');
    const updateEl = document.getElementById('trustUpdateDate');
    const recentHtml = recentChipsHTML();
    if (recentEl && recentHtml) recentEl.innerHTML = recentHtml;

    try {
      const res = await fetch('data/site-summary.json?v=20260704a');
      if (!res.ok) return;
      const summary = await res.json();
      if (recentEl && !recentHtml && Array.isArray(summary.recentUpdates)) {
        const items = summary.recentUpdates.slice(0, 4).map(e =>
          `<a href="exam-${e.id}.html" class="recent-chip">${esc(e.label || e.title || '시험')}</a>`
        ).join('');
        if (items) recentEl.innerHTML = `<div class="recent-row" aria-label="최근 업데이트"><span class="recent-row__label">최근 업데이트</span><div class="recent-row__chips">${items}</div></div>`;
      }
      if (countEl && Number.isInteger(summary.count)) countEl.textContent = summary.count.toLocaleString('ko-KR');
      if (updateEl && summary.updateLabel) updateEl.textContent = summary.updateLabel;
    } catch {}
  }

  function init() {
    mountPlaceholder();
    mountDday();
    mountNextExam();
    mountSummary();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
