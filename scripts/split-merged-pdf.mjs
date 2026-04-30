// 통합 PDF (사용자가 한컴에서 끼워넣기로 만든 47개 파일 합본) 를
// 페이지 텍스트 분석으로 시험별로 분할 → 원래 파일 위치에 저장
//
// 사용:
//   node scripts/split-merged-pdf.mjs <merged.pdf> [--dry-run]
//
// 알고리즘:
//   1) PDF 페이지별로 텍스트 추출 (pdftotext)
//   2) 각 페이지의 시험 식별 패턴 매칭 (연도 + 영역명)
//   3) 같은 식별 = 같은 시험. 식별 변경 = 다음 시험 시작
//   4) 시험 그룹별로 pdfseparate 로 분할
//   5) 매핑 파일명(zip 안 순서) 으로 저장

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const PDF = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
if (!PDF) {
  console.error('사용: node scripts/split-merged-pdf.mjs <merged.pdf>');
  process.exit(1);
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || ('exit ' + code))));
    p.on('error', reject);
  });
}

// 페이지 텍스트에서 시험 식별 패턴 추출
function identify(text) {
  const t = text.replace(/\s+/g, ' ');

  // 연도
  const yearM = t.match(/(\d{4})\s*학년도/);
  const year = yearM ? yearM[1] : null;

  // 시험 종류
  let kind = null;
  if (/법학적성시험|LEET/i.test(t)) kind = 'LEET';
  else if (/의[\s·.]*치의학|MEET/i.test(t)) kind = 'MEET';
  else if (/경찰대학/.test(t)) kind = 'POLICE';

  // 영역
  let area = null;
  if (/언어이해/.test(t)) area = 'verbal';
  else if (/추리논증/.test(t)) area = 'reasoning';
  else if (/논술/.test(t)) area = 'essay';
  else if (/도입/.test(t)) area = 'intro';
  else if (/언어추론/.test(t)) area = 'verbal';        // MEET
  else if (/수학/.test(t)) area = 'math';
  else if (/영어/.test(t)) area = 'english';

  // 답지/문제지
  let kindKind = null;
  if (/정답[표]?/.test(t)) kindKind = 'a';
  else if (/문제지|제\s*\d\s*교시/.test(t)) kindKind = 'q';

  return { year, kind, area, kindKind, raw: t.slice(0, 100) };
}

async function main() {
  // 1) 페이지 수
  const info = await exec('pdfinfo', [PDF]);
  const pagesM = info.match(/Pages:\s*(\d+)/);
  if (!pagesM) throw new Error('pdfinfo 실패');
  const totalPages = parseInt(pagesM[1], 10);
  console.log(`PDF 총 ${totalPages}페이지`);

  // 2) 페이지별 텍스트 + 식별
  const pageIds = [];
  for (let p = 1; p <= totalPages; p++) {
    const text = await exec('pdftotext', ['-f', String(p), '-l', String(p), '-layout', PDF, '-']);
    const id = identify(text);
    pageIds.push({ page: p, ...id });
  }

  // 3) 시험 경계 검출 — 식별이 바뀌는 페이지가 새 시험 시작
  const segments = [];
  let curr = null;
  for (const pi of pageIds) {
    const sig = `${pi.year || '?'}-${pi.kind || '?'}-${pi.area || '?'}-${pi.kindKind || '?'}`;
    // 첫 페이지거나 식별이 바뀌면 새 segment
    // 단, 같은 시험 내에서도 영역 키워드가 본문에 등장할 수 있으므로
    // 표지 신호(연도+종류 모두 매칭)일 때만 새 시작으로 인정
    const isCover = pi.year && pi.kind && pi.area;
    if (!curr) {
      curr = { sig, start: pi.page, end: pi.page, ...pi };
    } else if (isCover && sig !== curr.sig) {
      segments.push(curr);
      curr = { sig, start: pi.page, end: pi.page, ...pi };
    } else {
      curr.end = pi.page;
    }
  }
  if (curr) segments.push(curr);

  console.log(`\n검출된 시험 경계: ${segments.length}개`);
  for (const s of segments) {
    console.log(`  p${s.start}-${s.end}: ${s.sig}`);
  }

  if (DRY) {
    console.log('\n--dry-run 모드 — 실제 분할은 안 함');
    return;
  }

  if (segments.length !== 47) {
    console.warn(`\n⚠️  47개 시험 기대했는데 ${segments.length}개 검출. 확인 필요.`);
    console.warn('  통합 PDF 안에 페이지 나누기가 빠진 부분이 있을 수 있음.');
    console.warn('  --dry-run 으로 한 번 더 확인 후 매핑 점검 권장.');
  }

  // 4) zip 안 매핑 (NN_파일명) 으로 매핑 — 파일명에서 연도/영역/종류 파싱
  const zipOrder = [
    // 매핑은 zip 생성 시점과 동일해야 함. 디스크에서 .hwp 목록 읽음 (PDF 없는 것)
  ];
  const exams = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'exams.json'), 'utf8'));
  const hwpPaths = new Set();
  for (const e of exams) {
    for (const k of ['answerUrl', 'questionUrl']) {
      const u = e[k];
      if (typeof u === 'string' && u.endsWith('.hwp') && !u.startsWith('http')) {
        try { await fs.stat(u); hwpPaths.add(u); } catch {}
      }
    }
  }
  const sortedHwp = [...hwpPaths].sort();
  console.log(`\nzip 안 .hwp 파일: ${sortedHwp.length}개`);

  // 파일명 → 식별 sig
  function sigOfFilename(p) {
    const base = path.basename(p, '.hwp');
    const m = base.match(/^(\d{4})_(?:main|prelim)_(\w+?)_([qa])$/);
    if (!m) return null;
    const [, year, areaRaw, ka] = m;
    let kind = null, area = null;
    if (p.includes('pdfs_leet')) kind = 'LEET';
    else if (p.includes('pdfs_meet')) kind = 'MEET';
    else if (p.includes('pdfs_police')) kind = 'POLICE';
    if (areaRaw === 'verbal') area = 'verbal';
    else if (areaRaw === 'reasoning') area = 'reasoning';
    else if (areaRaw === 'essay') area = 'essay';
    else if (areaRaw === 'intro') area = 'intro';
    else if (areaRaw === 'math') area = 'math';
    else if (areaRaw === 'english') area = 'english';
    return `${year}-${kind}-${area}-${ka}`;
  }

  // 매칭: segment.sig ↔ filename.sig
  const matches = [];
  const usedFiles = new Set();
  for (const seg of segments) {
    const found = sortedHwp.find(p => !usedFiles.has(p) && sigOfFilename(p) === seg.sig);
    if (found) {
      usedFiles.add(found);
      matches.push({ seg, file: found });
    } else {
      matches.push({ seg, file: null });
      console.warn(`매칭 실패: ${seg.sig} (p${seg.start}-${seg.end})`);
    }
  }

  // 5) pdfseparate 로 segment 별로 분할 → 원래 위치 저장
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'split-'));
  let ok = 0, fail = 0;
  for (const { seg, file } of matches) {
    if (!file) { fail++; continue; }
    const outBase = path.join(tmpDir, `seg-${seg.start}-${seg.end}`);
    try {
      // 페이지 범위 추출 → 단일 PDF
      // pdfseparate 는 각 페이지 따로. 다시 합치려면 pdfunite
      // qpdf 로 페이지 범위 추출이 더 깔끔
      const dest = path.resolve(ROOT, file).replace(/\.hwp$/, '.pdf');
      await exec('qpdf', [PDF, '--pages', '.', `${seg.start}-${seg.end}`, '--', dest]);
      ok++;
    } catch (e) {
      fail++;
      console.warn(`분할 실패 ${file}: ${e.message.slice(0, 80)}`);
    }
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n분할 저장: ${ok} 성공 · ${fail} 실패`);
}

main().catch(e => { console.error(e); process.exit(1); });
