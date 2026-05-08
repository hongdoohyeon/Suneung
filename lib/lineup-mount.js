'use strict';
// gradecut 결과 화면 아래 정시 모의지원 라인 섹션 마운트.
// gradecut.js 의 entries(영역별 점수·등급·pct) 가 들어오면 라인 산정 후 카드 리스트 렌더.

import { buildLineup, loadAdmissionsData } from './lineup.js?v=20260508n';

const STATE = { mode: 'all', year: '2025', filters: new Set(['safe','fit','aim']) };

// 사용 가능한 학년도 — manual-results.json 에서 동적 추출 (mountLineup 시점).
let AVAILABLE_YEARS = ['2025'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function ensureSection() {
  let sec = document.getElementById('lineupSection');
  if (sec) return sec;
  const totalCard = document.getElementById('gcTotalCard');
  if (!totalCard) return null;
  sec = document.createElement('section');
  sec.id = 'lineupSection';
  sec.className = 'lineup-section';
  sec.style.display = 'none';
  sec.innerHTML = `
    <header class="lineup-section__head">
      <div>
        <h3 class="lineup-section__title">정시 모의지원 라인</h3>
        <p class="lineup-section__sub">반영비율과 70%컷(백분위)을 비교한 참고선입니다. 실제 환산점수와는 차이가 있을 수 있습니다.</p>
      </div>
      <div class="lineup-section__year">
        <select id="lineupYear" aria-label="기준 학년도"></select>
      </div>
    </header>

    <div class="lineup-controls">
      <div class="lineup-modes" role="tablist" aria-label="진로 선택">
        <button class="lineup-mode is-active" data-mode="all"        type="button" role="tab" aria-selected="true">전체</button>
        <button class="lineup-mode"           data-mode="humanities" type="button" role="tab" aria-selected="false">인문·사회</button>
        <button class="lineup-mode"           data-mode="natural"    type="button" role="tab" aria-selected="false">자연·공학·의약</button>
      </div>
      <input id="lineupSearch" class="lineup-search" type="search" placeholder="학교/학과 검색" aria-label="학교 또는 학과 검색"/>
    </div>

    <div class="lineup-summary" id="lineupSummary"></div>

    <div class="lineup-filters" id="lineupFilters">
      <button class="lineup-filter is-active" data-line="safe"  type="button"><span class="lineup-dot" style="background:#1a8a3a"></span>안정</button>
      <button class="lineup-filter is-active" data-line="fit"   type="button"><span class="lineup-dot" style="background:#0a6cb4"></span>적정</button>
      <button class="lineup-filter is-active" data-line="aim"   type="button"><span class="lineup-dot" style="background:#c84d1f"></span>소신</button>
      <button class="lineup-filter"           data-line="risky" type="button"><span class="lineup-dot" style="background:#888"></span>지원 어려움</button>
    </div>

    <div class="lineup-list" id="lineupList"></div>

    <details class="lineup-note">
      <summary>산정 기준과 한계</summary>
      <ul>
        <li>환산값 = <strong>국어·수학·탐구 백분위</strong>에 학교 반영비율을 적용한 가중평균.</li>
        <li>영어·한국사는 학교마다 환산 단위(절대평가→점수)가 천차만별이라 가중평균에서 제외 — 사용자가 5등급 이하면 실제 환산은 표시값보다 낮을 수 있습니다.</li>
        <li>2025학년도부터 일부 대학(72/99교)이 국·수·탐 컷을 <strong>각각 다른 학생의 점수</strong>로 공개 → 70%컷이 한 학생 평균이 아닌 경우 ±1~2 오차 가능.</li>
        <li>참고용 도구입니다. 실제 지원 전에는 어디가(adiga.kr)와 입학처 공식 환산 자료를 함께 확인하세요.</li>
      </ul>
    </details>
  `;
  totalCard.parentNode.insertBefore(sec, totalCard.nextSibling);

  // 학년도 select 옵션 채우기 (사용 가능한 데이터 기준, 최신 default)
  const yearSel = sec.querySelector('#lineupYear');
  yearSel.innerHTML = AVAILABLE_YEARS
    .map((y, i) => `<option value="${y}"${y === STATE.year ? ' selected' : ''}>${y}학년도 정시</option>`)
    .join('');

  // 이벤트 위임 — 한 번만 바인딩
  sec.querySelector('.lineup-modes').addEventListener('click', e => {
    const btn = e.target.closest('.lineup-mode');
    if (!btn) return;
    sec.querySelectorAll('.lineup-mode').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', b === btn);
    });
    STATE.mode = btn.dataset.mode;
    rerender();
  });
  sec.querySelector('#lineupFilters').addEventListener('click', e => {
    const btn = e.target.closest('.lineup-filter');
    if (!btn) return;
    const k = btn.dataset.line;
    if (STATE.filters.has(k)) STATE.filters.delete(k);
    else STATE.filters.add(k);
    btn.classList.toggle('is-active', STATE.filters.has(k));
    rerender();
  });
  sec.querySelector('#lineupYear').addEventListener('change', e => {
    STATE.year = e.target.value;
    rerender();
  });
  sec.querySelector('#lineupSearch').addEventListener('input', () => rerender());

  return sec;
}

let _lastEntries = null;
async function rerender() {
  if (!_lastEntries) return;
  await render(_lastEntries);
}

function summaryHTML(rows, areas, missingAreas) {
  const counts = { safe: 0, fit: 0, aim: 0, risky: 0 };
  rows.forEach(r => counts[r.line.key]++);

  const areaParts = [];
  if (areas.korean != null) areaParts.push(`국어 ${areas.korean.toFixed(1)}`);
  if (areas.math   != null) areaParts.push(`수학 ${areas.math.toFixed(1)}`);
  if (areas.tamgu  != null) areaParts.push(`탐구 ${areas.tamgu.toFixed(1)}`);
  if (areas.englishGrade  != null) areaParts.push(`영어 ${areas.englishGrade}등급`);
  if (areas.hanguksaGrade != null) areaParts.push(`한국사 ${areas.hanguksaGrade}등급`);

  const missing = missingAreas.length
    ? `<p class="lineup-summary__missing">⚠ ${esc(missingAreas.join('·'))} 미입력 — 결과가 부정확할 수 있습니다.</p>`
    : '';

  return `
    <div class="lineup-summary__row">
      <span class="lineup-summary__label">내 백분위</span>
      <span class="lineup-summary__values">${areaParts.map(esc).join(' · ') || '입력 없음'}</span>
    </div>
    <div class="lineup-summary__counts">
      <span class="lineup-count" data-line="safe"><strong>${counts.safe}</strong> 안정</span>
      <span class="lineup-count" data-line="fit"><strong>${counts.fit}</strong> 적정</span>
      <span class="lineup-count" data-line="aim"><strong>${counts.aim}</strong> 소신</span>
      <span class="lineup-count" data-line="risky"><strong>${counts.risky}</strong> 어려움</span>
    </div>
    ${missing}
  `;
}

function rowHTML(r) {
  const diffSign = r.diff >= 0 ? '+' : '';
  const hints = [];
  if (r.hasEnglishPenalty)  hints.push('영어 별도 가/감점');
  if (r.hasHanguksaPenalty) hints.push('한국사 별도 감점');
  const hint = hints.length ? `<span class="lineup-row__adj">${esc(hints.join(' · '))} — 환산값 외 추가 적용</span>` : '';
  return `
    <div class="lineup-row" data-line="${r.line.key}">
      <div class="lineup-row__main">
        <span class="lineup-row__line" style="background:${r.line.color}1a;color:${r.line.color}">${esc(r.line.label)}</span>
        <div class="lineup-row__title">
          <span class="lineup-row__school">${esc(r.school)}</span>
          <span class="lineup-row__unit">${esc(r.unit)}</span>
        </div>
      </div>
      <div class="lineup-row__nums">
        <span class="lineup-row__pct">
          <strong>${r.userScore.toFixed(1)}</strong>
          <em>vs 70%컷 ${r.pct70.toFixed(1)}</em>
        </span>
        <span class="lineup-row__diff" style="color:${r.line.color}">${diffSign}${r.diff.toFixed(1)}</span>
      </div>
      ${hint}
    </div>
  `;
}

export async function mountLineup(entries) {
  _lastEntries = entries;
  // 데이터에서 사용 가능한 학년도 추출 (가장 큰 값 default)
  if (AVAILABLE_YEARS.length === 1) {
    try {
      const data = await loadAdmissionsData();
      if (data) {
        const set = new Set();
        for (const slug of Object.keys(data.results)) {
          if (slug.startsWith('_')) continue;
          const v = data.results[slug];
          if (v && typeof v === 'object') {
            for (const k of Object.keys(v)) {
              if (/^\d{4}$/.test(k)) set.add(k);
            }
          }
        }
        if (set.size > 0) {
          AVAILABLE_YEARS = [...set].sort().reverse();
          STATE.year = AVAILABLE_YEARS[0];
        }
      }
    } catch {}
  }
  const sec = ensureSection();
  if (!sec) return;
  if (!entries || entries.length === 0) {
    sec.style.display = 'none';
    return;
  }
  await render(entries);
}

async function render(entries) {
  const sec = document.getElementById('lineupSection');
  if (!sec) return;

  const result = await buildLineup(entries, { mode: STATE.mode, year: STATE.year });
  if (!result) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';

  const { rows, areas, missingAreas } = result;
  document.getElementById('lineupSummary').innerHTML = summaryHTML(rows, areas, missingAreas);

  const q = (document.getElementById('lineupSearch')?.value || '').trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (!STATE.filters.has(r.line.key)) return false;
    if (!q) return true;
    return r.school.toLowerCase().includes(q) || (r.unit || '').toLowerCase().includes(q);
  });

  const list = document.getElementById('lineupList');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="lineup-empty">조건에 맞는 학과가 없습니다.</div>`;
    return;
  }
  list.innerHTML = filtered.map(rowHTML).join('');
}
