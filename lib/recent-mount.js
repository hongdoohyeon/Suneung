'use strict';
// 메인 페이지 등에 "최근 본 시험" chip 자동 mount.
// 컨테이너 #recentMount 가 있으면 채움, 없으면 no-op.

import { recentChipsHTML } from './recent.js';

function mount() {
  const el = document.getElementById('recentMount');
  if (!el) return;
  const html = recentChipsHTML();
  if (html) el.innerHTML = html;
}

if (document.readyState !== 'loading') mount();
else document.addEventListener('DOMContentLoaded', mount);
