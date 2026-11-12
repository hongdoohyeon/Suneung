// 기출검색 공용 사전 — 브라우저 목록 검색(state.js)과 스마트 검색 Worker(cloudflare/smart-search/src/parse.js)가 함께 읽는다.
// 다른 모듈을 가져오지 않는다(Worker 가 그대로 묶어 쓰도록).

// 논술 대학 — 시험 목록의 대학 이름(subject, 공백·괄호 뺀 형태)에 들어 있는 글자.
// 새 대학이 수록되면 여기에 더한다(scripts/test-search.mjs 가 빠진 대학을 잡는다).
export const SCHOOLS = [
  '가천대', '가톨릭대', '강남대', '건국대', '경기대', '경북대', '경희대', '고려대', '광운대', '국민대',
  '단국대', '덕성여자대', '동국대', '동덕여자대', '부산대', '삼육대', '상명대', '서강대', '서경대', '서울과학기술대',
  '서울시립대', '서울여자대', '성균관대', '성신여자대', '세종대', '수원대', '숙명여자대', '숭실대', '신한대', '아주대',
  '연세대', '을지대', '이화여자대', '인하대', '중앙대', '한국공학대', '한국기술교육대', '한국외국어대', '한국항공대', '한신대',
  '한양대', '홍익대',
];

// 줄임말·다른 이름 → 위 이름
export const SCHOOL_ALIASES = {
  연대: '연세대', 고대: '고려대', 성대: '성균관대', 성균관: '성균관대', 중대: '중앙대', 단대: '단국대', 건대: '건국대', 홍대: '홍익대',
  이대: '이화여자대', 이화여대: '이화여자대', 숙대: '숙명여자대', 숙명여대: '숙명여자대', 서울여대: '서울여자대',
  덕성여대: '덕성여자대', 성신여대: '성신여자대', 동덕여대: '동덕여자대',
  외대: '한국외국어대', 한국외대: '한국외국어대', 시립대: '서울시립대', 서울시립: '서울시립대',
  과기대: '서울과학기술대', 서울과기대: '서울과학기술대', 서울과기: '서울과학기술대',
  항공대: '한국항공대', 한기대: '한국기술교육대', 코리아텍: '한국기술교육대', 공학대: '한국공학대', 한국공대: '한국공학대',
  카톨릭대: '가톨릭대', 가톨릭: '가톨릭대', 가대: '가톨릭대',
};

// '대'를 뺀 줄기만 쳐도 대학으로 보는 이름 — 흔한 낱말과 겹치는 줄기는 뺀다("아주 어려운"의 아주 등)
const STEM_BLOCK = new Set(['아주', '경기', '국민', '강남', '신한', '수원', '세종', '부산']);

const norm = s => String(s ?? '').toLowerCase().replace(/[\s()·]/g, '');

// 검색어 낱말 → 대학 이름(SCHOOLS 의 값) 또는 null
export function schoolOf(word) {
  let w = norm(word).replace(/학교$/, '');
  if (w.length < 2) return null;
  if (SCHOOL_ALIASES[w]) return SCHOOL_ALIASES[w];
  if (w.endsWith('대학')) w = w.slice(0, -1);   // 연세대학 → 연세대
  if (SCHOOLS.includes(w)) return w;
  if (w.endsWith('여대') && SCHOOLS.includes(w.slice(0, -2) + '여자대')) return w.slice(0, -2) + '여자대';
  if (!w.endsWith('대') && !STEM_BLOCK.has(w) && SCHOOLS.includes(w + '대')) return w + '대';
  if (SCHOOLS.includes(w + '여자대')) return w + '여자대';              // 이화·숙명·덕성
  // 세 글자 이상 앞부분이 한 대학에만 맞으면(한국외 → 한국외국어대)
  const pre = w.length >= 3 ? SCHOOLS.filter(s => s.startsWith(w)) : [];
  return pre.length === 1 ? pre[0] : null;
}
