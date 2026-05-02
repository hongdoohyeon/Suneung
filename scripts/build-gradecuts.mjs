#!/usr/bin/env node
// 모은 등급컷 데이터를 data/gradecuts.json 으로 통합.
// 사이트 표시는 무조건 원점수(rawCuts) 기준.
//
// 출처 (raw 소스에서 매번 fresh 빌드 — 기존 출력 파일 무시)
//   1) data/raw/megastudy/gradecuts-normalized.json - 메가스터디 2016~2026
//   2) /tmp/csat_gc_normalized_v3.json              - 평가원 hwpx 2005~2020
//   3) /tmp/recent_csat_gc.json                     - 평가원 매년 갱신 fan-out
//   4) data/raw/etoos/rawcuts-normalized.json       - 이투스 wayback archive (raw)
//
// 적용 순서 (뒤가 우선):
//   hwpx → 평가원 recent → 메가스터디 (raw + std + 백분위 + 누적) → 이투스 archive (raw 보강) → 절대평가 자동
// 표준점수/백분위/누적은 데이터로만 보존 (사이트 미표시).

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXAMS_PATH = path.resolve(ROOT, 'data/exams.json');
const OUT_PATH = path.resolve(ROOT, 'data/gradecuts.json');

async function readJsonOr(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf-8')); }
  catch { return fallback; }
}

const [exams, megastudy, hwpxData, recentData, etoosArchived] = await Promise.all([
  readFile(EXAMS_PATH, 'utf-8').then(JSON.parse),
  readJsonOr(path.resolve(ROOT, 'data/raw/megastudy/gradecuts-normalized.json'), []),
  readJsonOr('/tmp/csat_gc_normalized_v3.json', []),
  readJsonOr('/tmp/recent_csat_gc.json', []),
  readJsonOr(path.resolve(ROOT, 'data/raw/etoos/rawcuts-normalized.json'), []),
]);
// 기존 출력 파일을 seed로 사용해, 현재 환경에 없는 보조 raw 소스(/tmp 평가원 추출물 등)가
// 재빌드 과정에서 삭제되지 않게 한다. 아래 source 적용 순서가 기존 값을 덮어쓰므로
// megastudy/etoos 최신 raw 보강은 계속 반영된다.
const existing = await readJsonOr(OUT_PATH, []);

function makeKey(curr, yr, type, subj, sub) {
  return `${curr}|${yr}|${type}|${subj}|${sub ?? ''}`;
}

const examMetaIndex = new Map();
for (const e of exams) {
  examMetaIndex.set(makeKey(e.curriculum, e.gradeYear, e.type, e.subject, e.subSubject), e);
}

const resultMap = new Map();

// 1. 기존 (rawCuts) — 가장 먼저 그대로 보존
for (const c of existing) {
  const k = makeKey(c.curriculum, c.gradeYear, c.type, c.subject, c.subSubject);
  resultMap.set(k, { ...c });
}

function ensureRecord(meta) {
  const k = makeKey(meta.curriculum, meta.gradeYear, meta.type, meta.subject, meta.subSubject);
  if (!resultMap.has(k)) {
    const exam = examMetaIndex.get(k);
    resultMap.set(k, exam ? {
      curriculum: exam.curriculum, gradeYear: exam.gradeYear, examYear: exam.examYear,
      month: exam.month, typeGroup: exam.typeGroup, type: exam.type,
      subject: exam.subject, subSubject: exam.subSubject,
    } : {
      curriculum: meta.curriculum, gradeYear: meta.gradeYear, examYear: meta.examYear,
      month: meta.month, typeGroup: meta.typeGroup, type: meta.type,
      subject: meta.subject, subSubject: meta.subSubject,
    });
  }
  return resultMap.get(k);
}

// 2. 평가원 hwpx (standardCuts)
let hwpxApplied = 0;
for (const r of hwpxData) {
  const rec = ensureRecord(r);
  rec.standardCuts = r.standardCuts;
  hwpxApplied++;
}

// 3. 평가원 recent (subSubject fan-out)
function fanoutSubjects(year, type, subj, sub) {
  const matches = exams.filter(e => e.gradeYear === year && e.type === type && e.subject === subj);
  if (sub != null) return matches.filter(e => (e.subSubject ?? null) === sub);
  if (matches.length > 0) return matches;
  return [{
    curriculum: '2015', gradeYear: year, examYear: year - 1,
    month: type === 'csat' ? 11 : 9,
    typeGroup: 'suneung', type, subject: subj, subSubject: null,
  }];
}

let recentApplied = 0;
for (const r of recentData) {
  for (const exam of fanoutSubjects(r.year, r.type, r.subject, r.subSubject)) {
    const rec = ensureRecord(exam);
    rec.standardCuts = r.standardCuts;
    recentApplied++;
  }
}

// 4. 메가스터디 — 가능하면 원점수(5컬럼 raw 데이터), 그 외는 표준점수+백분위 (데이터 보존용).
//    국어/수학의 통합형 시기는 단일 record (subSubject=null) → 사이트 모든 변형으로 fan-out.
let megaApplied = 0;
for (const r of megastudy) {
  const targets = (r.subSubject == null && (r.subject === '국어' || r.subject === '수학'))
    ? fanoutSubjects(r.gradeYear, r.type, r.subject, null)
    : [r];
  for (const exam of targets) {
    const rec = ensureRecord({
      curriculum: r.curriculum, gradeYear: r.gradeYear, examYear: r.examYear,
      month: r.month, typeGroup: r.typeGroup, type: r.type,
      subject: exam.subject ?? r.subject,
      subSubject: exam.subSubject ?? r.subSubject,
    });
    rec.standardCuts = r.standardCuts;
    if (Array.isArray(r.rawCuts) && r.rawCuts.some(v => v != null)) rec.rawCuts = r.rawCuts;
    if (r.standardPercentile?.some(v => v != null)) rec.standardPercentile = r.standardPercentile;
    if (r.cumulativePercent?.some(v => v != null)) rec.cumulativePercent = r.cumulativePercent;
    if (r.highestStandardScore != null) rec.highestStandardScore = r.highestStandardScore;
    if (r.fullScore != null) rec.fullScore = r.fullScore;
    rec.source = 'megastudy';
    megaApplied++;
  }
}

// 5a. 이투스 wayback archive (시험 직후 캡처본의 원점수 등급컷)
//     megastudy 가 이미 있는 record 에는 rawCuts 만 보강.
function compatibleStandardCuts(existingCuts, incomingCuts) {
  if (!Array.isArray(existingCuts) || !Array.isArray(incomingCuts)) return true;
  const diffs = [];
  for (let i = 0; i < Math.min(existingCuts.length, incomingCuts.length); i++) {
    const a = existingCuts[i], b = incomingCuts[i];
    if (Number.isFinite(a) && Number.isFinite(b)) diffs.push(Math.abs(a - b));
  }
  if (diffs.length < 6) return true;
  const max = Math.max(...diffs);
  const avg = diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
  // 이투스 원점수 표는 표 헤더에 과목명이 없어서 순서 매핑에 의존한다.
  // 기존 표준점수와 크게 어긋나면 과목 오프셋 가능성이 높으므로 raw 보강을 차단한다.
  return max <= 6 && avg <= 3;
}

let etoosApplied = 0;
let etoosSkippedByStdMismatch = 0;
for (const r of etoosArchived) {
  if (!Array.isArray(r.rawCuts) || !r.rawCuts.some(v => v != null)) continue;
  const rec = ensureRecord(r);
  if (!compatibleStandardCuts(rec.standardCuts, r.standardCuts)) {
    etoosSkippedByStdMismatch++;
    continue;
  }
  // 사용자 입력 rawCuts 보존
  if (Array.isArray(rec.rawCuts) && rec.rawCuts.length === 8 && rec.source !== 'megastudy') continue;
  rec.rawCuts = r.rawCuts;
  if (r.fullScore != null) rec.fullScore = r.fullScore;
  // standardCuts/표점/백분위는 megastudy 가 있으면 그쪽 우선, 없으면 etoos 값 사용
  if (!rec.standardCuts && r.standardCuts) rec.standardCuts = r.standardCuts;
  if (!rec.standardPercentile && r.standardPercentile) rec.standardPercentile = r.standardPercentile;
  if (rec.highestStandardScore == null && r.highestStandardScore != null) rec.highestStandardScore = r.highestStandardScore;
  rec.source = rec.source ? `${rec.source}+etoos-raw` : 'etoos-archived';
  etoosApplied++;
}

// 5. 절대평가 영역 (영어/한국사) 원점수 등급컷 자동 추가.
//    - 영어: 100점 만점, 1~8등급 컷 = 90/80/70/60/50/40/30/20
//    - 한국사: 50점 만점, 1~8등급 컷 = 40/35/30/25/20/15/10/5
//    - 영어 절대평가 시행: 2018학년도 수능 ~. 그 이전 시험은 상대평가라 제외.
//    - 한국사 필수화 + 절대평가: 2017학년도 수능부터.
//    - 학평/모평도 동일 절대평가 기준 (편의상 통일).
const ABSOLUTE_CUTS = {
  '영어':   { fullScore: 100, cuts: [90, 80, 70, 60, 50, 40, 30, 20], absoluteSince: 2018 },
  '한국사': { fullScore: 50,  cuts: [40, 35, 30, 25, 20, 15, 10, 5],  absoluteSince: 2017 },
};

let absoluteApplied = 0;
// 사이트 시험 + 빌드된 모든 record 둘 다 순회 (megastudy-only 레코드도 정리하기 위해)
const absoluteTargets = new Set();
for (const e of exams) {
  const ab = ABSOLUTE_CUTS[e.subject];
  if (ab && e.gradeYear >= ab.absoluteSince) {
    absoluteTargets.add(makeKey(e.curriculum, e.gradeYear, e.type, e.subject, e.subSubject));
  }
}
for (const [k, rec] of resultMap) {
  const ab = ABSOLUTE_CUTS[rec.subject];
  if (!ab) continue;
  if (rec.gradeYear >= ab.absoluteSince) absoluteTargets.add(k);
}
for (const k of absoluteTargets) {
  // 사이트 미존재 record 도 ensureRecord 로 정리
  const parts = k.split('|');
  const meta = { curriculum: parts[0], gradeYear: +parts[1], type: parts[2], subject: parts[3], subSubject: parts[4] || null };
  const rec = ensureRecord(meta);
  // 절대평가 시기 영어/한국사: standardCuts 는 의미 없음 (절대 컷이 std 컬럼에 들어간 것). 제거.
  delete rec.standardCuts;
  delete rec.standardPercentile;
  delete rec.cumulativePercent;
  delete rec.highestStandardScore;
  const ab = ABSOLUTE_CUTS[rec.subject];
  // rawCuts 보강 (이미 있으면 보존)
  if (!Array.isArray(rec.rawCuts) || !rec.rawCuts.some(v => v != null)) {
    rec.rawCuts = ab.cuts.slice();
    rec.absolute = true;
    rec.source = rec.source || 'absolute-standard';
    absoluteApplied++;
  } else {
    rec.absolute = true;
  }
  rec.fullScore = ab.fullScore;
}

// 6. fullScore 채우기
const FULL_SCORE = {
  '국어': 100, '수학': 100, '영어': 100, '한국사': 50,
  '사회탐구': 50, '과학탐구': 50, '통합사회': 50, '통합과학': 50,
  '직업탐구': 50, '제2외국어': 50,
};

const sorted = [...resultMap.values()].sort((a, b) => {
  if (a.gradeYear !== b.gradeYear) return b.gradeYear - a.gradeYear;
  const tOrder = { csat: 0, sept: 1, june: 2, oct: 3, jul: 4, apr: 5, mar: 6 };
  const ao = tOrder[a.type] ?? 99, bo = tOrder[b.type] ?? 99;
  if (ao !== bo) return ao - bo;
  return (a.subject + (a.subSubject ?? '')).localeCompare(b.subject + (b.subSubject ?? ''));
});

const out = sorted.map((rec, i) => {
  const r = { ...rec, id: i + 1 };
  if (r.fullScore == null) {
    const fs = FULL_SCORE[r.subject];
    if (fs != null) r.fullScore = fs;
  }
  return r;
});

await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

console.log(`기존 rawCuts: ${existing.length}건`);
console.log(`hwpx 적재: ${hwpxApplied}건`);
console.log(`recent 적재: ${recentApplied}건`);
console.log(`megastudy 적재: ${megaApplied}건`);
console.log(`etoos archived rawCuts: ${etoosApplied}건 (표준점수 불일치 skip ${etoosSkippedByStdMismatch}건)`);
console.log(`절대평가 자동 추가: ${absoluteApplied}건`);
console.log(`최종: ${out.length}건`);

const withRaw = out.filter(r => Array.isArray(r.rawCuts) && r.rawCuts.length).length;
const withStd = out.filter(r => Array.isArray(r.standardCuts) && r.standardCuts.length).length;
const withPct = out.filter(r => Array.isArray(r.standardPercentile)).length;
const matched = out.filter(r => examMetaIndex.has(makeKey(r.curriculum, r.gradeYear, r.type, r.subject, r.subSubject))).length;
console.log(`  rawCuts: ${withRaw}`);
console.log(`  standardCuts: ${withStd}`);
console.log(`  standardPercentile: ${withPct}`);
console.log(`  사이트 시험 매칭: ${matched}/${out.length}`);
