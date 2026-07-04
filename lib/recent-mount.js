'use strict';
// 메인 페이지 — "최근 본 시험" chip + trust 신호 mount.
// recent 비어있으면 "최근 업데이트" fallback. 홈에서는 경량 summary만 fetch.

import { recentChipsHTML, recentUpdatesHTML, trustStats } from './recent.js?v=20260704a';

function fmtCount(n) {
  return n.toLocaleString('ko-KR');
}

async function mount() {
  const recentEl = document.getElementById('recentMount');
  if (recentEl) {
    const html = recentChipsHTML();
    if (html) {
      recentEl.innerHTML = html;
    } else {
      const fallback = await recentUpdatesHTML(4);
      if (fallback) recentEl.innerHTML = fallback;
    }
  }

  const countEl = document.getElementById('trustExamCount');
  const updateEl = document.getElementById('trustUpdateDate');
  if (countEl || updateEl) {
    const { count, updateLabel } = await trustStats();
    if (countEl && count != null) countEl.textContent = fmtCount(count);
    if (updateEl && updateLabel)  updateEl.textContent = updateLabel;
  }
}

if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
