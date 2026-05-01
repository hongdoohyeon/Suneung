#!/usr/bin/env node
// 모은 등급컷 데이터를 data/gradecuts.json 으로 통합.
// 평가원 공공데이터는 매칭 여부와 무관하게 모두 보존 (향후 시험 추가 대비).
//
// 입력:
//   /tmp/csat_gc_normalized_v3.json  - 평가원 hwpx 2005-2020 수능 (459건, standardCuts)
//   /tmp/recent_csat_gc.json         - 평가원 매년 갱신 2026 수능/모의 (22건)
//   data/gradecuts.json              - 기존 (rawCuts 11건)
//
// 데이터 모델:
//   {
//     id, curriculum, gradeYear, examYear, month, typeGroup, type,
//     subject, subSubject,
//     rawCuts:        [원점수 8개]   ← 표시용 (원점수 만점 fullScore 기준)
//     standardCuts:   [표준점수 8개] ← 평가원 공식 (DB 활용, 만점 무관)
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
  readFile('/tmp/csat_gc_normalized_v3.json', 'utf-8').then(JSON.parse),
  readFile('/tmp/recent_csat_gc.json', 'utf-8').then(JSON.parse),
  readFile(OUT_PATH, 'utf-8').then(JSON.parse).catch(() => []),
]);

function makeKey(curr, yr, type, subj, sub) {
  return `${curr}|${yr}|${type}|${subj}|${sub ?? ''}`;
}

// 사이트 시험 메타 (curriculum, examYear, month, typeGroup) 채우기 위해 인덱싱
const examMetaIndex = new Map();
for (const e of exams) {
  const k = makeKey(e.curriculum, e.gradeYear, e.type, e.subject, e.subSubject);
  examMetaIndex.set(k, e);
}

const resultMap = new Map();

// 1) 기존 rawCuts 11건 - 그대로 유지
for (const c of existingCuts) {
  const k = makeKey(c.curriculum, c.gradeYear, c.type, c.subject, c.subSubject);
  resultMap.set(k, { ...c });
}

// 2) hwpx 459건 — 사이트 매칭 무관 적재
let hwpxApplied = 0;
for (const r of hwpxData) {
  const exam = examMetaIndex.get(makeKey(r.curriculum, r.gradeYear, r.type, r.subject, r.subSubject));
  const k = makeKey(r.curriculum, r.gradeYear, r.type, r.subject, r.subSubject);
  let rec = resultMap.get(k);
  if (!rec) {
    rec = exam ? {
      curriculum: exam.curriculum,
      gradeYear: exam.gradeYear,
      examYear: exam.examYear,
      month: exam.month,
      typeGroup: exam.typeGroup,
      type: exam.type,
      subject: exam.subject,
      subSubject: exam.subSubject,
    } : {
      curriculum: r.curriculum,
      gradeYear: r.gradeYear,
      examYear: r.examYear,
      month: r.month,
      typeGroup: r.typeGroup,
      type: r.type,
      subject: r.subject,
      subSubject: r.subSubject,
    };
    resultMap.set(k, rec);
  }
  rec.standardCuts = r.standardCuts;
  hwpxApplied++;
}

// 3) recent 22건 — 사이트의 모든 subSubject 변형으로 fan-out
function fanoutSubjects(year, type, subj, sub) {
  const matches = exams.filter(e =>
    e.gradeYear === year && e.type === type && e.subject === subj
  );
  if (sub != null) {
    return matches.filter(e => (e.subSubject ?? null) === sub);
  }
  // sub 가 None 인데 사이트에 여러 subSubject 가 있으면 모두에게 같은 컷 적용
  if (matches.length > 0) return matches;
  // 사이트에 시험 없음 — 단일 record (subSubject=null)
  return [{
    curriculum: '2015',
    gradeYear: year,
    examYear: year - 1,
    month: type === 'csat' ? 11 : 9,
    typeGroup: 'suneung',
    type, subject: subj, subSubject: null,
  }];
}

let recentApplied = 0;
for (const r of recentData) {
  const targets = fanoutSubjects(r.year, r.type, r.subject, r.subSubject);
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

// 4) fullScore (원점수 만점) — 영역별
const FULL_SCORE = {
  '국어': 100, '수학': 100, '영어': 100, '한국사': 50,
  '사회탐구': 50, '과학탐구': 50,
  '통합사회': 50, '통합과학': 50,
  '직업탐구': 50, '제2외국어': 50,
};

const sorted = [...resultMap.values()].sort((a, b) => {
  if (a.gradeYear !== b.gradeYear) return b.gradeYear - a.gradeYear;
  const tOrder = { csat: 0, sept: 1, june: 2, oct: 3, jul: 4, apr: 5, mar: 6 };
  if ((tOrder[a.type] ?? 99) !== (tOrder[b.type] ?? 99)) return (tOrder[a.type] ?? 99) - (tOrder[b.type] ?? 99);
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

console.log(`기존 rawCuts: ${existingCuts.length}건`);
console.log(`hwpx 적재: ${hwpxApplied}건`);
console.log(`recent 적재: ${recentApplied}건`);
console.log(`최종: ${out.length}건`);

const withRaw = out.filter(r => Array.isArray(r.rawCuts) && r.rawCuts.length).length;
const withStd = out.filter(r => Array.isArray(r.standardCuts) && r.standardCuts.length).length;
const matchedSite = out.filter(r => examMetaIndex.has(makeKey(r.curriculum, r.gradeYear, r.type, r.subject, r.subSubject))).length;
console.log(`  rawCuts 보유: ${withRaw}`);
console.log(`  standardCuts 보유: ${withStd}`);
console.log(`  사이트 시험 매칭: ${matchedSite}`);
console.log(`  사이트 시험 없음(보존): ${out.length - matchedSite}`);
