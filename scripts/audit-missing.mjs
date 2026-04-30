#!/usr/bin/env node
// data/answers.json 에서 ? 가 포함된 시험을 찾아 보고서를 생성.
//   data/answers-missing.json 에 저장.
//
// 출력 구조:
//   {
//     "generatedAt": "...",
//     "totalExams": ...,
//     "examsWithMissing": ...,
//     "totalMissing": ...,
//     "missingByPosition": { "수학_22": 63, ... },
//     "exams": [
//       {
//         "id": 7, "subject": "수학", "subSubject": "기하",
//         "gradeYear": 2027, "type": "mar", "curriculum": "2015",
//         "missingNumbers": [16,17,18,19,20,21,22,29,30],
//         "totalLength": 30
//       }, ...
//     ]
//   }

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ANSWERS_PATH = path.resolve(ROOT, 'data/answers.json');
const EXAMS_PATH   = path.resolve(ROOT, 'data/exams.json');
const OUT_PATH     = path.resolve(ROOT, 'data/answers-missing.json');

const answers = JSON.parse(await readFile(ANSWERS_PATH, 'utf-8'));
const exams   = JSON.parse(await readFile(EXAMS_PATH,   'utf-8'));
const examById = new Map(exams.map(e => [e.id, e]));

const missingByPosition = {};
const examsOut = [];
let totalMissing = 0;

for (const [eid_str, arr] of Object.entries(answers)) {
  const exam = examById.get(Number(eid_str));
  if (!exam) continue;
  const missingNumbers = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === '?') missingNumbers.push(i + 1);
  }
  if (missingNumbers.length === 0) continue;

  totalMissing += missingNumbers.length;
  for (const n of missingNumbers) {
    const k = `${exam.subject}_${n}`;
    missingByPosition[k] = (missingByPosition[k] || 0) + 1;
  }
  examsOut.push({
    id: exam.id,
    curriculum: exam.curriculum,
    gradeYear: exam.gradeYear,
    type: exam.type,
    subject: exam.subject,
    subSubject: exam.subSubject,
    totalLength: arr.length,
    missingCount: missingNumbers.length,
    missingNumbers,
    questionUrl: exam.questionUrl,
    answerUrl: exam.answerUrl,
  });
}

// 누락 많은 순 정렬
examsOut.sort((a, b) => b.missingCount - a.missingCount || a.id - b.id);

// 위치별 빈도 — 빈도 높은 순으로
const sortedPositions = Object.fromEntries(
  Object.entries(missingByPosition).sort((a, b) => b[1] - a[1])
);

const report = {
  generatedAt: new Date().toISOString(),
  totalExams: Object.keys(answers).length,
  examsWithMissing: examsOut.length,
  totalMissing,
  missingByPosition: sortedPositions,
  reason: 'PDF의 단답형 영역 폰트 cmap 매핑이 깨져 PDF.js·PDFium·pdftotext 모두 텍스트 추출 불가. 공식 데이터 외에는 자동 보완 어려움.',
  exams: examsOut,
};

await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + '\n');

// 요약 출력
console.log(`보고서 생성: data/answers-missing.json`);
console.log(`  누락 포함 시험: ${examsOut.length}건 / 전체 ${report.totalExams}건`);
console.log(`  누락 정답 합계: ${totalMissing}개`);
console.log('\n  누락이 많은 위치 TOP 10:');
const top = Object.entries(sortedPositions).slice(0, 10);
for (const [pos, count] of top) {
  console.log(`    ${pos.padEnd(15)}  ${count}회`);
}
console.log('\n  과목별 누락 합계:');
const bySubject = {};
for (const ex of examsOut) {
  bySubject[ex.subject] = (bySubject[ex.subject] || 0) + ex.missingCount;
}
for (const [s, c] of Object.entries(bySubject).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${s.padEnd(8)}  ${c}개`);
}
