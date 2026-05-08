'use strict';
// 정시 모의지원 라인 산정.
// gradecut entries(영역별 점수·등급·상위백분율)를 받아
// manual-ratios + manual-results 와 결합해 학과별 환산 백분위 → 70%컷 비교 → 라인 분류.
//
// 핵심 규칙
// - 학과별로 트랙(ratios)을 다르게 선택 — 한 학교 안에 인문·자연 트랙이 따로 있어서.
// - 수시(지역균형·학생부·교과·논술·실기) 트랙은 제외, 정시 ratios 만 사용.
// - ratios 값 중 숫자만 가중치로 사용. 문자열('차등감점','100점만점 등급환산')은 무시.
// - 영어: english_grades 표 max>0 이면 환산점수 → 100점 정규화 후 ratios 가중평균에 편입.
//          max≤0 (서울대 같은 감점형) 이면 baseAvg 산출 후 직접 가/감산.
// - 한국사: hanguksa_grades 가/감점 적용.

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

// gradecut entries → 영역별 평균 백분위 + 영어/한국사 등급
// pct 는 "상위 N%" 이므로 백분위 = 100 - pct.
export function aggregateAreas(entries) {
  const buckets = { korean: [], math: [], tamgu: [] };
  let englishGrade = null, hanguksaGrade = null;
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
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    korean:        avg(buckets.korean),
    math:          avg(buckets.math),
    tamgu:         avg(buckets.tamgu),
    englishGrade:  englishGrade,
    hanguksaGrade: hanguksaGrade,
  };
}

const SUSHI_RE = /지역균형|지균|학생부|교과전형|학종|종합전형|논술|면접전형|특기|실기/;
const NAT_TRACK_RE = /자연|이공|공학|의|약|치|수의|간호|생명|화학|물리(?!학과)|수학|컴퓨터|소프트웨어|전자|기계|건축|시스템|로봇|반도체|AI/;
const HUM_TRACK_RE = /인문|사회|상경|경영|경제|어문|문학|사학|철학|예술|디자인|음악|미술|체육|글로벌|국제|미디어|언론/;

function classifyUnit(unit) {
  if (!unit) return 'humanities';
  // 명시 표기 우선 — '자율전공학부(자연)' / '(인문)' 같은 케이스
  if (/\(자연\)|\(이공\)/.test(unit)) return 'natural';
  if (/\(인문\)|\(사회\)/.test(unit)) return 'humanities';
  // 의·약·간호·보건 → 자연
  if (/의예|의학|치의|약학|수의|간호|보건|치의예|약학부|치과|한의|방사선|물리치료|작업치료/.test(unit)) return 'natural';
  // 자연·공학 — '전공학부' 가 '공학' 정규식과 false-match 되는 문제 회피
  // 공학은 '공학과/공학부/공과대학' 같은 단어 단위로만 매칭
  if (/공학과|공학부|공과대|이공계|이공대|자연계열|자연과학|화학과|물리학|컴퓨터|소프트웨어|전자|기계|건축|토목|생명과학|생명공학|환경공학|반도체|항공|식품|농학|산림|생물학|수학과|로봇|에너지|시스템반도체|AI|데이터사이언스|바이오|신소재|소재공학/.test(unit)) return 'natural';
  // 인문·사회·예체능 — 자유전공/자율전공은 인문 디폴트
  if (/인문|국어|어문|영어|독어|불어|중어|일어|러시아|문학|사학|철학|사회|경제|경영|법학|정치|미디어|언론|행정|심리|교육|아동|음악|미술|디자인|체육|상경|글로벌|국제|관광|호텔|문화|자유전공|자율전공/.test(unit)) return 'humanities';
  return 'humanities';
}

// 학과 분류에 맞는 정시 트랙을 학교 tracks 에서 선택.
function pickTrackForUnit(school, unit) {
  const all = (school.tracks || []).filter(t => t && t.ratios);
  // 1차: 수시 키워드 제외
  const eligible = all.filter(t => !SUSHI_RE.test(t.label || ''));
  const pool = eligible.length ? eligible : all;
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const cls = classifyUnit(unit);
  if (cls === 'natural') {
    return pool.find(t => NAT_TRACK_RE.test(t.label)) || pool[0];
  }
  return pool.find(t => HUM_TRACK_RE.test(t.label))
      || pool.find(t => !NAT_TRACK_RE.test(t.label))
      || pool[0];
}

// 숫자만 통과 — 문자열·null 은 null
function numOrNull(v) {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) ? v : null;
}

// 영어/한국사 등급 → ratios 가중평균에 편입할 0~100 정규화 점수.
// 환산표 max≤0 (감점형) 이면 단위가 백분위와 달라 가중평균 편입 불가 → null.
function gradeNormalized(map, grade) {
  if (!map || grade == null) return null;
  const mine = Number(map[String(grade)]);
  if (!Number.isFinite(mine)) return null;
  const vals = Object.values(map).map(Number).filter(Number.isFinite);
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  if (max <= 0) return null;
  return (mine / max) * 100;
}

// 학교·학과 단위로 사용자 환산 백분위 계산.
// 국어/수학/탐구 만 ratios 가중평균에 편입.
// 영어/한국사는 학교마다 환산 단위가 너무 달라(서울대 -2.0 / 고려대 200점만점 / 연세대 100점만점)
// 0~100 백분위로 정규화하면 영어 1등급=100 이 영역 평균(95) 보다 높게 잡혀 systematic bias 가 생김.
// 시뮬레이션 결과 사용자=컷 일 때 환산값이 평균 +1.26 위로 밀리는 문제 → 영어/한국사는 가중평균에서 제외.
// 대신 학교가 영어·한국사를 어떻게 다루는지 UI 힌트로만 표시.
function computeUserScore(school, unit, areas) {
  const track = pickTrackForUnit(school, unit);
  if (!track) return null;
  const r = track.ratios || {};

  let sum = 0, w = 0;
  const wK = numOrNull(r['국어']);
  if (wK && areas.korean != null) { sum += areas.korean * wK; w += wK; }
  const wM = numOrNull(r['수학']);
  if (wM && areas.math != null)   { sum += areas.math   * wM; w += wM; }
  const wT = numOrNull(r['탐구']);
  if (wT && areas.tamgu != null)  { sum += areas.tamgu  * wT; w += wT; }

  if (w === 0) return null;

  const baseAvg = sum / w;
  return {
    userScore: baseAvg,
    baseAvg,
    track,
    hasEnglishPenalty:  !!school.english_grades  && areas.englishGrade  != null,
    hasHanguksaPenalty: !!school.hanguksa_grades && areas.hanguksaGrade != null,
  };
}

export function classifyLine(diff) {
  if (diff >=  1.5) return { key: 'safe',  label: '안정',     color: '#1a8a3a', rank: 0 };
  if (diff >=  0)   return { key: 'fit',   label: '적정',     color: '#0a6cb4', rank: 1 };
  if (diff >= -1.5) return { key: 'aim',   label: '소신',     color: '#c84d1f', rank: 2 };
  return                  { key: 'risky', label: '지원 어려움', color: '#888',    rank: 3 };
}

// 진로 모드별 학과 필터.
function unitMatchesMode(unit, mode) {
  if (mode === 'all') return true;
  return classifyUnit(unit) === mode;
}

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

    for (const u of yearResults) {
      if (typeof u.pct70 !== 'number') continue;
      if (/평균/.test(u.unit)) continue;
      if (!unitMatchesMode(u.unit, mode)) continue;

      const calc = computeUserScore(school, u.unit, areas);
      if (!calc) continue;

      const diff = calc.userScore - u.pct70;
      rows.push({
        slug,
        school: school.name,
        unit: u.unit,
        track: calc.track.label,
        userScore: calc.userScore,
        baseAvg:   calc.baseAvg,
        hasEnglishPenalty:  calc.hasEnglishPenalty,
        hasHanguksaPenalty: calc.hasHanguksaPenalty,
        pct70: u.pct70,
        diff,
        line: classifyLine(diff),
        note: u.note || '',
      });
    }
  }

  // 합격 확률 높은 순: 안정 → 적정 → 소신 → 어려움.
  // 같은 라인 안에서는 컷 높은 학교(좋은 학과) 가 위로.
  rows.sort((a, b) => {
    if (a.line.rank !== b.line.rank) return a.line.rank - b.line.rank;
    return b.pct70 - a.pct70;
  });
  return { rows, areas, missingAreas, year, mode };
}
