#!/usr/bin/env node
// 이투스 시험별 풀서비스 페이지 (sub14.asp) 의 Wayback Machine 캡처본을 fetch.
// 시험 직후 캡처본에는 원점수 등급컷이 채워져 있음.
//
// 출처:
//   - 이투스 풀서비스 URL 패턴: /report/exam/YYYYMMDD/sub14.asp?Grd=3
//   - Wayback Machine: archive.org/wayback/available?url=...&timestamp=YYYYMMDD
//
// 출력: data/raw/etoos/rawcuts-raw.json (시험·영역별 raw 표 데이터)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(ROOT, 'data/raw/etoos');
await mkdir(OUT_DIR, { recursive: true });

// 메가스터디 fetch 결과로 만든 시험 목록 활용
const examsList = JSON.parse(await readFile(path.resolve(ROOT, 'data/raw/megastudy/exams.json'), 'utf-8'));
console.log(`이투스에서 시도할 시험 ${examsList.length}건`);

// HTML → 표 파싱 (간단 버전)
function parseTables(html) {
  const tables = [];
  const tblRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = tblRe.exec(html)) !== null) {
    const tblXml = m[1];
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let mr;
    while ((mr = trRe.exec(tblXml)) !== null) {
      const cells = [];
      const tdRe = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/g;
      let mc;
      while ((mc = tdRe.exec(mr[1])) !== null) {
        const text = mc[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length > 1) tables.push(rows);
  }
  return tables;
}

// EUC-KR 응답 디코딩
async function fetchEucKr(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // wayback 응답은 UTF-8 일 수도, 원본 페이지의 EUC-KR 일 수도. 둘 다 시도.
  let text = new TextDecoder('utf-8').decode(buf);
  // EUC-KR 응답 시 한글이 깨짐 → 다시 디코딩
  if (!/[가-힣]/.test(text.slice(0, 5000))) {
    text = new TextDecoder('euc-kr').decode(buf);
  }
  return text;
}

// 한 시험의 wayback 캡처 (시험 직후 1~2주 내) 찾아서 fetch
async function fetchOneExam(exam) {
  const dateStr = exam.examDate.replaceAll('-', '');   // 20251113
  const baseUrl = `https://www.etoos.com/report/exam/${dateStr}/sub14.asp?Grd=3`;
  // 시험 직후 ~ 30일 내 캡처 시도
  const dt = new Date(exam.examDate);
  const targets = [];
  for (const days of [7, 14, 21, 30]) {
    const t = new Date(dt.getTime() + days * 86400 * 1000);
    const ts = `${t.getUTCFullYear()}${String(t.getUTCMonth()+1).padStart(2,'0')}${String(t.getUTCDate()).padStart(2,'0')}`;
    targets.push(ts);
  }

  for (const ts of targets) {
    try {
      const apiResp = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(baseUrl)}&timestamp=${ts}`);
      const apiData = await apiResp.json();
      const closest = apiData?.archived_snapshots?.closest;
      if (!closest) continue;
      const html = await fetchEucKr(closest.url);
      const tables = parseTables(html);
      // 등급컷 표 (등급+원점수+표준점수+백분위 헤더)
      const gcTables = tables.filter(t => {
        const head = t[0]?.join(' ') || '';
        return /등급/.test(head) && /원점수/.test(head) && /표준점수/.test(head);
      });
      if (gcTables.length === 0) continue;
      return { snapshotTs: closest.timestamp, snapshotUrl: closest.url, tables: gcTables };
    } catch (e) { continue; }
  }
  return null;
}

// 모든 시험 순차 처리 (rate limit 고려)
const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < examsList.length; i++) {
  const exam = examsList[i];
  process.stdout.write(`\r  ${i+1}/${examsList.length}  ${exam.examDate} ${exam.typeRaw.replace(/<.*$/,'')}  성공:${ok} 실패:${fail}     `);
  try {
    const r = await fetchOneExam(exam);
    if (r) {
      results.push({ ...exam, ...r });
      ok++;
    } else {
      fail++;
    }
  } catch { fail++; }
  await new Promise(r => setTimeout(r, 200));   // 살살
}
console.log();

await writeFile(path.join(OUT_DIR, 'rawcuts-raw.json'), JSON.stringify(results, null, 2));
console.log(`\n저장: ${results.length}건 → data/raw/etoos/rawcuts-raw.json`);
console.log(`  성공: ${ok}, 실패: ${fail}`);
// 학년도별 성공
import { writeFile as wf } from 'node:fs/promises';
const byYear = {};
results.forEach(r => { byYear[r.examYear] = (byYear[r.examYear]||0) + 1; });
console.log(`  학년도별:`, byYear);
