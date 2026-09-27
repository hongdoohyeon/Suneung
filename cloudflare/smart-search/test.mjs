// node cloudflare/smart-search/test.mjs  — 키체인의 키로 실제 JEV 에 몇 개 물어본다(로컬 확인용)
import { execSync } from 'node:child_process';
import { ruleParse, toFilters, JEV_QUESTIONS } from './src/parse.js';
const key = execSync('security find-generic-password -a kicegg -s typesafe-api-key -w').toString().trim();
const qs = process.argv.slice(2).length ? process.argv.slice(2) : [
  '15개정 이후 고난도 수학이랑 국어', '불수능 국어', '최근 3년 9모 영어', '물리 쉬운 시험', '22~25학년도 6모 수학',
  '고2 학평 영어', '경찰대 수학', '연세대 논술', '2020년 이후 사탐', '킬러 많았던 수학 시험', '문제 길고 지문 빡센 국어', '역대급으로 어려웠던 영어', '작년 수능 과탐', '미적분 23학년도',
];
let tokens = 0;
let calls = 0;
for (const q of qs) {
  const rule = ruleParse(q);
  if (!rule.unknown) { console.log(`${q}  (규칙만)\n   →`, JSON.stringify(toFilters(rule, null))); continue; }
  calls++;
  const t = Date.now();
  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state: q, questions: JEV_QUESTIONS }) });
  const j = await r.json();
  tokens += j.usage?.input_tokens || 0;
  console.log(`${q}  (${Date.now() - t}ms, ${j.usage?.input_tokens}tok)\n   →`, JSON.stringify(toFilters(ruleParse(q), j.answers)));
}
console.log(`JEV 호출 ${calls}/${qs.length}회 · 평균 입력 ${Math.round(tokens / Math.max(1, calls))}토큰`);
