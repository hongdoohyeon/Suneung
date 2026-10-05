#!/usr/bin/env node
// 2026-10-05 기준 대학 입학처가 공개한 2027학년도 모의논술 공식 자료(문제·해설)를 추가한다.
// 자산은 essay-v21 릴리즈. 가이드북·자료집 통합본은 해당 모의논술 페이지만 잘라 올렸다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v21';
const sources = {
  uos: 'https://admission.uos.ac.kr/admissionNew/freeBoard/view.do?list_id=OF1&seq=53&menuid=2002001005000000000',
  dongguk: 'https://ipsi.dongguk.edu/admission/html/rolling/data.asp',
  skku: 'https://admission.skku.edu/admission/html/rolling/questionView.html?idx=59500',
  sungshin: 'https://ipsi.sungshin.ac.kr/bbs/filedown.php?bbsid=guidebookguidebook&file_seq=2912',
  hongik: 'https://www.hongik.ac.kr/kr/admission/previous-question.do?mode=view&articleNo=154971',
  sogang: 'https://admission.sogang.ac.kr/enter/html/rolling/data.asp',
  khu: 'https://iphak.khu.ac.kr/detail.do?menuurl=89BGs%2Bk748ajyySWoWlQPw%3D%3D&board_seq=18071&categoryid=27',
  hanyang: 'https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns02',
  ewha: 'https://admission.ewha.ac.kr/admission/html/rolling/lecture-info.asp',
  kw: 'https://iphak.kw.ac.kr/pds/pds_view.php?bn=44694&m_type=SUSI',
  sookmyung: 'https://admission.sookmyung.ac.kr/admission/html/rolling/previous.asp',
  ajou: 'https://www.iajou.ac.kr/pasttest/view.php?bn=78689&m_type=SUSI',
  dankook: 'https://ipsi.dankook.ac.kr/jukjeon/doumi/nonsul_list.html?bbsid=juk_pds09&mode=view&bltn_seq=51777',
  ssu: 'https://iphak.ssu.ac.kr/board/exam_view.asp?number=137&flag2=1&page_no=1_2_7',
  cuk: 'https://ipsi.catholic.ac.kr/detail.do?menuurl=1HQVVMcjyX0%2FK4Lre9qaHA%3D%3D&board_seq=37609&categoryid=43',
  kyonggi: 'https://enter.kyonggi.ac.kr/cms/FR_BBS_CON/BoardView.do?MENU_ID=290&SITE_NO=2&BOARD_SEQ=4&BBS_SEQ=4047',
  kangnam: 'https://admission.kangnam.ac.kr/doumi/notice.htm?bbsid=notice&mode=view&bltn_seq=39581',
};

// [대학, 계열, 문제 자산, 해설 자산(null=미공개, 'same'=문제·해설 합본), 출처, 예시답안 자산]
const rows = [
  ['서울시립대학교', '자연계열', 'uos_2027_mock_nat_q.pdf', 'uos_2027_mock_nat_s.pdf', sources.uos],
  ['동국대학교', '인문계열', 'dongguk_2027_mock_hum_q.pdf', 'dongguk_2027_mock_hum_s.pdf', sources.dongguk],
  ['동국대학교', '자연계열', 'dongguk_2027_mock_nat_q.pdf', 'dongguk_2027_mock_nat_s.pdf', sources.dongguk],
  ['성균관대학교', '인문계(언어형)', 'skku_2027_mock_lang_q.pdf', 'skku_2027_mock_lang_s.pdf', sources.skku],
  ['성균관대학교', '자연계(수리형)', 'skku_2027_mock_math_q.pdf', 'skku_2027_mock_math_s.pdf', sources.skku],
  ['성신여자대학교', '인문계열', 'sungshin_2027_mock_hum.pdf', 'same', sources.sungshin],
  ['성신여자대학교', '자연계열', 'sungshin_2027_mock_nat.pdf', 'same', sources.sungshin],
  ['홍익대학교', '서울캠퍼스 인문계열', 'hongik_2027_mock_seoul_hum_q.pdf', 'hongik_2027_mock_seoul_hum_s.pdf', sources.hongik],
  ['홍익대학교', '서울캠퍼스 자연계열', 'hongik_2027_mock_seoul_nat_q.pdf', 'hongik_2027_mock_seoul_nat_s.pdf', sources.hongik],
  ['홍익대학교', '세종캠퍼스 인문계열', 'hongik_2027_mock_sejong_hum_q.pdf', 'hongik_2027_mock_sejong_hum_s.pdf', sources.hongik],
  ['홍익대학교', '세종캠퍼스 자연계열', 'hongik_2027_mock_sejong_nat_q.pdf', 'hongik_2027_mock_sejong_nat_s.pdf', sources.hongik],
  ['서강대학교', '인문계열', 'sogang_2027_mock_hum.pdf', 'same', sources.sogang],
  ['서강대학교', '자연계열', 'sogang_2027_mock_nat.pdf', 'same', sources.sogang],
  ['경희대학교', '인문체육계', 'khu_2027_mock_humpe_q.pdf', 'khu_2027_mock_humpe_s.pdf', sources.khu],
  ['경희대학교', '사회계', 'khu_2027_mock_soc_q.pdf', 'khu_2027_mock_soc_s.pdf', sources.khu],
  ['경희대학교', '자연계', 'khu_2027_mock_nat_q.pdf', 'khu_2027_mock_nat_s.pdf', sources.khu],
  ['경희대학교', '의약학계(수학)', 'khu_2027_mock_med_math_q.pdf', 'khu_2027_mock_med_math_s.pdf', sources.khu],
  ['경희대학교', '의약학계(물리)', 'khu_2027_mock_med_phys_q.pdf', 'khu_2027_mock_med_phys_s.pdf', sources.khu],
  ['경희대학교', '의약학계(화학)', 'khu_2027_mock_med_chem_q.pdf', 'khu_2027_mock_med_chem_s.pdf', sources.khu],
  ['경희대학교', '의약학계(생명과학)', 'khu_2027_mock_med_bio_q.pdf', 'khu_2027_mock_med_bio_s.pdf', sources.khu],
  ['한양대학교', '인문계열', 'hanyang_2027_mock_hum_q.pdf', 'hanyang_2027_mock_hum_s.pdf', sources.hanyang, 'hanyang_2027_mock_hum_a.pdf'],
  ['한양대학교', '상경계열', 'hanyang_2027_mock_econ_q.pdf', 'hanyang_2027_mock_econ_s.pdf', sources.hanyang, 'hanyang_2027_mock_econ_a.pdf'],
  ['한양대학교', '자연계열', 'hanyang_2027_mock_nat_q.pdf', 'hanyang_2027_mock_nat_s.pdf', sources.hanyang, 'hanyang_2027_mock_nat_a.pdf'],
  ['이화여자대학교', '인문계열Ⅰ', 'ewha_2027_mock_hum1_q.pdf', 'ewha_2027_mock_hum1_s.pdf', sources.ewha],
  ['이화여자대학교', '인문계열Ⅱ', 'ewha_2027_mock_hum2_q.pdf', 'ewha_2027_mock_hum2_s.pdf', sources.ewha],
  ['이화여자대학교', '자연계열Ⅰ', 'ewha_2027_mock_nat1_q.pdf', 'ewha_2027_mock_nat1_s.pdf', sources.ewha],
  ['이화여자대학교', '자연계열Ⅱ', 'ewha_2027_mock_nat2_q.pdf', 'ewha_2027_mock_nat2_s.pdf', sources.ewha],
  ['광운대학교', '인문사회계열 1번', 'kw_2027_mock_h1.pdf', 'same', sources.kw],
  ['광운대학교', '인문사회계열 2번', 'kw_2027_mock_h2.pdf', 'same', sources.kw],
  ['광운대학교', '자연계열 문제1', 'kw_2027_mock_n1.pdf', 'same', sources.kw],
  ['광운대학교', '자연계열 문제2', 'kw_2027_mock_n2.pdf', 'same', sources.kw],
  ['숙명여자대학교', '인문계열', 'sookmyung_2027_mock_hum_q.pdf', 'sookmyung_2027_mock_hum_s.pdf', sources.sookmyung],
  ['숙명여자대학교', '자연계열', 'sookmyung_2027_mock_nat_q.pdf', 'sookmyung_2027_mock_nat_s.pdf', sources.sookmyung],
  ['숙명여자대학교', '의약학계열(약학)', 'sookmyung_2027_mock_pharm_q.pdf', 'sookmyung_2027_mock_pharm_s.pdf', sources.sookmyung],
  ['아주대학교', '인문계열', 'ajou_2027_mock_hum_q.pdf', 'ajou_2027_mock_hum_s.pdf', sources.ajou],
  ['아주대학교', '자연계열', 'ajou_2027_mock_nat_q.pdf', 'ajou_2027_mock_nat_s.pdf', sources.ajou],
  ['아주대학교', '의학계열', 'ajou_2027_mock_med_q.pdf', 'ajou_2027_mock_med_s.pdf', sources.ajou],
  ['단국대학교', '인문계열', 'dankook_2027_mock_hum_q.pdf', 'dankook_2027_mock_hum_s.pdf', sources.dankook],
  ['단국대학교', '자연계열', 'dankook_2027_mock_nat_q.pdf', 'dankook_2027_mock_nat_s.pdf', sources.dankook],
  ['숭실대학교', '인문계열', 'ssu_2027_mock_hum.pdf', 'same', sources.ssu],
  ['숭실대학교', '경상계열', 'ssu_2027_mock_econ.pdf', 'same', sources.ssu],
  ['숭실대학교', '자연계열', 'ssu_2027_mock_nat.pdf', 'same', sources.ssu],
  ['가톨릭대학교', '인문사회계열', 'cuk_2027_mock_hum.pdf', 'same', sources.cuk],
  ['가톨릭대학교', '자연공학계열', 'cuk_2027_mock_nat.pdf', 'same', sources.cuk],
  ['경기대학교', '언어사회', 'kyonggi_2027_mock_lang_q.pdf', null, sources.kyonggi],
  ['경기대학교', '수리', 'kyonggi_2027_mock_math_q.pdf', null, sources.kyonggi],
  ['강남대학교', '전계열 통합', 'kangnam_2027_mock_all.pdf', 'same', sources.kangnam],
];

const link = (asset, name) => `${WORKER}/${asset}?name=${encodeURIComponent(name)}`;

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
let nextId = Math.max(...exams.map(e => e.id)) + 1;
let added = 0;
for (const [school, field, qAsset, sAsset, original, aAsset] of rows) {
  const duplicate = exams.some(e => e.typeGroup === 'essay' && e.gradeYear === 2027
    && e.type === 'essay_mock' && e.subject === school && e.subSubject === field);
  if (duplicate) continue;
  const base = `2027학년도 ${school} 모의논술 ${field}`;
  const combined = sAsset === 'same';
  const qName = combined ? `${base} 문제·해설.pdf` : `${base} 문제.pdf`;
  const sName = combined ? qName : (sAsset ? `${base} 해설.pdf` : null);
  const aName = aAsset ? `${base} 예시답안.pdf` : null;
  const entry = {
    id: nextId++,
    curriculum: '논술',
    gradeYear: 2027,
    examYear: 2026,
    month: 8,
    typeGroup: 'essay',
    type: 'essay_mock',
    studentGrade: null,
    subject: school,
    subSubject: field,
    questionUrl: link(qAsset, qName),
    answerUrl: aAsset ? link(aAsset, aName) : null,
    solutionUrl: sName ? link(combined ? qAsset : sAsset, sName) : null,
    questionDownload: qName,
    answerDownload: aName,
    solutionDownload: sName,
    source: 'essay-v21',
    questionUrl_source_original: original,
  };
  if (sName) entry.solutionUrl_source_original = original;
  exams.push(entry);
  added++;
}

if (!added) {
  console.log('추가할 2027학년도 모의논술 자료 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`2027학년도 모의논술 ${added}건 추가`);
