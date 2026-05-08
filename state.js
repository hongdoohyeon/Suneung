'use strict';
import {
  CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, TAB_CONFIG,
  getTypeConf, getTabConf, prettySub, searchAliasOf,
} from './config.js?v=20260508i';

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
    .replace(/일\s*학년/g, '고1')
    .replace(/이\s*학년/g, '고2')
    .replace(/삼\s*학년/g, '고3');
}
const normQ = s => fold(s).replace(/\s+/g, '');

// 사용자 query 를 토큰(공백/쉼표/슬래시 단위)으로 분해.
// 각 토큰은 매칭 단계에서 다시 (숫자)↔(한글/영문) 경계로 분해될 수 있음 (matchToken 참고).
function tokenize(query) {
  return fold(query)
    .replace(/[,\/]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(c => c.replace(/\s+/g, ''));
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
  if (e.gradeYear) {
    const gy = String(e.gradeYear);
    items.push(gy, `${gy}학년도`, gy.slice(-2));
  }
  if (e.examYear) {
    const ey = String(e.examYear);
    items.push(ey, `${ey}년`, ey.slice(-2));
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

  return normQ(items.filter(Boolean).join(' '));
}

function getHay(e) {
  let h = _hayCache.get(e);
  if (h === undefined) { h = buildHay(e); _hayCache.set(e, h); }
  return h;
}

// 단일 토큰이 hay 와 매칭되는지.
// 시도 순서: 1) 직접 substring  2) alias 결과 중 하나가 substring
//             3) 토큰을 (숫자)/(한글·영문) 단위로 분해 → 분해된 sub-part 가 모두 (1)/(2) 만족
//   "25수능" → 분해 ["25","수능"] → 둘 다 hay 안에 있어야 통과.
function matchToken(hay, tok) {
  const t = normQ(tok);
  if (!t) return true;
  if (hay.includes(t)) return true;
  const aliases = searchAliasOf(t);
  if (aliases && aliases.some(a => hay.includes(normQ(a)))) return true;

  const parts = t.match(/[\d]+|[가-힣a-z]+/g);
  if (parts && parts.length > 1) {
    return parts.every(p => {
      if (hay.includes(p)) return true;
      const al = searchAliasOf(p);
      return al ? al.some(a => hay.includes(normQ(a))) : false;
    });
  }
  return false;
}

// AND 매칭 — 모든 토큰이 통과해야 함.
function matchesQuery(e, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const hay = getHay(e);
  return tokens.every(tok => matchToken(hay, tok));
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

export function filtered() {
  const allowed = tabCurriculums();
  const tabConf = getTabConf(state.tab);

  const items = state.exams.filter(e => {
    if (!allowed.includes(e.curriculum))                                       return false;
    if (!passesTabEduFilter(e, tabConf))                                       return false;
    if (state.typeGroup  !== 'all' && e.typeGroup  !== state.typeGroup)       return false;
    if (!matchMulti(state.type, e.type)) return false;
    if (!matchMulti(state.gradeYear, String(e.gradeYear))) return false;
    if (state.subject    !== 'all' && e.subject    !== state.subject)          return false;
    if (state.subSubject !== 'all' && e.subSubject !== state.subSubject)       return false;
    if (state.query && !matchesQuery(e, state.query)) return false;
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

  return items.sort((a, b) => {
    if (a.gradeYear !== b.gradeYear) {
      return gradeYearSortKey(b.gradeYear) - gradeYearSortKey(a.gradeYear);
    }
    if (a.month !== b.month) return b.month - a.month;
    const sa = lookupOr999(subjectIdx, a.subject);
    const sb = lookupOr999(subjectIdx, b.subject);
    if (sa !== sb) return sa - sb;
    const subsMap = subSubsIdx.get(a.subject) ?? new Map();
    return lookupOr999(subsMap, a.subSubject)
         - lookupOr999(subsMap, b.subSubject);
  });
}

export function subjectCounts() {
  const allowed = tabCurriculums();
  const tabConf = getTabConf(state.tab);
  const base = state.exams.filter(e => {
    if (!allowed.includes(e.curriculum)) return false;
    if (!passesTabEduFilter(e, tabConf)) return false;
    if (state.typeGroup !== 'all' && e.typeGroup !== state.typeGroup) return false;
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
