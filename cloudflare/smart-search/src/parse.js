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
  [/경찰(대학?(교)?)?|사관(학교)?/, 'mp'], [/leet|meet|리트|미트/i, 'gradschool'], [/논술/, 'essay'],
  [/초졸|초등(학교)?\s*(졸업\s*)?(학력\s*)?검정/, 'gedelem'], [/중졸|중학교\s*(졸업\s*)?(학력\s*)?검정/, 'gedmid'],
  [/고졸|검정\s*고시|검고/, 'gedhigh'],
];
const MONTH_KEY = { 3: 'mar', 4: 'apr', 5: 'may', 6: 'jun', 7: 'jul', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec' };
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
  [/언어\s*이해/, '언어이해'], [/추리\s*논증/, '추리논증'], [/언어\s*추론/, '언어추론'],
];
// 과목 안의 세부 이름(물리·미적분 등)은 검색어로 남겨 목록 검색이 좁히게 한다
const KEEP = /화작|언매|화법과\s*작문|언어와\s*매체|미적분?|확통|확률과\s*통계|기하|생윤|윤사|사문|한지|세지|동사|세사|정법|경제|물리(학)?\s*[12Ⅰ]?|화학\s*[12Ⅰ]?|생명(과학)?\s*[12Ⅰ]?|지구\s*과학\s*[12Ⅰ]?|일본어|중국어|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어|한문/g;
const HARD = /불\s*수능|킬러|고난도|어려(운|웠던|웠|움)|어렵게|최상위|변별력/;
const EASY = /물\s*수능|쉬(운|웠던|웠)|쉽게|평이/;
// 뜻 없는 말(조사·흔한 명사) — 남은 말이 이것뿐이면 JEV 를 부르지 않는다
const FILLER = /(짝수|홀수|검정\s*고시|검고|이후|이전|부터|까지|이상|이하|최근|기출(문제)?|문제지?|시험지?|시험|자료|찾아\s*줘|보여\s*줘|중에|중|에서|이랑|랑|하고|그리고|및|과목|많았던|나온|있는|했던|위주|만|전부|모두|좀|거|것|[,.·/&+]|\s(과|와|의|를|을|은|는|이|가)\s)/g;

// 흔한 줄임말 → SUBSUB 키 (검색어로 남기지 않고 세부 과목 필터로)
const ABBR = [
  [/화작|화법과\s*작문/, 'hwajak'], [/언매|언어와\s*매체/, 'eonmae'], [/미적분?/, 'calc'], [/확통|확률과\s*통계/, 'prob'], [/기하/, 'geo'],
  [/물리(학)?\s*(2|Ⅱ|투)|물\s*2/, 'phys2'], [/물리(학)?\s*(1|Ⅰ|원)?|물\s*1/, 'phys1'], [/화학\s*(2|Ⅱ)|화\s*2/, 'chem2'], [/화학\s*(1|Ⅰ)?|화\s*1/, 'chem1'],
  [/생명(과학)?\s*(2|Ⅱ)|생물\s*2|생\s*2/, 'bio2'], [/생명(과학)?\s*(1|Ⅰ)?|생물\s*1?|생\s*1/, 'bio1'],
  [/지구\s*과학\s*(2|Ⅱ)|지과\s*2|지\s*2/, 'earth2'], [/지구\s*과학\s*(1|Ⅰ)?|지과\s*1?|지\s*1/, 'earth1'],
  [/생윤|생활과\s*윤리/, 'saeng'], [/윤사|윤리와\s*사상/, 'yunsa'], [/사문|사회\s*문화/, 'samun'], [/한지|한국\s*지리/, 'hanji'], [/세지|세계\s*지리/, 'seji'],
  [/동사|동아시아사/, 'dongsa'], [/세사|세계사/, 'sesa'], [/정법|정치와\s*법|법과\s*정치/, 'jeongbeop'], [/경제/, 'econ'],
  [/독일어/, 'de'], [/프랑스어/, 'fr'], [/스페인어/, 'es'], [/중국어/, 'zh'], [/일본어/, 'ja'], [/러시아어/, 'ru'], [/아랍어/, 'ar'], [/베트남어/, 'vi'], [/한문/, 'hanmun'],
];

export function ruleParse(q) {
  const out = { text: [] };
  let s = ' ' + q.replace(/\s+/g, ' ').trim() + ' ';
  const now = NOW_GRADE_YEAR();
  const take = re => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };

  const subsub = [];
  for (const [re, k] of ABBR) if (re.test(s)) { subsub.push(k); s = s.replace(re, ' '); }
  if (subsub.length) out.subsub = subsub;
  for (const w of s.match(KEEP) || []) out.text.push(w.replace(/\s+/g, ''));
  let t0, mm0;
  if ((t0 = s.match(/(인문|자연)\s*(계열|계)?/))) { out.track = t0[1]; s = s.replace(t0[0], ' '); }
  if ((t0 = s.match(/킬러\s*(문항\s*)?(없|배제|금지|빠진|사라진)[가-힣]*(\s*(뒤|후|이후|다음))?/))) { out.era = 'killer_ban'; s = s.replace(t0[0], ' '); }
  if ((t0 = s.match(/(\d{2,4})\s*년대/))) {
    const d = +t0[1] % 100;
    out.decade = { 90: 'd1990', 0: 'd2000', 10: 'd2010', 20: 'd2020' }[d];
    s = s.replace(t0[0], ' ');
  }
  // 정렬 표현 — "오래된 순"·"어려운 순" 은 기간·난이도 필터가 아니라 순서
  let sm;
  if ((sm = s.match(/(오래된|옛날|예전|과거)\s*(순|것\s*부터|거\s*부터)/))) { out.sort = 'old'; s = s.replace(sm[0], ' '); }
  else if ((sm = s.match(/(최신|최근)\s*(순|것\s*부터|거\s*부터)/))) { out.sort = 'new'; s = s.replace(sm[0], ' '); }
  else if ((sm = s.match(/(어려운|어려웠던|어렵던)\s*(순|것\s*부터|거\s*부터)/))) { out.sort = 'hard'; s = s.replace(sm[0], ' '); }
  else if ((sm = s.match(/(쉬운|쉬웠던)\s*(순|것\s*부터|거\s*부터)/))) { out.sort = 'easy'; s = s.replace(sm[0], ' '); }
  if (/불\s*수능|물\s*수능/.test(s)) { out.typeGroup = 'suneung'; out.type = ['csat']; }
  if (take(HARD)) out.tier = ['4', '5'];
  else if (take(EASY)) out.tier = ['1', '2'];
  for (const [re, v] of TAB_RULES) if (take(re)) { out.tab = v; break; }
  // 사관·경찰 탭은 둘이 섞여 있다 — 한쪽만 말했으면 그 시험만
  if (out.tab === 'mp' && /경찰/.test(q) !== /사관/.test(q)) out.typeGroup = /경찰/.test(q) ? 'police' : 'military';
  if (out.tab === 'mp') s = s.replace(/경찰(대학?(교)?)?|사관(학교)?/g, ' ');
  if (out.tab?.startsWith('ged')) s = s.replace(/고졸|중졸|초졸|검정\s*고시|검고/g, ' ');
  // 검정고시 "1회·2회" → 제1회(4월)·제2회(8월)
  if (out.tab?.startsWith('ged') && (mm0 = s.match(/(제\s*)?([12])\s*회(차)?/))) { out.typeGroup = 'ged'; out.type = [`ged_${mm0[2]}`]; s = s.replace(mm0[0], ' '); }
  // "3월 학평", "10월 모의고사" → 교육청 해당 월 (6월·9월 평가원 모평보다 먼저)
  let mm = s.match(/(\d{1,2})\s*월\s*(학평|학력\s*평가|모의\s*고사|교육청)/);
  if (mm && MONTH_KEY[+mm[1]]) {
    // 고3 의 6월·9월 '모의고사'는 평가원 모평 (교육청 6·9월 학평은 고1·고2만 있음)
    const kice = (+mm[1] === 6 || +mm[1] === 9) && /모의/.test(mm[2]) && !['junior', 'freshman'].includes(out.tab);
    if (kice) { out.typeGroup = 'suneung'; out.type = [+mm[1] === 6 ? 'june' : 'sept']; }
    else { out.typeGroup = 'education'; out.type = [MONTH_KEY[+mm[1]]]; }
    s = s.replace(mm[0], ' ');
  }
  if ((mm = s.match(/(짝수|홀수)\s*(해|년도?|학년도)/))) { out.parity = mm[1] === '짝수' ? 'even' : 'odd'; s = s.replace(mm[0], ' '); }
  if ((mm = s.match(/옛날|오래된|예전|옛\s*기출|고전/))) { out.age = 'old'; s = s.replace(mm[0], ' '); }
  else if ((mm = s.match(/최신|요즘|최근\s*(기출|시험)?(?!\s*\d)/))) { out.age = 'recent'; s = s.replace(mm[0], ' '); }
  const has = [];
  if ((mm = s.match(/(듣기\s*)?대본(\s*있는)?/))) { has.push('script'); s = s.replace(mm[0], ' '); }
  if ((mm = s.match(/듣기(\s*(파일|mp3|음원))?(\s*있는)?/i))) { if (!has.includes('script')) has.push('listen'); s = s.replace(mm[0], ' '); }
  if ((mm = s.match(/짝수\s*형/))) { has.push('even'); s = s.replace(mm[0], ' '); }
  if ((mm = s.match(/해설(\s*(있는|포함))?/))) { has.push('solution'); s = s.replace(mm[0], ' '); }
  if (has.length) out.has = has;
  for (const [re, v] of EXAM_RULES) if (!out.type && re.test(s)) {
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

  let m;
  // 1등급컷 숫자 조건 — "1등급컷 84점 이하", "컷 90 이상"
  if ((m = take(/(1\s*등급\s*)?컷\s*(이|가)?\s*(\d{2,3})\s*점?\s*(이하|이상|미만|초과|밑|넘)/))) {
    const n = +m[3], w = m[4];
    out.cut = /이하|미만|밑/.test(w) ? { max: w === '미만' ? n - 1 : n } : { min: w === '초과' || w === '넘' ? n + 1 : n };
  }

  // 교육과정: "15개정", "2015 개정", "09개정", "7차" (+ 이후)
  const after = /(이후|부터|이상|뒤)/;
  m = take(/(20)?(15|09|07)\s*개정(\s*교육\s*과정)?\s*(이후|부터|이상)?/);
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
  } else if ((m = s.match(/(\d{2,4})\s*(학년도|년)?\s*(이후|부터|이상|이전|까지|이하)?/)) && (m[2] || m[3] || m[1].length === 4 || /^\d{2}$/.test(m[1]))
    // 수능이 없던 해("미적 88" 의 88 → 1988)는 연도로 보지 않는다
    && (m[1].length !== 2 || m[2] || (y4(+m[1]) >= 1994 && y4(+m[1]) <= now + 1))) {
    s = s.replace(m[0], ' ');
    // 검정고시는 시행 연도 = 목록의 연도 ("2026년" 그대로)
    const gy = y4(+m[1]) + (m[2] === '년' && !out.tab?.startsWith('ged') ? 1 : 0);
    if (!m[3]) out.years = { from: gy, to: gy };
    else if (after.test(m[3])) out.years = { from: gy, to: now };
    else out.years = { from: 1994, to: gy };
  }

  // 연도로도 컷으로도 못 쓴 맨 숫자("미적 88")는 버린다 — JEV 는 숫자에 약하다
  s = s.replace(/(^|\s)\d{1,3}(?=\s)/g, ' ');

  // 남은 말: 뜻 없는 말을 빼고도 남으면 규칙이 모르는 표현 → JEV 에 묻는다
  const rest = s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  out.rest = rest;
  if (rest) for (const w of rest.split(' ')) if (w.length >= 2 && !out.text.includes(w)) out.unknown = [...(out.unknown || []), w];
  return out;
}

// ── JEV 판단 축 ─────────────────────────────────────────────
// 규칙이 모르는 말이 남으면 아래 축 전부를 한 번에 묻는다(따로 묻는 것보다 훨씬 싸고 빠름).
// 숫자·날짜 계산은 JEV 가 약하므로 '뜻'만 고르게 하고, 학년도 범위는 ERA/DECADE 표로 코드가 정한다.

// 세부 과목 — 교육과정마다 이름이 달라 같은 과목의 옛 이름을 함께 묶는다
export const SUBSUB = {
  hwajak: ['화법과 작문', ['화법과작문']], eonmae: ['언어와 매체', ['언어와매체']],
  calc: ['미적분', ['미적분']], prob: ['확률과 통계', ['확률과통계']], geo: ['기하', ['기하']],
  ga: ['가형(이과 수학)', ['가형']], na: ['나형(문과 수학)', ['나형']], typeA: ['A형(쉬운 유형)', ['A형']], typeB: ['B형(어려운 유형)', ['B형']],
  phys1: ['물리학Ⅰ', ['물리학Ⅰ', '물리Ⅰ']], phys2: ['물리학Ⅱ', ['물리학Ⅱ', '물리Ⅱ']],
  chem1: ['화학Ⅰ', ['화학Ⅰ']], chem2: ['화학Ⅱ', ['화학Ⅱ']],
  bio1: ['생명과학Ⅰ', ['생명과학Ⅰ', '생물Ⅰ']], bio2: ['생명과학Ⅱ', ['생명과학Ⅱ', '생물Ⅱ']],
  earth1: ['지구과학Ⅰ', ['지구과학Ⅰ']], earth2: ['지구과학Ⅱ', ['지구과학Ⅱ']],
  saeng: ['생활과 윤리', ['생활과윤리']], yunsa: ['윤리와 사상', ['윤리와사상']], samun: ['사회·문화', ['사회·문화']],
  hanji: ['한국지리', ['한국지리']], seji: ['세계지리', ['세계지리']], dongsa: ['동아시아사', ['동아시아사']], sesa: ['세계사', ['세계사']],
  jeongbeop: ['정치와 법', ['정치와법', '법과정치', '법과사회', '정치']], econ: ['경제', ['경제']],
  geunhyeon: ['한국근현대사', ['한국근현대사']], guksa: ['국사', ['국사']],
  de: ['독일어', ['독일어']], fr: ['프랑스어', ['프랑스어']], es: ['스페인어', ['스페인어']], zh: ['중국어', ['중국어']],
  ja: ['일본어', ['일본어']], ru: ['러시아어', ['러시아어']], ar: ['아랍어', ['아랍어']], vi: ['베트남어', ['베트남어']], hanmun: ['한문', ['한문']],
};
// 시대·사건 → 학년도 범위 (to 가 null 이면 올해까지)
const ERA = {
  integrated: ['통합수능·선택과목 체제(2022학년도~)', 2022, null], first_integrated: ['첫 통합수능(2022학년도)', 2022, 2022],
  pre_integrated: ['통합수능 이전(문·이과 가형/나형 시절)', 1994, 2021], ab: ['국·수·영 A/B형 수준별 시험 시기(2014~2016학년도)', 2014, 2016],
  eng_absolute: ['영어 절대평가 이후(2018학년도~)', 2018, null], eng_relative: ['영어 상대평가 시절(~2017학년도)', 1994, 2017],
  killer_ban: ['킬러문항 배제 방침 이후(2024학년도~)', 2024, null], covid: ['코로나 시기(2021~2022학년도)', 2021, 2022],
  hist_required: ['한국사 필수화 이후(2017학년도~)', 2017, null], early: ['수능 초창기(1994~2000학년도)', 1994, 2000],
};
const DECADE = { d1990: ['1990년대', 1994, 1999], d2000: ['2000년대', 2000, 2009], d2010: ['2010년대', 2010, 2019], d2020: ['2020년대', 2020, null] };
const TIERS = { very_hard: ['5'], hard: ['4', '5'], normal: ['3'], easy: ['1', '2'], very_easy: ['1'] };
const MONTHS = { mar: '3월', apr: '4월', may: '5월', jun: '6월(교육청)', jul: '7월', sep: '9월(교육청)', oct: '10월', nov: '11월', dec: '12월' };
const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria: { ...criteria, none: '언급 없음' } });
const noul = instructions => ({ type: 'noul', instructions });

export const JEV_QUESTIONS = {
  tab: choice('검색어가 찾는 시험 대상은?', {
    senior: '수능·평가원 모의평가·고3 학력평가', junior: '고2 학력평가', freshman: '고1 학력평가', mp: '사관학교·경찰대 1차 시험',
    gradschool: 'LEET·MEET(전문대학원)', essay: '대학별 논술', gedhigh: '고졸 검정고시', gedmid: '중졸 검정고시', gedelem: '초졸 검정고시',
  }),
  exam: choice('검색어가 찾는 시험 종류는?', {
    csat: '수능 본시험만', june: '평가원 6월 모의평가(6모·6평)', sept: '평가원 9월 모의평가(9모·9평)', mock: '평가원 6모와 9모 둘 다(모평)',
    kice: '평가원 시험 전체', education: '교육청 학력평가 전체(학평·모의고사)',
    ...Object.fromEntries(Object.entries(MONTHS).map(([k, v]) => [`edu_${k}`, `교육청 ${v} 학력평가`])),
  }),
  subsub: choice('검색어가 가리키는 세부 선택과목은?', Object.fromEntries(Object.entries(SUBSUB).map(([k, [label]]) => [k, label]))),
  difficulty: choice('검색어가 원하는 난이도는?', {
    very_hard: '역대급으로 가장 어려운 시험만(불수능)', hard: '어려운 편(고난도·킬러·변별력 큰)', normal: '보통 난이도',
    easy: '쉬운 편(물수능·평이한)', very_easy: '역대급으로 가장 쉬운 시험만',
  }),
  era: choice('검색어가 가리키는 시대·제도 변화는?', Object.fromEntries(Object.entries(ERA).map(([k, [label]]) => [k, label]))),
  decade: choice('검색어가 가리키는 연대는?', Object.fromEntries(Object.entries(DECADE).map(([k, [label]]) => [k, label]))),
  yearPattern: choice('검색어가 학년도를 어떤 식으로 고르라고 하나?', {
    even: '짝수 해·짝수 학년도만', odd: '홀수 해·홀수 학년도만', recent: '최근·요즘 기출 위주', old: '옛날·오래된 기출 위주',
  }),
  curriculum: choice('검색어가 가리키는 교육과정은?', { c2015: '2015 개정', c2009: '2009 개정', c2007: '2007 개정', c7: '7차 교육과정' }),
  track: choice('논술이라면 어느 계열?', { 인문: '인문·사회 계열', 자연: '자연·이공 계열(수리·과학)' }),
  sort: choice('검색어가 원하는 정렬 순서는?', { hard: '어려운 시험부터', easy: '쉬운 시험부터', old: '오래된 시험부터', new: '최신 시험부터' }),
  ...Object.fromEntries([
    ['s_kor', '국어'], ['s_math', '수학'], ['s_eng', '영어'], ['s_hist', '한국사'],
    ['s_soc', '사회탐구(생활과윤리·사회문화·한국지리 등)'], ['s_sci', '과학탐구(물리·화학·생명과학·지구과학)'],
    ['s_lang', '제2외국어·한문'], ['s_voc', '직업탐구'],
  ].map(([k, v]) => [k, noul(`검색어가 ${v} 과목을 찾고 있나?`)])),
  h_listen: noul('검색어가 듣기 파일(MP3)이 있는 시험을 원하나?'),
  h_script: noul('검색어가 듣기 대본이 있는 시험을 원하나?'),
  h_solution: noul('검색어가 해설지가 있는 시험을 원하나?'),
  h_even: noul('검색어가 짝수형 문제지를 원하나?'),
};

const SUBJECT_KEYS = { s_kor: '국어', s_math: '수학', s_eng: '영어', s_hist: '한국사', s_soc: '사회탐구', s_sci: '과학탐구', s_lang: '제2외국어', s_voc: '직업탐구' };
const HAS_KEYS = { h_listen: 'listen', h_script: 'script', h_solution: 'solution', h_even: 'even' };

// 규칙 결과(우선) + JEV 답(빈 칸 채우기) → 사이트 필터. 확신이 낮은 답은 버린다.
export function toFilters(rule, ans) {
  const f = {};
  const now = NOW_GRADE_YEAR();
  const pick = (k, min = 0.7) => (ans?.[k] && ans[k].choice !== 'none' && ans[k].confidence >= min ? ans[k].choice : null);
  const yes = (k, min = 0.8) => (ans?.[k]?.noul ?? 0) >= min;

  const tab = rule.tab || pick('tab');
  if (tab) f.tab = tab;
  if (rule.typeGroup) { f.typeGroup = rule.typeGroup; if (rule.type) f.type = rule.type; }
  else {
    const exam = pick('exam', 0.8);
    if (exam?.startsWith('edu_')) { f.typeGroup = 'education'; f.type = [exam.slice(4)]; }
    else if (exam === 'education') f.typeGroup = 'education';
    else if (exam) { f.typeGroup = 'suneung'; const t = { csat: ['csat'], june: ['june'], sept: ['sept'], mock: ['june', 'sept'] }[exam]; if (t) f.type = t; }
  }
  if (f.typeGroup && !f.tab) f.tab = 'senior';

  if (rule.tier) f.tier = rule.tier;
  else { const d = pick('difficulty'); if (d) f.tier = TIERS[d]; }
  if (rule.cut) f.cut = rule.cut;

  if (rule.subjects) f.subjects = rule.subjects;
  else { const s = Object.entries(SUBJECT_KEYS).filter(([k]) => yes(k)).map(([, v]) => v); if (s.length) f.subjects = s; }
  if (rule.subsub) f.subSubjects = rule.subsub.flatMap(k => SUBSUB[k][1]);
  else { const ss = pick('subsub', 0.75); if (ss && !rule.text.length) f.subSubjects = SUBSUB[ss][1]; }

  // 학년도: 규칙 > 교육과정 > 시대 > 연대 > 최근/옛날, 짝·홀은 따로
  const span = (from, to) => ({ from, to: to ?? now });
  let years = rule.years;
  const curr = rule.curriculum || pick('curriculum', 0.8);
  if (curr && CURR[curr]) years = rule.currAfter ? span(CURR[curr].from, null) : years || span(CURR[curr].from, CURR[curr].to);
  const era = rule.era || pick('era', 0.8), dec = rule.decade || pick('decade', 0.8);
  if (!years && era) years = span(ERA[era][1], ERA[era][2]);
  if (!years && dec) years = span(DECADE[dec][1], DECADE[dec][2]);
  const yp = rule.parity || rule.age || pick('yearPattern', 0.8);
  if (yp === 'even' || yp === 'odd') f.parity = yp;
  else if (yp === 'recent' && !years) years = span(now - 4, null);
  else if (yp === 'old' && !years) years = span(1994, now - 10);
  if (years) f.years = years;

  const has = rule.has || Object.entries(HAS_KEYS).filter(([k]) => yes(k)).map(([, v]) => v);
  if (has.length) f.has = has;
  const track = rule.track || pick('track', 0.8);
  if (track && f.tab === 'essay') f.subSubject = track;
  const sort = rule.sort || pick('sort', 0.8);
  if (sort && sort !== 'new') f.sort = sort;

  // 필터로 못 바꾼 말(물리·미적분·학교 이름 등)은 목록 검색어로. 학교 이름(○○대)은 JEV 가 답해도 남긴다
  const text = [...rule.text, ...(rule.unknown || []).filter(w => !ans || /(대|대학|대학교)$/.test(w))];
  if (text.length) f.text = text.join(' ');
  return f;
}
