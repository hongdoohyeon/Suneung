#!/usr/bin/env node
// 모은 등급컷 데이터를 data/gradecuts.json 으로 통합.
//
// 입력:
//   /tmp/csat_gc_normalized_v2.json  - 평가원 hwpx 2014-2020 수능 (68건, standardCuts)
//   /tmp/recent_csat_gc.json         - 평가원 매년 갱신 2026 수능/모의평가 (22건)
//   data/gradecuts.json              - 기존 (rawCuts 11건)
//
// 출력:
//   data/gradecuts.json              - 통합본
//
// 데이터 모델:
//   {
//     id, curriculum, gradeYear, examYear, month, typeGroup, type,
//     subject, subSubject,
//     rawCuts:        [원점수 8개]   ← 표시용 (있을 때만)
//     standardCuts:   [표준점수 8개] ← 평가원 공식 (DB 활용)
//     fullScore:      원점수 만점
//   }

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXAMS_PATH = path.resolve(ROOT, 'data/exams.json');
const OUT_PATH = path.resolve(ROOT, 'data/gradecuts.json');

const [exams, hwpxData, recentData, existingCuts] = await Promise.all([
  readFile(EXAMS_PATH, 'utf-8').then(JSON.parse),
  readFile('/tmp/csat_gc_normalized_v2.json', 'utf-8').then(JSON.parse),
  readFile('/tmp/recent_csat_gc.json', 'utf-8').then(JSON.parse),
  readFile(OUT_PATH, 'utf-8').then(JSON.parse).catch(() => []),
]);

// 키: (curriculum, gradeYear, type, subject, subSubject) → exam meta
const examIndex = new Map();
for (const e of exams) {
  const k = `${e.curriculum}|${e.gradeYear}|${e.type}|${e.subject}|${e.subSubject ?? ''}`;
  examIndex.set(k, e);
}

// 결과 저장 맵 (같은 키면 합치기)
const resultMap = new Map();   // key → record

function makeKey(curr, yr, type, subj, sub) {
  return `${curr}|${yr}|${type}|${subj}|${sub ?? ''}`;
}

// 1) 기존 데이터 먼저 적재 (rawCuts 보존)
for (const c of existingCuts) {
  const k = makeKey(c.curriculum, c.gradeYear, c.type, c.subject, c.subSubject);
  resultMap.set(k, { ...c });
}

// 2) hwpx 데이터 적재 (standardCuts) — siteId 가 있는 것만
let hwpxApplied = 0, hwpxSkip = 0;
for (const r of hwpxData) {
  if (!r.siteId) { hwpxSkip++; continue; }
  const exam = exams.find(e => e.id === r.siteId);
  if (!exam) { hwpxSkip++; continue; }
  const k = makeKey(exam.curriculum, exam.gradeYear, exam.type, exam.subject, exam.subSubject);
  let rec = resultMap.get(k);
  if (!rec) {
    rec = {
      curriculum: exam.curriculum,
      gradeYear: exam.gradeYear,
      examYear: exam.examYear,
      month: exam.month,
      typeGroup: exam.typeGroup,
      type: exam.type,
      subject: exam.subject,
      subSubject: exam.subSubject,
    };
    resultMap.set(k, rec);
  }
  rec.standardCuts = r.rawCuts;   // hwpx 의 'rawCuts' 는 사실 표준점수
  hwpxApplied++;
}

// 3) recent 데이터 적재. 2026 csat / sept.
//    표준점수는 선택과목과 무관 → 사이트의 모든 subSubject 변형에 복사.
//    또한 영어/한국사/탐구는 1:1 매칭.
function fanoutSubjects(year, type, subj, sub, cuts) {
  // 사이트의 (year, type, subj) 모든 subSubject 후보
  const matches = exams.filter(e =>
    e.gradeYear === year && e.type === type && e.subject === subj
  );
  if (sub != null) {
    return matches.filter(e => (e.subSubject ?? null) === sub);
  }
  // sub 가 None 인데 사이트에 여러 subSubject 가 있으면 모두에게 같은 컷 적용
  return matches;
}

let recentApplied = 0, recentSkip = 0;
for (const r of recentData) {
  const targets = fanoutSubjects(r.year, r.type, r.subject, r.subSubject, r.standardCuts);
  if (targets.length === 0) { recentSkip++; continue; }
  for (const exam of targets) {
    const k = makeKey(exam.curriculum, exam.gradeYear, exam.type, exam.subject, exam.subSubject);
    let rec = resultMap.get(k);
    if (!rec) {
      rec = {
        curriculum: exam.curriculum,
        gradeYear: exam.gradeYear,
        examYear: exam.examYear,
        month: exam.month,
        typeGroup: exam.typeGroup,
        type: exam.type,
        subject: exam.subject,
        subSubject: exam.subSubject,
      };
      resultMap.set(k, rec);
    }
    rec.standardCuts = r.standardCuts;
    recentApplied++;
  }
}

// 4) fullScore (원점수 만점) 채우기 — 영역별
function fullScoreFor(subj) {
  const map = {
    '국어': 100, '수학': 100, '영어': 100, '한국사': 50,
    '사회탐구': 50, '과학탐구': 50,
    '통합사회': 50, '통합과학': 50,
    '언어이해': null, '추리논증': null, '논술': null,   // LEET — 별도 처리
  };
  return map[subj] ?? null;
}

// id 부여 + sort
const sorted = [...resultMap.values()].sort((a, b) => {
  if (a.gradeYear !== b.gradeYear) return b.gradeYear - a.gradeYear;
  const tOrder = { csat: 0, sept: 1, june: 2, oct: 3, jul: 4, apr: 5, mar: 6 };
  if ((tOrder[a.type] ?? 99) !== (tOrder[b.type] ?? 99)) return (tOrder[a.type] ?? 99) - (tOrder[b.type] ?? 99);
  return (a.subject + (a.subSubject ?? '')).localeCompare(b.subject + (b.subSubject ?? ''));
});

const out = sorted.map((rec, i) => {
  const r = { ...rec, id: i + 1 };
  if (r.fullScore == null) {
    const fs = fullScoreFor(r.subject);
    if (fs != null) r.fullScore = fs;
  }
  return r;
});

await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

console.log(`기존 데이터: ${existingCuts.length}건`);
console.log(`hwpx 적재 (standardCuts): ${hwpxApplied}건 (skip ${hwpxSkip})`);
console.log(`recent 적재 (standardCuts): ${recentApplied}건 (skip ${recentSkip})`);
console.log(`최종 저장: ${out.length}건`);

// 통계
const withRaw = out.filter(r => Array.isArray(r.rawCuts) && r.rawCuts.length).length;
const withStd = out.filter(r => Array.isArray(r.standardCuts) && r.standardCuts.length).length;
const withBoth = out.filter(r =>
  Array.isArray(r.rawCuts) && r.rawCuts.length &&
  Array.isArray(r.standardCuts) && r.standardCuts.length
).length;
console.log(`  rawCuts 보유: ${withRaw}건`);
console.log(`  standardCuts 보유: ${withStd}건`);
console.log(`  둘 다: ${withBoth}건`);
