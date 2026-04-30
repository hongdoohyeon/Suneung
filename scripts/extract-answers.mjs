// 답지 PDF 일괄 텍스트 파싱 → data/answers.json 갱신
//
// 사용:
//   node scripts/extract-answers.mjs                   # 미추출 항목 전부
//   node scripts/extract-answers.mjs --limit 30        # 상위 30개만
//   node scripts/extract-answers.mjs --concurrency 8   # 동시 8개
//   node scripts/extract-answers.mjs --force           # 이미 있어도 재추출
//   node scripts/extract-answers.mjs --ids 1,2,5       # 특정 id만
//
// 알고리즘:
//   1) URL 단위로 PDF 한 번만 fetch (확통/미적분/기하 같은 답지면 재사용)
//   2) PDF.js textItems 의 위치(x, y) 보존하여 row 단위 그룹핑
//   3) row 안에서 (번호, 답, 배점) 트리플 인식 — 거짓 매칭 차단
//   4) subSubject 가 있으면 헤더의 x 좌표로 자기 컬럼만 선택
//      (수능 수학·사탐·과탐의 다컬럼 표 답지 대응)
//   5) V2 실패 시 단순 정규식(V1) fallback

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
const LIMIT       = Number(argVal('--limit', 0));
const FORCE       = has('--force');
const ID_FILTER   = (argVal('--ids', '') || '').split(',').map(s => s.trim()).filter(Boolean);

// ── 상수 ──────────────────────────────────────────────────
const CIRCLED_TO_NUM = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };

// 답지 컬럼 헤더로 등장 가능한 과목명 (정규화 키 비교)
const SUBJECT_HEADERS = [
  // 수학
  '확률과통계', '미적분', '기하', '가형', '나형',
  // 사탐 (2015)
  '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사',
  '경제', '정치와법', '법과정치', '사회·문화',
  // 과탐 (2015)
  '물리학Ⅰ', '물리학Ⅱ', '화학Ⅰ', '화학Ⅱ',
  '생명과학Ⅰ', '생명과학Ⅱ', '지구과학Ⅰ', '지구과학Ⅱ',
  // 과탐 (2009)
  '물리Ⅰ', '물리Ⅱ',
  // 국어 (2015)
  '화법과작문', '언어와매체',
];

const norm = s => String(s ?? '').replace(/[\s·]/g, '');

// ── PDF.js (Node legacy build) ────────────────────────────
let _pdfjs;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

// ── 답지 PDF 바이트 가져오기: http(s) 면 fetch, 상대 경로면 로컬 파일 ──
async function fetchPdfBuf(url) {
  if (/^https?:\/\//i.test(url)) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) return { error: `http-${res.status}` };
      return { buf: new Uint8Array(await res.arrayBuffer()) };
    } catch (e) {
      return { error: e?.name === 'AbortError' ? 'timeout' : 'fetch-error' };
    } finally {
      clearTimeout(timer);
    }
  }
  // LEET/MEET 등 로컬 경로 (예: pdfs_leet/2026/main/2026_main_verbal_a.pdf)
  const localPath = path.resolve(ROOT, url);
  try {
    const data = await fs.readFile(localPath);
    return { buf: new Uint8Array(data) };
  } catch {
    return { error: 'local-not-found' };
  }
}

// ── PDF → textItems (위치 포함) ──────────────────────────
async function fetchTextItems(url) {
  const got = await fetchPdfBuf(url);
  if (got.error) return { error: got.error };
  const buf = got.buf;
  const lib = await getPdfjs();
  let items;
  try {
    const pdf = await lib.getDocument({
      data: buf, disableFontFace: true, useSystemFonts: false,
    }).promise;
    const limit = Math.min(pdf.numPages, 4);
    items = [];
    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        const s = String(it.str || '').trim();
        if (!s) continue;
        items.push({ s, x: it.transform[4], y: it.transform[5], page: i });
      }
    }
  } catch {
    return { error: 'pdf-error' };
  }
  if (items.length === 0) return { error: 'no-text' };
  return { items };
}

// ── 인접 토큰 N개를 합쳐서 헤더 검색 (헤더 텍스트가 분할되어 있어도 매칭) ──
function findHeaderItem(items, key, maxJoin = 4) {
  const target = norm(key);
  if (!target) return null;
  for (let i = 0; i < items.length; i++) {
    let joined = norm(items[i].s);
    if (joined === target) return items[i];
    for (let n = 1; n < maxJoin; n++) {
      if (i + n >= items.length) break;
      // 같은 행에서만 합침 (y 차이 < 4)
      if (Math.abs(items[i + n].y - items[i].y) > 4) break;
      joined += norm(items[i + n].s);
      if (joined === target) return items[i];
      if (joined.length > target.length + 6) break;   // 너무 길어지면 중단
    }
  }
  return null;
}

// ── row 단위 그룹핑 (페이지별로 분리) ────────────────────
function groupByRow(items, yTol = 3) {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;       // 같은 페이지 안에선 y 큰 것이 위쪽
  });
  const rows = [];
  for (const it of sorted) {
    const row = rows.find(r => r.page === it.page && Math.abs(r.y - it.y) <= yTol);
    if (row) row.items.push(it);
    else rows.push({ page: it.page, y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

// ── row → (번호, 답, 배점) 트리플 ────────────────────────
function triplesFromRow(rowItems) {
  const triples = [];
  let i = 0;
  while (i + 2 < rowItems.length) {
    const a = rowItems[i].s;
    const b = rowItems[i + 1].s;
    const c = rowItems[i + 2].s;
    const isNum   = /^\d{1,2}$/.test(a);
    const isAns   = CIRCLED_TO_NUM[b] !== undefined || /^\d{1,4}$/.test(b);
    const isScore = /^\d$/.test(c);   // 배점은 1자리 (1~5점)
    if (isNum && isAns && isScore) {
      const num = parseInt(a, 10);
      const ans = CIRCLED_TO_NUM[b] || b;
      if (num >= 1 && num <= 50 && ans !== '0') {
        triples.push({ num, ans, x: rowItems[i + 1].x, y: rowItems[i + 1].y });
        i += 3;
        continue;
      }
    }
    i++;
  }
  return triples;
}

// ── 블록 패턴: '번호' 행 + '정답' 행 분리 (사관/경찰대 등) ──
function blockPairs(rows) {
  const pairs = [];
  for (const row of rows) {
    // '정답' 라벨: 단일 토큰 "정답" 또는 분리된 "정"+"답" 두 토큰
    let dataStart = -1;
    const single = row.items.findIndex(it => /^정답$/.test(it.s));
    if (single >= 0) {
      dataStart = single + 1;
    } else {
      for (let k = 0; k < row.items.length - 1; k++) {
        if (/^정$/.test(row.items[k].s) && /^답$/.test(row.items[k + 1].s)) {
          dataStart = k + 2; break;
        }
      }
    }
    if (dataStart < 0) continue;
    const ansItems = row.items.slice(dataStart)
      .filter(it => CIRCLED_TO_NUM[it.s] !== undefined || /^\d{1,4}$/.test(it.s));
    if (ansItems.length < 5) continue;

    // 같은 페이지의 위쪽 row 중 숫자만으로 채워진 row 찾기
    const above = rows
      .filter(r => r.page === row.page && r.y > row.y)
      .sort((a, b) => a.y - b.y);   // 가까운 위쪽 우선

    let numItems = null;
    for (const r of above) {
      const nums = r.items.filter(it => /^\d{1,2}$/.test(it.s) && parseInt(it.s, 10) <= 50);
      if (nums.length === 0) continue;
      // 케이스 A: 같은 개수 → 인덱스 매칭으로 충분
      if (nums.length === ansItems.length) { numItems = nums; break; }
      // 케이스 B: 더 많거나 적으면 x 좌표가 ansItems 와 매칭되는지 확인
      const matched = ansItems.filter(a => nums.some(n => Math.abs(n.x - a.x) < 14));
      if (matched.length >= ansItems.length * 0.6) { numItems = nums; break; }
    }
    if (!numItems) continue;

    if (numItems.length === ansItems.length) {
      // 인덱스 순 매칭 (가장 신뢰도 높음)
      for (let i = 0; i < ansItems.length; i++) {
        const numVal = parseInt(numItems[i].s, 10);
        const ansVal = CIRCLED_TO_NUM[ansItems[i].s] || ansItems[i].s;
        if (numVal < 1 || numVal > 50 || ansVal === '0') continue;
        pairs.push({ num: numVal, ans: ansVal, x: ansItems[i].x, y: row.y });
      }
    } else {
      // x 좌표 매칭
      for (const ans of ansItems) {
        const num = numItems.find(n => Math.abs(n.x - ans.x) < 14);
        if (!num) continue;
        const numVal = parseInt(num.s, 10);
        const ansVal = CIRCLED_TO_NUM[ans.s] || ans.s;
        if (numVal < 1 || numVal > 50 || ansVal === '0') continue;
        pairs.push({ num: numVal, ans: ansVal, x: ans.x, y: row.y });
      }
    }
  }
  return pairs;
}

// ── V2: 위치 기반 트리플 + 블록 + 컬럼 선택 ─────────────
function buildAnswersV2(items, exam) {
  const rows = groupByRow(items);

  // 블록 패턴(번호행 + 정답행) 우선 시도 — 사관/경찰대 등에서 정확
  const blocks = blockPairs(rows);
  const blockNums = new Set(blocks.map(b => b.num));

  // 트리플은 block 이 잡지 못한 번호만 보충 (block 결과를 거짓 트리플로 덮지 않도록)
  const tripleAll = [];
  for (const r of rows) for (const t of triplesFromRow(r.items)) tripleAll.push(t);
  const triples = [...blocks];
  for (const t of tripleAll) {
    if (!blockNums.has(t.num)) triples.push(t);
  }
  if (triples.length === 0) return null;

  // subSubject 헤더 x 좌표 (있으면)
  let headerX = null;
  if (exam.subSubject) {
    const h = findHeaderItem(items, exam.subSubject);
    if (h) headerX = h.x;
  }

  const pairs = new Map();
  for (const t of triples) {
    if (!pairs.has(t.num)) {
      pairs.set(t.num, t);
      continue;
    }
    // 이미 있으면 — headerX 와 더 가까운 답으로 교체
    if (headerX != null) {
      const cur = pairs.get(t.num);
      if (Math.abs(t.x - headerX) < Math.abs(cur.x - headerX)) {
        pairs.set(t.num, t);
      }
    }
    // headerX 없으면 첫 매칭 유지 (순수 공통 시험에선 자연스러움)
  }

  if (pairs.size < 5) return null;
  const max = Math.max(...pairs.keys());
  const arr = [];
  let missing = 0;
  for (let i = 1; i <= max; i++) {
    if (pairs.has(i)) arr.push(String(pairs.get(i).ans));
    else { arr.push('?'); missing++; }
  }
  if (missing > Math.max(2, Math.floor(arr.length * 0.3))) return null;
  return arr;
}

// ── V1: 단순 정규식 (fallback) ────────────────────────────
function parseAnswersV1(text) {
  const t = String(text || '');
  const pairs = new Map();
  const re = /(?:^|[^\d])(\d{1,2})\s*(?:번|[.)]|\s+)\s*((?:[①②③④⑤])|(?:\d{1,3}))(?!\d)/g;
  let m;
  while ((m = re.exec(t)) != null) {
    const num = parseInt(m[1], 10);
    if (num < 1 || num > 50) continue;
    if (pairs.has(num)) continue;
    let ans = m[2];
    if (CIRCLED_TO_NUM[ans]) ans = CIRCLED_TO_NUM[ans];
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
  if (missing > Math.max(2, Math.floor(arr.length * 0.3))) return null;
  return arr;
}

// ── I/O ──────────────────────────────────────────────────
async function loadJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); }
  catch { return fallback; }
}
async function saveOut(out) {
  const sorted = {};
  for (const k of Object.keys(out).sort((a, b) => Number(a) - Number(b))) sorted[k] = out[k];
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

  // URL 단위로 묶기 (같은 PDF 여러 시험 공유)
  const byUrl = new Map();
  for (const e of targets) {
    if (!byUrl.has(e.answerUrl)) byUrl.set(e.answerUrl, []);
    byUrl.get(e.answerUrl).push(e);
  }
  const totalWithUrl = exams.filter(e => e.answerUrl).length;
  console.log(
    `전체 ${exams.length}개 · 답지URL ${totalWithUrl}개 · ` +
    `처리대상 ${targets.length}개 (${byUrl.size}개 PDF) · 동시성 ${CONCURRENCY}`
  );
  if (targets.length === 0) { console.log('처리할 항목이 없습니다.'); return; }

  let done = 0, ok = 0, fail = 0;
  const SAVE_EVERY = 25;
  const t0 = Date.now();
  const failures = [];
  const reasonCount = Object.create(null);

  const urlQueue = [...byUrl.keys()];

  function recordFail(exam, reason) {
    fail++;
    reasonCount[reason] = (reasonCount[reason] || 0) + 1;
    failures.push({
      id: exam.id, curriculum: exam.curriculum, gradeYear: exam.gradeYear,
      type: exam.type, subject: exam.subject, sub: exam.subSubject,
      reason, url: exam.answerUrl,
    });
  }

  async function worker() {
    while (urlQueue.length) {
      const url = urlQueue.shift();
      if (!url) break;
      const group = byUrl.get(url);
      const result = await fetchTextItems(url);

      if (result.error) {
        for (const exam of group) { recordFail(exam, result.error); done++; }
      } else {
        const items = result.items;
        // V1 fallback 용 텍스트 미리 만들어 둠
        const flatText = items.map(it => it.s).join(' ');
        for (const exam of group) {
          let arr = buildAnswersV2(items, exam);
          if (!arr) arr = parseAnswersV1(flatText);
          if (arr) { out[String(exam.id)] = arr; ok++; }
          else recordFail(exam, 'parse-fail');
          done++;
        }
      }
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
    console.log('\n실패 사유:');
    const sorted = Object.entries(reasonCount).sort((a, b) => b[1] - a[1]);
    for (const [r, c] of sorted) console.log(`  ${r.padEnd(14)} ${c}건`);
    const reportPath = path.join(ROOT, 'data', 'answers-fails.json');
    await fs.writeFile(reportPath, JSON.stringify(failures, null, 2) + '\n');
    console.log(`\n상세 보고서: data/answers-fails.json (${failures.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
