import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { state, resetFilters, filtered } from '../state.js';

const base = 'https://kicegg.com/';
const digest = data => createHash('sha256').update(data).digest('hex');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const version = appSource.match(/const DATA_VERSION = '([^']+)'/)[1];
async function get(path, options = {}) {
  const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}

// HTML까지 비교하여 이전 배포가 남아 있는 상태를 성공으로 처리하지 않는다.
for (const path of ['index.html', 'archive.html', 'app.js', 'state.js', 'config.js']) {
  const local = readFileSync(new URL('../' + path, import.meta.url));
  const response = await get(path.endsWith('.html') ? path : `${path}?v=${version}`);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(local), `${path}: 배포 내용 불일치`);
}
const localIndex = readFileSync(new URL('../data/archive/all.json', import.meta.url));
const response = await get(`data/archive/all.json?v=${version}`);
const body = Buffer.from(await response.arrayBuffer());
assert.equal(digest(body), digest(localIndex), '전체 검색 색인 불일치');
resetFilters();
state.tab = 'all';
state.exams = JSON.parse(body);
state.query = '27 9월 국어';
assert.deepEqual(filtered().map(e => e.id).sort(), [12733, 12734]);
state.query = '연세대 논술';
assert.ok(filtered().length > 0, '논술 검색 실패');

const exam = JSON.parse(readFileSync(new URL('../data/exam/12733.json', import.meta.url)));
for (const key of ['questionUrl', 'answerUrl', 'solutionUrl']) {
  const pdf = await get(exam[key], { headers: { Range: 'bytes=0-31' } });
  const reader = pdf.body.getReader();
  let signature = '';
  try {
    while (signature.length < 5) {
      const { value, done } = await reader.read();
      if (done) break;
      signature += Buffer.from(value).toString('latin1');
    }
  } finally {
    await reader.cancel();
  }
  assert.ok(signature.startsWith('%PDF-'), `${key}: PDF 응답 아님`);
}
console.log('배포 파일·전체 검색·문제/정답/해설 PDF 검증 통과');
