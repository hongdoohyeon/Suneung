// HWP → PDF 일괄 변환
// 흐름: HWP --(hwp5odt)--> ODT --(soffice headless)--> PDF
//
// 사전 요구:
//   pip3 install --user pyhwp
//   brew install --cask libreoffice
//
// 사용:
//   node scripts/hwp-to-pdf.mjs                # 모든 .hwp 변환 (이미 .pdf 있으면 skip)
//   node scripts/hwp-to-pdf.mjs --force        # 이미 있어도 재변환
//   node scripts/hwp-to-pdf.mjs --files a.hwp,b.hwp
//   node scripts/hwp-to-pdf.mjs --dry-run      # 대상 파일만 출력

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HWP5ODT  = path.join(os.homedir(), 'Library/Python/3.9/bin/hwp5odt');
const HWP5HTML = path.join(os.homedir(), 'Library/Python/3.9/bin/hwp5html');
const SOFFICE  = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i+1] ? args[i+1] : d; };
const has = k => args.includes(k);
const FORCE   = has('--force');
const DRY     = has('--dry-run');
const FILES   = (argVal('--files', '') || '').split(',').map(s => s.trim()).filter(Boolean);

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

async function findHwpFiles() {
  const result = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.hwp')) result.push(p);
    }
  }
  await walk(path.join(ROOT, 'pdfs_leet'));
  await walk(path.join(ROOT, 'pdfs_meet'));
  await walk(path.join(ROOT, 'pdfs_police'));
  return result;
}

async function convertOne(hwpPath) {
  const dir = path.dirname(hwpPath);
  const base = path.basename(hwpPath, '.hwp');
  const pdfPath = path.join(dir, base + '.pdf');

  // 이미 .pdf 있고 force 아니면 skip
  if (!FORCE) {
    try { await fs.stat(pdfPath); return { ok: true, skipped: true, pdfPath }; }
    catch {}
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwp2pdf-'));
  try {
    // 1차: hwp5odt → ODT → PDF
    try {
      const odtPath = path.join(tmpDir, base + '.odt');
      await exec(HWP5ODT, [hwpPath, '--output', odtPath]);
      await exec(SOFFICE, [
        '--headless', '--norestore', '--nologo',
        '--convert-to', 'pdf', '--outdir', dir, odtPath,
      ]);
      return { ok: true, pdfPath, via: 'odt' };
    } catch (odtErr) {
      // 2차 fallback: hwp5html → HTML → PDF
      try {
        const htmlDir = path.join(tmpDir, 'html');
        await exec(HWP5HTML, ['--output', htmlDir, hwpPath]);
        // soffice 의 HTML → PDF 결과 파일명은 입력 baseName 따라감 (index.pdf)
        await exec(SOFFICE, [
          '--headless', '--norestore', '--nologo',
          '--convert-to', 'pdf', '--outdir', tmpDir,
          path.join(htmlDir, 'index.xhtml'),
        ]);
        // tmpDir/index.pdf 를 원하는 위치로 이동
        const generated = path.join(tmpDir, 'index.pdf');
        await fs.rename(generated, pdfPath);
        return { ok: true, pdfPath, via: 'html' };
      } catch (htmlErr) {
        return { ok: false, error: `odt: ${odtErr.message.slice(0, 100)} | html: ${htmlErr.message.slice(0, 100)}` };
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  let targets;
  if (FILES.length > 0) {
    targets = FILES.map(f => path.resolve(ROOT, f));
  } else {
    targets = await findHwpFiles();
  }
  if (DRY) {
    console.log('대상:', targets.length, '개');
    for (const f of targets.slice(0, 10)) console.log('  ', path.relative(ROOT, f));
    if (targets.length > 10) console.log('  ...');
    return;
  }

  console.log(`HWP → PDF 변환 대상: ${targets.length}개`);
  let ok = 0, skip = 0, fail = 0;
  const failures = [];
  let i = 0;
  for (const hwp of targets) {
    i++;
    const r = await convertOne(hwp);
    if (r.ok) {
      if (r.skipped) skip++; else ok++;
    } else {
      fail++;
      failures.push({ file: path.relative(ROOT, hwp), error: r.error });
    }
    process.stdout.write(`\r${i}/${targets.length}  변환:${ok}  스킵:${skip}  실패:${fail}   `);
  }
  console.log(`\n완료. 변환 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (failures.length > 0) {
    console.log('\n실패 샘플:');
    for (const f of failures.slice(0, 5)) console.log(' ', f.file, '→', f.error);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
