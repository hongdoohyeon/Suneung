#!/usr/bin/env node
// 고려대학교(서울) 2005~2016학년도 논술 기출·모의논술 중 빠져 있던 것을 추가한다.
// 원본: 고려대 입학처 자료 게시판(BOARD_SEQ=2) 첨부. 자산은 essay-v22 릴리즈.
// HWP 는 PDF 로 변환, 백서·자료집은 계열별 문제·해설 쪽만 잘라 올렸다.
// 보류(수식·글상자가 변환에서 깨짐): 2005 정시 문제, 2008 수시2 자연, 2008 정시 자연 해설, 2010 수시 전부.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v22';
const SCHOOL = '고려대학교';
const original = seq => `https://oku.korea.ac.kr/ajaxfile/FR_SVC/FileDown.do?GBN=X01&BOARD_SEQ=2&SITE_NO=2&BBS_SEQ=${seq}&FILE_SEQ=1`;

// [학년도, 시행년, 시행월, type, 계열, 문제 자산, 해설 자산(null=미공개), 출처 게시글 번호]
const rows = [
  [2005, 2004, 11, 'essay_annual', '수시2 인문계(언어논술)', 'ku_2005_annual_hum_s2_q.pdf', 'ku_2005_annual_s2_s.pdf', 2],
  [2005, 2004, 11, 'essay_annual', '수시2 자연계(언어논술)', 'ku_2005_annual_nat_s2_q.pdf', 'ku_2005_annual_s2_s.pdf', 3],
  [2006, 2006, 1, 'essay_annual', '정시 계열공통', 'ku_2006_annual_all_js_q.pdf', 'ku_2006_annual_all_js_s.pdf', 9],
  [2007, 2006, 8, 'essay_annual', '수시1 인문계', 'ku_2007_annual_hum_s1_q.pdf', 'ku_2007_annual_s1_s.pdf', 12],
  [2007, 2006, 8, 'essay_annual', '수시1 자연계', 'ku_2007_annual_nat_s1_q.pdf', 'ku_2007_annual_s1_s.pdf', 12],
  [2007, 2006, 11, 'essay_annual', '수시2 인문계', 'ku_2007_annual_hum_s2_q.pdf', 'ku_2007_annual_hum_s2_s.pdf', 13],
  [2007, 2006, 11, 'essay_annual', '수시2 자연계', 'ku_2007_annual_nat_s2_q.pdf', 'ku_2007_annual_nat_s2_s.pdf', 13],
  [2007, 2007, 1, 'essay_annual', '정시 계열공통', 'ku_2007_annual_all_js_q.pdf', 'ku_2007_annual_all_js_s.pdf', 15],
  [2007, 2006, 6, 'essay_mock', '인문계', 'ku_2007_mock_hum_q.pdf', 'ku_2007_mock_s.pdf', 11],
  [2007, 2006, 6, 'essay_mock', '자연계', 'ku_2007_mock_nat_q.pdf', 'ku_2007_mock_s.pdf', 11],
  [2008, 2007, 11, 'essay_annual', '수시2 인문계', 'ku_2008_annual_hum_s2_q.pdf', 'ku_2008_annual_hum_s2_s.pdf', 18],
  [2008, 2008, 1, 'essay_annual', '정시 인문계', 'ku_2008_annual_hum_js_q.pdf', 'ku_2008_annual_hum_js_s.pdf', 19],
  [2008, 2008, 1, 'essay_annual', '정시 자연계', 'ku_2008_annual_nat_js_q.pdf', null, 19],
  [2008, 2007, 4, 'essay_mock', '인문계', 'ku_2008_mock_hum_q.pdf', 'ku_2008_mock_hum_s.pdf', 17],
  [2008, 2007, 4, 'essay_mock', '자연계', 'ku_2008_mock_nat_q.pdf', 'ku_2008_mock_nat_s.pdf', 17],
  [2009, 2008, 11, 'essay_annual', '수시2 인문계', 'ku_2009_annual_hum_s2_q.pdf', 'ku_2009_annual_hum_s2_s.pdf', 23],
  [2009, 2008, 11, 'essay_annual', '수시2 자연계', 'ku_2009_annual_nat_s2_q.pdf', 'ku_2009_annual_nat_s2_s.pdf', 23],
  [2009, 2009, 1, 'essay_annual', '정시 인문계', 'ku_2009_annual_hum_js_q.pdf', 'ku_2009_annual_hum_js_s.pdf', 25],
  [2009, 2008, 5, 'essay_mock', '인문계', 'ku_2009_mock_hum_q.pdf', 'ku_2009_mock_hum_s.pdf', 21],
  [2009, 2008, 5, 'essay_mock', '자연계', 'ku_2009_mock_nat_q.pdf', 'ku_2009_mock_nat_s.pdf', 21],
  [2010, 2009, 5, 'essay_mock', '인문계(예시문제)', 'ku_2010_mock_hum_ex_q.pdf', 'ku_2010_mock_hum_ex_s.pdf', 26],
  [2010, 2009, 5, 'essay_mock', '자연계(예시문제)', 'ku_2010_mock_nat_ex_q.pdf', 'ku_2010_mock_nat_ex_s.pdf', 26],
  [2011, 2010, 11, 'essay_annual', '인문계 A(오전)', 'ku_2011_annual_hum_a_q.pdf', 'ku_2011_annual_hum_a_s.pdf', 29],
  [2011, 2010, 11, 'essay_annual', '인문계 B(오후)', 'ku_2011_annual_hum_b_q.pdf', 'ku_2011_annual_hum_b_s.pdf', 29],
  [2011, 2010, 11, 'essay_annual', '자연계', 'ku_2011_annual_nat_q.pdf', 'ku_2011_annual_nat_s.pdf', 29],
  [2011, 2010, 5, 'essay_mock', '인문계', 'ku_2011_mock_hum_q.pdf', 'ku_2011_mock_hum_s.pdf', 28],
  [2011, 2010, 5, 'essay_mock', '자연계', 'ku_2011_mock_nat_q.pdf', 'ku_2011_mock_nat_s.pdf', 28],
  [2012, 2011, 11, 'essay_annual', '인문계 A(오전)', 'ku_2012_annual_hum_a_q.pdf', 'ku_2012_annual_hum_a_s.pdf', 32],
  [2012, 2011, 11, 'essay_annual', '인문계 B(오후)', 'ku_2012_annual_hum_b_q.pdf', 'ku_2012_annual_hum_b_s.pdf', 32],
  [2012, 2011, 11, 'essay_annual', '자연계 A(오전)', 'ku_2012_annual_nat_a_q.pdf', 'ku_2012_annual_nat_a_s.pdf', 32],
  [2012, 2011, 11, 'essay_annual', '자연계 B(오후)', 'ku_2012_annual_nat_b_q.pdf', 'ku_2012_annual_nat_b_s.pdf', 32],
  [2012, 2011, 5, 'essay_mock', '인문계', 'ku_2012_mock_hum_q.pdf', 'ku_2012_mock_hum_s.pdf', 31],
  [2012, 2011, 5, 'essay_mock', '자연계', 'ku_2012_mock_nat_q.pdf', 'ku_2012_mock_nat_s.pdf', 31],
  [2013, 2012, 11, 'essay_annual', '인문계 A', 'ku_2013_annual_hum_a_q.pdf', 'ku_2013_annual_hum_s.pdf', 34],
  [2013, 2012, 11, 'essay_annual', '인문계 B', 'ku_2013_annual_hum_b_q.pdf', 'ku_2013_annual_hum_s.pdf', 34],
  [2013, 2012, 11, 'essay_annual', '자연계 A 유형1(수학·물리·화학·생명과학)', 'ku_2013_annual_nat_a1_q.pdf', 'ku_2013_annual_nat_s.pdf', 34],
  [2013, 2012, 11, 'essay_annual', '자연계 A 유형2(수학·물리·화학·지구과학)', 'ku_2013_annual_nat_a2_q.pdf', 'ku_2013_annual_nat_s.pdf', 34],
  [2013, 2012, 11, 'essay_annual', '자연계 B 유형3(수학·물리·화학)', 'ku_2013_annual_nat_b3_q.pdf', 'ku_2013_annual_nat_s.pdf', 34],
  [2013, 2012, 11, 'essay_annual', '자연계 B 유형4(수학·물리·화학·생명과학)', 'ku_2013_annual_nat_b4_q.pdf', 'ku_2013_annual_nat_s.pdf', 34],
  [2013, 2012, 6, 'essay_mock', '인문계', 'ku_2013_mock_hum_q.pdf', 'ku_2013_mock_hum_s.pdf', 33],
  [2013, 2012, 6, 'essay_mock', '자연계', 'ku_2013_mock_nat_q.pdf', 'ku_2013_mock_nat_s.pdf', 33],
  [2015, 2014, 5, 'essay_mock', '인문계(A·B)', 'ku_2015_mock_hum_q.pdf', 'ku_2015_mock_hum_s.pdf', 36],
  [2015, 2014, 5, 'essay_mock', '자연계', 'ku_2015_mock_nat_q.pdf', 'ku_2015_mock_nat_s.pdf', 36],
  [2016, 2015, 5, 'essay_mock', '인문계', 'ku_2016_mock_hum_q.pdf', 'ku_2016_mock_hum_s.pdf', 37],
  [2016, 2015, 5, 'essay_mock', '자연계', 'ku_2016_mock_nat_q.pdf', 'ku_2016_mock_nat_s.pdf', 37],
];

const link = (asset, name) => `${WORKER}/${asset}?name=${encodeURIComponent(name)}`;

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
let nextId = Math.max(...exams.map(e => e.id)) + 1;
let added = 0;
for (const [gradeYear, examYear, month, type, field, qAsset, sAsset, seq] of rows) {
  const duplicate = exams.some(e => e.typeGroup === 'essay' && e.gradeYear === gradeYear
    && e.type === type && e.subject === SCHOOL && e.subSubject === field);
  if (duplicate) continue;
  const base = `${gradeYear}학년도 ${SCHOOL} ${type === 'essay_mock' ? '모의논술' : '논술'} ${field}`;
  const qName = `${base} 문제.pdf`;
  const sName = sAsset ? `${base} 해설.pdf` : null;
  const entry = {
    id: nextId++,
    curriculum: '논술',
    gradeYear,
    examYear,
    month,
    typeGroup: 'essay',
    type,
    studentGrade: null,
    subject: SCHOOL,
    subSubject: field,
    questionUrl: link(qAsset, qName),
    answerUrl: null,
    solutionUrl: sAsset ? link(sAsset, sName) : null,
    questionDownload: qName,
    answerDownload: null,
    solutionDownload: sName,
    source: 'essay-v22',
    questionUrl_source_original: original(seq),
  };
  if (sAsset) entry.solutionUrl_source_original = original(seq);
  exams.push(entry);
  added++;
}

if (!added) {
  console.log('추가할 고려대 2005~2016 논술 자료 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`고려대 2005~2016 논술 ${added}건 추가`);
