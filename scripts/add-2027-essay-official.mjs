#!/usr/bin/env node
// 2026-07-18 기준 대학 입학처가 공개한 2027학년도 모의논술 공식 자료를 추가한다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v19';
const sources = {
  cau: 'https://admission.cau.ac.kr/detail.do?board_seq=3252&menuurl=jcgylvDgJz1bdCxN45fl1g%3D%3D&pageNo=1',
  sejong: 'https://ipsi.sejong.ac.kr/sub_page/sub5/0102_view.asp?B_CATEGORY=0&B_CODE=BOARD_1455985403&IDX=81&tab1=5',
  yonseiMirae: 'https://admission.yonsei.ac.kr/mirae/admission/html/rolling/previousView.asp?BBS_NO=3163&s_code=BBS_SUBJECT&s_data=&s_page=1',
};

const rows = [
  ['중앙대학교', '인문계(가이드북)', 7, 'cau_2027_mock_humanities_guide.pdf', sources.cau],
  ['중앙대학교', '자연계(가이드북)', 7, 'cau_2027_mock_natural_guide.pdf', sources.cau],
  ['세종대학교', '자유전공', 7, 'sejong_2027_mock_free.pdf', sources.sejong],
  ['세종대학교', '인문계', 7, 'sejong_2027_mock_humanities.pdf', sources.sejong],
  ['세종대학교', '자연계', 7, 'sejong_2027_mock_natural.pdf', sources.sejong],
  ['연세대학교(미래)', '인문계(가이드북)', 6, 'yonsei_mirae_2027_mock_guide.pdf', sources.yonseiMirae],
  ['연세대학교(미래)', '자연계(가이드북)', 6, 'yonsei_mirae_2027_mock_guide.pdf', sources.yonseiMirae],
];

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
let nextId = Math.max(...exams.map(e => e.id)) + 1;
let added = 0;
for (const [school, field, month, asset, original] of rows) {
  const duplicate = exams.some(e => e.typeGroup === 'essay' && e.gradeYear === 2027
    && e.type === 'essay_mock' && e.subject === school && e.subSubject === field);
  if (duplicate) continue;
  const url = `${WORKER}/${asset}`;
  const title = `2027학년도 ${school} 모의논술 ${field} 문제·해설`;
  exams.push({
    id: nextId++,
    curriculum: '논술',
    gradeYear: 2027,
    examYear: 2026,
    month,
    typeGroup: 'essay',
    type: 'essay_mock',
    studentGrade: null,
    subject: school,
    subSubject: field,
    questionUrl: url,
    answerUrl: null,
    solutionUrl: url,
    questionDownload: `${title}.pdf`,
    answerDownload: null,
    solutionDownload: `${title}.pdf`,
    source: 'essay-v19',
    questionUrl_source_original: original,
    solutionUrl_source_original: original,
  });
  added++;
}

if (!added) {
  console.log('추가할 2027학년도 공식 논술 자료 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`2027학년도 공식 모의논술 ${added}건 추가`);
