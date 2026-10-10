'use strict';
// D-day mount — 헤더 nav 우측 칩 + 메인 hero 인라인 텍스트.

import { getDdayInfo } from './dday.js?v=8ee9894f6d21ac181603';

function mountHeaderChip() {
  const nav = document.querySelector('.site-header .header-tools');
  if (!nav) return;
  if (nav.querySelector('.dday-chip')) return;
  const info = getDdayInfo();
  const chip = document.createElement('a');
  chip.className = 'dday-chip';
  chip.href = '/calendar.html';   // 404 처럼 하위 경로에서 열려도 맞게
  chip.title = info.full + ` (${info.targetLabel})`;
  chip.innerHTML = `
    <span class="dday-chip__label">수능</span>
    <span class="dday-chip__value">${info.label}</span>
  `;
  nav.insertBefore(chip, nav.querySelector('.theme-toggle'));
}

function mountLandingBanner() {
  const slot = document.getElementById('ddayBanner');
  if (!slot) return;
  const info = getDdayInfo();
  slot.innerHTML = `
    <div class="dday-line">
      <span class="dday-line__label">${info.gradeYear}학년도 수능</span>
      <span class="dday-line__sep">·</span>
      <span class="dday-line__value">${info.label}</span>
      <span class="dday-line__sep">·</span>
      <span class="dday-line__date">${info.targetLabel} (${weekdayKo(info.target)})</span>
    </div>`;
}

function weekdayKo(d) {
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일';
}

function init() {
  mountHeaderChip();
  mountLandingBanner();
}

if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
