// 1단계: 모든 자료 PDF 를 받아 1쪽 텍스트·쪽수를 캐시하고, 문제지는 미리보기 이미지를 만든다.
// node scripts/material-audit/extract.mjs [--limit N]   (이어받기: 이미 캐시된 URL 은 건너뜀)
// 출력: tmp/material-audit/pages/{h}.json, previews/{h}.jpg   (h = sha1(url 경로)의 앞 12자)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
// pdf.js 가 범위 요청 실패를 내부에서 놓치는 경우가 있어 프로세스 전체가 죽지 않게 막는다(해당 파일은 시간 초과로 실패 기록)
process.on('unhandledRejection', () => {});
const OUT = path.join(ROOT, 'tmp/material-audit/pages');
const PREV = path.join(ROOT, 'previews');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PREV, { recursive: true });
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity;

// ?name= 등 쿼리는 파일 정체와 무관 → 경로로 식별
export const urlHash = u => crypto.createHash('sha1').update(u.split('?')[0]).digest('hex').slice(0, 12);

const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8'));
const jobs = new Map();   // url → { roles:Set, preview:boolean }
for (const e of exams) for (const k of ['questionUrl', 'answerUrl', 'solutionUrl', 'scriptUrl', 'questionUrlEven']) {
  const u = e[k];
  if (!u || !/^https:/.test(u) || !/\.pdf(\?|$)/i.test(u)) continue;
  const j = jobs.get(u) || { roles: new Set(), preview: false };
  j.roles.add(k); if (k === 'questionUrl') j.preview = true;
  jobs.set(u, j);
}
// --shard i/n : 여러 프로세스로 나눠 돌리기 (PDF 해석·그리기가 CPU 한 코어를 다 씀)
const sh = process.argv.includes('--shard') ? process.argv[process.argv.indexOf('--shard') + 1].split('/').map(Number) : [0, 1];
const todo = [...jobs].filter(([u]) => parseInt(urlHash(u).slice(0, 6), 16) % sh[1] === sh[0]).filter(([u, j]) => !fs.existsSync(path.join(OUT, urlHash(u) + '.json'))
  || (j.preview && !fs.existsSync(path.join(PREV, urlHash(u) + '.jpg')))).slice(0, limit);
console.log(`PDF ${jobs.size}개 중 남은 것 ${todo.length}개`);

async function one(url, job) {
  const h = urlHash(url);
  const rec = { url, roles: [...job.roles], ok: false };
  let doc;
  try {
    // 통째로 한 번에 받는다 — 범위 요청은 파일당 왕복이 수십 번이라 오히려 느림
    const res = await fetch(url, { signal: AbortSignal.timeout(240000) });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    const data = new Uint8Array(await res.arrayBuffer());
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
    rec.numPages = doc.numPages;
    const texts = [];
    for (let n = 1; n <= Math.min(2, doc.numPages); n++) {           // 정답표는 1쪽이 표지일 때가 있어 2쪽까지
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      texts.push(tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
      if (n === 1 && job.preview) {
        const vp = page.getViewport({ scale: 1 });
        const scale = 320 / vp.width;
        const { canvas, context } = doc.canvasFactory.create(Math.round(vp.width * scale), Math.round(vp.height * scale));
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: page.getViewport({ scale }) }).promise;
        // 흐리게 보여 줄 것이라 아주 작게(120px) — 글씨는 읽을 수 없는 크기
        await sharp(canvas.toBuffer('image/png')).resize({ width: 120 }).jpeg({ quality: 50, mozjpeg: true }).toFile(path.join(PREV, h + '.jpg'));
      }
    }
    rec.page1 = texts[0].slice(0, 2500);
    rec.page2 = (texts[1] || '').slice(0, 1200);
    rec.ok = true;
  } catch (err) {
    rec.error = String(err?.message || err).slice(0, 200);
    rec.status = err?.status;
  } finally { try { await doc?.destroy(); } catch {} }
  fs.writeFileSync(path.join(OUT, h + '.json'), JSON.stringify(rec));
  return rec;
}

// 호스트별 동시 요청 수 — 우리 워커는 넉넉히, EBSi 는 예의상 적게
const LIMIT = { 'suneung-files.hdh061224.workers.dev': 3, 'wdown.ebsi.co.kr': 1 };   // 프로세스(샤드)당
const queues = new Map();
for (const job of todo) { const host = new URL(job[0]).host; (queues.get(host) || queues.set(host, []).get(host)).push(job); }
let done = 0, fail = 0;
const t0 = Date.now();
await Promise.all([...queues].flatMap(([host, q]) => Array.from({ length: LIMIT[host] || 2 }, async () => {
  while (q.length) {
    const [u, j] = q.shift();
    const r = await Promise.race([one(u, j), new Promise(res => setTimeout(() => res({ ok: false, error: "timeout" }), 300000))]);
    done++; if (!r.ok) fail++;
    if (done % 100 === 0) console.log(`${done}/${todo.length} (실패 ${fail}) ${((Date.now() - t0) / 60000).toFixed(1)}분`);
  }
})));
console.log(`끝: ${done}개, 실패 ${fail}개, ${((Date.now() - t0) / 60000).toFixed(1)}분`);
