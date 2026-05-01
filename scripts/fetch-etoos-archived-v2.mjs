#!/usr/bin/env node
// 이투스 시험별 sub14.asp 의 Wayback Machine archive 모든 캡처를 CDX API 로 listing.
// 시험 직후 1~30일 캡처 우선 fetch.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(ROOT, 'data/raw/etoos');
await mkdir(OUT_DIR, { recursive: true });

const examsList = JSON.parse(await readFile(path.resolve(ROOT, 'data/raw/megastudy/exams.json'), 'utf-8'));

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

async function fetchEucKr(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text = new TextDecoder('utf-8').decode(buf);
  if (!/[가-힣]/.test(text.slice(0, 5000))) {
    text = new TextDecoder('euc-kr').decode(buf);
  }
  return text;
}

// 한 시험에 대한 모든 CDX 캡처 listing
async function listCaptures(dateStr) {
  const url = `https://www.etoos.com/report/exam/${dateStr}/sub14.asp?Grd=3`;
  const api = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json`;
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    if (!text.trim() || text.trim() === '[]') return [];
    const data = JSON.parse(text);
    return data.slice(1).map(r => ({ ts: r[1], statusCode: r[4], original: r[2] }))
      .filter(r => r.statusCode === '200');
  } catch { return []; }
}

const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < examsList.length; i++) {
  const exam = examsList[i];
  const dateStr = exam.examDate.replaceAll('-', '');
  process.stdout.write(`\r  ${i+1}/${examsList.length} ${exam.examDate}  성공:${ok} 실패:${fail}     `);

  const caps = await listCaptures(dateStr);
  if (caps.length === 0) { fail++; continue; }

  // 시험일 + 5~60일 사이 캡처 우선
  const examDate = new Date(exam.examDate);
  const ranked = caps.map(c => {
    const ts = c.ts;
    const ct = new Date(`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`);
    const days = (ct - examDate) / 86400000;
    return { ...c, days };
  }).filter(c => c.days >= 0).sort((a,b) => Math.abs(a.days - 14) - Math.abs(b.days - 14));   // 14일 후가 가장 좋음

  let success = false;
  for (const cap of ranked.slice(0, 5)) {
    try {
      const archiveUrl = `http://web.archive.org/web/${cap.ts}/${cap.original}`;
      const html = await fetchEucKr(archiveUrl);
      const tables = parseTables(html);
      const gcTables = tables.filter(t => {
        const head = (t[0] || []).join(' ');
        return /등급/.test(head) && /원점수/.test(head) && /표준점수/.test(head);
      });
      if (gcTables.length === 0) continue;

      // 첫 표의 1등급 원점수가 비어있으면 의미 없음 (활성 페이지)
      const firstTbl = gcTables[0];
      const grade1 = firstTbl[2] || [];   // 보통 첫 표 행 0=헤더, 1=만점, 2=1등급
      const rawCol = grade1[1] || '';
      if (!rawCol || rawCol === '-' || rawCol === '') continue;

      results.push({ ...exam, snapshotTs: cap.ts, snapshotUrl: archiveUrl, tables: gcTables });
      ok++;
      success = true;
      break;
    } catch { continue; }
    await new Promise(r => setTimeout(r, 200));
  }
  if (!success) fail++;
  await new Promise(r => setTimeout(r, 100));
}
console.log();

await writeFile(path.join(OUT_DIR, 'rawcuts-archived-v2.json'), JSON.stringify(results, null, 2));
console.log(`\n저장: ${results.length}건 → data/raw/etoos/rawcuts-archived-v2.json`);
console.log(`  성공: ${ok}, 실패: ${fail}`);
const byYear = {};
results.forEach(r => { byYear[r.examYear] = (byYear[r.examYear]||0) + 1; });
console.log(`  학년도별:`, byYear);
