#!/usr/bin/env node
// 이투스 시험별 풀서비스 페이지 (sub14.asp) 직접 fetch.
// 활성 페이지에서 원점수 등급컷 추출.
//
// URL 패턴: https://www.etoos.com/report/exam/YYYYMMDD/sub14.asp?Grd=3
//
// 출력: data/raw/etoos/rawcuts-direct.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(ROOT, 'data/raw/etoos');
await mkdir(OUT_DIR, { recursive: true });

const examsList = JSON.parse(await readFile(path.resolve(ROOT, 'data/raw/megastudy/exams.json'), 'utf-8'));
console.log(`총 ${examsList.length}건 시험에 대해 이투스 직접 fetch`);

function parseTables(html) {
  const tables = [];
  const tblRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = tblRe.exec(html)) !== null) {
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let mr;
    while ((mr = trRe.exec(m[1])) !== null) {
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

async function fetchEtoos(dateStr) {
  const url = `https://www.etoos.com/report/exam/${dateStr}/sub14.asp?Grd=3`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error('too small (404 또는 빈 페이지)');
  // EUC-KR 디코딩 (이투스는 EUC-KR)
  return new TextDecoder('euc-kr').decode(buf);
}

const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < examsList.length; i++) {
  const exam = examsList[i];
  const dateStr = exam.examDate.replaceAll('-', '');
  process.stdout.write(`\r  ${i+1}/${examsList.length} ${exam.examDate} ${exam.typeRaw.replace(/<.*$/,'')}  성공:${ok} 실패:${fail}     `);
  try {
    const html = await fetchEtoos(dateStr);
    const tables = parseTables(html);
    // 등급컷 표 = 헤더에 [등급, 원점수, 표준점수, 백분위] 포함
    const gcTables = tables.filter(t => {
      const head = (t[0] || []).join(' ');
      return /등급/.test(head) && /원점수/.test(head) && /표준점수/.test(head) && /백분위/.test(head);
    });
    if (gcTables.length === 0) { fail++; continue; }
    results.push({ ...exam, tables: gcTables });
    ok++;
  } catch (e) { fail++; }
  await new Promise(r => setTimeout(r, 150));
}
console.log();

await writeFile(path.join(OUT_DIR, 'rawcuts-direct.json'), JSON.stringify(results, null, 2));
console.log(`\n저장: ${results.length}건 → data/raw/etoos/rawcuts-direct.json`);
console.log(`  성공: ${ok}, 실패: ${fail}`);
const byYear = {};
results.forEach(r => { byYear[r.examYear] = (byYear[r.examYear]||0) + 1; });
console.log(`  학년도별:`, byYear);
