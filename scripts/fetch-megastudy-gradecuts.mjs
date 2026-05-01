#!/usr/bin/env node
// 메가스터디 역대 등급컷(2016~2026 고3 수능/모평/학평) 자동 수집.
//
// API:
//   POST /Entinfo/total_rankCut/main_examNm_ax.asp     body: grdFlg=3
//   POST /Entinfo/total_rankCut/main_examRankCut_ax.asp body: examSeq=<id>&tabNo=<1|2|3>
//
// tabNo: 1=국수영한, 2=사회, 3=과학
//
// 출력: data/raw/megastudy/gradecuts.json (raw HTML 파싱 결과)
//      data/raw/megastudy/exams.json     (시험 목록 메타)

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(ROOT, 'data/raw/megastudy');
await mkdir(OUT_DIR, { recursive: true });

const BASE = 'https://www.megastudy.net/Entinfo/total_rankCut';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Referer': `${BASE}/main.asp`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept-Charset': 'utf-8,euc-kr;q=0.7,*;q=0.7',
};

// EUC-KR 응답을 읽어 utf-8 string 반환
async function postEucKr(url, body) {
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body });
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder('euc-kr').decode(buf);
}

// 1. 시험 목록 가져오기 (grdFlg=3 고3)
console.log('시험 목록 fetch...');
const examListHtml = await postEucKr(`${BASE}/main_examNm_ax.asp`, 'grdFlg=3');
// fncSelExamSeq(SEQ,'1',IDX);">YYYY.MM.DD 시험명</li>
const examRe = /fncSelExamSeq\((\d+),'\d+',\d+\);">\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\S+)\s*</g;
const exams = [];
let m;
while ((m = examRe.exec(examListHtml)) !== null) {
  const [, seq, year, month, day, type] = m;
  let normalizedType = null;
  if (type === '수능') normalizedType = 'csat';
  else if (type === '모의평가') normalizedType = type === '모의평가' && Number(month) === 6 ? 'june' : (Number(month) === 9 ? 'sept' : 'mock');
  else if (type === '학력평가') {
    const M = Number(month);
    normalizedType = ({3:'mar', 4:'apr', 7:'jul', 10:'oct', 5:'may', 11:'nov'})[M] ?? `m${M}`;
  }
  // gradeYear: 학년도 — 11~12월 시험은 다음 해, 그 외는 같은 해
  const examYear = Number(year);
  const examMonth = Number(month);
  const gradeYear = (examMonth >= 11 || normalizedType === 'csat') ? examYear + 1 : examYear;
  exams.push({
    examSeq: Number(seq),
    examDate: `${year}-${month}-${day}`,
    examYear, gradeYear, month: examMonth,
    type: normalizedType, typeRaw: type,
  });
}
console.log(`시험 ${exams.length}개 발견`);
await writeFile(path.join(OUT_DIR, 'exams.json'), JSON.stringify(exams, null, 2));

// 2. 각 시험 × 3 탭 등급컷 fetch
function parseGradeTable(html) {
  // <table class="tb_basic"> ... <tr>등급, 표준점수, 백분위, 누적비율
  // 영역명: <th colspan=4 class="sb_th">국어</th>
  const out = [];
  const tableRe = /<table class="tb_basic">[\s\S]*?<th colspan="\d+" class="sb_th">([^<]+)<\/th>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
  let mt;
  while ((mt = tableRe.exec(html)) !== null) {
    const subjectName = mt[1].trim();
    const tbody = mt[2];
    const rows = [];
    const trRe = /<tr>([\s\S]*?)<\/tr>/g;
    let mr;
    while ((mr = trRe.exec(tbody)) !== null) {
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells = [];
      let mc;
      while ((mc = tdRe.exec(mr[1])) !== null) {
        const v = mc[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        cells.push(v);
      }
      if (cells.length) rows.push(cells);
    }
    out.push({ subjectName, rows });
  }
  return out;
}

const allData = [];
let done = 0;
const total = exams.length * 3;
for (const ex of exams) {
  for (const tabNo of [1, 2, 3]) {
    const html = await postEucKr(`${BASE}/main_examRankCut_ax.asp`, `examSeq=${ex.examSeq}&tabNo=${tabNo}`);
    const parsed = parseGradeTable(html);
    for (const t of parsed) {
      allData.push({
        examSeq: ex.examSeq, examDate: ex.examDate,
        gradeYear: ex.gradeYear, examYear: ex.examYear, month: ex.month,
        type: ex.type, typeRaw: ex.typeRaw,
        tabNo, subjectName: t.subjectName,
        rows: t.rows,
      });
    }
    done++;
    if (done % 20 === 0) process.stdout.write(`\r  ${done}/${total} (${(done*100/total).toFixed(0)}%)  ${allData.length}건 누적`);
    // 너무 빠른 호출 방지
    await new Promise(r => setTimeout(r, 60));
  }
}
console.log(`\n완료. 총 ${allData.length}건 등급컷 표`);
await writeFile(path.join(OUT_DIR, 'gradecuts-raw.json'), JSON.stringify(allData, null, 2));
console.log(`저장: data/raw/megastudy/gradecuts-raw.json`);
