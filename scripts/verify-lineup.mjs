#!/usr/bin/env node
// 라인 산정 알고리즘 검증 — 백분위 sweep + 주요 학과 대조표.
//
// 실행: node scripts/verify-lineup.mjs
//
// 1) 백분위 sweep: 80~99 사용자별로 라인 분포 합리성 sanity check
// 2) 주요 학과 대조표: 동일 백분위에서 학과별 라인 결과 → ±1.5 임계값 적정성 점검

import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const ratios  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/admissions/manual-ratios.json'),  'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/admissions/manual-results.json'), 'utf8'));

// ── lib/lineup.js 의 핵심 로직 복제 (브라우저 환경 fetch 우회) ──
const SUSHI_RE = /지역균형|지균|학생부|교과전형|학종|종합전형|논술|면접전형|특기|실기/;
const NAT = /자연|이공|공학|의|약|치|수의|간호|생명|화학|물리(?!학과)|수학|컴퓨터|소프트웨어|전자|기계|건축|시스템|로봇|반도체|AI/;
const HUM = /인문|사회|상경|경영|경제|어문|문학|사학|철학|예술|디자인|음악|미술|체육|글로벌|국제|미디어|언론/;

function classifyUnit(unit) {
  if (!unit) return 'humanities';
  if (/의학|치의|약학|수의|간호|보건|의예|치의예|약학부|치과|한의/.test(unit)) return 'natural';
  if (/공학|자연|화학|물리|컴퓨터|소프트웨어|전자|기계|건축|토목|생명|환경|반도체|항공|식품|농|산림|생물|수학과|로봇|에너지|시스템|AI|데이터|바이오/.test(unit)) return 'natural';
  return 'humanities';
}

function pickTrack(school, unit) {
  const all = (school.tracks || []).filter(t => t && t.ratios);
  const eligible = all.filter(t => !SUSHI_RE.test(t.label || ''));
  const pool = eligible.length ? eligible : all;
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];
  const cls = classifyUnit(unit);
  if (cls === 'natural') return pool.find(t => NAT.test(t.label)) || pool[0];
  return pool.find(t => HUM.test(t.label)) || pool.find(t => !NAT.test(t.label)) || pool[0];
}

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

function gradeNorm(map, grade) {
  if (!map || grade == null) return null;
  const mine = Number(map[String(grade)]);
  if (!Number.isFinite(mine)) return null;
  const vals = Object.values(map).map(Number).filter(Number.isFinite);
  const max = Math.max(...vals);
  if (max <= 0) return null;
  return mine / max * 100;
}

function compute(school, unit, areas) {
  const t = pickTrack(school, unit);
  if (!t) return null;
  const r = t.ratios || {};
  let sum = 0, w = 0;
  const wK = num(r['국어']); if (wK && areas.korean != null) { sum += areas.korean * wK; w += wK; }
  const wM = num(r['수학']); if (wM && areas.math   != null) { sum += areas.math   * wM; w += wM; }
  const wT = num(r['탐구']); if (wT && areas.tamgu  != null) { sum += areas.tamgu  * wT; w += wT; }
  // 영어/한국사는 ratios 가중평균에서 제외 (학교 단위 충돌 + systematic bias 방지)
  if (w === 0) return null;
  return { score: sum / w, track: t };
}

function classifyLine(diff) {
  if (diff >=  1.5) return 'safe';
  if (diff >=  0)   return 'fit';
  if (diff >= -1.5) return 'aim';
  return 'risky';
}

// ── 1) 백분위 sweep ──
function runSweep(year = '2025') {
  console.log('\n━━━ 1. 백분위 sweep — 라인 분포 ━━━\n');
  console.log('가정: 영역별 백분위 동일 / 영어·한국사 1등급');
  console.log(`pct │  안정   적정   소신   어려움 │ 검사학과수`);
  console.log('────┼──────────────────────────────────┼──────────');
  for (let pct = 80; pct <= 99; pct += 1) {
    const areas = { korean: pct, math: pct, tamgu: pct, englishGrade: 1, hanguksaGrade: 1 };
    let safe = 0, fit = 0, aim = 0, risky = 0, total = 0;
    for (const slug of Object.keys(ratios)) {
      if (slug.startsWith('_')) continue;
      const sch = ratios[slug];
      const yr = results[slug]?.[year]; if (!Array.isArray(yr)) continue;
      for (const u of yr) {
        if (typeof u.pct70 !== 'number') continue;
        if (/평균/.test(u.unit)) continue;
        const c = compute(sch, u.unit, areas); if (!c) continue;
        const line = classifyLine(c.score - u.pct70);
        if (line === 'safe') safe++; else if (line === 'fit') fit++;
        else if (line === 'aim') aim++; else risky++;
        total++;
      }
    }
    console.log(`${String(pct).padStart(3)} │ ${String(safe).padStart(5)}  ${String(fit).padStart(5)}  ${String(aim).padStart(5)}  ${String(risky).padStart(6)} │ ${String(total).padStart(6)}`);
  }
}

// ── 2) 주요 학과 대조 — 동일 백분위에서 라인 다양성 확인 ──
function runHeadline(year = '2025') {
  console.log('\n━━━ 2. 주요 학과 대조 (사용자 백분위 95) ━━━\n');
  const areas = { korean: 95, math: 95, tamgu: 95, englishGrade: 1, hanguksaGrade: 1 };
  const targets = [
    ['snu','의예과'], ['snu','컴퓨터공학부'], ['snu','경영대학'], ['snu','자유전공학부'],
    ['yonsei','의예과'], ['yonsei','전기전자공학부'], ['yonsei','경영학과'],
    ['korea','의과대학'], ['korea','컴퓨터학과'], ['korea','경영대학'],
    ['cau','의학부'], ['cau','경영학부'],
    ['hanyang','컴퓨터소프트웨어학부'], ['hanyang','경영학부'],
    ['skku','경영학'], ['skku','글로벌리더학'],
    ['uos','경영학부'], ['uos','전자전기컴퓨터공학부'],
    ['kw','경영학부'], ['sejong','경영학부'],
  ];
  console.log(`${'학교'.padEnd(15)} ${'학과'.padEnd(22)} score   cut   diff   line`);
  console.log('─'.repeat(75));
  for (const [slug, want] of targets) {
    const sch = ratios[slug]; if (!sch) continue;
    const yr = results[slug]?.[year] || [];
    const u = yr.find(x => x.unit === want); if (!u) continue;
    const c = compute(sch, want, areas); if (!c) continue;
    const d = c.score - u.pct70;
    const line = classifyLine(d);
    const labels = { safe: '안정', fit: '적정', aim: '소신', risky: '어려움' };
    console.log(`${(sch.name).padEnd(15)} ${want.padEnd(22)} ${c.score.toFixed(1)}  ${u.pct70.toFixed(1)}  ${(d>=0?'+':'')+d.toFixed(2).padStart(5)}  ${labels[line]}`);
  }
}

// ── 3) 동일 학과 컷 vs 사용자 백분위 — 임계값 보정 검증 ──
function runThresholdCheck(year = '2025') {
  console.log('\n━━━ 3. 임계값 검증 — 사용자 백분위 = 학과 70%컷일 때 라인 ━━━\n');
  console.log('이론적으로 사용자 점수 = 학과 70%컷이면 "적정" 경계여야 함.');
  console.log('실제 산정 결과의 환산값(score)이 cut 과 얼마나 다른지 검사:\n');

  const samples = [];
  for (const slug of Object.keys(ratios)) {
    if (slug.startsWith('_')) continue;
    const sch = ratios[slug];
    const yr = results[slug]?.[year]; if (!Array.isArray(yr)) continue;
    for (const u of yr) {
      if (typeof u.pct70 !== 'number') continue;
      if (/평균/.test(u.unit)) continue;
      // 사용자 백분위 = pct70 으로 설정
      const areas = { korean: u.pct70, math: u.pct70, tamgu: u.pct70, englishGrade: 1, hanguksaGrade: 1 };
      const c = compute(sch, u.unit, areas); if (!c) continue;
      samples.push(c.score - u.pct70);
    }
  }
  samples.sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const median = samples[Math.floor(samples.length / 2)];
  const p10 = samples[Math.floor(samples.length * 0.10)];
  const p90 = samples[Math.floor(samples.length * 0.90)];
  console.log(`표본 ${samples.length}건 (학교×학과)`);
  console.log(`  평균 diff:  ${avg >= 0 ? '+' : ''}${avg.toFixed(3)}`);
  console.log(`  median:     ${median >= 0 ? '+' : ''}${median.toFixed(3)}`);
  console.log(`  10~90% 범위: ${p10.toFixed(2)} ~ ${p90.toFixed(2)}`);
  console.log(`  → 0 에 가까울수록 "사용자=cut → 적정 경계" 가정이 정확.`);
}

// ── 4) 비대칭성 — 인문/자연 트랙에서 사용자 점수 영향 ──
function runTrackAsymmetry(year = '2025') {
  console.log('\n━━━ 4. 인문/자연 트랙 영향 — 같은 학교에서 두 트랙 score 차이 ━━━\n');
  const areas = { korean: 95, math: 90, tamgu: 92, englishGrade: 1, hanguksaGrade: 1 };
  console.log('가정: 국어 95 / 수학 90 / 탐구 92 / 영어·한국사 1');
  console.log('수학 약점 사용자가 인문/자연 트랙 어디로 가야 유리한지 검증:\n');
  console.log(`${'학교'.padEnd(15)} 인문 score   자연 score   차이`);
  console.log('─'.repeat(55));
  for (const slug of ['snu','yonsei','korea','hanyang','skku','cau','uos','sogang']) {
    const sch = ratios[slug]; if (!sch) continue;
    // 인문 학과 sample
    const humUnit = results[slug]?.[year]?.find(u => classifyUnit(u.unit) === 'humanities' && !/평균/.test(u.unit));
    const natUnit = results[slug]?.[year]?.find(u => classifyUnit(u.unit) === 'natural'    && !/평균/.test(u.unit));
    if (!humUnit || !natUnit) continue;
    const ch = compute(sch, humUnit.unit, areas);
    const cn = compute(sch, natUnit.unit, areas);
    if (!ch || !cn) continue;
    const diff = ch.score - cn.score;
    console.log(`${sch.name.padEnd(15)} ${ch.score.toFixed(2).padStart(8)}    ${cn.score.toFixed(2).padStart(8)}    ${(diff>=0?'+':'')+diff.toFixed(2)}`);
  }
}

// ── 실행 ──
runSweep();
runHeadline();
runThresholdCheck();
runTrackAsymmetry();
console.log('');
