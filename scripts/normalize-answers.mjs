#!/usr/bin/env node
// data/answers.json 정상화: 과목별 표준 문항 수에 array 길이 강제.
//   - 길이가 더 길면 잘라냄 (다른 컬럼 답이 섞인 케이스)
//   - 길이가 더 짧으면 '?' 로 padding (단답형 추출 누락 케이스)
//   - 정상 문항 수가 정의되지 않은 카테고리(LEET/MEET/사관/경찰대)는 건드리지 않음.
//
// 실행:  node scripts/normalize-answers.mjs           # 미리보기
//        node scripts/normalize-answers.mjs --write   # 실제 갱신

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ANSWERS_PATH = path.resolve(ROOT, 'data/answers.json');
const EXAMS_PATH   = path.resolve(ROOT, 'data/exams.json');

const WRITE = process.argv.includes('--write');

// 과목별 표준 문항 수.
// typeGroup 으로 1차 필터링 후 subject 매핑.
const SUNEUNG_LIKE = new Set(['suneung', 'education']);
const SUNEUNG_LENGTH = {
  '국어':   45,
  '영어':   45,
  '수학':   30,
  '한국사': 20,
  '사회탐구': 20,
  '과학탐구': 20,
};
const PRELIM_LENGTH = {  // 2028 예비시험
  '국어':   45,
  '수학':   30,
  '통합사회': 25,
  '통합과학': 24,
};

function expectedLength(exam) {
  // 평가원 예비(prelim) 는 typeGroup='suneung' 이지만 문항수가 다름 → type 우선 분기
  if (exam.type === 'prelim') return PRELIM_LENGTH[exam.subject] ?? null;
  if (SUNEUNG_LIKE.has(exam.typeGroup)) return SUNEUNG_LENGTH[exam.subject] ?? null;
  // LEET/MEET/사관/경찰대: 시기별 문항 수 변화가 커서 미정의
  return null;
}

const answers = JSON.parse(await fs.readFile(ANSWERS_PATH, 'utf-8'));
const exams   = JSON.parse(await fs.readFile(EXAMS_PATH,   'utf-8'));
const examById = new Map(exams.map(e => [e.id, e]));

let trimmed = 0, padded = 0, untouched = 0, skipped = 0;
const trimSamples = [], padSamples = [];

for (const [eid_str, arr] of Object.entries(answers)) {
  const exam = examById.get(Number(eid_str));
  if (!exam) { skipped++; continue; }
  const expected = expectedLength(exam);
  if (expected == null) { skipped++; continue; }

  if (arr.length === expected) { untouched++; continue; }

  if (arr.length > expected) {
    const removed = arr.slice(expected);
    answers[eid_str] = arr.slice(0, expected);
    trimmed++;
    if (trimSamples.length < 5) trimSamples.push({
      id: exam.id, subject: exam.subject, sub: exam.subSubject,
      from: arr.length, to: expected, removed,
    });
  } else {
    const padded_arr = [...arr];
    while (padded_arr.length < expected) padded_arr.push('?');
    answers[eid_str] = padded_arr;
    padded++;
    if (padSamples.length < 5) padSamples.push({
      id: exam.id, subject: exam.subject, sub: exam.subSubject,
      from: arr.length, to: expected,
    });
  }
}

console.log(`총 ${Object.keys(answers).length}건`);
console.log(`  ✓ 정상 (변경없음): ${untouched}`);
console.log(`  ✂ 자름 (length 초과): ${trimmed}`);
console.log(`  ＋ padding (length 부족): ${padded}`);
console.log(`  − skip (정상길이 미정의): ${skipped}`);

if (trimSamples.length) {
  console.log('\n자른 샘플:');
  for (const s of trimSamples) {
    console.log(`  id=${s.id} ${s.subject}${s.sub?`(${s.sub})`:''} ${s.from}→${s.to}, 제거: ${s.removed.join(',')}`);
  }
}
if (padSamples.length) {
  console.log('\npadding 샘플:');
  for (const s of padSamples) {
    console.log(`  id=${s.id} ${s.subject}${s.sub?`(${s.sub})`:''} ${s.from}→${s.to}`);
  }
}

if (WRITE) {
  await fs.writeFile(ANSWERS_PATH, JSON.stringify(answers) + '\n');
  console.log('\n✅ data/answers.json 갱신');
} else {
  console.log('\n(미리보기 모드. 실제 적용은 --write 추가)');
}
