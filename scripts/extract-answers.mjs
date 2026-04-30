// 답지 PDF 일괄 텍스트 파싱 → data/answers.json 갱신
//
// 사용:
//   node scripts/extract-answers.mjs                   # 미추출 항목 전부
//   node scripts/extract-answers.mjs --limit 30        # 상위 30개만
//   node scripts/extract-answers.mjs --concurrency 8   # 동시 8개
//   node scripts/extract-answers.mjs --force           # 이미 있어도 재추출
//   node scripts/extract-answers.mjs --ids 1,2,5       # 특정 id만
//
// 결과 형식: { "1": ["2","3","1",...], "2": [...] }   (id → 정답 배열)
// 실패 케이스는 키 자체를 추가하지 않음 → 다음 실행에서 자동 재시도.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMS_PATH = path.join(ROOT, 'data', 'exams.json');
const OUT_PATH   = path.join(ROOT, 'data', 'answers.json');

// ── CLI 인자 ──────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const has = k => args.includes(k);

const CONCURRENCY = Number(argVal('--concurrency', 5));
const LIMIT       = Number(argVal('--limit', 0));     // 0 = 전체
const FORCE       = has('--force');
const ID_FILTER   = (argVal('--ids', '') || '').split(',').map(s => s.trim()).filter(Boolean);

// ── 파싱 로직 (런타임 구버전과 동일) ─────────────────────
const CIRCLED_TO_NUM = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };

function parseAnswersFromText(text) {
  const t = String(text || '');
  const pairs = new Map();
  // 패턴: (번호 1~50) (구분자: 번/./)/공백) (답: 원숫자 ①~⑤ 또는 1~3자리 정수)
  // 답 뒤에 추가 숫자 오면 거짓 매칭 가능성 → (?!\d) 로 차단
  const re = /(?:^|[^\d])(\d{1,2})\s*(?:번|[.)]|\s+)\s*((?:[①②③④⑤])|(?:\d{1,3}))(?!\d)/g;
  let m;
  while ((m = re.exec(t)) != null) {
    const num = parseInt(m[1], 10);
    if (num < 1 || num > 50) continue;
    if (pairs.has(num)) continue;
    let ans = m[2];
    if (CIRCLED_TO_NUM[ans]) ans = CIRCLED_TO_NUM[ans];
    // 답이 0 이거나 비정상이면 skip
    if (ans === '0' || ans === '') continue;
    pairs.set(num, ans);
  }
  if (pairs.size < 5) return null;
  const max = Math.max(...pairs.keys());
  const arr = [];
  let missing = 0;
  for (let i = 1; i <= max; i++) {
    if (pairs.has(i)) arr.push(pairs.get(i));
    else { arr.push('?'); missing++; }
  }
  // 임계값 완화: 30% 누락까지 허용 (수능 수학은 단답 9/30 = 30%)
  if (missing > Math.max(2, Math.floor(arr.length * 0.3))) return null;
  return arr;
}

// ── PDF.js (Node legacy build) ───────────────────────────
let _pdfjs;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

// 결과: { ok: true, answers } 또는 { ok: false, reason }
async function fetchAndParse(url) {
  if (!url) return { ok: false, reason: 'no-url' };
  const lib = await getPdfjs();

  // ── 1) 다운로드 ────────────────────────────────────────
  let buf;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) return { ok: false, reason: `http-${res.status}` };
      buf = new Uint8Array(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'fetch-error' };
  }

  // ── 2) PDF 텍스트 추출 ────────────────────────────────
  let text = '';
  try {
    const pdf = await lib.getDocument({
      data: buf,
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    const limit = Math.min(pdf.numPages, 4);
    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += ' ' + tc.items.map(it => it.str).join(' ');
    }
  } catch {
    return { ok: false, reason: 'pdf-error' };
  }
  if (!text.trim() || text.replace(/\s+/g, '').length < 10) {
    return { ok: false, reason: 'no-text' };   // 이미지 스캔 PDF 가능성
  }

  // ── 3) 정답 패턴 매칭 ─────────────────────────────────
  const arr = parseAnswersFromText(text);
  if (!arr) return { ok: false, reason: 'parse-fail' };
  return { ok: true, answers: arr };
}

// ── I/O ──────────────────────────────────────────────────
async function loadJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveOut(out) {
  // 키를 숫자 정렬해서 안정적인 diff
  const sorted = {};
  for (const k of Object.keys(out).sort((a, b) => Number(a) - Number(b))) {
    sorted[k] = out[k];
  }
  await fs.writeFile(OUT_PATH, JSON.stringify(sorted) + '\n');
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  const exams = await loadJson(EXAMS_PATH, []);
  const out   = await loadJson(OUT_PATH, {});

  let targets = exams.filter(e => e.answerUrl);
  if (ID_FILTER.length > 0) {
    const set = new Set(ID_FILTER.map(Number));
    targets = targets.filter(e => set.has(e.id));
  }
  if (!FORCE) targets = targets.filter(e => !out[String(e.id)]);
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  const totalWithUrl = exams.filter(e => e.answerUrl).length;
  console.log(`전체 ${exams.length}개 · 답지URL ${totalWithUrl}개 · 처리대상 ${targets.length}개 · 동시성 ${CONCURRENCY}`);

  if (targets.length === 0) {
    console.log('처리할 항목이 없습니다.');
    return;
  }

  let done = 0, ok = 0, fail = 0;
  const SAVE_EVERY = 25;
  const t0 = Date.now();

  // 실패 사유 누적
  const failures = [];           // {id, subject, sub, type, gradeYear, reason, url}
  const reasonCount = Object.create(null);

  const queue = [...targets];

  async function worker() {
    while (queue.length) {
      const exam = queue.shift();
      if (!exam) break;
      let result;
      try {
        result = await fetchAndParse(exam.answerUrl);
      } catch {
        result = { ok: false, reason: 'unknown-error' };
      }
      if (result.ok) {
        out[String(exam.id)] = result.answers;
        ok++;
      } else {
        fail++;
        reasonCount[result.reason] = (reasonCount[result.reason] || 0) + 1;
        failures.push({
          id: exam.id,
          curriculum: exam.curriculum,
          gradeYear: exam.gradeYear,
          type: exam.type,
          subject: exam.subject,
          sub: exam.subSubject,
          reason: result.reason,
          url: exam.answerUrl,
        });
      }
      done++;
      const pct = ((done / targets.length) * 100).toFixed(1);
      const eta = ((Date.now() - t0) / done) * (targets.length - done) / 1000;
      process.stdout.write(
        `\r처리: ${done}/${targets.length} (${pct}%)  성공: ${ok}  실패: ${fail}  ETA: ${eta.toFixed(0)}s   `
      );
      if (done % SAVE_EVERY === 0) await saveOut(out);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveOut(out);
  console.log(`\n완료. ${ok} 성공 · ${fail} 실패 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (failures.length > 0) {
    // 사유 요약
    console.log('\n실패 사유:');
    const sorted = Object.entries(reasonCount).sort((a, b) => b[1] - a[1]);
    for (const [r, c] of sorted) console.log(`  ${r.padEnd(14)} ${c}건`);

    // 상세 보고서 — 디버깅·재시도용
    const reportPath = path.join(ROOT, 'data', 'answers-fails.json');
    await fs.writeFile(reportPath, JSON.stringify(failures, null, 2) + '\n');
    console.log(`\n상세 보고서: data/answers-fails.json (${failures.length}건)`);
    console.log('  · no-text     이미지 스캔 PDF 가능성 — 재시도해도 동일');
    console.log('  · parse-fail  텍스트는 있으나 패턴 안 맞음 — URL 열어서 답지 포맷 확인 필요');
    console.log('  · http-XXX / fetch-error / timeout — 네트워크 일시 오류 가능, 재실행으로 자동 재시도');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
