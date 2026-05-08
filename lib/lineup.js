'use strict';
// 정시 모의지원 라인 산정.
// gradecut entries(영역별 점수·등급·상위백분율)를 받아
// manual-ratios + manual-results 와 결합해 학과별 환산 백분위 → 70%컷 비교 → 라인 분류.

let _data = null;

export async function loadAdmissionsData() {
  if (_data) return _data;
  try {
    const [ratios, results] = await Promise.all([
      fetch('data/admissions/manual-ratios.json').then(r => r.json()),
      fetch('data/admissions/manual-results.json').then(r => r.json()),
    ]);
    _data = { ratios, results };
    return _data;
  } catch { return null; }
}

// gradecut entries (subject·grade·pct(상위 백분율)·fullScore...) →
// 영역별 평균 백분위 + 영어/한국사 등급.
// pct 는 "상위 N%" 이므로 진짜 백분위 = 100 - pct.
export function aggregateAreas(entries) {
  const buckets = { korean: [], math: [], tamgu: [] };
  let englishGrade = null;
  let hanguksaGrade = null;
  for (const e of entries) {
    const truePct = 100 - e.pct;
    switch (e.subject) {
      case '국어':     buckets.korean.push(truePct); break;
      case '수학':     buckets.math.push(truePct);   break;
      case '과학탐구':
      case '사회탐구': buckets.tamgu.push(truePct);  break;
      case '영어':     if (englishGrade  == null) englishGrade  = e.grade; break;
      case '한국사':   if (hanguksaGrade == null) hanguksaGrade = e.grade; break;
    }
  }
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return {
    korean:        avg(buckets.korean),
    math:          avg(buckets.math),
    tamgu:         avg(buckets.tamgu),
    englishGrade:  englishGrade,
    hanguksaGrade: hanguksaGrade,
  };
}

// 진로별 트랙 선택. 학교 tracks[] 중 사용자 진로에 맞는 첫 트랙.
const TRACK_RE = {
  humanities: /인문|사회|어문|상경|경영|경제|음악|미술|예술|디자인|문학|사학|철학|언론|미디어/,
  natural:    /자연|공학|이공|의|약|치|간호|수의|생명|화학|물리|수학|컴퓨터|소프트웨어|전자|기계|건축|토목|식품|환경|반도체|AI|항공/,
};

function pickTrack(school, mode) {
  const tracks = school.tracks ?? [];
  if (!tracks.length) return null;
  if (mode === 'all') return tracks[0];
  const re = TRACK_RE[mode];
  if (!re) return tracks[0];
  return tracks.find(t => re.test(t.label || '')) || tracks[0];
}

// 학과명을 보고 사용자 진로 모드와 맞는지 휴리스틱 판단.
function unitMatchesMode(unit, mode) {
  if (mode === 'all') return true;
  if (!unit) return true;
  const isMed = /의학|치의|약학|수의|간호|보건|의예|치의예|약학부/.test(unit);
  const isNat = /공학|자연|화학|물리|수학|컴퓨터|소프트웨어|전자|기계|건축|토목|생명|환경|에너지|반도체|항공|식품|농|산림|생물|AI|로봇|미래/i.test(unit);
  const isHum = /인문|국어|어문|영어|독어|불어|중어|일어|러시아|문학|사학|철학|사회|경제|경영|법학|정치|미디어|언론|행정|심리|교육|아동|음악|미술|디자인|체육|상경|글로벌|국제/.test(unit);
  if (mode === 'humanities') return isHum && !isNat && !isMed;
  if (mode === 'natural')    return isNat || isMed;
  return true;
}

// pct70 - userScore 차이로 라인 분류.
// 단위가 "백분위 평균"이라 ±1.5 정도면 한 단계 차이.
export function classifyLine(diff) {
  if (diff >=  1.5) return { key: 'safe',  label: '안정',     color: '#1a8a3a', priority: 0 };
  if (diff >=  0)   return { key: 'fit',   label: '적정',     color: '#0a6cb4', priority: 1 };
  if (diff >= -1.5) return { key: 'aim',   label: '소신',     color: '#c84d1f', priority: 2 };
  return                  { key: 'risky', label: '지원 어려움', color: '#888',    priority: 3 };
}

// 입력: gradecut entries + opts({ mode, year })
// 출력: { rows: [...], areas, missingAreas, year }
export async function buildLineup(entries, opts = {}) {
  const { mode = 'all', year = '2025' } = opts;
  const data = await loadAdmissionsData();
  if (!data) return null;

  const areas = aggregateAreas(entries);
  const missingAreas = [];
  if (areas.korean == null) missingAreas.push('국어');
  if (areas.math   == null) missingAreas.push('수학');
  if (areas.tamgu  == null) missingAreas.push('탐구');

  const rows = [];
  for (const slug of Object.keys(data.ratios)) {
    if (slug.startsWith('_')) continue;
    const school = data.ratios[slug];
    const yearResults = data.results[slug]?.[year];
    if (!Array.isArray(yearResults) || yearResults.length === 0) continue;

    const track = pickTrack(school, mode);
    if (!track || !track.ratios) continue;

    const r = track.ratios;
    let sum = 0, w = 0;
    if (r['국어'] && areas.korean != null) { sum += areas.korean * r['국어']; w += r['국어']; }
    if (r['수학'] && areas.math   != null) { sum += areas.math   * r['수학']; w += r['수학']; }
    if (r['탐구'] && areas.tamgu  != null) { sum += areas.tamgu  * r['탐구']; w += r['탐구']; }
    if (r['영어'] && areas.englishGrade != null) {
      const engPct = Math.max(0, 100 - (areas.englishGrade - 1) * 5);
      sum += engPct * r['영어']; w += r['영어'];
    }
    if (w === 0) continue;

    const baseAvg = sum / w;

    // 영어가 ratios 에 없으면 학교의 english_grades 감점/가산을 그대로 적용.
    const engAdj = (!r['영어'] && school.english_grades && areas.englishGrade != null)
      ? (Number(school.english_grades[String(areas.englishGrade)]) || 0)
      : 0;
    const hsAdj  = (school.hanguksa_grades && areas.hanguksaGrade != null)
      ? (Number(school.hanguksa_grades[String(areas.hanguksaGrade)]) || 0)
      : 0;

    const userScore = baseAvg + engAdj + hsAdj;

    for (const u of yearResults) {
      if (typeof u.pct70 !== 'number') continue;
      if (/평균/.test(u.unit)) continue;
      if (!unitMatchesMode(u.unit, mode)) continue;

      const diff = userScore - u.pct70;
      rows.push({
        slug, school: school.name, unit: u.unit,
        track: track.label,
        userScore, pct70: u.pct70, diff,
        line: classifyLine(diff),
        engAdj, hsAdj,
        note: u.note || '',
      });
    }
  }

  rows.sort((a, b) => b.pct70 - a.pct70);
  return { rows, areas, missingAreas, year, mode };
}
