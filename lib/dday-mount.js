'use strict';
// D-day mount — 헤더 nav 우측 칩 + 메인 hero 위 큰 배지.

import { getDdayInfo } from './dday.js';

function mountHeaderChip() {
  // 모든 페이지 site-header 안에 추가
  const nav = document.querySelector('.site-header__inner .header-nav');
  if (!nav) return;
  if (nav.querySelector('.dday-chip')) return;
  const info = getDdayInfo();
  const chip = document.createElement('a');
  chip.className = 'dday-chip';
  chip.href = '/';
  chip.title = info.full + ` (${info.targetLabel})`;
  chip.innerHTML = `
    <span class="dday-chip__label">수능</span>
    <span class="dday-chip__value">${info.label}</span>
  `;
  nav.appendChild(chip);
}

function mountLandingBanner() {
  const slot = document.getElementById('ddayBanner');
  if (!slot) return;
  const info = getDdayInfo();
  slot.innerHTML = `
    <div class="dday-banner__inner">
      <span class="dday-banner__label">${info.gradeYear}학년도 수능</span>
      <span class="dday-banner__value">${info.label}</span>
      <span class="dday-banner__date">${info.targetLabel} (${weekdayKo(info.target)})</span>
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
