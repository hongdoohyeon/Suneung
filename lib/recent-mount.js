'use strict';
// 메인 페이지 — "최근 본 시험" chip 라인 자동 mount.
// 비어있으면 "최근 업데이트" fallback.

import { recentChipsHTML, recentUpdatesHTML } from './recent.js';

async function mount() {
  const el = document.getElementById('recentMount');
  if (!el) return;
  const html = recentChipsHTML();
  if (html) {
    el.innerHTML = html;
    return;
  }
  const fallback = await recentUpdatesHTML(4);
  if (fallback) el.innerHTML = fallback;
}

if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
