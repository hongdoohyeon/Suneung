#!/usr/bin/env node
// 2026-07-18 기준 대학 입학처가 공개한 2026학년도 선행학습 영향평가 보고서의 논술 자료를 추가한다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v20';
const sources = {
  cau: 'https://admission.cau.ac.kr/detail.do?board_seq=3225&menuurl=GtVhpgQCdX1JUrE85Ea%2BtA%3D%3D&pageNo=1',
  kangnam: 'https://admission.kangnam.ac.kr/doumi/notice.htm?bbsid=notice&bltn_seq=39500&ctg_cd=&keyword=&mode=view&page=1&skey=',
  hanshin: 'https://ent.hs.ac.kr/ipsi/pages/?b=B_1_1&bn=22849&cate=&m=read&p=17',
  hufs: 'https://use.go.kr/jinhak/user/bbs/BD_selectBbs.do?q_bbsDocNo=20260402093738025&q_bbsSn=1095',
  kookmin: 'https://admission.kookmin.ac.kr/helper/notice.php?ctype=view&category=foreigner&no=1062',
  koreaSejong: 'https://oku.korea.ac.kr/sejong/cms/FR_BBS_CON/BoardView.do?BBS_SEQ=1957&BOARD_SEQ=8&CONTENTS_NO=&MENU_ID=570&SITE_NO=3',
  koreatech: 'https://www.koreatech.ac.kr/board.es?act=view&bid=0036&list_no=55550&mid=a40601000000',
  samyook: 'https://ipsi.syu.ac.kr/2016_syu/pages/index.asp?b=B_1_1&bn=66389&cate=&f=ALL&m=read&nPage=1&p=29&s=',
  sangmyung: 'https://admission.smu.ac.kr/_seoul/board/bbs.html?bbsid=seoul_notice&bltn_seq=61662&ctg_cd=jungsi&guestSkin=Y&keyword=&mode=view&page=31&skey=',
  seoultech: 'https://admission.seoultech.ac.kr/cms/FR_CON/index.do?MENU_ID=380',
  shinhan: 'https://ipsi.shinhan.ac.kr/sjmain.do',
  skuniv: 'https://use.go.kr/jinhak/user/bbs/BD_selectBbs.do?q_bbsDocNo=20260402093658392&q_bbsSn=1095',
  sungshin: 'https://ipsi.sungshin.ac.kr/guide/dataroom.htm?bbsid=notice&bltn_seq=35897&ctg_cd=all&keyword=25&mode=view&page=1&skey=title',
  swu: 'https://use.go.kr/jinhak/user/bbs/BD_selectBbs.do?q_bbsDocNo=20260402093658392&q_bbsSn=1095',
};

const kangnamDocument = 'https://admission.kangnam.ac.kr/bbs/filedown.php?bbsid=notice&file_seq=4135';
const rows = [
  ['한국기술교육대학교', '공학·ICT융합계열 수리논술', 11, 'koreatech_2026_report.pdf', sources.koreatech],
  ['한국기술교육대학교', '사회융합계열 언어논술', 11, 'koreatech_2026_report.pdf', sources.koreatech],
  ['고려대학교(세종)', '인문·체능계열', 11, 'korea_sejong_2026_report.pdf', sources.koreaSejong],
  ['고려대학교(세종)', '자연계열', 11, 'korea_sejong_2026_report.pdf', sources.koreaSejong],
  ['고려대학교(세종)', '자연계열(약학)', 11, 'korea_sejong_2026_report.pdf', sources.koreaSejong],
  ['국민대학교', '인문계 오전', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['국민대학교', '인문계 오후1', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['국민대학교', '인문계 오후2', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['국민대학교', '자연계 오전', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['국민대학교', '자연계 오후1', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['국민대학교', '자연계 오후2', 11, 'kookmin_2026_report.pdf', sources.kookmin],
  ['서울과학기술대학교', '자연계열', 11, 'seoultech_2026_report.pdf', sources.seoultech],
  ['신한대학교', '자연과학·공학계열 1교시', 11, 'shinhan_2026_report.pdf', sources.shinhan],
  ['신한대학교', '인문사회계열 2교시', 11, 'shinhan_2026_report.pdf', sources.shinhan],
  ['강남대학교', '인문사회계 A형', 11, null, sources.kangnam, kangnamDocument],
  ['강남대학교', '공학계 B형', 11, null, sources.kangnam, kangnamDocument],
  ['강남대학교', '자유전공학부 C형', 11, null, sources.kangnam, kangnamDocument],
  ['삼육대학교', '인문계열', 11, 'samyook_2026_report.pdf', sources.samyook],
  ['삼육대학교', '자연계열', 11, 'samyook_2026_report.pdf', sources.samyook],
  ['상명대학교', '인문 A형', 10, 'sangmyung_2026_report.pdf', sources.sangmyung],
  ['상명대학교', '인문 B형', 10, 'sangmyung_2026_report.pdf', sources.sangmyung],
  ['상명대학교', '자연 A형', 11, 'sangmyung_2026_report.pdf', sources.sangmyung],
  ['상명대학교', '자연 B형', 11, 'sangmyung_2026_report.pdf', sources.sangmyung],
  ['서경대학교', '공통 A형', 11, 'skuniv_2026_report.pdf', sources.skuniv],
  ['서경대학교', '공통 B형', 11, 'skuniv_2026_report.pdf', sources.skuniv],
  ['서울여자대학교', '인문사회계열 오전', 11, 'swu_2026_report.pdf', sources.swu],
  ['서울여자대학교', '자연계열 오후', 11, 'swu_2026_report.pdf', sources.swu],
  ['성신여자대학교', '인문계열 1교시', 11, 'sungshin_2026_report.pdf', sources.sungshin],
  ['성신여자대학교', '인문계열 2교시', 11, 'sungshin_2026_report.pdf', sources.sungshin],
  ['성신여자대학교', '자연계열', 11, 'sungshin_2026_report.pdf', sources.sungshin],
  ['중앙대학교', '경영경제계열', 11, 'cau_2026_report.pdf', sources.cau],
  ['중앙대학교', '인문사회계열', 11, 'cau_2026_report.pdf', sources.cau],
  ['중앙대학교', '자연계열Ⅰ', 11, 'cau_2026_report.pdf', sources.cau],
  ['중앙대학교', '자연계열Ⅱ', 11, 'cau_2026_report.pdf', sources.cau],
  ['한국외국어대학교', '인문계열 T1', 11, 'hufs_2026_report.pdf', sources.hufs],
  ['한국외국어대학교', '사회계열 T2', 11, 'hufs_2026_report.pdf', sources.hufs],
  ['한국외국어대학교', '인문계열 T3', 11, 'hufs_2026_report.pdf', sources.hufs],
  ['한국외국어대학교', '사회계열 T4', 11, 'hufs_2026_report.pdf', sources.hufs],
  ['한국외국어대학교', '자연계열 T4', 11, 'hufs_2026_report.pdf', sources.hufs],
  ['한신대학교', '인문계열', 11, 'hanshin_2026_report.pdf', sources.hanshin],
  ['한신대학교', '자연계열', 11, 'hanshin_2026_report.pdf', sources.hanshin],
];

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
let nextId = Math.max(...exams.map(e => e.id)) + 1;
let added = 0;
for (const [school, field, month, asset, original, directUrl] of rows) {
  const duplicate = exams.some(e => e.typeGroup === 'essay' && e.gradeYear === 2026
    && e.type === 'essay_annual' && e.subject === school && e.subSubject === field);
  if (duplicate) continue;
  const url = directUrl || `${WORKER}/${asset}`;
  const title = `2026학년도 ${school} 논술 ${field} 문제·해설`;
  exams.push({
    id: nextId++,
    curriculum: '논술',
    gradeYear: 2026,
    examYear: 2025,
    month,
    typeGroup: 'essay',
    type: 'essay_annual',
    studentGrade: null,
    subject: school,
    subSubject: field,
    questionUrl: url,
    answerUrl: null,
    solutionUrl: url,
    questionDownload: `${title}.pdf`,
    answerDownload: null,
    solutionDownload: `${title}.pdf`,
    source: directUrl ? 'kangnam-official' : 'essay-v20',
    questionUrl_source_original: original,
    solutionUrl_source_original: original,
  });
  added++;
}

if (!added) {
  console.log('추가할 2026학년도 공식 논술 자료 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`2026학년도 공식 논술 ${added}건 추가`);
