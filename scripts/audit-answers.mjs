// 답안 데이터(data/answers.json) 전수 sanity check
//
// 점검 항목:
//  1) '?' 가 포함된 답 (추출 누락)
//  2) 단답형 시험인데 정상 문항 수보다 짧음 (수능/사관/경찰 수학 등)
//  3) 같은 답지 URL 을 공유하는 시험들의 공통 부분(1~22 등)이 일치 여부
//     → 다컬럼 답지에서 잘못 매칭된 케이스 발견
//  4) 답이 모두 같은 값 (의심)
//  5) 답안 길이가 시험별 표준치와 크게 다른 경우
//
// 결과: data/audit-report.json (의심 케이스 목록) + 콘솔 요약

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 시험별 표준 문항 수 (참고용 — 정확치 아닐 수 있음)
function expectedLen(exam) {
  const c = exam.curriculum, t = exam.type, s = exam.subject;
  // 수능/평가원/교육청
  if (['suneung', 'csat', 'june', 'sept', 'mar', 'apr', 'jul', 'oct'].includes(t) || c === '2015' || c === '2009') {
    if (s === '국어') return 45;
    if (s === '수학') return 30;
    if (s === '영어') return 45;
    if (s === '한국사') return 20;
    if (s === '사회탐구' || s === '과학탐구') return 20;
    if (s === '통합과학' || s === '통합사회') return 25;
  }
  // 사관학교
  if (c === '사관' || t === 'military_annual') {
    if (s === '국어') return 30;
    if (s === '수학') return 30;
    if (s === '영어') return 30;
  }
  // 경찰대
  if (c === '경찰대' || t === 'police_annual') {
    if (s === '국어') return 45;
    if (s === '수학') return 25;
    if (s === '영어') return 45;
  }
  // LEET
  if (c === 'LEET' || t === 'leet_annual') {
    if (s === '언어이해') return 30;
    if (s === '추리논증') return 40;
  }
  // MEET
  if (c === 'MEET' || t === 'meet_annual') {
    if (s === '언어추론') return 30;
  }
  return null;
}

const exams = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'exams.json'), 'utf8'));
const ans   = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'answers.json'), 'utf8'));

const examById = new Map(exams.map(e => [e.id, e]));
const issues = [];

function pushIssue(exam, type, detail) {
  issues.push({
    id: exam.id, curriculum: exam.curriculum, gradeYear: exam.gradeYear,
    type: exam.type, subject: exam.subject, sub: exam.subSubject,
    issue: type, detail,
  });
}

// 1+2+4+5 — 시험별 점검
for (const exam of exams) {
  const a = ans[String(exam.id)];
  if (!a) continue;

  // 1) '?' 포함
  const qmark = a.filter(x => x === '?').length;
  if (qmark > 0) {
    pushIssue(exam, 'qmark', { qmark, total: a.length });
  }

  // 2) 길이 부족 — 단답형 누락 의심
  const expected = expectedLen(exam);
  if (expected != null && a.length < expected) {
    pushIssue(exam, 'short', { actual: a.length, expected });
  }
  // 5) 길이 초과 (거짓 매칭 의심)
  if (expected != null && a.length > expected + 5) {
    pushIssue(exam, 'long', { actual: a.length, expected });
  }

  // 4) 모두 같은 값
  const validAns = a.filter(x => x !== '?');
  if (validAns.length >= 5) {
    const allSame = validAns.every(x => x === validAns[0]);
    if (allSame) pushIssue(exam, 'all-same', { value: validAns[0], count: validAns.length });
  }
}

// 3) 같은 답지 URL 공유 시험들의 공통 부분 일치 여부
//    수학 답지 한 개 → 미적분/기하/확통 3시험. 1~22 공통 답이 모두 같아야 함.
const byUrl = new Map();
for (const exam of exams) {
  if (!exam.answerUrl) continue;
  const a = ans[String(exam.id)];
  if (!a) continue;
  if (!byUrl.has(exam.answerUrl)) byUrl.set(exam.answerUrl, []);
  byUrl.get(exam.answerUrl).push({ exam, ans: a });
}

for (const [url, group] of byUrl.entries()) {
  if (group.length < 2) continue;   // 1개면 비교 X

  // 가장 짧은 길이까지 공통 부분
  const minLen = Math.min(...group.map(g => g.ans.length));
  const commonEnd = Math.min(minLen, 22);   // 보통 1~22가 공통
  const mismatches = [];
  for (let i = 0; i < commonEnd; i++) {
    const vals = new Set(group.map(g => g.ans[i]));
    vals.delete('?');
    if (vals.size > 1) {
      mismatches.push({ idx: i + 1, values: [...vals] });
    }
  }
  if (mismatches.length > 0) {
    for (const g of group) {
      pushIssue(g.exam, 'shared-mismatch', {
        url: url.slice(0, 80),
        groupSize: group.length,
        mismatchCount: mismatches.length,
        firstMismatches: mismatches.slice(0, 3),
      });
    }
  }
}

// ── 결과 저장 + 요약 ─────────────────────────────────
const reportPath = path.join(ROOT, 'data', 'audit-report.json');
await fs.writeFile(reportPath, JSON.stringify(issues, null, 2) + '\n');

const summary = {};
for (const i of issues) summary[i.issue] = (summary[i.issue] || 0) + 1;

console.log(`전체 추출됨: ${Object.keys(ans).length}개`);
console.log(`이슈 발견: ${issues.length}건 (${new Set(issues.map(i => i.id)).size}개 시험)`);
console.log('\n이슈 종류별:');
for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(18)} ${v}건`);
}
console.log(`\n상세: data/audit-report.json`);
