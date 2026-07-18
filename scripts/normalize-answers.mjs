#!/usr/bin/env node
// data/answers.json 정상화: 검증할 수 없는 자동 추출값을 별도 격리.
//   - '?' 포함 또는 표준 문항 수 불일치 값을 임의 보정하지 않음.
//   - 원본 값과 사유는 data/answers-unverified.json 에 보존.
//   - 정상 문항 수가 정의되지 않은 카테고리는 '?' 포함 여부만 검사.
//
// 실행:  node scripts/normalize-answers.mjs           # 미리보기
//        node scripts/normalize-answers.mjs --write   # 실제 갱신

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ANSWERS_PATH = path.resolve(ROOT, 'data/answers.json');
const UNVERIFIED_PATH = path.resolve(ROOT, 'data/answers-unverified.json');
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
  if (exam.typeGroup === 'leet') {
    return { '언어이해': 30, '추리논증': 40 }[exam.subject] ?? null;
  }
  if (exam.typeGroup === 'military' && exam.gradeYear >= 2021) {
    return { '국어': 30, '수학': 30, '영어': 30 }[exam.subject] ?? null;
  }
  // MEET/옛 사관/경찰대: 시기별 문항 수 변화가 커서 미정의
  return null;
}

const answers = JSON.parse(await fs.readFile(ANSWERS_PATH, 'utf-8'));
const exams   = JSON.parse(await fs.readFile(EXAMS_PATH,   'utf-8'));
const examById = new Map(exams.map(e => [e.id, e]));

let quarantined = 0, verified = 0;
let unverified = {};
try { unverified = JSON.parse(await fs.readFile(UNVERIFIED_PATH, 'utf-8')); }
catch {}
const samples = [];

for (const [eid_str, arr] of Object.entries(answers)) {
  const exam = examById.get(Number(eid_str));
  const expected = exam ? expectedLength(exam) : null;
  const reasons = [];
  if (!exam) reasons.push('orphan');
  if (!Array.isArray(arr)) reasons.push('not-array');
  if (Array.isArray(arr) && arr.includes('?')) reasons.push('unknown-values');
  if (Array.isArray(arr) && expected != null && arr.length !== expected) {
    reasons.push(`length-${arr.length}-expected-${expected}`);
  }
  if (reasons.length === 0) {
    delete unverified[eid_str];
    verified++;
    continue;
  }

  unverified[eid_str] = {
    reasons,
    exam: exam ? {
      id: exam.id,
      gradeYear: exam.gradeYear,
      type: exam.type,
      subject: exam.subject,
      subSubject: exam.subSubject,
      answerUrl: exam.answerUrl,
    } : null,
    answers: arr,
  };
  delete answers[eid_str];
  quarantined++;
  if (samples.length < 10) samples.push(`id=${eid_str} ${reasons.join(', ')}`);
}

console.log(`검증 완료 ${verified}건 / 격리 ${quarantined}건`);
for (const sample of samples) console.log(`  ${sample}`);

if (WRITE) {
  await fs.writeFile(ANSWERS_PATH, JSON.stringify(answers, null, 2) + '\n');
  await fs.writeFile(UNVERIFIED_PATH, JSON.stringify(unverified, null, 2) + '\n');
  console.log('\n✅ answers.json 검증값 갱신 / answers-unverified.json 격리값 보존');
} else {
  console.log('\n(미리보기 모드. 실제 적용은 --write 추가)');
}
