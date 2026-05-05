'use strict';
// 정시 라인업 매칭 — 사용자 평균 백분위 → 가능 라인 (안정/적정/도전).
// 데이터: data/lines.json (입시 라인 추정값, 학과별 차이 큼).
// 정확한 합격선은 adiga.kr에서 확인.

let _linesPromise = null;
async function loadLines() {
  if (!_linesPromise) {
    _linesPromise = fetch('data/lines.json')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }
  return _linesPromise;
}

// 사용자의 "평균 상위 백분율" (작을수록 좋음, 1등급=상위~4%)을
// 일반 입시 표기 "백분위" (클수록 좋음, 99=상위 1%) 로 변환.
function topPctToPercentile(topPct) {
  return Math.max(0, Math.min(100, 100 - topPct));
}

// avgTopPct (= 평균 상위 백분율) → 라인별 분류.
// percentileCut 이상이면 가능, +1.5 이상이면 안정, -1.5 이내면 도전.
export async function matchLines(avgTopPct) {
  const data = await loadLines();
  if (!data) return null;
  const myPercentile = topPctToPercentile(avgTopPct);

  const result = data.lines.map(line => {
    const diff = myPercentile - line.percentileCut;
    let band;
    if (diff >= 1.5) band = 'safe';        // 안정
    else if (diff >= -1.5) band = 'reach'; // 적정
    else if (diff >= -4)  band = 'aim';    // 도전
    else                  band = 'far';    // 어려움

    // 해당 라인의 대학 리스트
    const universities = data.universities
      .filter(u => u.lines.includes(line.key))
      .map(u => u.name);

    return {
      ...line,
      myPercentile,
      diff,
      band,
      universities,
    };
  });

  return { lines: result, meta: data._meta, myPercentile };
}

// adiga 정밀 분석 deep link — 점수환산 페이지 (로그인 필요하지만 사용자 측 OK).
export const ADIGA_URL = 'https://www.adiga.kr/sco/agu/univScoScaAnlsView.do?menuId=PCSCOAGU2000';

// 라인업 카드 HTML 생성.
export function renderLineupHTML(matched) {
  if (!matched) return '';
  const { lines, meta, myPercentile } = matched;

  const bandLabels = {
    safe:  { label: '안정', cls: 'lineup-row--safe',  emoji: '🟢' },
    reach: { label: '적정', cls: 'lineup-row--reach', emoji: '🟡' },
    aim:   { label: '도전', cls: 'lineup-row--aim',   emoji: '🟠' },
    far:   { label: '거리', cls: 'lineup-row--far',   emoji: '⚪️' },
  };

  // 안정·적정·도전만 표시 (far는 접어두기)
  const visible = lines.filter(l => l.band !== 'far')
    .sort((a, b) => b.percentileCut - a.percentileCut);

  if (visible.length === 0) {
    return `
      <div class="lineup">
        <header class="lineup__head">
          <h3 class="lineup__title">정시 라인업 (참고용)</h3>
          <span class="lineup__hint">평균 백분위 ${myPercentile.toFixed(1)}</span>
        </header>
        <p class="lineup__empty">현재 점수로 매칭되는 라인이 없어요. 추가 영역 입력 후 다시 확인해 보세요.</p>
      </div>`;
  }

  const rows = visible.map(l => {
    const b = bandLabels[l.band];
    const top3 = (l.universities || []).slice(0, 6).join(' · ');
    const more = l.universities.length > 6 ? ` 외 ${l.universities.length - 6}곳` : '';
    return `
      <div class="lineup-row ${b.cls}">
        <div class="lineup-row__head">
          <span class="lineup-row__band">${b.emoji} ${b.label}</span>
          <span class="lineup-row__line">${escHtml(l.label)}</span>
          <span class="lineup-row__cut">백분위 ${l.percentileCut}+</span>
        </div>
        <div class="lineup-row__sub">${escHtml(l.sub)}</div>
        <div class="lineup-row__unis">${escHtml(top3)}${escHtml(more)}</div>
      </div>`;
  }).join('');

  return `
    <div class="lineup">
      <header class="lineup__head">
        <h3 class="lineup__title">정시 라인업 (참고용)</h3>
        <span class="lineup__hint">평균 백분위 <strong>${myPercentile.toFixed(1)}</strong></span>
      </header>
      <div class="lineup__rows">${rows}</div>
      <footer class="lineup__foot">
        <p class="lineup__disclaimer">
          ※ 입시 학원 라인표 기반 추정값. <strong>학과별 차이 큼</strong>
          (의·치·한·약·수의 + 컴공·전자공 등 인기 학과는 동일 대학에서도 라인↑).
          정확한 합격선은
          <a href="${ADIGA_URL}" target="_blank" rel="noopener">대학어디가</a>에서 확인하세요.
        </p>
      </footer>
    </div>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
