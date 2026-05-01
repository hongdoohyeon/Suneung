#!/usr/bin/env node
// 모은 등급컷 데이터를 data/gradecuts.json 으로 통합.
//
// 출처
//   1) data/raw/megastudy/gradecuts-normalized.json - 메가스터디 2016~2026 (1443건)
//   2) /tmp/csat_gc_normalized_v3.json              - 평가원 hwpx 2005~2020 (459건)
//   3) /tmp/recent_csat_gc.json                     - 평가원 매년 갱신 (28건 fan-out)
//   4) data/gradecuts.json 기존                      - rawCuts 11건 (사용자 입력)
//
// 우선순위 (같은 시험이면 뒤가 덮어씀):
//   기존 rawCuts (보존) → 평가원 hwpx → 평가원 recent → 메가스터디 (가장 우선)
// 메가스터디는 표준점수 외에 백분위·누적비율·최고점도 제공.

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

const [exams, megastudy, hwpxData, recentData, existing] = await Promise.all([
  readFile(EXAMS_PATH, 'utf-8').then(JSON.parse),
  readJsonOr(path.resolve(ROOT, 'data/raw/megastudy/gradecuts-normalized.json'), []),
  readJsonOr('/tmp/csat_gc_normalized_v3.json', []),
  readJsonOr('/tmp/recent_csat_gc.json', []),
  readJsonOr(OUT_PATH, []),
]);

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

// 4. 메가스터디 (가장 우선) — 표준점수+백분위+누적비율+최고점.
//    국어/수학의 통합형 시기는 단일 record (subSubject=null) 로 들어옴 → 사이트의 모든 변형으로 fan-out.
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
    if (r.standardPercentile?.some(v => v != null)) rec.standardPercentile = r.standardPercentile;
    if (r.cumulativePercent?.some(v => v != null)) rec.cumulativePercent = r.cumulativePercent;
    if (r.highestStandardScore != null) rec.highestStandardScore = r.highestStandardScore;
    rec.source = 'megastudy';
    megaApplied++;
  }
}

// 5. fullScore 채우기
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
console.log(`최종: ${out.length}건`);

const withRaw = out.filter(r => Array.isArray(r.rawCuts) && r.rawCuts.length).length;
const withStd = out.filter(r => Array.isArray(r.standardCuts) && r.standardCuts.length).length;
const withPct = out.filter(r => Array.isArray(r.standardPercentile)).length;
const matched = out.filter(r => examMetaIndex.has(makeKey(r.curriculum, r.gradeYear, r.type, r.subject, r.subSubject))).length;
console.log(`  rawCuts: ${withRaw}`);
console.log(`  standardCuts: ${withStd}`);
console.log(`  standardPercentile: ${withPct}`);
console.log(`  사이트 시험 매칭: ${matched}/${out.length}`);
