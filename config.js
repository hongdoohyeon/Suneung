'use strict';

// 모든 시험: gradeYear = examYear + 1 (수능/LEET/MEET 동일 공식)
// 표시만 다름 — gradeYear 기준 "학년도", examYear 기준 "년 X월" (교육청)

// ╔══════════════════════════════════════════════════════════
// ║  TAB_CONFIG — archive 페이지 카테고리 탭 (8개)
// ║  탭 = "사용자가 인지하는 카테고리" (예: 고3, 사관·경찰)
// ║  curriculum = 데이터 단위 (2015 개정, 2009 개정, 사관, 경찰대 등)
// ║  한 탭이 여러 curriculum을 묶을 수 있음.
// ╚══════════════════════════════════════════════════════════
export const TAB_CONFIG = [
  // ── 데이터 있는 탭 ──────────────────────────────────────
  // senior 탭: 평가원(전 학년) + 교육청 고3 학평만 표시 (educationGrades:[3])
  { key: 'senior',     label: '고3',       sub: '수능·평가원·학평',
    curriculums: ['2015', '2009', '예비'], educationGrades: [3] },
  { key: 'mp',         label: '사관·경찰', sub: '1차 시험',         curriculums: ['사관', '경찰대'] },
  { key: 'gradschool', label: 'LEET·MEET', sub: '전문대학원',       curriculums: ['LEET', 'MEET'] },
  // 고1·고2: 교육청 학평만 (typeGroup=education, studentGrade=2/1)
  { key: 'junior',     label: '고2',       sub: '학력평가',
    curriculums: ['2015', '2009'], educationGrades: [2], educationOnly: true },
  { key: 'freshman',   label: '고1',       sub: '학력평가',
    curriculums: ['2015', '2009'], educationGrades: [1], educationOnly: true },
  // ── 빈 탭 (데이터 채워지면 placeholder 해제) ───────────
  { key: 'ged',        label: '검정고시',  sub: '준비 중',  curriculums: [], placeholder: true },
  { key: 'essay',      label: '논술',      sub: '준비 중',  curriculums: [], placeholder: true },
  { key: 'admissions', label: '입시자료',  sub: '준비 중',  curriculums: [], placeholder: true },
];

export function getTabConf(tabKey) {
  return TAB_CONFIG.find(t => t.key === tabKey) ?? null;
}

// 옛 URL 파라미터 (?tab=2015 등) 호환 — curriculum 키가 들어오면 새 탭으로 매핑
const LEGACY_CURRICULUM_TO_TAB = {
  '2015': 'senior', '2009': 'senior', '예비': 'senior',
  '사관': 'mp', '경찰대': 'mp',
  'LEET': 'gradschool', 'MEET': 'gradschool',
};
export function legacyTabKey(maybeOld) {
  return LEGACY_CURRICULUM_TO_TAB[maybeOld] ?? maybeOld;
}

export const CURRICULUM_CONFIG = {
  '2015': {
    id: '2015',
    label: '2015 개정',
    rangeLabel: '2022~2027학년도',
    gradeYearRange: [2022, 2027],
    availableTypeGroups: ['suneung', 'education'],
    subjects: {
      '국어':      { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: ['화법과작문', '언어와매체'] },
      '수학':      { icon: '📐', bg: '#eef2ff', color: '#1a4fd6', subs: ['확률과통계', '미적분', '기하'] },
      '영어':      { icon: '🌍', bg: '#e6f5fb', color: '#0077a8', subs: [] },
      '한국사':    { icon: '🏛️', bg: '#fdf3e7', color: '#8f5610', subs: [] },
      '과학탐구':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe',
                    subs: ['물리학Ⅰ','화학Ⅰ','생명과학Ⅰ','지구과학Ⅰ','물리학Ⅱ','화학Ⅱ','생명과학Ⅱ','지구과학Ⅱ'] },
      '사회탐구':  { icon: '🌏', bg: '#ecf5e8', color: '#2a7a2a',
                    subs: ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','경제','정치와법','사회·문화'] },
    },
    subjectsByTypeGroup: {},
  },

  '2009': {
    id: '2009',
    label: '2009 개정',
    rangeLabel: '2014~2021학년도',
    gradeYearRange: [2014, 2021],
    availableTypeGroups: ['suneung', 'education'],
    subjects: {
      '국어':      { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '수학':      { icon: '📐', bg: '#eef2ff', color: '#1a4fd6', subs: ['가형', '나형'] },
      '영어':      { icon: '🌍', bg: '#e6f5fb', color: '#0077a8', subs: [] },
      '한국사':    { icon: '🏛️', bg: '#fdf3e7', color: '#8f5610', subs: [] },
      '과학탐구':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe',
                    subs: ['물리Ⅰ','화학Ⅰ','생명과학Ⅰ','지구과학Ⅰ','물리Ⅱ','화학Ⅱ','생명과학Ⅱ','지구과학Ⅱ'] },
      '사회탐구':  { icon: '🌏', bg: '#ecf5e8', color: '#2a7a2a',
                    subs: ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','법과정치','경제','사회·문화'] },
    },
    subjectsByTypeGroup: {},
  },

  // ── 28학년도 예비 (2022 개정 평가원 예시문항) ──────────────
  // 평가원 2025.04.15 공개 예시문항: 국어 / 수학 / 통합사회 / 통합과학 4개 영역
  // typeGroup 은 '평가원'(suneung) — 예비도 평가원 출제이므로 같은 그룹에 흡수.
  '예비': {
    id: '예비',
    label: '28학년도 예비',
    rangeLabel: '2022 개정 · 평가원 예시문항',
    gradeYearRange: [2028, 2028],
    availableTypeGroups: ['suneung'],
    singleType: false,
    subjects: {
      '국어':      { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '수학':      { icon: '📐', bg: '#eef2ff', color: '#1a4fd6', subs: [] },
      '통합과학':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe', subs: [] },
      '통합사회':  { icon: '🌏', bg: '#ecf5e8', color: '#2a7a2a', subs: [] },
    },
    subjectsByTypeGroup: {},
  },

  // ── 사관학교 / 경찰대 (각 단일 탭) ─────────────────────────
  // 사관학교: 자체 출제. 국어=독서·문학(선택X), 수학만 선택과목 존재, 영어 단일
  '사관': {
    id: '사관',
    label: '사관학교',
    rangeLabel: '사관학교 1차 시험',
    gradeYearRange: [2006, 2026],
    availableTypeGroups: ['military'],
    singleType: true,
    subjects: {
      // 09개정 09~16학년도엔 국어 A/B형 분리, 17학년도부터 통합 (subSubject=null)
      '국어': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: ['A형','B형'] },
      '수학': { icon: '📐', bg: '#eef2ff', color: '#1a4fd6',
               subs: ['A형','B형','가형','나형','확률과통계','미적분','기하'] },
      // 영어 색상은 평가원/교육청과 통일
      '영어': { icon: '🌍', bg: '#e6f5fb', color: '#0077a8', subs: [] },
    },
    subjectsByTypeGroup: {},
  },

  // 경찰대: 자체 출제. 국·수·영 모두 단일 시험지 (선택과목 없음)
  '경찰대': {
    id: '경찰대',
    label: '경찰대학',
    rangeLabel: '경찰대학 1차 시험',
    gradeYearRange: [2007, 2026],
    availableTypeGroups: ['police'],
    singleType: true,
    subjects: {
      '국어': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '수학': { icon: '📐', bg: '#eef2ff', color: '#1a4fd6', subs: [] },
      // 영어 색상은 평가원/교육청과 통일
      '영어': { icon: '🌍', bg: '#e6f5fb', color: '#0077a8', subs: [] },
    },
    subjectsByTypeGroup: {},
  },

  // ── 리트 (LEET) ──────────────────────────────────────────
  // 첫 시행: 2008.08.24 → 2009학년도 LEET / 가장 최근: 2025.07 → 2026학년도
  'LEET': {
    id: 'LEET',
    label: '리트 (LEET)',
    rangeLabel: '법학적성시험',
    gradeYearRange: [2009, 2026],
    availableTypeGroups: ['leet'],
    singleType: true,
    subjects: {
      '언어이해': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '추리논증': { icon: '🧩', bg: '#eef2ff', color: '#1a4fd6', subs: [] },
      '논술':     { icon: '✍️', bg: '#e6f5fb', color: '#0077a8', subs: [] },
      // 2008.01 예비시험에만 출제된 도입 문항 (이후 본시험에는 미사용)
      '도입':     { icon: '🪧', bg: '#f5f3ff', color: '#7c3aed', subs: [] },
    },
    subjectsByTypeGroup: {},
  },

  // ── 미트 (MEET) ──────────────────────────────────────────
  // 첫 시행: 2004.08 → 2005학년도 / 의전원 사실상 폐지로 2016학년도가 마지막
  // 영역: 언어추론(~2012학년도, 이후 한국어능력시험 대체) · 자연과학추론Ⅰ(생물) · 자연과학추론Ⅱ(화학·물리)
  'MEET': {
    id: 'MEET',
    label: '미트 (MEET)',
    rangeLabel: '의·치의학교육입문검사',
    gradeYearRange: [2005, 2016],
    availableTypeGroups: ['meet'],
    singleType: true,
    subjects: {
      '언어추론': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
    },
    subjectsByTypeGroup: {},
  },
};

export const EXAM_TYPE_CONFIG = [
  // ── 색 팔레트 원칙 ──────────────────────────────────────
  // (1) 같은 그룹의 모든 type 배지는 같은 색. 라벨이 구분 담당.
  // (2) 평가원 그룹 = 사이트 액센트 (#0066cc) 와 정렬 — 메인 평가의 위계.
  // (3) 영역색과 hue 충돌 회피: 교육청 = 슬레이트 (보라X), 사관 = 다크 브론즈 (한국사와 분리).
  {
    groupKey: 'suneung',
    groupLabel: '평가원',
    groupColor: '#0066cc',
    groupBg: '#e6f0fa',
    displayMode: 'gradeYear',
    types: [
      { key: 'csat',   label: '수능',     month: 11, badgeBg: '#e6f0fa', badgeColor: '#0066cc' },
      { key: 'june',   label: '6월 모의', month:  6, badgeBg: '#e6f0fa', badgeColor: '#0066cc' },
      { key: 'sept',   label: '9월 모의', month:  9, badgeBg: '#e6f0fa', badgeColor: '#0066cc' },
      { key: 'prelim', label: '예비시험', month:  5, badgeBg: '#e6f0fa', badgeColor: '#0066cc' },
    ],
  },
  {
    groupKey: 'education',
    groupLabel: '교육청',
    groupColor: '#475569',
    groupBg: '#eef1f4',
    displayMode: 'examYear',
    types: [
      // shortLabel: 좁은 사이드바 칩에서만 사용, 카드/태그 등 본문에는 label 그대로
      { key: 'mar', label: '3월 학력평가',  shortLabel: '3월',  month:  3, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'apr', label: '4월 학력평가',  shortLabel: '4월',  month:  4, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'jun', label: '6월 학력평가',  shortLabel: '6월',  month:  6, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'jul', label: '7월 학력평가',  shortLabel: '7월',  month:  7, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'sep', label: '9월 학력평가',  shortLabel: '9월',  month:  9, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'oct', label: '10월 학력평가', shortLabel: '10월', month: 10, badgeBg: '#eef1f4', badgeColor: '#475569' },
      { key: 'nov', label: '11월 학력평가', shortLabel: '11월', month: 11, badgeBg: '#eef1f4', badgeColor: '#475569' },
    ],
  },
  {
    groupKey: 'military',
    groupLabel: '사관학교',
    groupColor: '#6b4220',
    groupBg: '#efe9df',
    displayMode: 'gradeYear',
    types: [
      { key: 'military_annual', label: '1차 시험', month: 7, badgeBg: '#efe9df', badgeColor: '#6b4220' },
    ],
  },
  {
    groupKey: 'police',
    groupLabel: '경찰대학',
    groupColor: '#0c4a6e',
    groupBg: '#e0f2fe',
    displayMode: 'gradeYear',
    types: [
      { key: 'police_annual', label: '1차 시험', month: 7, badgeBg: '#e0f2fe', badgeColor: '#0c4a6e' },
    ],
  },
  {
    groupKey: 'leet',
    groupLabel: 'LEET',
    groupColor: '#0e7490',
    groupBg: '#ecfeff',
    displayMode: 'gradeYear',
    types: [
      { key: 'leet_annual', label: '본시험', month: 7, badgeBg: '#ecfeff', badgeColor: '#0e7490' },
    ],
  },
  {
    groupKey: 'meet',
    groupLabel: 'MEET',
    groupColor: '#059669',
    groupBg: '#ecfdf5',
    displayMode: 'gradeYear',
    types: [
      { key: 'meet_annual', label: '본시험', month: 8, badgeBg: '#ecfdf5', badgeColor: '#059669' },
    ],
  },
];

export function getTypeConf(typeKey) {
  for (const g of EXAM_TYPE_CONFIG) {
    for (const t of g.types) {
      if (t.key === typeKey) return { ...t, groupKey: g.groupKey, groupLabel: g.groupLabel, displayMode: g.displayMode };
    }
  }
  return null;
}

export function getGroupConf(groupKey) {
  return EXAM_TYPE_CONFIG.find(g => g.groupKey === groupKey) ?? null;
}

// ── 표시용 라벨: 데이터 키는 붙여쓰기 유지, 화면에 보일 때만 띄어쓰기 ──
const SUB_LABEL = {
  '화법과작문': '화법과 작문',
  '언어와매체': '언어와 매체',
  '확률과통계': '확률과 통계',
  '생활과윤리': '생활과 윤리',
  '윤리와사상': '윤리와 사상',
  '정치와법':   '정치와 법',
  '법과정치':   '법과 정치',
};

export function prettySub(key) {
  if (key == null) return '';
  return SUB_LABEL[key] ?? key;
}

// 검색 별칭: 사용자 축약 → 실제 데이터 키 (정확 일치일 때만 확장)
const SEARCH_ALIASES = {
  '6모': ['6월', '6월모의평가'],
  '육모': ['6월', '6월모의평가'],
  '9모': ['9월', '9월모의평가'],
  '구모': ['9월', '9월모의평가'],
  '6평': ['6월', '6월모의평가'],
  '9평': ['9월', '9월모의평가'],
  '수능': ['대학수학능력시험', '수능'],
  '학평': ['학력평가', '학평'],
  '학력평가': ['학력평가', '학평'],
  '3월': ['3월 학력평가'],
  '4월': ['4월 학력평가'],
  '7월': ['7월 학력평가'],
  '10월': ['10월 학력평가'],
  '11월': ['11월 학력평가'],
  '화작': ['화법과작문', '화법과 작문'],
  '언매': ['언어와매체', '언어와 매체'],
  '확통': ['확률과통계', '확률과 통계'],
  '미적': ['미적분'],
  '기벡': ['기하'],
  '리트': ['LEET', '법학적성시험'],
  'leet': ['LEET', '법학적성시험'],
  '사관': ['사관학교'],
  '경찰': ['경찰대'],
  '경찰대': ['경찰대'],
  '생윤': ['생활과윤리'],
  '윤사': ['윤리와사상'],
  '정법': ['정치와법', '법과정치'],
  '사문': ['사회·문화'],
  '한지': ['한국지리'],
  '세지': ['세계지리'],
  '세사': ['세계사'],
  '한사': ['한국사'],
  '고1': ['고1', '학력평가'],
  '고2': ['고2', '학력평가'],
  '고3': ['고3'],
};

export function searchAliasOf(normalizedQ) {
  return SEARCH_ALIASES[normalizedQ] ?? null;
}
