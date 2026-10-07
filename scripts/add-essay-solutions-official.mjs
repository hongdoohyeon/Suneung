#!/usr/bin/env node
// 해설이 비어 있던 기존 논술 항목에 대학 공식 해설을 연결한다(2026-10-07). 자산은 essay-v25 릴리즈.
// 출처: 이화여대 선행학습 영향평가 보고서 문항카드(2024~2026), 중앙대 논술가이드북 전년도 기출 해설 장
// (2015·2021~2024)과 2025 선행학습 보고서, 한양대 입학처 계열별 출제의도·예시답안 파일(2018~2026).
// 아주대 2020 의예(2021 논술자료집 채점기준)·2024 모의(예시답안 및 채점기준)도 함께 연결.
// 2차(essay-v26): 가톨릭·경희·부산·아주·홍익·한양·성균관·고려 등 15개교 121건 — 대학이 공개한 출제의도·해설·예시답안.
// 문제지 본문이 보고서·가이드북의 어느 구간에 있는지 대조해 구간을 정했다.
// 함께: 중앙대 2023 '인문사회계열①/②'는 실제로 경영경제/인문사회 문제여서 계열명을 바로잡는다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const BASE = 'https://suneung-files.hdh061224.workers.dev';
// 자산 경로에 'v26/' 접두어가 있으면 essay-v26 릴리즈, 없으면 essay-v25
const assetUrl = asset => asset.startsWith('v26/') ? `${BASE}/essay-v26/${asset.slice(4)}` : `${BASE}/essay-v25/${asset}`;

// [항목 id, 해설 자산, 원본 출처]
const rows = [
  [9398, 'sol_9398.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9399, 'sol_9399.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9400, 'sol_9400.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9401, 'sol_9401.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9402, 'sol_9402.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9403, 'sol_9403.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9445, 'sol_9445.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9452, 'sol_9452.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9453, 'sol_9453.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9457, 'sol_9457.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9460, 'sol_9460.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9469, 'sol_9469.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9499, 'sol_9499.pdf', "https://go.hanyang.ac.kr/web/pds/pds_list.do?m_type=SUSI&ct02=ns01"],
  [9507, 'sol_9507.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9508, 'sol_9508.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9509, 'sol_9509.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9510, 'sol_9510.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9511, 'sol_9511.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9512, 'sol_9512.pdf', "https://go.hanyang.ac.kr/web/notice/notice_view.do?bn=20598"],
  [9660, 'sol_9660.pdf', "https://admission.cau.ac.kr/"],
  [9661, 'sol_9661.pdf', "https://admission.cau.ac.kr/"],
  [9662, 'sol_9662.pdf', "https://admission.cau.ac.kr/"],
  [9663, 'sol_9663.pdf', "https://admission.cau.ac.kr/"],
  [9664, 'sol_9664.pdf', "https://admission.cau.ac.kr/"],
  [9700, 'sol_9700.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103247_4577.pdf"],
  [9701, 'sol_9701.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103247_4577.pdf"],
  [9702, 'sol_9702.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103247_4577.pdf"],
  [9703, 'sol_9703.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103247_4577.pdf"],
  [9704, 'sol_9704.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103329_6943.pdf"],
  [9705, 'sol_9705.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103329_6943.pdf"],
  [9706, 'sol_9706.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20210713103329_6943.pdf"],
  [9710, 'sol_9710.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153013_3214.pdf"],
  [9711, 'sol_9711.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153013_3214.pdf"],
  [9712, 'sol_9712.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153013_3214.pdf"],
  [9713, 'sol_9713.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153013_3214.pdf"],
  [9714, 'sol_9714.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153049_4685.pdf"],
  [9715, 'sol_9715.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153049_4685.pdf"],
  [9716, 'sol_9716.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20220706153049_4685.pdf"],
  [9720, 'sol_9720.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20230906175343_1579.pdf"],
  [9721, 'sol_9721.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20230906175343_1579.pdf"],
  [9722, 'sol_9722.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20230906175330_9211.pdf"],
  [9723, 'sol_9723.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=nonsul_20230906175330_9211.pdf"],
  [9727, 'sol_9727.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20240718112511806_cc6c611cb4cf40eb8cee291f9114bff2.pdf"],
  [9728, 'sol_9728.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20240718112511806_cc6c611cb4cf40eb8cee291f9114bff2.pdf"],
  [9729, 'sol_9729.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20240718112524862_ade60aaa767a4772973a90b2cc2fda5a.pdf"],
  [9730, 'sol_9730.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20240718112524862_ade60aaa767a4772973a90b2cc2fda5a.pdf"],
  [9734, 'sol_9734.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20250327034359156_c3b1213e6b1d4c72a1c70046e9e327a4.pdf"],
  [9735, 'sol_9735.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20250327034359156_c3b1213e6b1d4c72a1c70046e9e327a4.pdf"],
  [9736, 'sol_9736.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20250327034359156_c3b1213e6b1d4c72a1c70046e9e327a4.pdf"],
  [9737, 'sol_9737.pdf', "https://admission.cau.ac.kr/file/download.do?sfn=20250327034359156_c3b1213e6b1d4c72a1c70046e9e327a4.pdf"],
  [11070, 'sol_11070.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11071, 'sol_11071.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11072, 'sol_11072.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11073, 'sol_11073.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11074, 'sol_11074.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11075, 'sol_11075.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11076, 'sol_11076.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11077, 'sol_11077.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11133, 'sol_11133.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11135, 'sol_11135.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11136, 'sol_11136.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [11139, 'sol_11139.pdf', "https://admission.ewha.ac.kr/admission/html/ewharo/publication4.asp"],
  [10745, 'sol_10745.pdf', "https://www.iajou.ac.kr/pasttest/list.php"],
  [10768, 'sol_10768.pdf', "https://www.iajou.ac.kr/pasttest/list.php"],
  [10769, 'sol_10769.pdf', "https://www.iajou.ac.kr/pasttest/list.php"],
  [10770, 'sol_10770.pdf', "https://www.iajou.ac.kr/pasttest/list.php"],
  [9371, 'v26/sol2_9371.pdf', "https://oku.korea.ac.kr/"],
  [9372, 'v26/sol2_9372.pdf', "https://oku.korea.ac.kr/"],
  [9408, 'v26/sol2_9408.pdf', "https://go.hanyang.ac.kr/"],
  [9422, 'v26/sol2_9422.pdf', "https://go.hanyang.ac.kr/"],
  [9423, 'v26/sol2_9423.pdf', "https://go.hanyang.ac.kr/"],
  [9429, 'v26/sol2_9429.pdf', "https://go.hanyang.ac.kr/"],
  [9430, 'v26/sol2_9430.pdf', "https://go.hanyang.ac.kr/"],
  [9434, 'v26/sol2_9434.pdf', "https://go.hanyang.ac.kr/"],
  [9440, 'v26/sol2_9440.pdf', "https://go.hanyang.ac.kr/"],
  [9441, 'v26/sol2_9441.pdf', "https://go.hanyang.ac.kr/"],
  [9524, 'v26/sol2_9524.pdf', "https://admission.yonsei.ac.kr/"],
  [9525, 'v26/sol2_9525.pdf', "https://admission.yonsei.ac.kr/"],
  [9647, 'v26/sol2_9647.pdf', "https://admission.skku.edu/"],
  [9648, 'v26/sol2_9648.pdf', "https://admission.skku.edu/"],
  [9651, 'v26/sol2_9651.pdf', "https://admission.skku.edu/"],
  [9654, 'v26/sol2_9654.pdf', "https://admission.skku.edu/"],
  [9745, 'v26/sol2_9745.pdf', "https://iphak.khu.ac.kr/"],
  [9746, 'v26/sol2_9746.pdf', "https://iphak.khu.ac.kr/"],
  [9779, 'v26/sol2_9779.pdf', "https://iphak.khu.ac.kr/"],
  [9780, 'v26/sol2_9780.pdf', "https://iphak.khu.ac.kr/"],
  [9800, 'v26/sol2_9800.pdf', "https://iphak.khu.ac.kr/"],
  [9806, 'v26/sol2_9806.pdf', "https://iphak.khu.ac.kr/"],
  [9818, 'v26/sol2_9818.pdf', "https://iphak.khu.ac.kr/"],
  [9824, 'v26/sol2_9824.pdf', "https://iphak.khu.ac.kr/"],
  [9860, 'v26/sol2_9860.pdf', "https://iphak.khu.ac.kr/"],
  [10039, 'v26/sol2_10039.pdf', "https://ipsi.catholic.ac.kr/"],
  [10041, 'v26/sol2_10041.pdf', "https://ipsi.catholic.ac.kr/"],
  [10045, 'v26/sol2_10045.pdf', "https://ipsi.catholic.ac.kr/"],
  [10063, 'v26/sol2_10063.pdf', "https://ipsi.catholic.ac.kr/"],
  [10064, 'v26/sol2_10064.pdf', "https://ipsi.catholic.ac.kr/"],
  [10065, 'v26/sol2_10065.pdf', "https://ipsi.catholic.ac.kr/"],
  [10066, 'v26/sol2_10066.pdf', "https://ipsi.catholic.ac.kr/"],
  [10067, 'v26/sol2_10067.pdf', "https://ipsi.catholic.ac.kr/"],
  [10068, 'v26/sol2_10068.pdf', "https://ipsi.catholic.ac.kr/"],
  [10069, 'v26/sol2_10069.pdf', "https://ipsi.catholic.ac.kr/"],
  [10070, 'v26/sol2_10070.pdf', "https://ipsi.catholic.ac.kr/"],
  [10071, 'v26/sol2_10071.pdf', "https://ipsi.catholic.ac.kr/"],
  [10072, 'v26/sol2_10072.pdf', "https://ipsi.catholic.ac.kr/"],
  [10073, 'v26/sol2_10073.pdf', "https://ipsi.catholic.ac.kr/"],
  [10074, 'v26/sol2_10074.pdf', "https://ipsi.catholic.ac.kr/"],
  [10075, 'v26/sol2_10075.pdf', "https://ipsi.catholic.ac.kr/"],
  [10076, 'v26/sol2_10076.pdf', "https://ipsi.catholic.ac.kr/"],
  [10077, 'v26/sol2_10077.pdf', "https://ipsi.catholic.ac.kr/"],
  [10080, 'v26/sol2_10080.pdf', "https://ipsi.catholic.ac.kr/"],
  [10081, 'v26/sol2_10081.pdf', "https://ipsi.catholic.ac.kr/"],
  [10082, 'v26/sol2_10082.pdf', "https://ipsi.catholic.ac.kr/"],
  [10083, 'v26/sol2_10083.pdf', "https://ipsi.catholic.ac.kr/"],
  [10084, 'v26/sol2_10084.pdf', "https://ipsi.catholic.ac.kr/"],
  [10085, 'v26/sol2_10085.pdf', "https://ipsi.catholic.ac.kr/"],
  [10086, 'v26/sol2_10086.pdf', "https://ipsi.catholic.ac.kr/"],
  [10087, 'v26/sol2_10087.pdf', "https://ipsi.catholic.ac.kr/"],
  [10088, 'v26/sol2_10088.pdf', "https://ipsi.catholic.ac.kr/"],
  [10089, 'v26/sol2_10089.pdf', "https://ipsi.catholic.ac.kr/"],
  [10090, 'v26/sol2_10090.pdf', "https://ipsi.catholic.ac.kr/"],
  [10091, 'v26/sol2_10091.pdf', "https://ipsi.catholic.ac.kr/"],
  [10095, 'v26/sol2_10095.pdf', "https://ipsi.catholic.ac.kr/"],
  [10097, 'v26/sol2_10097.pdf', "https://ipsi.catholic.ac.kr/"],
  [10124, 'v26/sol2_10124.pdf', "https://admission.konkuk.ac.kr/"],
  [10151, 'v26/sol2_10151.pdf', "https://admission.konkuk.ac.kr/"],
  [10166, 'v26/sol2_10166.pdf', "https://enter.kyonggi.ac.kr/"],
  [10168, 'v26/sol2_10168.pdf', "https://enter.kyonggi.ac.kr/"],
  [10184, 'v26/sol2_10184.pdf', "https://enter.kyonggi.ac.kr/"],
  [10195, 'v26/sol2_10195.pdf', "https://ipsi.knu.ac.kr/"],
  [10196, 'v26/sol2_10196.pdf', "https://ipsi.knu.ac.kr/"],
  [10375, 'v26/sol2_10375.pdf', "https://go.pusan.ac.kr/"],
  [10376, 'v26/sol2_10376.pdf', "https://go.pusan.ac.kr/"],
  [10395, 'v26/sol2_10395.pdf', "https://go.pusan.ac.kr/"],
  [10396, 'v26/sol2_10396.pdf', "https://go.pusan.ac.kr/"],
  [10397, 'v26/sol2_10397.pdf', "https://go.pusan.ac.kr/"],
  [10398, 'v26/sol2_10398.pdf', "https://go.pusan.ac.kr/"],
  [10399, 'v26/sol2_10399.pdf', "https://go.pusan.ac.kr/"],
  [10400, 'v26/sol2_10400.pdf', "https://go.pusan.ac.kr/"],
  [10401, 'v26/sol2_10401.pdf', "https://go.pusan.ac.kr/"],
  [10402, 'v26/sol2_10402.pdf', "https://go.pusan.ac.kr/"],
  [10403, 'v26/sol2_10403.pdf', "https://go.pusan.ac.kr/"],
  [10430, 'v26/sol2_10430.pdf', "https://admission.smu.ac.kr/"],
  [10431, 'v26/sol2_10431.pdf', "https://admission.smu.ac.kr/"],
  [10432, 'v26/sol2_10432.pdf', "https://admission.smu.ac.kr/"],
  [10433, 'v26/sol2_10433.pdf', "https://admission.smu.ac.kr/"],
  [10434, 'v26/sol2_10434.pdf', "https://ipsi.skuniv.ac.kr/"],
  [10435, 'v26/sol2_10435.pdf', "https://ipsi.skuniv.ac.kr/"],
  [10546, 'v26/sol2_10546.pdf', "https://ipsi.sungshin.ac.kr/"],
  [10550, 'v26/sol2_10550.pdf', "https://ipsi.sejong.ac.kr/"],
  [10752, 'v26/sol2_10752.pdf', "https://iphak.ajou.ac.kr/"],
  [10753, 'v26/sol2_10753.pdf', "https://iphak.ajou.ac.kr/"],
  [10754, 'v26/sol2_10754.pdf', "https://iphak.ajou.ac.kr/"],
  [10755, 'v26/sol2_10755.pdf', "https://iphak.ajou.ac.kr/"],
  [10756, 'v26/sol2_10756.pdf', "https://iphak.ajou.ac.kr/"],
  [10757, 'v26/sol2_10757.pdf', "https://iphak.ajou.ac.kr/"],
  [10761, 'v26/sol2_10761.pdf', "https://iphak.ajou.ac.kr/"],
  [10762, 'v26/sol2_10762.pdf', "https://iphak.ajou.ac.kr/"],
  [10763, 'v26/sol2_10763.pdf', "https://iphak.ajou.ac.kr/"],
  [10764, 'v26/sol2_10764.pdf', "https://iphak.ajou.ac.kr/"],
  [10765, 'v26/sol2_10765.pdf', "https://iphak.ajou.ac.kr/"],
  [10766, 'v26/sol2_10766.pdf', "https://iphak.ajou.ac.kr/"],
  [10767, 'v26/sol2_10767.pdf', "https://iphak.ajou.ac.kr/"],
  [10801, 'v26/sol2_10801.pdf', "https://admission.inha.ac.kr/"],
  [10803, 'v26/sol2_10803.pdf', "https://admission.inha.ac.kr/"],
  [10806, 'v26/sol2_10806.pdf', "https://admission.inha.ac.kr/"],
  [10880, 'v26/sol2_10880.pdf', "https://admission.hufs.ac.kr/"],
  [10900, 'v26/sol2_10900.pdf', "https://admission.hufs.ac.kr/"],
  [10971, 'v26/sol2_10971.pdf', "https://ibsi.hongik.ac.kr/"],
  [10978, 'v26/sol2_10978.pdf', "https://ibsi.hongik.ac.kr/"],
  [10979, 'v26/sol2_10979.pdf', "https://ibsi.hongik.ac.kr/"],
  [10981, 'v26/sol2_10981.pdf', "https://ibsi.hongik.ac.kr/"],
  [10984, 'v26/sol2_10984.pdf', "https://ibsi.hongik.ac.kr/"],
  [10985, 'v26/sol2_10985.pdf', "https://ibsi.hongik.ac.kr/"],
  [10986, 'v26/sol2_10986.pdf', "https://ibsi.hongik.ac.kr/"],
  [10987, 'v26/sol2_10987.pdf', "https://ibsi.hongik.ac.kr/"],
  [11001, 'v26/sol2_11001.pdf', "https://ibsi.hongik.ac.kr/"],
  [11002, 'v26/sol2_11002.pdf', "https://ibsi.hongik.ac.kr/"],
  [11003, 'v26/sol2_11003.pdf', "https://ibsi.hongik.ac.kr/"],
  [11190, 'v26/sol2_11190.pdf', "https://ipsi.catholic.ac.kr/"],
  [11191, 'v26/sol2_11191.pdf', "https://ipsi.catholic.ac.kr/"],
  [11218, 'v26/sol2_11218.pdf', "https://admission.ssu.ac.kr/"],
  [14363, 'v26/sol2_14363.pdf', "https://ipsi.catholic.ac.kr/"],
  [14364, 'v26/sol2_14364.pdf', "https://ipsi.catholic.ac.kr/"],
  [14365, 'v26/sol2_14365.pdf', "https://ipsi.catholic.ac.kr/"],
  [14366, 'v26/sol2_14366.pdf', "https://ipsi.catholic.ac.kr/"],
  [14367, 'v26/sol2_14367.pdf', "https://ipsi.catholic.ac.kr/"],
  [14368, 'v26/sol2_14368.pdf', "https://ipsi.catholic.ac.kr/"],
  [10886, 'v26/sol4_10886.pdf', "https://adms.hufs.ac.kr/"],
];

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const byId = new Map(exams.map(e => [e.id, e]));
let changed = 0;

const relabel = [[9720, '인문사회계열①', '경영경제계열'], [9721, '인문사회계열②', '인문사회계열']];
for (const [id, from, to] of relabel) {
  const e = byId.get(id);
  if (!e || e.subSubject !== from) continue;
  e.subSubject = to;
  e.questionDownload = e.questionDownload?.replace(from, to) ?? null;
  if (e.questionUrl) e.questionUrl = `${e.questionUrl.split('?')[0]}?name=${encodeURIComponent(e.questionDownload)}`;
  changed++;
}

// 한양대 2024 자연(오후1): 파일은 문제지인데 다운로드 이름이 '출제의도 및 평가지침'으로 붙어 있었다
{
  const e = byId.get(9499);
  const name = '2024학년도 한양대학교 논술 자연계열(오후1) 문제.pdf';
  if (e && e.questionDownload !== name) {
    e.questionDownload = name;
    e.questionUrl = `${e.questionUrl.split('?')[0]}?name=${encodeURIComponent(name)}`;
    changed++;
  }
}

for (const [id, asset, original] of rows) {
  const e = byId.get(id);
  if (!e || e.solutionUrl) continue;
  const kind = e.type === 'essay_mock' ? '모의논술' : '논술';
  e.solutionDownload = `${e.gradeYear}학년도 ${e.subject} ${kind} ${e.subSubject} 해설.pdf`;
  e.solutionUrl = `${assetUrl(asset)}?name=${encodeURIComponent(e.solutionDownload)}`;
  e.solutionUrl_source_original = original;
  changed++;
}

if (!changed) {
  console.log('연결할 해설 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`논술 해설 ${changed}건 연결·수정`);
