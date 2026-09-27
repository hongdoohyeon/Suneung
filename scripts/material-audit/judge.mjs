// 2단계: extract.mjs 가 모은 1쪽 텍스트로 자료 오류 후보를 찾는다.
//  · 코드: 깨진 링크, 학년도·월 불일치(숫자는 JEV 가 약해 코드로), 텍스트 없음(스캔본)
//  · JEV: 문서 종류·출제 기관·영역·세부 과목·학년 — 한 문서에 한 번 호출, 확신 높은 불일치만 올린다
// node scripts/material-audit/judge.mjs [--limit N] [--no-jev]
// 출력: tmp/material-audit/judge/{h}.json (JEV 답 캐시), tmp/material-audit/report.json
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'tmp/material-audit');
const CACHE = path.join(DIR, 'judge');
fs.mkdirSync(CACHE, { recursive: true });
const argv = process.argv;
const limit = Number(argv[argv.indexOf('--limit') + 1]) || Infinity;
const useJev = !argv.includes('--no-jev');
const KEY = useJev ? execSync('security find-generic-password -a kicegg -s typesafe-api-key -w').toString().trim() : '';
const urlHash = u => crypto.createHash('sha1').update(u.split('?')[0]).digest('hex').slice(0, 12);

const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8'));
const ROLE = { questionUrl: 'question', questionUrlEven: 'question', answerUrl: 'answer', solutionUrl: 'solution', scriptUrl: 'script' };
const ROLE_KO = { question: '문제지', answer: '정답', solution: '해설', script: '듣기 대본' };
const ORG_OF = { suneung: 'kice', education: 'edu', military: 'military', police: 'police', leet: 'leet', meet: 'meet', essay: 'essay', ged: 'ged' };
const ORG_KO = { kice: '평가원', edu: '교육청', military: '사관학교', police: '경찰대', leet: 'LEET', meet: 'MEET·DEET', essay: '대학 논술', ged: '검정고시', ebs: 'EBS' };
const MAIN_SUBJECTS = ['국어', '수학', '영어', '한국사', '사회탐구', '과학탐구', '직업탐구', '제2외국어', '통합사회', '통합과학'];

// 같은 영역·교육과정의 세부 과목 목록(탐구 과목 바뀜 검사용)
const siblings = new Map();
for (const e of exams) if (e.subSubject) {
  const k = `${e.curriculum}|${e.subject}`;
  (siblings.get(k) || siblings.set(k, new Set()).get(k)).add(e.subSubject);
}

function questions(e, role) {
  const q = {
    kind: { type: 'choice', instructions: '이 PDF 는 어떤 문서인가?', criteria: {
      question: '시험 문제지(문항과 선지가 나열됨)', answer: '정답표(문항 번호별 정답·배점 목록)', solution: '해설지(문항별 풀이·해설 문장)',
      script: '영어 듣기 대본', cover: '표지·안내문만 있음', other: '기타·판별 불가' } },
    org: { type: 'choice', instructions: '이 시험을 출제·시행한 곳은?', criteria: {
      kice: '한국교육과정평가원(대학수학능력시험·평가원 모의평가)', edu: '시·도교육청 전국연합학력평가', military: '육·해·공군사관학교 1차 선발시험',
      police: '경찰대학 1차 시험', leet: '법학적성시험(LEET)', meet: '의·치의학교육입문검사(MEET·DEET)', essay: '대학교 논술고사',
      ged: '초·중·고졸 학력 검정고시', ebs: 'EBS 해설 자료', unknown: '판별 불가' } },
  };
  if (MAIN_SUBJECTS.includes(e.subject)) q.subject = { type: 'choice', instructions: '이 문서의 시험 영역(과목)은?',
    criteria: { ...Object.fromEntries(MAIN_SUBJECTS.map(s => [s, s])), multi: '여러 영역이 함께 들어 있음', unknown: '판별 불가' } };
  const sib = siblings.get(`${e.curriculum}|${e.subject}`);
  if (e.subSubject && sib && sib.size > 1 && sib.size < 60) q.subsub = { type: 'choice', instructions: '이 문서의 세부 과목(선택과목)은?',
    criteria: { ...Object.fromEntries([...sib].map(s => [s, s])), multi: '여러 세부 과목이 함께 들어 있음', unknown: '판별 불가' } };
  if (e.typeGroup === 'education') q.grade = { type: 'choice', instructions: '이 시험의 대상 학년은?',
    criteria: { g1: '고등학교 1학년', g2: '고등학교 2학년', g3: '고등학교 3학년', unknown: '판별 불가' } };
  return q;
}

async function jev(state, qs) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions: qs }) });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (i + 1))); continue; }
    throw new Error(`jev ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error('jev retry exhausted');
}

// ── 대상 목록 ──
const items = [];
for (const e of exams) for (const [k, role] of Object.entries(ROLE)) {
  const u = e[k];
  if (!u || !/^https:/.test(u)) continue;
  if (!/\.pdf(\?|$)/i.test(u)) continue;
  const f = path.join(DIR, 'pages', urlHash(u) + '.json');
  if (!fs.existsSync(f)) continue;
  items.push({ e, k, role, u, rec: JSON.parse(fs.readFileSync(f, 'utf8')) });
}
console.log(`검사 대상 ${items.length}건 (추출된 것만)`);

const issues = [];
const add = (it, code, sev, msg, extra = {}) => issues.push({ id: it.e.id, field: it.k, url: it.u, code, sev, msg, ...extra });
const stats = { broken: 0, noText: 0, judged: 0, tokens: 0 };

// 코드 검사
for (const it of items) {
  const { e, rec } = it;
  if (!rec.ok) { stats.broken++; add(it, 'broken', 'high', `파일이 열리지 않음 (${rec.status || rec.error})`); continue; }
  const text = `${rec.page1} ${rec.page2}`;
  if (text.replace(/[\s\d.①-⑤]/g, '').length < 30) { stats.noText++; it.noText = true; continue; }
  // 학년도: 문서에 적힌 'NNNN학년도' 중 하나라도 맞으면 통과 (교육청은 시행 연도를 학년도로 적기도 함)
  const ys = [...new Set([...text.matchAll(/(19|20)(\d{2})\s*학년도/g)].map(m => +(m[1] + m[2])))];
  const ok = [e.gradeYear, e.examYear, e.gradeYear - 1].filter(Boolean);
  if (ys.length && e.gradeYear && !ys.some(y => ok.includes(y)) && ['suneung', 'education'].includes(e.typeGroup)) {
    add(it, 'year', 'high', `문서의 학년도 ${ys.join('·')} ≠ 등록 ${e.gradeYear}학년도`);
  }
  // 교육청 월: '○월' + 학력평가 문구가 있을 때만
  const mm = text.match(/(\d{1,2})\s*월\s*(고\s*[123]\s*)?(전국\s*연합|학력\s*평가)/);
  if (e.typeGroup === 'education' && mm && e.month && +mm[1] !== e.month) add(it, 'month', 'high', `문서의 ${mm[1]}월 ≠ 등록 ${e.month}월`);
}

// JEV 검사
const todo = items.filter(it => it.rec.ok && !it.noText).slice(0, limit);
let n = 0;
const t0 = Date.now();
async function judgeOne(it) {
  const { e, rec, role } = it;
  const qs = questions(e, role);
  const key = crypto.createHash('sha1').update(it.u.split('?')[0] + JSON.stringify(Object.keys(qs)) + (qs.subsub ? Object.keys(qs.subsub.criteria).join() : '')).digest('hex').slice(0, 16);
  const cf = path.join(CACHE, key + '.json');
  let ans;
  if (fs.existsSync(cf)) ans = JSON.parse(fs.readFileSync(cf, 'utf8'));
  else {
    if (!useJev) return;
    const state = { first_page: rec.page1.slice(0, 1500), second_page: rec.page2.slice(0, 500), page_count: rec.numPages };
    const res = await jev(state, qs);
    ans = res.answers; stats.tokens += res.usage?.input_tokens || 0;
    fs.writeFileSync(cf, JSON.stringify(ans));
  }
  stats.judged++;
  const c = (k, min = 0.85) => (ans[k] && ans[k].confidence >= min ? ans[k].choice : null);
  const kind = c('kind');
  const kindOk = { question: ['question'], answer: ['answer', 'solution'], solution: ['solution', 'answer'], script: ['script'] }[role];
  // 해설 자리의 '문제지' 판정은 해설 표시어가 전혀 없을 때만 (옛 해설지는 문항을 다시 싣고 풀어서 헷갈림)
  const explains = /해설|풀이|정답|출제\s*의도|평가\s*요소/.test(`${rec.page1} ${rec.page2}`);
  if (kind && !['other', 'cover'].includes(kind) && !kindOk.includes(kind) && !(role === 'solution' && kind === 'question' && explains)) {
    add(it, 'kind', 'high', `${ROLE_KO[role]} 자리에 ${ROLE_KO[kind] || kind} 문서`, { conf: ans.kind.confidence });
  }
  const org = c('org');
  const orgOk = [ORG_OF[e.typeGroup], ...(role === 'solution' ? ['ebs'] : []), ...(e.typeGroup === 'meet' ? ['meet'] : [])];
  if (org && org !== 'unknown' && ORG_OF[e.typeGroup] && !orgOk.includes(org)) {
    add(it, 'org', 'high', `출제 기관이 ${ORG_KO[org]}로 보임 (등록: ${ORG_KO[ORG_OF[e.typeGroup]]})`, { conf: ans.org.confidence });
  }
  const subj = c('subject');
  // 평가원은 통합과학·통합사회를 '과학탐구·사회탐구 영역'으로 표기 → 같은 것으로 본다
  // 사이트 관례로 같은 영역: 통합과학·통합사회 = 과학·사회탐구(고1 학평·예비시험), 옛 한국사 = 사회탐구 영역 안
  const SAME = [['통합과학', '과학탐구'], ['통합사회', '사회탐구'], ['한국사', '사회탐구']];
  const same = (a, b) => a === b || SAME.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  if (subj && !['multi', 'unknown'].includes(subj) && !same(subj, e.subject)) {
    add(it, 'subject', 'high', `영역이 ${subj}로 보임 (등록: ${e.subject})`, { conf: ans.subject.confidence });
  }
  const ss = c('subsub', 0.9);
  const norm = x => String(x).replace(/[\s·①-⑩]/g, '');
  if (ss && !['multi', 'unknown'].includes(ss) && norm(ss) !== norm(e.subSubject)) {
    add(it, 'subsub', 'mid', `세부 과목이 ${ss}로 보임 (등록: ${e.subSubject})`, { conf: ans.subsub.confidence });
  }
  const gr = c('grade');
  if (gr && gr !== 'unknown' && e.studentGrade && gr !== `g${e.studentGrade}`) {
    add(it, 'grade', 'mid', `대상 학년이 고${gr[1]}로 보임 (등록: 고${e.studentGrade})`, { conf: ans.grade.confidence });
  }
}
const pool = Array.from({ length: 8 }, async () => {
  while (todo.length) {
    const it = todo.shift();
    try { await judgeOne(it); } catch (err) { console.log('jev 오류', it.e.id, String(err.message).slice(0, 120)); }
    if (++n % 200 === 0) console.log(`${n}건 판정 · ${((Date.now() - t0) / 60000).toFixed(1)}분 · 토큰 ${stats.tokens.toLocaleString()}`);
  }
});
await Promise.all(pool);

// 같은 파일이 여러 시험에 걸려 있으면(통합 시험지 등) 한 줄로 합친다
const byKey = new Map();
for (const i of issues) {
  const k = `${i.url.split('?')[0]}|${i.code}|${i.msg}`;
  const g = byKey.get(k) || byKey.set(k, { ...i, ids: [] }).get(k);
  g.ids.push(i.id);
}
const out = { generatedAt: new Date().toISOString(), stats: { ...stats, items: items.length, costUSD: +(stats.tokens * 0.042 / 1e6).toFixed(3) }, issues: [...byKey.values()] };
fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(out, null, 1));
const cnt = {};
for (const i of out.issues) cnt[i.code] = (cnt[i.code] || 0) + 1;
console.log('통계', out.stats, '\n오류 후보', cnt);
