'use strict';
// 아이폰 사파리 다운로드 방식 시험 페이지(dltest.html) — 확인되면 지운다
import { saveViaWorker, saveBlob } from './download.js';

const SRC = '/files/kice-v4/2023_10_g3_english_q.pdf';
const log = document.getElementById('log');
const say = t => { log.textContent += t + '\n'; };
let blob = null;
fetch(SRC, { credentials: 'omit' }).then(r => r.blob()).then(b => { blob = b; say(`준비됨 (${(b.size / 1e6).toFixed(1)}MB)`); }, e => say('파일 못 받음: ' + e));

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-t]')?.dataset.t;
  if (!t) return;
  if (!blob) { say('아직 준비 중'); return; }
  const name = `시험${t}.pdf`;
  if (t === 'A') say('A → ' + await saveViaWorker(blob, name, { type: 'application/octet-stream', nosniff: true }));
  if (t === 'B') say('B → ' + await saveViaWorker(blob, name, { type: 'application/x-download', nosniff: true }));
  if (t === 'C') { say('C → 서버 dl=1'); location.assign(`${SRC}?name=${encodeURIComponent(name)}&dl=1`); }
  if (t === 'D') { say('D → blob'); saveBlob(blob, name); }
});
