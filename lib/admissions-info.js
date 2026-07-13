// 정시 반영비율 페이지 — ratios-lookup.json fetch + 학교 select + 학과 list 렌더.
import { escHtml, escAttr, safeUrl } from './dom.js';

const $ = (id) => document.getElementById(id);

const TIER_LABEL = {
  sky: 'SKY', ssh: '서성한', csis: '중경외시', kdh: '건동홍',
  ksu: '국숭세단', kmsg: '광명상가', ddw: '동덕덕성숙명',
  ist: '특성화(UNIST/GIST/DGIST)', medical: '의·치·한·약 특화',
  in_seoul_etc: '서울권 일반', metro_strong: '수도권 강세',
  national: '지방거점 국립 (메디컬만)', regional_med: '지방 메디컬',
};

const TIER_ORDER = [
  'sky', 'ssh', 'csis', 'kdh', 'ksu', 'kmsg', 'ddw',
  'in_seoul_etc', 'metro_strong', 'medical', 'ist',
  'national', 'regional_med', 'extra',
];

function tierRank(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx === -1 ? 99 : idx;
}

let LOOKUP = null;
let POLICIES = null;
let RESULTS = null;

const POLICY_LABEL = {
  math_pick: '수학 선택과목 (미적분/기하)',
  tamgu_bonus: '탐구 가산점',
  hanguksa_deduction: '한국사 감점',
  hanguksa_table: '한국사 등급별 환산',
  english_deduction: '영어 감점/환산',
  foreign_deduction: '제2외국어/한문 감점',
  compulsory_subject: '필수 응시 과목',
};

let MANUAL_RESULTS = null;

async function load() {
  try {
    const [r1, r2, r3, r4] = await Promise.all([
      fetch('data/admissions/ratios-lookup.json'),
      fetch('data/admissions/policies.json'),
      fetch('data/admissions/results.json'),
      fetch('data/admissions/manual-results.json'),
    ]);
    if (!r1.ok) throw new Error('lookup fetch failed');
    LOOKUP = (await r1.json()).lookup;
    POLICIES = r2.ok ? await r2.json() : {};
    RESULTS = r3.ok ? await r3.json() : {};
    MANUAL_RESULTS = r4.ok ? await r4.json() : {};
    populateSchools();
  } catch (e) {
    $('info').textContent = '데이터 로드 실패: ' + e.message;
  }
}

function populateSchools(filter = '') {
  const sel = $('schoolSelect');
  sel.innerHTML = '<option value="">학교 선택...</option>';
  const entries = Object.entries(LOOKUP || {})
    .filter(([slug, v]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return v.name.toLowerCase().includes(q) || (v.shortName || '').toLowerCase().includes(q) || slug.includes(q);
    })
    .sort((a, b) => {
      // 1. tier 순위 (sky 먼저)
      const at = tierRank(a[1].category === 'extra' ? 'extra' : a[1].tier);
      const bt = tierRank(b[1].category === 'extra' ? 'extra' : b[1].tier);
      if (at !== bt) return at - bt;
      // 2. tier 같으면 ratio 있는 학교 먼저
      const ar = a[1].tracks.some(t => t.ratios) ? 0 : 1;
      const br = b[1].tracks.some(t => t.ratios) ? 0 : 1;
      if (ar !== br) return ar - br;
      // 3. 학교명 가나다순
      return a[1].name.localeCompare(b[1].name, 'ko');
    });

  // tier별 optgroup
  let curTier = null;
  let curGroup = null;
  for (const [slug, v] of entries) {
    const tierKey = v.category === 'extra' ? 'extra' : v.tier;
    if (tierKey !== curTier) {
      curTier = tierKey;
      curGroup = document.createElement('optgroup');
      curGroup.label = v.category === 'extra' ? '추가 학교 (universities.json 외)' : (TIER_LABEL[tierKey] || tierKey || '기타');
      sel.appendChild(curGroup);
    }
    const opt = document.createElement('option');
    opt.value = slug;
    const ratio_mark = v.tracks.some(t => t.ratios) ? '★ ' : '○ ';
    opt.textContent = `${ratio_mark}${v.name}`;
    curGroup.appendChild(opt);
  }
}

function fmtRatios(rs) {
  const total = Object.values(rs).reduce((a, b) => a + b, 0);
  let mode, suffix, badge, badgeBg;
  if (total >= 95 && total <= 105) { mode='pct'; suffix='%'; badge='백분율'; badgeBg='#e6f0ff;color:#1a4ba0'; }
  else if (total >= 280 && total <= 320) { mode='w'; suffix=''; badge='가중치(300합)'; badgeBg='#f0e6ff;color:#5020a0'; }
  else if (total >= 800 && total <= 1200) { mode='raw'; suffix='점'; badge=`만점합 ${total}점`; badgeBg='#fff5e0;color:#7a4a00'; }
  else { mode='raw'; suffix=''; badge=`합계 ${total.toFixed(0)}`; badgeBg='#f3f3f3;color:#666'; }
  const html = Object.entries(rs).map(([k, v]) => `<span>${escHtml(k)} ${escHtml(v)}${suffix}</span>`).join('');
  return `<span style="background:${badgeBg};font-weight:600">${escHtml(badge)}</span>` + html;
}

function fmtEng(grades) {
  if (!grades || !Object.keys(grades).length) return '';
  const sorted = Object.entries(grades).sort((a, b) => +a[0] - +b[0]);
  let html = '<table class="adm-eng-table"><thead><tr>';
  for (const [g] of sorted) html += `<th>${escHtml(g)}등급</th>`;
  html += '</tr></thead><tbody><tr>';
  for (const [, v] of sorted) html += `<td>${escHtml(v)}</td>`;
  html += '</tr></tbody></table>';
  return html;
}

function renderSchool(slug) {
  const v = LOOKUP[slug];
  if (!v) { $('info').innerHTML = '<div class="adm-empty">데이터 없음.</div>'; return; }
  const conf = v.confidence;
  const confLabel = { medium: '학과별 비율 추출됨', low: '영어 등급만 추출' }[conf] || conf;
  const tier = v.tier ? `<span class="adm-tier">${escHtml(TIER_LABEL[v.tier] || v.tier)}</span>` : '';
  const admissionUrl = safeUrl(v.admissionUrl);
  let html = `<div class="adm-meta">
    <strong style="font-size:16px">${escHtml(v.name)}</strong>${tier}
    <span class="adm-confidence adm-confidence--${escAttr(conf)}">${escHtml(confLabel)}</span>
    ${admissionUrl ? `<br><a href="${escAttr(admissionUrl)}" target="_blank" rel="noopener">입학처</a>` : ''}
    ${v.source ? `<div class="adm-source">출처: ${escHtml(v.source)}</div>` : ''}
  </div>`;
  if (!v.tracks.length) {
    html += '<div class="adm-empty">추출 데이터 없음.</div>';
  } else {
    html += '<h3 style="margin:24px 0 8px;font-size:15px">학과별 반영비율 + 영어 환산</h3>';
    for (const t of v.tracks) {
      const isManual = t.manual === true;
      const cls = isManual ? 'adm-track' : 'adm-track';
      const bg = isManual ? 'background:#eef5ff;border-color:#a8c4e8' : '';
      html += `<div class="${cls}" style="${bg}">`;
      const mark = isManual ? '<span style="background:#3a6bbf;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;margin-right:6px">검증됨</span>' : '';
      html += `<div class="adm-track__label">${mark}${escHtml(t.label || '(라벨 없음)')}</div>`;
      if (t.ratios && Object.keys(t.ratios).length) {
        html += `<div class="adm-ratio">${fmtRatios(t.ratios)}</div>`;
      }
      if (t.ratios_note && Object.keys(t.ratios_note).length) {
        const note = Object.entries(t.ratios_note).map(([k,v])=>`${k}: ${v}`).join(' · ');
        html += `<div class="adm-source" style="color:#666">📝 ${escHtml(note)}</div>`;
      }
      if (t.scoreFormula) html += `<div class="adm-source">산출: ${escHtml(t.scoreFormula)}</div>`;
      if (t.math_pick) html += `<div class="adm-source">수학: ${escHtml(t.math_pick)}</div>`;
      if (t.tamgu_pick) html += `<div class="adm-source">탐구: ${escHtml(t.tamgu_pick)}</div>`;
      if (t.english_grades) {
        html += fmtEng(t.english_grades);
      }
      if (t.page) html += `<div class="adm-source">PDF p.${escHtml(t.page)}</div>`;
      html += '</div>';
    }
  }
  // 검증된 입결 (manual-results)
  const mres = (MANUAL_RESULTS || {})[slug];
  if (mres) {
    html += '<h3 style="margin:32px 0 8px;font-size:15px">전년도 학과별 70%컷 백분위 <span style="background:#3a6bbf;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">검증됨</span></h3>';
    for (const [yr, units] of Object.entries(mres).sort((a,b)=>b[0].localeCompare(a[0]))) {
      html += `<div class="adm-track" style="background:#eef5ff;border-color:#a8c4e8"><div class="adm-track__label">${escHtml(yr)}학년도 정시 — 학과별 백분위 70%컷</div>`;
      html += '<table class="adm-eng-table" style="font-size:12px"><thead><tr><th>학과</th><th>백분위 70%컷</th><th>비고</th></tr></thead><tbody>';
      for (const u of units) {
        html += `<tr><td style="text-align:left">${escHtml(u.unit || '')}</td><td><strong>${escHtml(u.pct70)}</strong></td><td>${escHtml(u.note || '')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }
  }
  // 전년도 입시결과 (자동 추출)
  const results = (RESULTS || {})[slug];
  if (results) {
    html += '<h3 style="margin:32px 0 8px;font-size:15px">전년도 입시결과 (학과별 70%컷)</h3>';
    for (const [yr, ydata] of Object.entries(results).sort((a,b)=>b[0].localeCompare(a[0]))) {
      html += `<div class="adm-track"><div class="adm-track__label">${escHtml(yr)}학년도 정시 — ${escHtml(ydata.unit_count)}개 학과</div>`;
      const hdr = (ydata.units[0]?.header || []).filter(h=>h);
      html += '<div style="overflow-x:auto"><table class="adm-eng-table" style="font-size:11px">';
      html += '<thead><tr><th>모집단위</th>';
      const num_cols = Math.min(8, ydata.units[0]?.numbers.length || 0);
      const headers = hdr.slice(1, num_cols+1);
      for (let i=0; i<num_cols; i++) html += `<th>${escHtml(headers[i] || `col${i+1}`)}</th>`;
      html += '</tr></thead><tbody>';
      for (const u of ydata.units.slice(0, 30)) {
        html += `<tr><td style="text-align:left;max-width:160px">${escHtml(u.unit || '')}</td>`;
        for (let i=0; i<num_cols; i++) html += `<td>${escHtml(u.numbers[i] ?? '-')}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      if (ydata.unit_count > 30) html += `<div class="adm-source">... ${escHtml(ydata.unit_count-30)}개 더</div>`;
      html += '</div>';
    }
  }
  // 정책 (가산/감점/한국사/필수)
  const pols = (POLICIES || {})[slug];
  if (pols) {
    html += '<h3 style="margin:32px 0 8px;font-size:15px">가산점·감점·필수 응시</h3>';
    const categoryOrder = ['math_pick', 'tamgu_bonus', 'english_deduction', 'hanguksa_deduction', 'hanguksa_table', 'foreign_deduction', 'compulsory_subject'];
    for (const cat of categoryOrder) {
      if (!pols[cat]) continue;
      html += `<div class="adm-track">`;
      html += `<div class="adm-track__label">${POLICY_LABEL[cat] || cat}</div>`;
      if (cat === 'hanguksa_table') {
        // 한국사 표
        for (const e of pols[cat]) {
          html += fmtEng(e.grades);
        }
      } else {
        html += '<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.5">';
        for (const it of pols[cat]) {
          html += `<li>${escHtml(it.text || '')} <span class="adm-source">p${escHtml(it.page)}</span></li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
    }
  }
  $('info').innerHTML = html;
}

// 비교 모드
let compareMode = false;
let compareSlugs = [];

function toggleCompare(slug) {
  const i = compareSlugs.indexOf(slug);
  if (i >= 0) compareSlugs.splice(i, 1);
  else if (compareSlugs.length < 3) compareSlugs.push(slug);
  renderCompareList();
}

function renderCompareList() {
  const el = $('compareList');
  el.classList.toggle('is-open', compareMode);
  if (!compareMode) return;
  if (!compareSlugs.length) {
    el.innerHTML = '비교 모드: select에서 학교 추가 (최대 3개)';
    return;
  }
  el.innerHTML = `<strong>비교 학교</strong> (${compareSlugs.length}/3): ` +
    compareSlugs.map(s => `<span style="background:#fff;padding:2px 8px;border-radius:4px;margin:0 4px;cursor:pointer" data-rm="${escAttr(s)}">${escHtml(LOOKUP[s]?.name || s)} ✕</span>`).join('') +
    ` <button id="renderCompareBtn" style="margin-left:8px;padding:4px 10px;border-radius:4px;border:1px solid #2a5;background:#2a5;color:#fff;cursor:pointer">비교 보기</button>`;
  el.querySelectorAll('[data-rm]').forEach(s => s.addEventListener('click', e => toggleCompare(e.target.dataset.rm)));
  $('renderCompareBtn')?.addEventListener('click', () => renderCompare());
}

function renderCompare() {
  if (!compareSlugs.length) return;
  let html = '<h3 style="margin:24px 0 8px;font-size:15px">비교 (' + compareSlugs.length + '개 학교)</h3>';
  for (const slug of compareSlugs) {
    const v = LOOKUP[slug];
    if (!v) continue;
    html += `<div class="adm-track"><div class="adm-track__label">${escHtml(v.name)}</div>`;
    const ratioTracks = (v.tracks || []).filter(t => t.ratios);
    if (ratioTracks.length) {
      for (const t of ratioTracks.slice(0, 3)) {
        html += `<div style="font-size:12px;margin:6px 0">${escHtml(t.label.slice(0, 50))}: ${fmtRatios(t.ratios)}</div>`;
      }
    } else if (v.tracks?.[0]?.english_grades) {
      html += '<div style="font-size:12px">영어 등급:</div>' + fmtEng(v.tracks[0].english_grades);
    } else {
      html += '<div class="adm-source">데이터 없음</div>';
    }
    html += '</div>';
  }
  $('info').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('schoolSelect').addEventListener('change', e => {
    if (!e.target.value) return;
    if (compareMode) {
      toggleCompare(e.target.value);
      e.target.value = '';
    } else {
      renderSchool(e.target.value);
    }
  });
  $('schoolFilter').addEventListener('input', e => populateSchools(e.target.value));
  $('compareBtn').addEventListener('click', () => {
    compareMode = !compareMode;
    const btn = $('compareBtn');
    btn.textContent = compareMode ? '단일 모드' : '비교 모드';
    btn.classList.toggle('is-active', compareMode);
    if (!compareMode) compareSlugs = [];
    renderCompareList();
  });
});
