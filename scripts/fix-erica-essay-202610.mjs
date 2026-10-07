#!/usr/bin/env node
// 한양대 ERICA 논술 정리(2026-10-07). 자산은 essay-v26 릴리즈.
// - 해설 문서(2019 모범답안, 2020 인문·자연·2021 수리 출제의도 및 예시답안)가 별도 '시험' 항목으로 들어가 있던 것을
//   오전/오후 시험의 해설로 쪽을 나눠 옮기고 그 항목은 삭제
// - 2021 모의 해설 칸에 빈 답안지가 연결돼 있던 것을 비움
// - ERICA 출처 주소를 현재 입학처(goerica.hanyang.ac.kr)로
// 멱등.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v26';
const ORIGIN = 'https://goerica.hanyang.ac.kr/admission/intro.asp';
const SCHOOL = '한양대학교(ERICA)';

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const byId = new Map(exams.map(e => [e.id, e]));
let changed = 0;

const moves = [10945, 10946, 10952, 10953, 10955, 10956, 10959, 10960];
for (const id of moves) {
  const e = byId.get(id);
  if (!e || e.solutionUrl) continue;
  e.solutionDownload = `${e.gradeYear}학년도 ${SCHOOL} 논술 ${e.subSubject} 해설.pdf`;
  e.solutionUrl = `${WORKER}/sol3_${id}.pdf?name=${encodeURIComponent(e.solutionDownload)}`;
  e.solutionUrl_source_original = ORIGIN;
  changed++;
}

for (const id of [10961, 10962]) {
  const e = byId.get(id);
  if (!e || !e.solutionUrl) continue;
  e.solutionUrl = null;
  e.solutionDownload = null;
  delete e.solutionUrl_source_original;
  changed++;
}

const pseudo = new Set([10944, 10951, 10954, 10958]);
const before = exams.length;
const kept = exams.filter(e => !pseudo.has(e.id));
changed += before - kept.length;

for (const e of kept) {
  if (e.subject !== SCHOOL) continue;
  for (const k of ['questionUrl_source_original', 'solutionUrl_source_original']) {
    if (e[k] && e[k] !== ORIGIN && e[k].includes('erica.hanyang.ac.kr/admission')) { e[k] = ORIGIN; changed++; }
  }
}

if (!changed) {
  console.log('ERICA 논술: 바꿀 것 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(kept, null, 2)}\n`, 'utf8');
console.log(`ERICA 논술: ${changed}건 변경`);
