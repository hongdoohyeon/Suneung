// HWP 답지 추출 — pyhwp 의 hwp5html 로 HTML 변환 후 표 셀 파싱
// LEET 2009~2021 / MEET 2005~2008 등 .hwp 파일 처리
//
// 사전 요구: pip3 install --user pyhwp (hwp5html 명령 제공)
//
// 사용:
//   node scripts/extract-answers-hwp.mjs                # 미추출 hwp 전부
//   node scripts/extract-answers-hwp.mjs --ids 875,...
//   node scripts/extract-answers-hwp.mjs --force

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMS_PATH = path.join(ROOT, 'data', 'exams.json');
const OUT_PATH   = path.join(ROOT, 'data', 'answers.json');

const HWP5HTML = path.join(os.homedir(), 'Library/Python/3.9/bin/hwp5html');

// CLI
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i+1] ? args[i+1] : d; };
const has = k => args.includes(k);
const FORCE = has('--force');
const ID_FILTER = (argVal('--ids', '') || '').split(',').map(s => s.trim()).filter(Boolean);

const CIRCLED_TO_NUM = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };

// HWP → HTML (hwp5html)
async function hwpToHtml(hwpPath) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwp-'));
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(HWP5HTML, [hwpPath], { cwd: tmpDir, stdio: 'pipe' });
      let err = '';
      p.stderr.on('data', d => err += d);
      p.on('close', code => code === 0 ? resolve() : reject(new Error('hwp5html: ' + err)));
      p.on('error', reject);
    });
    const subdirs = await fs.readdir(tmpDir);
    if (subdirs.length === 0) throw new Error('no output');
    const htmlPath = path.join(tmpDir, subdirs[0], 'index.xhtml');
    const html = await fs.readFile(htmlPath, 'utf8');
    return html;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// HTML 표 셀에서 (번호, 답) 페어 추출
function parseAnswersFromHtml(html) {
  // 모든 <td>...</td> 의 내부 텍스트만 뽑기
  const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
  const cells = [];
  let m;
  while ((m = cellRe.exec(html)) != null) {
    const text = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&#13;|&nbsp;/g, '')
      .replace(/\s+/g, '')
      .trim();
    cells.push(text);
  }
  if (cells.length < 6) return null;

  // 인접 셀에서 (숫자, 답) 페어 매칭
  // 답지 표는 보통 [번호][답][번호][답]... 형태로 셀이 나열
  const pairs = new Map();
  for (let i = 0; i + 1 < cells.length; i++) {
    const a = cells[i], b = cells[i + 1];
    if (!/^\d{1,2}$/.test(a)) continue;
    const num = parseInt(a, 10);
    if (num < 1 || num > 50) continue;
    let ans;
    if (CIRCLED_TO_NUM[b]) ans = CIRCLED_TO_NUM[b];
    else if (/^\d{1,4}$/.test(b) && b !== '0') ans = b;
    else continue;
    if (!pairs.has(num)) pairs.set(num, ans);
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

async function loadJson(p, fb) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); }
  catch { return fb; }
}
async function saveOut(out) {
  const sorted = {};
  for (const k of Object.keys(out).sort((a, b) => Number(a) - Number(b))) sorted[k] = out[k];
  await fs.writeFile(OUT_PATH, JSON.stringify(sorted) + '\n');
}

async function main() {
  const exams = await loadJson(EXAMS_PATH, []);
  const out   = await loadJson(OUT_PATH, {});

  let targets = exams.filter(e =>
    e.answerUrl && e.answerUrl.endsWith('.hwp') && !/^https?:\/\//i.test(e.answerUrl)
  );
  if (ID_FILTER.length > 0) {
    const set = new Set(ID_FILTER.map(Number));
    targets = targets.filter(e => set.has(e.id));
  }
  if (!FORCE) targets = targets.filter(e => !out[String(e.id)]);

  console.log(`HWP 답지 처리 대상: ${targets.length}개`);
  if (targets.length === 0) { console.log('처리할 항목 없음.'); return; }

  let ok = 0, fail = 0;
  const failures = [];
  for (const exam of targets) {
    const hwpPath = path.resolve(ROOT, exam.answerUrl);
    try {
      const html = await hwpToHtml(hwpPath);
      const arr = parseAnswersFromHtml(html);
      if (arr) {
        out[String(exam.id)] = arr;
        ok++;
        process.stdout.write(`\r✓ ${ok+fail}/${targets.length}  성공: ${ok}  실패: ${fail}   `);
      } else {
        fail++;
        failures.push({ id: exam.id, sub: exam.subSubject, reason: 'parse-fail', path: exam.answerUrl });
      }
    } catch (e) {
      fail++;
      failures.push({ id: exam.id, sub: exam.subSubject, reason: 'hwp-error', detail: e.message, path: exam.answerUrl });
    }
  }
  await saveOut(out);
  console.log(`\n완료. ${ok} 성공 · ${fail} 실패`);
  if (failures.length > 0) {
    console.log('\n실패 샘플:');
    for (const f of failures.slice(0, 5)) console.log('  ', f);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
