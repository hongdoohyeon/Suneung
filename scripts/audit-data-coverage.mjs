#!/usr/bin/env node
// 고1·고2 학평 및 논술 기출 커버리지를 집계하고 회귀 조건을 검증한다.

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const exams = JSON.parse(await readFile(new URL('data/exams.json', ROOT), 'utf8'));
const errors = [];

const education2013 = {};
for (const grade of [1, 2]) {
  const rows = exams.filter(e => e.typeGroup === 'education' && e.examYear === 2013 && e.studentGrade === grade);
  const months = [...new Set(rows.map(e => e.month))].sort((a, b) => a - b);
  education2013[grade] = { rows, months };
  const expected = grade === 1 ? 37 : 85;
  if (rows.length !== expected) errors.push(`2013 고${grade} ${rows.length}건 (예상 ${expected}건)`);
  if (months.join(',') !== '3,6,9,11') errors.push(`2013 고${grade} 회차 ${months.join(',')}`);
  if (rows.some(e => !e.questionUrl || !e.solutionUrl)) errors.push(`2013 고${grade} 문제지/해설 누락`);
}

const essays = exams.filter(e => e.typeGroup === 'essay');
const essayYears = Object.entries(essays.reduce((acc, e) => {
  acc[e.gradeYear] = (acc[e.gradeYear] || 0) + 1;
  return acc;
}, {})).sort((a, b) => Number(a[0]) - Number(b[0]));
const essaySchools = Object.entries(essays.reduce((acc, e) => {
  acc[e.subject] = (acc[e.subject] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));

const rounds = new Map();
for (const e of essays) {
  const key = `${e.subject}\t${e.gradeYear}\t${e.type}`;
  const round = rounds.get(key) || { school: e.subject, year: e.gradeYear, type: e.type, q: 0, a: 0, s: 0 };
  round.q += Boolean(e.questionUrl);
  round.a += Boolean(e.answerUrl);
  round.s += Boolean(e.solutionUrl);
  rounds.set(key, round);
}
const questionOnly = [...rounds.values()].filter(r => r.q > 0 && r.a === 0 && r.s === 0);
const questionOnlySchools = Object.entries(questionOnly.reduce((acc, r) => {
  acc[r.school] = (acc[r.school] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
const latestOfficial = essays.filter(e => e.source === 'essay-v19');
if (latestOfficial.length !== 7) errors.push(`essay-v19 ${latestOfficial.length}건 (예상 7건)`);
if (latestOfficial.some(e => !e.questionUrl?.includes('/essay-v19/') || !e.solutionUrl?.includes('/essay-v19/'))) {
  errors.push('essay-v19 문제/해설 URL 누락');
}

const today = new Date().toISOString().slice(0, 10);
const report = `# 데이터 커버리지 현황

기준일 ${today} · \`data/exams.json\` 실측

## 고1·고2 학력평가

- 고1: ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 1).length}건
- 고2: ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 2).length}건
- 2013년 보강: 고1 ${education2013[1].rows.length}건, 고2 ${education2013[2].rows.length}건
- 2013년 회차: 고1·고2 모두 ${education2013[1].months.join('·')}월
- 2013년 문제지·해설지: ${education2013[1].rows.length + education2013[2].rows.length}건 모두 EBSi 공식 PDF 연결

## 대학 논술

- 전체: ${essays.length}건 / ${essaySchools.length}개교 / ${rounds.size}개 회차
- 학년도 범위: ${essayYears[0][0]}~${essayYears.at(-1)[0]}
- 문제는 있으나 답안·해설이 없는 회차: ${questionOnly.length}개
- 2027학년도: ${essays.filter(e => e.gradeYear === 2027).length}건
- 이번 공식 보강: 중앙대 2건, 세종대 3건, 연세대 미래캠퍼스 2건

### 학년도별 건수

${essayYears.map(([year, count]) => `- ${year}: ${count}건`).join('\n')}

### 학교별 건수

${essaySchools.map(([school, count]) => `- ${school}: ${count}건`).join('\n')}

### 문제만 보유한 회차

${questionOnlySchools.map(([school, count]) => `- ${school}: ${count}회차`).join('\n')}

## 해석 주의

- 논술 본고사는 대학이 예시답안·해설을 공개하지 않는 경우가 많아, 문제만 있는 회차가 곧 수집 실패를 뜻하지는 않는다.
- 2027학년도 모의논술은 대학별 공개 일정이 달라 수시로 갱신해야 한다.
- 정시 반영비율·70%컷 커버리지는 \`npm run validate-admissions\` 출력으로 별도 확인한다.
`;

console.log(`고1 ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 1).length}건 / 고2 ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 2).length}건`);
console.log(`논술 ${essays.length}건 / ${essaySchools.length}개교 / 문제만 ${questionOnly.length}회차 / 2027학년도 ${essays.filter(e => e.gradeYear === 2027).length}건`);
if (errors.length) {
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
if (process.argv.includes('--write')) {
  await writeFile(new URL('docs/데이터-커버리지-현황.md', ROOT), report, 'utf8');
  console.log('docs/데이터-커버리지-현황.md 갱신 완료');
}
