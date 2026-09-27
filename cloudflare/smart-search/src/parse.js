// 검색어 → 필터. 규칙(코드)으로 먼저 풀고, 규칙이 못 잡는 뜻만 JEV 에 묻는다.
// JEV 는 숫자·날짜에 약하므로 연도는 전부 여기서 코드로 처리한다.

export const NOW_GRADE_YEAR = () => {
  const d = new Date(Date.now() + 9 * 3600e3);            // KST
  return d.getUTCFullYear() + 1;                           // 올해 치르는 수능의 학년도
};

const CURR = {
  c2015: { from: 2022, to: 2028 }, c2009: { from: 2014, to: 2021 },
  c2007: { from: 2012, to: 2013 }, c7: { from: 2005, to: 2011 },
};

// 2자리 연도 → 4자리 (00~40 → 20xx, 그 외 19xx)
const y4 = n => (n < 100 ? (n <= 40 ? 2000 + n : 1900 + n) : n);

// 확실한 단어는 규칙으로 — [정규식, 적용] 순서대로. 잡힌 부분은 검색어에서 지운다.
const TAB_RULES = [
  [/고\s*1|(?<!\d)1\s*학년(?!도)/, 'freshman'], [/고\s*2|(?<!\d)2\s*학년(?!도)/, 'junior'], [/고\s*3|(?<!\d)3\s*학년(?!도)/, 'senior'],
  [/경찰대|사관(학교)?/, 'mp'], [/leet|meet|리트|미트/i, 'gradschool'], [/논술/, 'essay'],
  [/초졸|초등(학교)?\s*(졸업\s*)?(학력\s*)?검정/, 'gedelem'], [/중졸|중학교\s*(졸업\s*)?(학력\s*)?검정/, 'gedmid'],
  [/고졸|검정\s*고시|검고/, 'gedhigh'],
];
const EXAM_RULES = [
  [/6\s*모|6\s*평|6월\s*(모의\s*)?평가/, ['june']], [/9\s*모|9\s*평|9월\s*(모의\s*)?평가/, ['sept']],
  [/모평|모의\s*평가/, ['june', 'sept']], [/수능/, ['csat']], [/학평|학력\s*평가|교육청/, 'education'],
];
const SUBJECT_RULES = [
  [/국어|화작|언매|화법|언어와\s*매체/, '국어'], [/수학|미적|확통|기하|수\s*[12Ⅰ]/, '수학'], [/영어/, '영어'], [/한국사/, '한국사'],
  [/사탐|사회\s*탐구|생윤|윤사|사문|사회\s*문화|한지|세지|동사|세사|정법|정치와\s*법|경제|생활과\s*윤리|윤리와\s*사상/, '사회탐구'],
  [/과탐|과학\s*탐구|물리|화학|생명|생물|지구\s*과학|지과|물[12Ⅰ]|화[12Ⅰ]|생[12Ⅰ]|지[12Ⅰ]/, '과학탐구'],
  [/제2외국어|제\s*2\s*외|한문|일본어|중국어|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어/, '제2외국어'],
  [/직탐|직업\s*탐구/, '직업탐구'],
];
// 과목 안의 세부 이름(물리·미적분 등)은 검색어로 남겨 목록 검색이 좁히게 한다
const KEEP = /인문|자연|화작|언매|화법과\s*작문|언어와\s*매체|미적분?|확통|확률과\s*통계|기하|생윤|윤사|사문|한지|세지|동사|세사|정법|경제|물리(학)?\s*[12Ⅰ]?|화학\s*[12Ⅰ]?|생명(과학)?\s*[12Ⅰ]?|지구\s*과학\s*[12Ⅰ]?|일본어|중국어|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어|한문/g;
const HARD = /불\s*수능|킬러|고난도|어려(운|웠던|웠|움)|어렵게|최상위|변별력/;
const EASY = /물\s*수능|쉬(운|웠던|웠)|쉽게|평이/;
// 뜻 없는 말(조사·흔한 명사) — 남은 말이 이것뿐이면 JEV 를 부르지 않는다
const FILLER = /(검정\s*고시|검고|이후|이전|부터|까지|이상|이하|최근|기출(문제)?|문제지?|시험지?|시험|자료|찾아\s*줘|보여\s*줘|중에|중|에서|이랑|랑|하고|그리고|및|과목|많았던|나온|있는|했던|위주|만|전부|모두|좀|거|것|[,.·/&+]|\s(과|와|의|를|을|은|는|이|가)\s)/g;

export function ruleParse(q) {
  const out = { text: [] };
  let s = ' ' + q.replace(/\s+/g, ' ').trim() + ' ';
  const now = NOW_GRADE_YEAR();
  const take = re => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };

  for (const w of s.match(KEEP) || []) out.text.push(w.replace(/\s+/g, ''));
  if (/불\s*수능|물\s*수능/.test(s)) { out.typeGroup = 'suneung'; out.type = ['csat']; }
  if (take(HARD)) out.tier = ['4', '5'];
  else if (take(EASY)) out.tier = ['1', '2'];
  for (const [re, v] of TAB_RULES) if (take(re)) { out.tab = v; break; }
  for (const [re, v] of EXAM_RULES) if (re.test(s)) {
    s = s.replace(re, ' ');
    if (v === 'education') out.typeGroup = 'education';
    else { out.typeGroup = 'suneung'; out.type = [...new Set([...(out.type || []), ...v])]; }
  }
  // 학교 이름(연세대·고려대학교 …)은 검색어로 — 논술 목록에서 좁혀진다
  for (const w of s.match(/[가-힣]{1,8}(대학교|대학|대)(?=\s)/g) || []) { out.text.push(w); s = s.replace(w, ' '); }
  const subs = [];
  for (const [re, v] of SUBJECT_RULES) {
    const g = new RegExp(re.source, re.flags + 'g');
    if (g.test(s)) { subs.push(v); s = s.replace(g, ' '); }
  }
  if (subs.length) out.subjects = subs;

  // 교육과정: "15개정", "2015 개정", "09개정", "7차" (+ 이후)
  const after = /(이후|부터|이상|뒤)/;
  let m = take(/(20)?(15|09|07)\s*개정(\s*교육\s*과정)?\s*(이후|부터|이상)?/);
  if (m) { out.curriculum = { 15: 'c2015', '09': 'c2009', '07': 'c2007' }[m[2]]; out.currAfter = !!m[4]; }
  else if ((m = take(/7\s*차(\s*교육\s*과정)?\s*(이후|부터)?/))) { out.curriculum = 'c7'; out.currAfter = !!m[2]; }

  // 연도 — 전부 학년도로 (사이트 필터 기준). "2025년" 은 시행 연도라 +1
  if ((m = take(/(올해|금년|작년|지난\s*해|재작년)/))) {
    const gy = now - ({ 올해: 0, 금년: 0, 작년: 1, 재작년: 2 }[m[1]] ?? 1);
    out.years = { from: gy, to: gy };
  } else if ((m = take(/최근\s*(\d{1,2})\s*(년|개년|회)/))) out.years = { from: now - Number(m[1]) + 1, to: now };
  else if ((m = take(/(\d{2,4})\s*(학년도|년)?\s*[~\-–]\s*(\d{2,4})\s*(학년도|년)?/))) {
    const k = m[2] === '년' || m[4] === '년' ? 1 : 0;
    out.years = { from: y4(+m[1]) + k, to: y4(+m[3]) + k };
  } else if ((m = take(/(\d{2,4})\s*(학년도|년)?\s*(이후|부터|이상|이전|까지|이하)?/)) && (m[2] || m[3] || m[1].length === 4 || /^\d{2}$/.test(m[1]))) {
    const gy = y4(+m[1]) + (m[2] === '년' ? 1 : 0);
    if (!m[3]) out.years = { from: gy, to: gy };
    else if (after.test(m[3])) out.years = { from: gy, to: now };
    else out.years = { from: 1994, to: gy };
  }

  // 남은 말: 뜻 없는 말을 빼고도 남으면 규칙이 모르는 표현 → JEV 에 묻는다
  const rest = s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  out.rest = rest;
  if (rest) for (const w of rest.split(' ')) if (w.length >= 2 && !out.text.includes(w)) out.unknown = [...(out.unknown || []), w];
  return out;
}

// JEV 질문 — 한 번 호출에 몰아서 묻는다(따로 묻는 것보다 훨씬 싸고 빠름)
export const JEV_QUESTIONS = {
  tab: {
    type: 'choice', instructions: '검색어가 찾는 시험 대상은?',
    criteria: {
      senior: '수능·평가원 모의평가·고3 학력평가', junior: '고2 학력평가', freshman: '고1 학력평가',
      mp: '사관학교·경찰대 1차 시험', gradschool: 'LEET·MEET', essay: '대학별 논술', ged: '검정고시', none: '언급 없음',
    },
  },
  exam: {
    type: 'choice', instructions: '검색어가 찾는 시험 종류는?',
    criteria: {
      csat: '수능 본시험만', june: '6월 모의평가(6모·6평)', sept: '9월 모의평가(9모·9평)', mock: '6모와 9모 둘 다(모평)',
      kice: '평가원 시험 전체(수능·6모·9모)', education: '교육청 학력평가(학평·모의고사)', none: '언급 없음',
    },
  },
  difficulty: {
    type: 'choice', instructions: '검색어가 원하는 난이도는?',
    criteria: { hard: '어려운 시험(고난도·불수능·킬러·어렵게 나온)', easy: '쉬운 시험(물수능·쉽게 나온)', none: '난이도 언급 없음' },
  },
  curriculum: {
    type: 'choice', instructions: '검색어가 가리키는 교육과정은?',
    criteria: { c2015: '2015 개정(통합수능·선택과목 체제)', c2009: '2009 개정', c2007: '2007 개정', c7: '7차 교육과정', none: '언급 없음' },
  },
  ...Object.fromEntries([
    ['s_kor', '국어'], ['s_math', '수학'], ['s_eng', '영어'], ['s_hist', '한국사'],
    ['s_soc', '사회탐구(생활과윤리·사회문화·한국지리 등)'], ['s_sci', '과학탐구(물리·화학·생명과학·지구과학)'],
    ['s_lang', '제2외국어·한문'], ['s_voc', '직업탐구'],
  ].map(([k, v]) => [k, { type: 'noul', instructions: `검색어가 ${v} 과목을 찾고 있나?` }])),
};

const SUBJECT_KEYS = { s_kor: '국어', s_math: '수학', s_eng: '영어', s_hist: '한국사', s_soc: '사회탐구', s_sci: '과학탐구', s_lang: '제2외국어', s_voc: '직업탐구' };

// JEV 답 + 규칙 결과 → 사이트 필터. 확신이 낮은 답은 버린다.
export function toFilters(rule, ans) {
  const f = {};
  const pick = (k, min = 0.7) => (ans?.[k] && ans[k].choice !== 'none' && ans[k].confidence >= min ? ans[k].choice : null);
  // 대상(탭)
  const tab = rule.tab || pick('tab');
  if (tab) f.tab = tab === 'ged' ? 'gedhigh' : tab;
  // 시험 종류
  if (rule.typeGroup) { f.typeGroup = rule.typeGroup; if (rule.type) f.type = rule.type; }
  else {
    const exam = pick('exam', 0.8);
    if (exam === 'education') f.typeGroup = 'education';
    else if (exam) { f.typeGroup = 'suneung'; const t = { csat: ['csat'], june: ['june'], sept: ['sept'], mock: ['june', 'sept'] }[exam]; if (t) f.type = t; }
  }
  if (f.typeGroup && !f.tab) f.tab = 'senior';
  // 난이도
  if (rule.tier) f.tier = rule.tier;
  else { const d = pick('difficulty'); if (d) f.tier = d === 'hard' ? ['4', '5'] : ['1', '2']; }
  // 과목
  if (rule.subjects) f.subjects = rule.subjects;
  else {
    const subjects = Object.entries(SUBJECT_KEYS).filter(([k]) => (ans?.[k]?.noul ?? 0) >= 0.8).map(([, v]) => v);
    if (subjects.length) f.subjects = subjects;
  }
  // 교육과정·연도
  const curr = rule.curriculum || pick('curriculum', 0.8);
  let years = rule.years;
  if (curr && CURR[curr]) {
    const r = CURR[curr];
    years = rule.currAfter ? { from: r.from, to: NOW_GRADE_YEAR() } : years || { from: r.from, to: r.to };
  }
  if (years) f.years = years;
  // 필터로 못 바꾼 말(물리·미적분·학교 이름 등)은 목록 검색어로
  // 학교 이름(○○대)은 JEV 가 답해도 검색어로 남긴다
  const text = [...rule.text, ...(rule.unknown || []).filter(w => !ans || /(대|대학|대학교)$/.test(w))];
  if (text.length) f.text = text.join(' ');
  return f;
}
