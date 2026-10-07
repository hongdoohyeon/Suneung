#!/usr/bin/env node
// 해설이 비어 있던 기존 논술 항목에 대학 공식 해설을 연결한다(2026-10-07). 자산은 essay-v25 릴리즈.
// 출처: 이화여대 선행학습 영향평가 보고서 문항카드(2024~2026), 중앙대 논술가이드북 전년도 기출 해설 장
// (2015·2021~2024)과 2025 선행학습 보고서, 한양대 입학처 계열별 출제의도·예시답안 파일(2018~2026).
// 문제지 본문이 보고서·가이드북의 어느 구간에 있는지 대조해 구간을 정했다.
// 함께: 중앙대 2023 '인문사회계열①/②'는 실제로 경영경제/인문사회 문제여서 계열명을 바로잡는다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v25';

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
  [9660, 'sol_9660.pdf', "https://legendstudy.com/781"],
  [9661, 'sol_9661.pdf', "https://legendstudy.com/781"],
  [9662, 'sol_9662.pdf', "https://legendstudy.com/781"],
  [9663, 'sol_9663.pdf', "https://legendstudy.com/781"],
  [9664, 'sol_9664.pdf', "https://legendstudy.com/781"],
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
  e.solutionUrl = `${WORKER}/${asset}?name=${encodeURIComponent(e.solutionDownload)}`;
  e.solutionUrl_source_original = original;
  changed++;
}

if (!changed) {
  console.log('연결할 해설 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`논술 해설 ${changed}건 연결·수정`);
