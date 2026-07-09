'use strict';
import {
  CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, TAB_CONFIG,
  getTypeConf, getTabConf, prettySub, searchAliasOf, ALIAS_KEYS_DESC,
} from './config.js?v=20260709a';

// ── 검색 정규화 ─────────────────────────────────────────────
// 로마자 숫자(Ⅰ/Ⅱ/Ⅲ) → 아라비아, 한자(一/二/三) → 아라비아, 소문자, 공백 제거.
// 학생 입력에 흔한 표기(화학Ⅰ / 화학I / 화학1 / 화학i)를 한 형태로 통일.
function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[Ⅰⅰ]/g, '1')
    .replace(/[Ⅱⅱ]/g, '2')
    .replace(/[Ⅲⅲ]/g, '3')
    .replace(/[Ⅳⅳ]/g, '4')
    .replace(/[‧·∙ㆍ・]/g, '')           // 가운뎃점 류 제거
    .replace(/[()[\]{}<>「」『』]/g, '') // 괄호 제거
    .replace(/일\s*학년/g, '고1')
    .replace(/이\s*학년/g, '고2')
    .replace(/삼\s*학년/g, '고3');
}
const normQ = s => fold(s).replace(/\s+/g, '');

// 한글 자모 (NFD-style 분해 + 초성 추출 양쪽에 사용)
const CHO  = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// "수능기출" → "ㅅㄴㄱㅊ" (초성만)
function toChosung(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      out += CHO[Math.floor((c - 0xAC00) / 588)];
    } else if (/[ㄱ-ㅎ]/.test(ch)) {
      out += ch;
    } else if (/[a-z0-9]/i.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}
// "수능" → "ㅅㅜㄴㅡㅇ" (자모 풀분해, 자모 단위 편집거리용)
function toJamo(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const idx = c - 0xAC00;
      out += CHO[Math.floor(idx / 588)];
      out += JUNG[Math.floor((idx % 588) / 28)];
      const j = idx % 28;
      if (j) out += JONG[j];
    } else if (/[ㄱ-ㅎㅏ-ㅣ]/.test(ch)) {
      out += ch;
    } else if (/[a-z0-9]/i.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}
// 토큰이 한글 초성만으로 구성됐는지 — "ㅎㄱ" 같은 입력 검출
const isChosungOnly = s => /^[ㄱ-ㅎ]+$/.test(String(s ?? ''));

// 정규식 메타문자 이스케이프
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 윈도우 + 자모 단위 편집거리 (≤ maxDiff 매칭 위치 발견하면 즉시 true)
function fuzzyContains(hay, needle, maxDiff) {
  const nLen = needle.length;
  if (nLen === 0) return true;
  if (nLen > hay.length + maxDiff) return false;
  // O(N×nLen) Levenshtein, needle 짧을 때만 호출되므로 충분.
  for (let i = 0; i + nLen - maxDiff <= hay.length; i++) {
    let diff = 0;
    let j = 0;
    while (j < nLen && diff <= maxDiff) {
      if (hay[i + j] === needle[j]) j++;
      else { diff++; j++; }
    }
    if (diff <= maxDiff) return true;
  }
  return false;
}

// "YYMM" 4자리 숫자 → [학년도2자리, 회차] 자동 분해
//  2506 → ['25','6모'] / 2511 → ['25','수능'] / 2509 → ['25','9모']
const YYMM_TO_TYPE = {
  '11': '수능', '09': '9모', '06': '6모',
  '03': '3모', '04': '4모', '05': '5모',
  '07': '7모', '08': '8모', '10': '10모',
};
function expandYYMM(t) {
  const m = t.match(/^(\d{2})(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const yy = +m[1];
  if (yy < 18 || yy > 30) return null;       // 합리적 학년도 범위
  const round = YYMM_TO_TYPE[m[2]];
  if (!round) return null;
  return [m[1], round];
}

// 사용자 query 를 토큰(공백/쉼표/슬래시/하이픈 단위)으로 분해.
// 각 토큰은 매칭 단계에서 다시 (숫자)↔(한글/영문) 경계로 분해될 수 있음 (matchToken 참고).
function tokenize(query) {
  const raw = fold(query)
    .replace(/[,\/\-_]+/g, ' ')   // 하이픈·언더스코어도 분리 ("25-9모" → ["25","9모"])
    .split(/\s+/)
    .filter(Boolean)
    .map(c => c.replace(/\s+/g, ''));
  // 4자리 YYMM 토큰 자동 분해
  const out = [];
  for (const t of raw) {
    const exp = expandYYMM(t);
    if (exp) out.push(...exp); else out.push(t);
  }
  return out;
}

// hay 캐시 — exam 객체별로 한 번만 빌드.
const _hayCache = new WeakMap();

function buildHay(e) {
  const tc = getTypeConf(e.type);
  const items = [];

  // 과목·소과목 (raw + pretty + 로마자 변환)
  if (e.subject)    items.push(e.subject);
  if (e.subSubject) {
    items.push(e.subSubject, prettySub(e.subSubject));
    // 화학Ⅰ → 화학1 / 화학i — 두 형태 모두 hay 에
    items.push(
      e.subSubject.replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅲ/g, '3'),
      e.subSubject.replace(/Ⅰ/g, 'i').replace(/Ⅱ/g, 'ii').replace(/Ⅲ/g, 'iii'),
    );
  }

  // 학년도·시행연도 (4자리 + 2자리 축약)
  // 학년도는 "2025"·"25"·"2025학년도" 모두 hay 단어로 등록 → 사용자 입력 "25"가 학년도 우선 매칭.
  // 시행연도는 "2025년" 표기만 등록 ("2025"·"25" 단독 매칭 시 학년도와 충돌 방지).
  if (e.gradeYear) {
    const gy = String(e.gradeYear);
    items.push(gy, `${gy}학년도`, gy.slice(-2));
  }
  if (e.examYear) {
    items.push(`${e.examYear}년`);
  }

  // 시행 월
  if (e.month) items.push(`${e.month}월`);

  // 학년 (고1/고2/고3 + 풀어쓴 형태)
  if (e.studentGrade) {
    const sg = e.studentGrade;
    items.push(`고${sg}`, ['', '고일', '고이', '고삼'][sg], `${sg}학년`);
  }

  // type / typeGroup label
  if (tc?.label)      items.push(tc.label);
  if (tc?.groupLabel) items.push(tc.groupLabel);

  // typeGroup·type 별 검색 키워드 보강
  switch (e.typeGroup) {
    case 'education':
      items.push('학평', '학력평가', '교육청', '모의고사');
      if (e.month) items.push(`${e.month}모`, `${e.month}평`);
      break;
    case 'suneung':
      items.push('평가원', '고3', '고삼');
      if (e.type === 'csat')   items.push('수능', '대학수학능력시험');
      if (e.type === 'june')   items.push('6월', '6모', '6평', '모의평가');
      if (e.type === 'sept')   items.push('9월', '9모', '9평', '모의평가');
      if (e.type === 'prelim') items.push('예비', '예비시행', '예시');
      break;
    case 'military':
      items.push('사관', '사관학교', '1차');
      break;
    case 'police':
      items.push('경찰', '경찰대', '1차');
      break;
    case 'leet':
      items.push('leet', '리트', '법학적성시험');
      break;
    case 'meet':
      items.push('meet', '의치학', '의예', '의대', '치대');
      break;
  }

  // 자료 타입 키워드 — 검색에 "듣기", "대본", "mp3", "스크립트" 직접 입력해도 잡히게
  items.push('문제지', '문제', '기출', '기출문제', '정답', '답지', '해설', '해설지', '풀이', '등급컷', '빠른정답');
  if (e.subject === '영어' && (e.listenUrl || e.scriptUrl)) {
    items.push('듣기', '듣기파일', '듣기mp3', 'mp3', '음원',
               '대본', '듣기대본', '스크립트', '영어스크립트', 'listening', 'script',
               '듣기평가', '딕테이션', 'dictation');
  }

  const joined = items.filter(Boolean).join(' ');
  const norm = normQ(joined);
  // 초성 hay (예: "한국사" → "ㅎㄱㅅ") — 초성만 입력시 매칭
  const chos = toChosung(joined);
  // 자모 풀분해 hay — 자모 단위 편집거리 매칭
  const jamo = toJamo(norm);
  // 단어 시작 위치 인덱스 — prefix 가산점용
  const wordStarts = new Set([0]);
  for (let i = 1; i < norm.length; i++) {
    // 단어 경계: 한글↔영숫자 / 공백 등 — normQ 후엔 이미 공백 제거됨, 하나의 큰 hay이지만
    // 원본 joined에서 공백 위치를 보존해야 prefix 정의 가능 — 별도 wordsArr로 처리.
  }
  // joined를 공백/구두점 단위로 잘라 단어 배열을 만들면 prefix·정확단어 일치 판정 가능
  const words = fold(joined).split(/[\s,/.()[\]{}<>]+/).filter(Boolean).map(w => w.replace(/\s+/g,''));
  const wordsSet = new Set(words);
  return { norm, chos, jamo, words, wordsSet };
}

function getHay(e) {
  let h = _hayCache.get(e);
  if (h === undefined) { h = buildHay(e); _hayCache.set(e, h); }
  return h;
}

// 토큰 단일 매칭 — 0(없음) ~ 1.0(정확) 점수 반환.
// 시도 순서:
//   정확 단어 1.0 / 정확 substring 0.95 / prefix 0.85 / alias 0.85 /
//   초성 0.8 / 토큰 분해 (숫자+한글) 0.75 / 자모 단위 거리 ≤1: 0.6 /
//   음절 단위 거리 ≤1: 0.5 / 그 외 0.
function scoreToken(hayObj, tok) {
  const t = normQ(tok);
  if (!t) return 1;
  const { norm: hay, chos, jamo, wordsSet } = hayObj;

  // 1) 초성만 입력
  if (isChosungOnly(tok)) {
    if (chos.includes(tok)) return 0.8;
    return 0;
  }

  // 2) 정확 단어 일치 (단어 토큰)
  if (wordsSet.has(t)) return 1.0;

  // 1글자 토큰은 정확 단어 일치만 통과 (substring 매칭은 너무 광범위)
  if (t.length === 1) return 0;

  // 짧은 숫자 토큰(2~3자리)은 정확 단어 매칭만 — "25"가 "2025년" substring 매칭되는 것 방지
  if (/^\d+$/.test(t) && t.length <= 3) return 0;

  // 3) 정확 substring
  if (hay.includes(t)) return 0.95;

  // 4) alias (수능, 5모, 듣기 등 매핑) — alias 배열 모두가 hay 에 있어야 정확 매칭
  const aliases = searchAliasOf(t);
  if (aliases) {
    const allIn = aliases.every(a => hay.includes(normQ(a)));
    if (allIn) {
      // 정확 단어 매칭이 하나라도 있으면 0.9, 부분 substring 만 있으면 0.85
      return aliases.some(a => wordsSet.has(normQ(a))) ? 0.9 : 0.85;
    }
  }

  // 5) prefix — 어떤 단어의 시작이 토큰
  if (t.length >= 2) {
    for (const w of wordsSet) {
      if (w.length > t.length && w.startsWith(t)) return 0.8;
    }
  }

  // 6) 토큰을 숫자/한글/영문 경계로 분해해 모든 sub-part 가 hay 또는 alias 매칭
  //    1글자 sub-part는 너무 헐거우므로 거부 (예: "5월" → ["5","월"] → 모든 시험 매칭 방지)
  const parts = t.match(/[\d]+|[가-힣a-z]+/g);
  if (parts && parts.length > 1 && parts.every(p => p.length >= 2)) {
    let total = 0; let ok = true;
    for (const p of parts) {
      if (hay.includes(p)) { total += 1; continue; }
      const al = searchAliasOf(p);
      if (al && al.every(a => hay.includes(normQ(a)))) { total += 0.85; continue; }
      ok = false; break;
    }
    if (ok) return 0.7 * (total / parts.length);
  }

  // 6-b) alias-greedy split — "9모영어" → ["9모","영어"], "5모영어듣기" → ["5모","영어","듣기"]
  // 긴 alias key 먼저 매치하면서 토큰을 자르고, 각 조각이 hay (또는 alias) 매칭되면 통과.
  if (t.length >= 3) {
    const segs = [];
    let i = 0;
    while (i < t.length) {
      let matched = null;
      for (const k of ALIAS_KEYS_DESC) {
        if (k.length > t.length - i) continue;
        if (k.length < 2) continue; // 한 글자 alias는 skip (false positive)
        if (t.startsWith(k, i)) { matched = k; break; }
      }
      if (matched) { segs.push(matched); i += matched.length; }
      else {
        // 한 글자 단위 누적 — 다음 alias 만날 때까지 한글/영문/숫자 묶음
        let j = i + 1;
        while (j < t.length) {
          let hit = false;
          for (const k of ALIAS_KEYS_DESC) {
            if (k.length >= 2 && t.startsWith(k, j)) { hit = true; break; }
          }
          if (hit) break;
          j++;
        }
        segs.push(t.slice(i, j));
        i = j;
      }
    }
    if (segs.length >= 2) {
      let total = 0; let ok = true;
      for (const s of segs) {
        if (hay.includes(s)) { total += 0.9; continue; }
        const al = searchAliasOf(s);
        if (al && al.every(a => hay.includes(normQ(a)))) { total += 0.85; continue; }
        ok = false; break;
      }
      if (ok) return 0.7 * (total / segs.length);
    }
  }

  // 7) 자모 단위 편집거리 ≤ 1 (한글 오타: "수능" → "스능", "기출" → "기풀")
  //    숫자 포함 토큰("5월" 등)은 거부 — "11월"같은 다른 월에 1자모 거리로 매칭되는 것 방지
  if (/^[가-힣]+$/.test(t) && t.length >= 2) {
    const tj = toJamo(t);
    if (tj.length >= 4 && fuzzyContains(jamo, tj, 1)) return 0.6;
  }

  // 8) 음절 단위 편집거리 ≤ 1 — 영숫자 오타 또는 한글 1음절 변경 (숫자 포함시 거부)
  if (t.length >= 3 && /^[가-힣a-z]+$/.test(t) && fuzzyContains(hay, t, 1)) return 0.5;

  return 0;
}

// 쿼리 파싱 — 구문(`"..."`) 정확 일치, `-token` 제외, 그 외 일반 토큰.
function parseQuery(query) {
  const include = []; const exclude = []; const phrases = [];
  const folded = fold(query);
  // 구문 추출
  const phRe = /"([^"]+)"/g;
  let m;
  let rest = folded;
  while ((m = phRe.exec(folded))) phrases.push(m[1].trim());
  rest = rest.replace(phRe, ' ');
  // 토큰 분해 (제외 토큰 `-foo` 먼저 처리, 그 후 하이픈은 단어 분리자로 사용)
  // 1) 단어 시작의 `-` 만 제외 토큰으로 인정 → "-듣기" / 그 외 단어 내 하이픈은 분리자
  const cleaned = rest.split(/\s+/).map(seg => {
    if (seg.startsWith('-') && seg.length > 1) {
      exclude.push(seg.slice(1).replace(/[-_]+/g,'').replace(/\s+/g,''));
      return '';
    }
    // 단어 내부 하이픈/언더스코어/슬래시는 단어 분리
    return seg.replace(/[-_/]+/g, ' ');
  }).filter(Boolean).join(' ');
  for (const raw of cleaned.split(/[\s,]+/).filter(Boolean)) {
    const t = raw.replace(/\s+/g,'');
    const exp = expandYYMM(t);
    if (exp) include.push(...exp); else include.push(t);
  }
  return { include, exclude, phrases };
}

// 쿼리 매칭 점수 — 0(제외) 또는 양수(랭킹 정렬용).
//   AND 모드: include 토큰 모두 score>0 / 구문 모두 정확 매칭 / exclude 모두 매칭 안됨.
//   같은 점수 안에서 정확 단어/단어시작 매칭이 더 높은 점수.
function scoreQuery(e, query) {
  const parsed = parseQuery(query);
  if (parsed.include.length === 0 && parsed.phrases.length === 0) return 1;
  const hayObj = getHay(e);

  // 구문은 정확 substring 필수 — normQ는 공백 제거하므로 "수능 국어" → "수능국어"
  for (const ph of parsed.phrases) {
    const pn = normQ(ph);
    if (pn && !hayObj.norm.includes(pn)) {
      // 공백 보존 매칭 fallback (joined hay가 공백 포함)
      const phLower = fold(ph).replace(/\s+/g, '');
      if (!hayObj.norm.includes(phLower)) return 0;
    }
  }
  // 제외 토큰은 score >= 0.6 이면 컷
  for (const ex of parsed.exclude) {
    if (scoreToken(hayObj, ex) >= 0.6) return 0;
  }
  // 포함 토큰 모두 매칭
  let total = 0;
  for (const tok of parsed.include) {
    const s = scoreToken(hayObj, tok);
    if (s === 0) return 0;  // AND
    total += s;
  }
  // 정확 매칭이 다수면 랭킹 보너스
  return parsed.include.length === 0 ? 1 : (total / parsed.include.length);
}

// 기존 호환성 유지 (boolean 인터페이스)
function matchesQuery(e, query) {
  return scoreQuery(e, query) > 0;
}

export const state = {
  exams:    [],
  loading:  true,

  tab:      'senior',  // 카테고리 탭 키 — TAB_CONFIG 의 key

  typeGroup:  'all',
  type:       'all',

  gradeYear:  'all',

  subject:    'all',
  subSubject: 'all',

  query: '',
  page:  1,

  // UI 토글 상태 — 학년도 칩 "더보기" 펼침 여부. 다른 필터 재렌더 시 유지
  yearExpanded: false,
};

export const PAGE_SIZE = 24;

export function resetFilters() {
  state.typeGroup  = 'all';
  state.type       = 'all';
  state.gradeYear  = 'all';
  state.subject    = 'all';
  state.subSubject = 'all';
  state.query      = '';
  state.page       = 1;
}

// 현재 탭이 포함하는 curriculum 키 배열 (예: 'senior' → ['2015','2009','예비'])
export function tabCurriculums() {
  return getTabConf(state.tab)?.curriculums ?? [];
}

// 탭 안의 모든 curriculum 정의 합집합 (영역 union 등 화면 구성용)
export function tabCurriculumConfs() {
  return tabCurriculums()
    .map(k => CURRICULUM_CONFIG[k])
    .filter(Boolean);
}

// 탭이 포함하는 모든 curriculum 의 영역 union (정렬: 첫 curriculum 기준 + 추가분 뒤에)
export function tabSubjects() {
  const merged = {};
  for (const conf of tabCurriculumConfs()) {
    for (const [key, val] of Object.entries(conf.subjects)) {
      if (!merged[key]) {
        merged[key] = { ...val, subs: [...val.subs] };
      } else {
        // subs union (중복 없이 순서 유지)
        for (const s of val.subs) {
          if (!merged[key].subs.includes(s)) merged[key].subs.push(s);
        }
      }
    }
  }
  return merged;
}

// 학년도 → curriculum 역매핑 (학년도 칩 그룹 헤더에 사용)
// 'preliminary' (28예비) → '예비' / 2022~ → '2015' / 2014~2021 → '2009' / 사관·경찰·LEET·MEET 은 자체
export function curriculumOfGradeYear(gradeYear) {
  for (const conf of tabCurriculumConfs()) {
    const [min, max] = conf.gradeYearRange;
    if (gradeYear === 'preliminary' && conf.id === '예비') return conf;
    if (typeof gradeYear === 'number' && gradeYear >= min && gradeYear <= max) return conf;
  }
  return null;
}

// 학년도 정렬 키: preliminary(28예비) = 2028 로 간주 → 가장 미래(앞) 위치
function gradeYearSortKey(gy) {
  return gy === 'preliminary' ? 2028 : Number(gy);
}

export function getDisplayYear(item) {
  if (item.gradeYear === 'preliminary') {
    return { label: '예비', suffix: '' };
  }
  const tc = getTypeConf(item.type);
  if (!tc) return { label: String(item.gradeYear), suffix: '학년도' };
  if (tc.displayMode === 'examYear') {
    return { label: `${item.examYear}년 ${item.month}월`, suffix: '' };
  }
  return { label: String(item.gradeYear), suffix: '학년도' };
}

// ── 탭별 educationGrades / educationOnly 필터 헬퍼 ──
// senior(고3)·junior(고2)·freshman(고1) 탭은 교육청 학평을 학년별로 분리.
// educationOnly: true 인 탭(고1/고2)은 평가원 데이터 제외.
function passesTabEduFilter(e, tabConf) {
  if (!tabConf) return true;
  if (tabConf.educationOnly && e.typeGroup !== 'education') return false;
  if (e.typeGroup === 'education' && Array.isArray(tabConf.educationGrades)) {
    if (!tabConf.educationGrades.includes(e.studentGrade)) return false;
  }
  return true;
}

// 다중 선택 매칭 헬퍼.
// stateVal: 'all' | string | array (다중 선택 시 [a,b,c])
// itemVal: 검사할 string
export function matchMulti(stateVal, itemVal) {
  if (stateVal === 'all' || stateVal == null) return true;
  if (Array.isArray(stateVal)) {
    return stateVal.length === 0 || stateVal.includes(String(itemVal));
  }
  return String(stateVal) === String(itemVal);
}

// 토글 helper — array에 추가/제거. 'all' 상태에서 새 값을 클릭하면 array 시작.
export function toggleMulti(stateKey, value) {
  const cur = state[stateKey];
  let arr;
  if (cur === 'all' || cur == null) arr = [String(value)];
  else if (Array.isArray(cur)) {
    if (cur.includes(String(value))) {
      arr = cur.filter(v => v !== String(value));
      if (arr.length === 0) { state[stateKey] = 'all'; return; }
    } else {
      arr = [...cur, String(value)];
    }
  } else {
    // 옛 single string 상태였을 때
    if (cur === String(value)) { state[stateKey] = 'all'; return; }
    arr = [cur, String(value)];
  }
  state[stateKey] = arr;
}

export function availableGradeYears() {
  const allowed = tabCurriculums();
  const tg = state.typeGroup;
  const tabConf = getTabConf(state.tab);
  return [...new Set(
    state.exams
      .filter(e => {
        if (!allowed.includes(e.curriculum)) return false;
        if (tg !== 'all' && e.typeGroup !== tg) return false;
        if (!passesTabEduFilter(e, tabConf)) return false;
        return true;
      })
      .map(e => e.gradeYear)
  )].sort((a, b) => gradeYearSortKey(b) - gradeYearSortKey(a));
}

// 논술 계열 버킷 — 문과(인문)/이과(자연) 필터용. 세부 트랙명을 키워드로 분류.
// 가이드북·보고서처럼 양 계열 통합 자료는 null (전체에서만 노출).
const ESSAY_NAT_RE = /자연|수리|수학|과학|물리|화학|생명|지구|의학|의약|의예|약학|공학|이학|창의인재/;
const ESSAY_HUM_RE = /인문|사회|상경|경영|경제|언어|국문|체능|문과|미래인재/;
export function essayTrack(sub) {
  if (!sub) return null;
  // 인문·자연 통합/전계열 자료는 계열 무관 → null('전체'에서만 노출).
  if (/통합|공통|전계열|인문.?자연|자연.?인문/.test(sub)) return null;
  // '사회과학'은 인문 계열 — NAT 정규식의 '과학' 오매칭을 막기 위해 먼저 분기.
  if (/사회과학|사회·과학/.test(sub)) return '인문';
  if (ESSAY_NAT_RE.test(sub)) return '자연';
  if (ESSAY_HUM_RE.test(sub)) return '인문';
  return null;
}

export function filtered() {
  const allowed = tabCurriculums();
  const tabConf = getTabConf(state.tab);
  const hasQuery = !!state.query;

  // query 있을 때는 score 계산 + score>0 필터, 없으면 score 생략(빠름)
  const scoreCache = hasQuery ? new WeakMap() : null;
  // 예비/예시 시험(prelim) — type=prelim 명시 선택 시에만 노출. type='all' 이면 숨김.
  const typeIsAll = state.type === 'all' || (Array.isArray(state.type) && state.type.length === 0);
  const items = state.exams.filter(e => {
    if (!allowed.includes(e.curriculum))                                       return false;
    if (!passesTabEduFilter(e, tabConf))                                       return false;
    if (state.typeGroup  !== 'all' && e.typeGroup  !== state.typeGroup)       return false;
    if (e.type === 'prelim' && typeIsAll) return false;   // 예비 분리 정책
    if (!matchMulti(state.type, e.type)) return false;
    if (!matchMulti(state.gradeYear, String(e.gradeYear))) return false;
    if (state.subject    !== 'all' && e.subject    !== state.subject)          return false;
    if (state.subSubject !== 'all') {
      // 논술은 계열 버킷(인문/자연) 필터 — 세부 트랙명('자연1 수학' 등)을 키워드로 분류
      if (e.typeGroup === 'essay' && (state.subSubject === '인문' || state.subSubject === '자연')) {
        if (essayTrack(e.subSubject) !== state.subSubject)                     return false;
      } else if (e.subSubject !== state.subSubject)                            return false;
    }
    if (hasQuery) {
      const s = scoreQuery(e, state.query);
      if (s === 0) return false;
      scoreCache.set(e, s);
    }
    return true;
  });

  // ── 정렬: 학년도(미래→과거, preliminary=2028) → month↓ → 영역(첫 curriculum 정의 순) → 소과목 ──
  // tabSubjects()는 dict 머지가 비싸므로 sort 시작 전에 한 번 캐시.
  const subjectsConf = tabSubjects();
  const subjectKeys = Object.keys(subjectsConf);
  const subjectIdx = new Map(subjectKeys.map((s, i) => [s, i]));
  // 영역별 subs 인덱스 캐시 (per-subject)
  const subSubsIdx = new Map();
  for (const [subj, conf] of Object.entries(subjectsConf)) {
    const subs = conf?.subs ?? [];
    subSubsIdx.set(subj, new Map(subs.map((s, i) => [s, i])));
  }
  const lookupOr999 = (m, v) => m.get(v) ?? 999;

  // 검색 쿼리 있을 때만 같은 questionUrl 카드 dedupe — 1999~2004 통합 시험지가 5개 영역 카드로 노출되어 검색 결과 노이즈가 됨.
  // 영역 필터·아카이브 일반 보기는 그대로 (필터·분류 본래 의도 유지).
  const dedupedItems = (() => {
    if (!hasQuery) return items;
    const seen = new Set();
    const out = [];
    for (const e of items) {
      const u = e.questionUrl;
      if (u && seen.has(u)) continue;
      if (u) seen.add(u);
      out.push(e);
    }
    return out;
  })();

  return dedupedItems.sort((a, b) => {
    // 1) 검색 점수 우선 (쿼리 있을 때)
    if (hasQuery) {
      const sa = scoreCache.get(a) ?? 0;
      const sb = scoreCache.get(b) ?? 0;
      // 0.05 이상 차이 시 점수 우선, 그 안쪽은 학년도/월 보조정렬
      if (Math.abs(sa - sb) > 0.05) return sb - sa;
    }
    // 2) 학년도(미래→과거)
    if (a.gradeYear !== b.gradeYear) {
      return gradeYearSortKey(b.gradeYear) - gradeYearSortKey(a.gradeYear);
    }
    if (a.month !== b.month) return b.month - a.month;
    const sa2 = lookupOr999(subjectIdx, a.subject);
    const sb2 = lookupOr999(subjectIdx, b.subject);
    if (sa2 !== sb2) return sa2 - sb2;
    const subsMap = subSubsIdx.get(a.subject) ?? new Map();
    return lookupOr999(subsMap, a.subSubject)
         - lookupOr999(subsMap, b.subSubject);
  });
}

export function subjectCounts() {
  const allowed = tabCurriculums();
  const tabConf = getTabConf(state.tab);
  const typeIsAll = state.type === 'all' || (Array.isArray(state.type) && state.type.length === 0);
  const base = state.exams.filter(e => {
    if (!allowed.includes(e.curriculum)) return false;
    if (!passesTabEduFilter(e, tabConf)) return false;
    if (state.typeGroup !== 'all' && e.typeGroup !== state.typeGroup) return false;
    if (e.type === 'prelim' && typeIsAll) return false;   // 예비 분리 정책 일관성
    if (!matchMulti(state.type, e.type)) return false;
    if (!matchMulti(state.gradeYear, String(e.gradeYear))) return false;
    if (state.query && !matchesQuery(e, state.query)) return false;
    return true;
  });
  const counts = {};
  for (const e of base) {
    counts[e.subject] = (counts[e.subject] ?? 0) + 1;
  }
  return counts;
}

// 사관학교: 국어=독서·문학(선택X), 수학만 선택과목 존재(시기별 분기), 영어 단일
function sagwanSubjectsByYear(gradeYear) {
  if (gradeYear >= 2022) {
    return { '국어': [], '수학': ['확률과통계', '미적분', '기하'], '영어': [] };
  }
  return   { '국어': [], '수학': ['가형', '나형'],                '영어': [] };
}

// 경찰대학: 자체 출제, 국·수·영 모두 단일 시험 (선택과목 없음)
function policeSubjectsByYear() {
  return { '국어': [], '수학': [], '영어': [] };
}

const SPECIAL_EXAMS = {
  '사관':   { typeGroup: 'military', type: 'military_annual', month: 7, getSubjects: sagwanSubjectsByYear },
  '경찰대': { typeGroup: 'police',   type: 'police_annual',   month: 7, getSubjects: policeSubjectsByYear },
};

export function buildMockData() {
  const items = [];
  let id = 1;

  for (const [currKey, conf] of Object.entries(CURRICULUM_CONFIG)) {
    if (SPECIAL_EXAMS[currKey]) continue;  // 사관·경찰대는 학년도별 분기 별도 처리

    const [minGY, maxGY] = conf.gradeYearRange;
    const gradeYears = [];
    for (let gy = maxGY; gy >= minGY; gy--) gradeYears.push(gy);

    for (const tgConf of EXAM_TYPE_CONFIG) {
      if (!conf.availableTypeGroups.includes(tgConf.groupKey)) continue;

      for (const typeConf of tgConf.types) {
        for (const gradeYear of gradeYears) {
          const examYear = gradeYear - 1;

          const allowedSubjects = conf.subjectsByTypeGroup[tgConf.groupKey];
          const subjectsToUse  = allowedSubjects
            ? Object.entries(conf.subjects).filter(([k]) => allowedSubjects.includes(k))
            : Object.entries(conf.subjects);

          for (const [subjKey, subjConf] of subjectsToUse) {
            // ── 팩트 기반 예외 처리 ──
            // 2009 개정: 한국사가 별도 필수영역으로 분리된 건 2017학년도부터
            if (currKey === '2009' && subjKey === '한국사' && gradeYear < 2017) continue;
            // MEET: 언어추론은 2012학년도까지만, 이후 한국어능력시험(KBS·TOKL)으로 대체
            if (currKey === 'MEET' && subjKey === '언어추론' && gradeYear > 2012) continue;

            const subsToAdd = subjConf.subs.length > 0 ? subjConf.subs : [null];
            for (const sub of subsToAdd) {
              items.push({
                id: id++,
                curriculum: currKey,
                gradeYear,
                examYear,
                month: typeConf.month,
                typeGroup: tgConf.groupKey,
                type: typeConf.key,
                subject: subjKey,
                subSubject: sub,
                questionUrl: null,
                answerUrl:   null,
                solutionUrl: null,
              });
            }
          }
        }
      }
    }
  }

  // ── 사관·경찰대 (학년도별 과목 셋 자동 분기) ──
  for (const [currKey, examConf] of Object.entries(SPECIAL_EXAMS)) {
    const conf = CURRICULUM_CONFIG[currKey];
    if (!conf) continue;
    const [minGY, maxGY] = conf.gradeYearRange;
    for (let gradeYear = maxGY; gradeYear >= minGY; gradeYear--) {
      const eraSubjects = examConf.getSubjects(gradeYear);
      for (const [subjKey, subs] of Object.entries(eraSubjects)) {
        const subsToAdd = subs.length > 0 ? subs : [null];
        for (const sub of subsToAdd) {
          items.push({
            id: id++,
            curriculum: currKey,
            gradeYear,
            examYear: gradeYear - 1,
            month: examConf.month,
            typeGroup: examConf.typeGroup,
            type: examConf.type,
            subject: subjKey,
            subSubject: sub,
            questionUrl: null, answerUrl: null, solutionUrl: null,
          });
        }
      }
    }
  }

  // ── LEET 예비시험 (2008.01.26 시행, 첫 정식 LEET 2008.08 직전) ──
  for (const subj of ['언어이해', '추리논증', '논술']) {
    items.push({
      id: id++,
      curriculum: 'LEET',
      gradeYear: 'preliminary',
      examYear: 2008,
      month: 1,
      typeGroup: 'leet',
      type: 'leet_annual',
      subject: subj,
      subSubject: null,
      questionUrl: null, answerUrl: null, solutionUrl: null,
    });
  }

  // MEET 예비시험은 자료 확인 불가하여 제외

  return items;
}
