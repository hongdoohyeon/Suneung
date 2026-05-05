'use strict';
// 등급 분포 SVG (정규분포 envelope) + 실제 KICE 도수분포 SVG.
// exam.html / exam-{id}.html 의 #gradeDistBody 에 주입.

import { $ } from './dom.js';

// 누적 백분율 4·11·23·40·60·77·89·96 의 표준정규 z-score (1→8 등급 컷)
export const GRADE_Z = [1.751, 1.227, 0.739, 0.253, -0.253, -0.739, -1.227, -1.751];

// 9 등급 분포 SVG — 등급컷만 알고 분포 모를 때 envelope 추정.
// viewBox 640×300, 폰트 24/28 — 모바일 360px viewport에서도 가독.
export function gradeDistSVG(rawCuts, fullScore) {
  const W = 640, H = 300;
  const PAD_X = 28, PAD_TOP = 22, PAD_BOTTOM = 130;
  const innerW = W - 2 * PAD_X;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const baseY  = PAD_TOP + innerH;
  const Z_RANGE = 2.4;

  // 1등급(고성취) = 왼쪽. z 부호 뒤집어 x 매핑.
  const xOf = z => PAD_X + ((-z + Z_RANGE) / (2 * Z_RANGE)) * innerW;
  const pdf = z => Math.exp(-z * z / 2);

  const zBounds = [Z_RANGE, ...GRADE_Z, -Z_RANGE];
  const gradeOf = z => {
    for (let g = 1; g <= 9; g++) {
      if (z <= zBounds[g - 1] && z > zBounds[g]) return g;
    }
    return 9;
  };

  const N_BARS = 36;
  const slot = innerW / N_BARS;
  const gap = 1.6;
  const barW = slot - gap;

  const maxPdf = pdf(0);
  const heightOf = z => (pdf(z) / maxPdf) * innerH * 0.96;

  let bars = '';
  for (let i = 0; i < N_BARS; i++) {
    const zCenter = Z_RANGE - ((i + 0.5) / N_BARS) * (2 * Z_RANGE);
    const h = heightOf(zCenter);
    const x = PAD_X + i * slot + gap / 2;
    const g = gradeOf(zCenter);
    const hh = Math.max(h, 1.5);
    bars += `<rect x="${x.toFixed(1)}" y="${(baseY - hh).toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}" class="grade-dist__bar grade-dist__bar--g${g}" rx="1"/>`;
  }

  const baseLine = `<line x1="${PAD_X}" y1="${baseY.toFixed(1)}" x2="${W - PAD_X}" y2="${baseY.toFixed(1)}" class="grade-dist__baseline"/>`;
  const ticks = GRADE_Z.map(z => {
    const x = xOf(z).toFixed(1);
    return `<line x1="${x}" y1="${baseY.toFixed(1)}" x2="${x}" y2="${(baseY + 4).toFixed(1)}" class="grade-dist__tick"/>`;
  }).join('');

  const cutLabels = rawCuts.map((c, i) => {
    const x = xOf(GRADE_Z[i]).toFixed(1);
    const label = (c == null) ? '·' : c;
    return `<text x="${x}" y="${(baseY + 28).toFixed(1)}" class="grade-dist__cut">${label}</text>`;
  }).join('');

  const gradeNums = [];
  for (let g = 1; g <= 9; g++) {
    const zMid = (zBounds[g - 1] + zBounds[g]) / 2;
    const x = xOf(zMid).toFixed(1);
    const y = (baseY + 70).toFixed(1);
    gradeNums.push(`<text x="${x}" y="${y}" class="grade-dist__num grade-dist__num--g${g}">${g}</text>`);
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" class="grade-dist__svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="등급별 원점수 컷 분포">
      ${bars}
      ${baseLine}
      ${ticks}
      ${cutLabels}
      ${gradeNums.join('')}
    </svg>
    <p class="grade-dist__legend">등급별 원점수 컷${fullScore ? ` · 만점 ${fullScore}점` : ''}</p>
  `;
}

// 실제 KICE 도수분포 → SVG (표점 도수분포 dict { score: { male, female } } 입력)
export function realDistSVG(distribution) {
  const entries = Object.entries(distribution)
    .map(([k, v]) => ({ std: Number(k), n: (v.male ?? 0) + (v.female ?? 0) }))
    .filter(d => Number.isFinite(d.std) && d.n >= 0)
    .sort((a, b) => a.std - b.std);
  if (entries.length === 0) return '';
  const W = 640, H = 220, PAD_X = 28, PAD_TOP = 22, PAD_BOTTOM = 60;
  const innerW = W - 2 * PAD_X;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const baseY = PAD_TOP + innerH;
  const minS = entries[0].std, maxS = entries[entries.length - 1].std;
  const xOf = s => PAD_X + ((s - minS) / Math.max(1, maxS - minS)) * innerW;
  const maxN = Math.max(...entries.map(d => d.n));
  const hOf = n => (n / maxN) * innerH * 0.96;
  const slot = innerW / entries.length;
  const barW = Math.max(1, slot - 1.4);
  const bars = entries.map(d => {
    const h = hOf(d.n);
    const x = xOf(d.std) - barW / 2;
    return `<rect x="${x.toFixed(2)}" y="${(baseY - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="var(--pop)" opacity="0.78"/>`;
  }).join('');
  const baseLine = `<line x1="${PAD_X}" y1="${baseY}" x2="${W - PAD_X}" y2="${baseY}" stroke="var(--line-strong)" stroke-width="1"/>`;
  const ticks = [minS, Math.round((minS + maxS) / 2), maxS].map(s =>
    `<text x="${xOf(s)}" y="${baseY + 16}" text-anchor="middle" fill="var(--ink-3)" font-size="11">${s}</text>`).join('');
  return `<svg class="grade-dist" viewBox="0 0 ${W} ${H}" role="img" aria-label="실제 도수분포">
    ${bars}${baseLine}${ticks}
  </svg>
  <p class="grade-dist__legend">실제 도수분포 · 출처 KICE</p>`;
}

// 등급 분포 카드 본문 렌더 — 실 도수분포 우선, 없으면 정규분포 envelope.
// 반환값: 등급컷이 있어 분포를 렌더했으면 cut 객체 (빠답 채점기에서 재사용용), 없으면 null.
export function renderGradeDist(exam, allCuts, distData) {
  const body = $('gradeDistBody');
  const hint = $('gradeDistHint');

  // (1) 실제 도수분포 데이터 매칭 (KICE 공식)
  if (Array.isArray(distData)) {
    const real = distData.find(d =>
      Number(d.year) === Number(exam.gradeYear) &&
      d.type === exam.type &&
      d.subject === exam.subject &&
      (d.subSubject ?? null) === (exam.subSubject ?? null)
    );
    if (real?.distribution) {
      if (hint) hint.textContent = '실제 도수분포 (KICE)';
      body.innerHTML = realDistSVG(real.distribution);
      return null;
    }
  }

  // (2) 등급컷 기반 정규분포 추정 (envelope)
  const cut = allCuts.find(c =>
    c.curriculum === exam.curriculum &&
    String(c.gradeYear) === String(exam.gradeYear) &&
    c.type === exam.type &&
    c.subject === exam.subject &&
    (c.subSubject ?? null) === (exam.subSubject ?? null)
  );
  const hasRaw = cut && Array.isArray(cut.rawCuts) && cut.rawCuts.some(v => v != null);
  if (!hasRaw) {
    if (hint) hint.textContent = '준비 중';
    body.innerHTML = `<p class="exam-card__sub">이 시험의 원점수 등급컷 데이터가 아직 없어요.</p>`;
    return null;
  }

  if (hint) hint.textContent = `1등급 컷 ${cut.rawCuts[0]}점${cut.absolute ? ' · 절대평가' : ''}`;
  body.innerHTML = gradeDistSVG(cut.rawCuts, cut.fullScore ?? 100);
  return cut;
}
