#!/usr/bin/env node
// 연세대 논술 정리(2026-10-07). 자산은 essay-v23 릴리즈.
// - 2015 '통합계열'은 시험지가 아니라 인문·사회·자연 공통 해설 → 항목 삭제, 각 계열 해설로 연결
// - 2020 자연, 2021 인문·사회·자연은 오전/오후 두 세트가 한 파일에 합쳐져 있던 것을 세트별로 분리
// - 2025 자연은 1차(2024.10.12)와 추가시험(2차, 2024.12.8)을 분리. 기존 '정답'은 출제의도라 해설에 합침
// - 2027 모의 '통합계열' → 공식 명칭(자연·통합계열 과학 서논술형)
// - 2017·2026 해설을 선행학습 영향평가 보고서 문항카드로 보강
// - 신규: 2004 논술Ⅰ·Ⅱ, 2011~2014 수시 본시험(옛 www2.yonsei.ac.kr 공식 파일, 인터넷 아카이브 사본),
//         2020 모의 인문·사회, 2021 모의 자연(수학)
// 멱등: 이미 적용됐으면 아무것도 바꾸지 않는다.

import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const WORKER = 'https://suneung-files.hdh061224.workers.dev/essay-v23';
const SCHOOL = '연세대학교';
const link = (asset, name) => `${WORKER}/${asset}?name=${encodeURIComponent(name)}`;
const WB = (ts, path) => `https://web.archive.org/web/${ts}/http://www2.yonsei.ac.kr/entrance/${path}`;
const REPORT_2017 = 'https://web.archive.org/web/2017/http://www2.yonsei.ac.kr/entrance/assessment/2017/2017_yonsei_assessment.pdf';
const REPORT_2026 = 'https://admission.yonsei.ac.kr/seoul/admission/html/counsel/dataView.asp?BBS_NO=3490';

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const byId = new Map(exams.map(e => [e.id, e]));
let nextId = Math.max(...exams.map(e => e.id)) + 1;
let changed = 0;

const title = (e, field, kind) =>
  `${e.gradeYear}학년도 ${SCHOOL} ${e.type === 'essay_mock' ? '모의논술' : '논술'} ${field} ${kind}.pdf`;
const exists = (gradeYear, type, field) => exams.some(e => e.typeGroup === 'essay'
  && e.subject === SCHOOL && e.gradeYear === gradeYear && e.type === type && e.subSubject === field);

function setFiles(e, field, qAsset, sAsset) {
  e.subSubject = field;
  if (qAsset) {
    e.questionDownload = title(e, field, '문제');
    e.questionUrl = link(qAsset, e.questionDownload);
  }
  if (sAsset) {
    e.solutionDownload = title(e, field, '해설');
    e.solutionUrl = link(sAsset, e.solutionDownload);
  }
  e.source = 'essay-v23';
}

// ── 세트 분리: [기존 id, 첫 세트 계열, 둘째 세트 계열, 자산 접두어] ──
const splits = [
  [9554, '자연계(물리) 오전', '자연계(물리) 오후', 'ys_2020_ann_mu'],
  [9555, '자연계(생명과학) 오전', '자연계(생명과학) 오후', 'ys_2020_ann_sm'],
  [9556, '자연계(수학) 오전', '자연계(수학) 오후', 'ys_2020_ann_su'],
  [9557, '자연계(지구과학) 오전', '자연계(지구과학) 오후', 'ys_2020_ann_jg'],
  [9558, '자연계(화학) 오전', '자연계(화학) 오후', 'ys_2020_ann_hw'],
  [9559, '인문·사회계 오전', '인문·사회계 오후', 'ys_2021_ann_in'],
  [9560, '자연계(물리학) 오전', '자연계(물리학) 오후', 'ys_2021_ann_mu'],
  [9561, '자연계(생명과학) 오전', '자연계(생명과학) 오후', 'ys_2021_ann_sm'],
  [9562, '자연계(수학) 오전', '자연계(수학) 오후', 'ys_2021_ann_su'],
  [9564, '자연계(화학) 오전', '자연계(화학) 오후', 'ys_2021_ann_hw'],
  [9584, '자연계(수학) 1차', '자연계(수학) 2차(추가시험)', 'ys_2025_ann_su'],
];
for (const [id, first, second, prefix] of splits) {
  const e = byId.get(id);
  if (!e || e.subSubject === first) continue;
  const second_ = structuredClone(e);
  setFiles(e, first, `${prefix}1_q.pdf`, `${prefix}1_s.pdf`);
  second_.id = nextId++;
  setFiles(second_, second, `${prefix}2_q.pdf`, `${prefix}2_s.pdf`);
  if (id === 9584) {
    // 기존 '정답' 파일은 출제의도 — 해설에 합쳤으므로 정답 칸은 비운다
    for (const x of [e, second_]) { x.answerUrl = null; x.answerDownload = null; delete x.answerUrl_source_original; }
    second_.month = 12;
    second_.questionUrl_source_original = 'https://admission.yonsei.ac.kr/seoul/admission/html/counsel/noticeView.asp?BBS_NO=3277';
  }
  exams.push(second_);
  changed += 2;
}
// 2021 지구과학은 공식 별책에도 오전(자연1) 한 세트뿐
{
  const e = byId.get(9563);
  if (e && e.subSubject === '자연계(지구과학)') {
    e.subSubject = '자연계(지구과학) 오전';
    e.questionDownload = title(e, e.subSubject, '문제');
    e.questionUrl = `${e.questionUrl.split('?')[0]}?name=${encodeURIComponent(e.questionDownload)}`;
    e.solutionDownload = title(e, e.subSubject, '해설');
    e.solutionUrl = `${e.solutionUrl.split('?')[0]}?name=${encodeURIComponent(e.solutionDownload)}`;
    changed++;
  }
}

// ── 2015 공통 해설: '통합계열' 항목 삭제 후 인문·사회·자연(수학)에 연결 ──
{
  const common = byId.get(9516);
  if (common) {
    for (const id of [9513, 9514, 9515]) {
      const e = byId.get(id);
      e.solutionDownload = `2015학년도 ${SCHOOL} 논술 출제 기본방향 및 해설(인문·사회·자연 공통).pdf`;
      e.solutionUrl = `${common.solutionUrl.split('?')[0]}?name=${encodeURIComponent(e.solutionDownload)}`;
      e.solutionUrl_source_original = WB('20150921232338', '2015/SUSI/FILE/2015_susi_nonsul_ann.pdf');
    }
    exams.splice(exams.indexOf(common), 1);
    changed++;
  }
}

// ── 2027 모의 명칭 ──
{
  const e = byId.get(9588);
  if (e && e.subSubject === '통합계열') {
    e.subSubject = '자연·통합계열(과학 서논술형)';
    e.questionDownload = title(e, e.subSubject, '문제');
    e.questionUrl = `${e.questionUrl.split('?')[0]}?name=${encodeURIComponent(e.questionDownload)}`;
    e.solutionDownload = title(e, e.subSubject, '해설');
    e.solutionUrl = `${e.solutionUrl.split('?')[0]}?name=${encodeURIComponent(e.solutionDownload)}`;
    changed++;
  }
}

// ── 해설 보강 (선행학습 영향평가 보고서 문항카드) ──
const addSolution = [
  [9532, 'ys_2017_ann_inmun_s.pdf', REPORT_2017], [9531, 'ys_2017_ann_sahoe_s.pdf', REPORT_2017],
  [9535, 'ys_2017_ann_su_s.pdf', REPORT_2017], [9533, 'ys_2017_ann_mu_s.pdf', REPORT_2017],
  [9537, 'ys_2017_ann_hw_s.pdf', REPORT_2017], [9534, 'ys_2017_ann_sm_s.pdf', REPORT_2017],
  [9536, 'ys_2017_ann_jg_s.pdf', REPORT_2017],
  [9586, 'ys_2026_ann_inmun_s.pdf', REPORT_2026], [9587, 'ys_2026_ann_su_s.pdf', REPORT_2026],
];
for (const [id, asset, original] of addSolution) {
  const e = byId.get(id);
  if (!e || e.solutionUrl) continue;
  e.solutionDownload = title(e, e.subSubject, '해설');
  e.solutionUrl = link(asset, e.solutionDownload);
  e.solutionUrl_source_original = original;
  changed++;
}

// ── 신규 항목 ──
// [학년도, 시행년, 월, type, 계열, 문제 자산, 해설 자산, 출처]
const W11 = p => WB('2018', `2011/susi/Notice_Pass/nonsul/${p}`);
const W12 = p => WB('2018', `2012/susi/Notice_Pass/nonsul/${p}`);
const W13 = p => WB('2018', `2013/susi/nonsul/${p}`);
const W14 = p => WB('2016', `2014/SUSI/FILE/${p}`);
const rows = [
  [2004, 2003, 12, 'essay_annual', '논술Ⅰ', 'ys_2004_ann_1.pdf', null, 'https://web.archive.org/web/20031228210236/http://www.yonsei.ac.kr/entrance/2004_essay1.pdf'],
  [2004, 2003, 12, 'essay_annual', '논술Ⅱ', 'ys_2004_ann_2.pdf', null, 'https://web.archive.org/web/20031228210314/http://www.yonsei.ac.kr/entrance/2004_essay2.pdf'],
  [2011, 2010, 10, 'essay_annual', '인문계', 'ys_2011_ann_in.pdf', 'ys_2011_ann_insa_s.pdf', W11('2011_Susi_Nonsul_In.pdf')],
  [2011, 2010, 10, 'essay_annual', '사회계', 'ys_2011_ann_sa.pdf', 'ys_2011_ann_insa_s.pdf', W11('2011_Susi_Nonsul_Sa.pdf')],
  [2011, 2010, 10, 'essay_annual', '자연계', 'ys_2011_ann_ja.pdf', 'ys_2011_ann_ja_s.pdf', W11('2011_Susi_Nonsul_Ja.pdf')],
  [2012, 2011, 10, 'essay_annual', '인문계', 'ys_2012_ann_in.pdf', 'ys_2012_ann_insa_s.pdf', W12('2012_Susi_Nonsul_In.pdf')],
  [2012, 2011, 10, 'essay_annual', '사회계', 'ys_2012_ann_sa.pdf', 'ys_2012_ann_insa_s.pdf', W12('2012_Susi_Nonsul_Sa.pdf')],
  [2012, 2011, 10, 'essay_annual', '자연계', 'ys_2012_ann_ja.pdf', 'ys_2012_ann_ja_s.pdf', W12('2012_Susi_Nonsul_Ja.pdf')],
  [2013, 2012, 10, 'essay_annual', '인문계', 'ys_2013_ann_in.pdf', 'ys_2013_ann_insa_s.pdf', W13('2013_Susi_Nonsul_In.pdf')],
  [2013, 2012, 10, 'essay_annual', '사회계', 'ys_2013_ann_sa.pdf', 'ys_2013_ann_insa_s.pdf', W13('2013_Susi_Nonsul_Sa.pdf')],
  [2013, 2012, 10, 'essay_annual', '자연계', 'ys_2013_ann_ja.pdf', 'ys_2013_ann_ja_s.pdf', W13('2013_Susi_Nonsul_Ja.pdf')],
  [2014, 2013, 10, 'essay_annual', '인문계', 'ys_2014_ann_in.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Hu.pdf')],
  [2014, 2013, 10, 'essay_annual', '사회계', 'ys_2014_ann_sa.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Ss.pdf')],
  [2014, 2013, 10, 'essay_annual', '자연계(수학·물리)', 'ys_2014_ann_ja_mu.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Sci.pdf')],
  [2014, 2013, 10, 'essay_annual', '자연계(수학·화학)', 'ys_2014_ann_ja_hw.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Sci.pdf')],
  [2014, 2013, 10, 'essay_annual', '자연계(수학·생명과학)', 'ys_2014_ann_ja_sm.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Sci.pdf')],
  [2014, 2013, 10, 'essay_annual', '자연계(수학·지구과학)', 'ys_2014_ann_ja_jg.pdf', 'ys_2014_ann_s.pdf', W14('2014_susi_nonsul_Sci.pdf')],
  [2020, 2019, 7, 'essay_mock', '인문·사회계', 'ys_2020_mock_hs.pdf', 'same', 'https://admission.yonsei.ac.kr/seoul/admission/html/data/2020_hs.pdf'],
  [2021, 2020, 7, 'essay_mock', '자연계(수학)', 'ys_2021_mock_su.pdf', 'same', 'https://admission.yonsei.ac.kr/seoul/download.asp?furl=bbs%2F20200716172354LNKXCK.PDF'],
];
for (const [gradeYear, examYear, month, type, field, qAsset, sAsset, original] of rows) {
  if (exists(gradeYear, type, field)) continue;
  const e = { id: nextId++, curriculum: '논술', gradeYear, examYear, month, typeGroup: 'essay', type,
    studentGrade: null, subject: SCHOOL, subSubject: field };
  const combined = sAsset === 'same';
  e.questionDownload = title(e, field, combined ? '문제·해설' : '문제');
  e.questionUrl = link(qAsset, e.questionDownload);
  e.answerUrl = null;
  e.solutionDownload = sAsset ? (combined ? e.questionDownload : title(e, field, '해설')) : null;
  e.solutionUrl = sAsset ? link(combined ? qAsset : sAsset, e.solutionDownload) : null;
  e.answerDownload = null;
  e.source = 'essay-v23';
  e.questionUrl_source_original = original;
  if (sAsset) e.solutionUrl_source_original = original;
  exams.push(e);
  changed++;
}

if (!changed) {
  console.log('연세대 논술: 바꿀 것 없음');
  process.exit(0);
}
await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
console.log(`연세대 논술: ${changed}건 변경·추가`);
