'use strict';
import { $, escHtml } from './lib/dom.js';
import { applySeo } from './lib/seo.js';
import { renderAllAdSlots } from './lib/ads.js';

const TAG_BG = {
  '사이트':   '#e6f0fa',
  '데이터':   '#ecf5e8',
  '입시':     '#fdf3e7',
  '버그':     '#fbeaea',
};
const TAG_FG = {
  '사이트':   '#0066cc',
  '데이터':   '#2a7a2a',
  '입시':     '#8f5610',
  '버그':     '#aa1a1a',
};

function fmtDate(s) {
  // 2026-05-04 → 2026.05.04
  return String(s ?? '').replaceAll('-', '.');
}

function entryHTML(it) {
  const bg = TAG_BG[it.tag] ?? '#eef1f4';
  const fg = TAG_FG[it.tag] ?? '#475569';
  return `
    <li class="patchnotes__entry">
      <header class="patchnotes__entry-head">
        <time class="patchnotes__date" datetime="${escHtml(it.date)}">${escHtml(fmtDate(it.date))}</time>
        ${it.tag ? `<span class="chiplet chiplet--type" style="--chip-bg:${bg};--chip-color:${fg};">${escHtml(it.tag)}</span>` : ''}
      </header>
      <h2 class="patchnotes__entry-title">${escHtml(it.title)}</h2>
      ${it.summary ? `<p class="patchnotes__entry-summary">${escHtml(it.summary)}</p>` : ''}
      ${it.body ? `<p class="patchnotes__entry-body">${escHtml(it.body)}</p>` : ''}
    </li>
  `;
}

async function main() {
  applySeo({
    title: '입시패치노트 — 기출해체분석기',
    description: '사이트 업데이트와 평가원·교육청 입시 변경사항 기록.',
    url: location.href,
    jsonLdId: 'jsonld-patchnotes',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: '입시패치노트',
      url: location.href,
      inLanguage: 'ko',
      isPartOf: { '@type': 'WebSite', name: '기출해체분석기',
                  url: 'https://kicegg.com/' },
    },
  });

  const list = $('patchnotesList');
  let entries = [];
  try {
    const res = await fetch('data/patchnotes.json', { cache: 'no-cache' });
    if (res.ok) entries = await res.json();
  } catch { /* fall-through */ }

  if (!Array.isArray(entries) || entries.length === 0) {
    list.innerHTML = `<li class="patchnotes__empty">아직 게시물이 없어요.</li>`;
    return;
  }
  // 날짜 내림차순 (가장 최근 위)
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  list.innerHTML = entries.map(entryHTML).join('');
}

main();

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
