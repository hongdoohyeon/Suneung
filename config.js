'use strict';

// 모든 시험: gradeYear = examYear + 1 (수능/LEET/MEET 동일 공식)
// 표시만 다름 — gradeYear 기준 "학년도", examYear 기준 "년 X월" (교육청)

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
      '영어':      { icon: '🌍', bg: '#e8f9ff', color: '#0077a8', subs: [] },
      '한국사':    { icon: '🏛️', bg: '#fdf4e8', color: '#a05c00', subs: [] },
      '사회탐구':  { icon: '🌏', bg: '#e8ffe8', color: '#2a7a2a',
                    subs: ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','경제','정치와법','사회·문화'] },
      '과학탐구':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe',
                    subs: ['물리학Ⅰ','물리학Ⅱ','화학Ⅰ','화학Ⅱ','생명과학Ⅰ','생명과학Ⅱ','지구과학Ⅰ','지구과학Ⅱ'] },
      '제2외국어': { icon: '🗣️', bg: '#fff5e8', color: '#b35a00',
                    subs: ['독일어Ⅰ','프랑스어Ⅰ','스페인어Ⅰ','중국어Ⅰ','일본어Ⅰ','러시아어Ⅰ','아랍어Ⅰ','베트남어Ⅰ','한문Ⅰ'] },
    },
    subjectsByTypeGroup: {
      education: ['국어','수학','영어','한국사'],
    },
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
      '영어':      { icon: '🌍', bg: '#e8f9ff', color: '#0077a8', subs: [] },
      '한국사':    { icon: '🏛️', bg: '#fdf4e8', color: '#a05c00', subs: [] },
      '사회탐구':  { icon: '🌏', bg: '#e8ffe8', color: '#2a7a2a',
                    subs: ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','법과정치','경제','사회·문화'] },
      '과학탐구':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe',
                    subs: ['물리Ⅰ','물리Ⅱ','화학Ⅰ','화학Ⅱ','생명과학Ⅰ','생명과학Ⅱ','지구과학Ⅰ','지구과학Ⅱ'] },
      '제2외국어': { icon: '🗣️', bg: '#fff5e8', color: '#b35a00',
                    subs: ['독일어Ⅰ','프랑스어Ⅰ','스페인어Ⅰ','중국어Ⅰ','일본어Ⅰ','러시아어Ⅰ','아랍어Ⅰ','한문Ⅰ'] },
    },
    subjectsByTypeGroup: {
      education: ['국어','수학','영어','한국사'],
    },
  },

  // ── 예비문제 (22/15/09 개정 예비시험 통합) ─────────────────
  // 학년도 칩으로 22(2028) / 15(2022) / 09(2014) 구분
  '예비': {
    id: '예비',
    label: '예비문제',
    rangeLabel: '평가원 예비시험 모음',
    gradeYearRange: [2014, 2028],
    availableTypeGroups: ['preliminary'],
    singleType: true,
    subjects: {
      '국어':      { icon: '📖', bg: '#fff0e8', color: '#c44b00',
                    subs: ['화법과작문', '언어와매체'] },
      '수학':      { icon: '📐', bg: '#eef2ff', color: '#1a4fd6',
                    subs: ['가형', '나형', '확률과통계', '미적분', '기하'] },
      '영어':      { icon: '🌍', bg: '#e8f9ff', color: '#0077a8', subs: [] },
      '한국사':    { icon: '🏛️', bg: '#fdf4e8', color: '#a05c00', subs: [] },
      '사회탐구':  { icon: '🌏', bg: '#e8ffe8', color: '#2a7a2a',
                    subs: ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','법과정치','정치와법','경제','사회·문화'] },
      '과학탐구':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe',
                    subs: ['물리Ⅰ','물리Ⅱ','물리학Ⅰ','물리학Ⅱ','화학Ⅰ','화학Ⅱ','생명과학Ⅰ','생명과학Ⅱ','지구과학Ⅰ','지구과학Ⅱ'] },
      '통합사회':  { icon: '🌏', bg: '#e8ffe8', color: '#2a7a2a', subs: [] },
      '통합과학':  { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe', subs: [] },
      '제2외국어': { icon: '🗣️', bg: '#fff5e8', color: '#b35a00',
                    subs: ['독일어Ⅰ','프랑스어Ⅰ','스페인어Ⅰ','중국어Ⅰ','일본어Ⅰ','러시아어Ⅰ','아랍어Ⅰ','베트남어Ⅰ','한문Ⅰ'] },
    },
    subjectsByTypeGroup: {},
  },

  // ── 사관학교 / 경찰대 (각 단일 탭) ─────────────────────────
  // 사관학교: 자체 출제. 국어=독서·문학(선택X), 수학만 선택과목 존재, 영어 단일
  '사관': {
    id: '사관',
    label: '사관학교',
    rangeLabel: '사관학교 1차 시험',
    gradeYearRange: [2014, 2026],
    availableTypeGroups: ['military'],
    singleType: true,
    subjects: {
      '국어': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '수학': { icon: '📐', bg: '#eef2ff', color: '#1a4fd6',
               subs: ['가형','나형','확률과통계','미적분','기하'] },
      '영어': { icon: '🌍', bg: '#e8f9ff', color: '#0077a8', subs: [] },
    },
    subjectsByTypeGroup: {},
  },

  // 경찰대: 자체 출제. 국·수·영 모두 단일 시험지 (선택과목 없음)
  '경찰대': {
    id: '경찰대',
    label: '경찰대학',
    rangeLabel: '경찰대학 1차 시험',
    gradeYearRange: [2014, 2026],
    availableTypeGroups: ['police'],
    singleType: true,
    subjects: {
      '국어': { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '수학': { icon: '📐', bg: '#eef2ff', color: '#1a4fd6', subs: [] },
      '영어': { icon: '🌍', bg: '#e8f9ff', color: '#0077a8', subs: [] },
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
      '논술':     { icon: '✍️', bg: '#e8f9ff', color: '#0077a8', subs: [] },
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
      '언어추론':       { icon: '📖', bg: '#fff0e8', color: '#c44b00', subs: [] },
      '자연과학추론Ⅰ': { icon: '🧬', bg: '#e8ffe8', color: '#2a7a2a', subs: [] },
      '자연과학추론Ⅱ': { icon: '🔬', bg: '#f0e8ff', color: '#6b2fbe', subs: [] },
    },
    subjectsByTypeGroup: {},
  },
};

export const EXAM_TYPE_CONFIG = [
  {
    groupKey: 'suneung',
    groupLabel: '평가원',
    groupColor: '#1a4fd6',
    groupBg: '#eef2ff',
    displayMode: 'gradeYear',
    types: [
      { key: 'csat', label: '수능',     month: 11, badgeBg: '#fff0e8', badgeColor: '#c44b00' },
      { key: 'june', label: '6월 모의', month:  6, badgeBg: '#e8f4ff', badgeColor: '#0062c4' },
      { key: 'sept', label: '9월 모의', month:  9, badgeBg: '#e8fff3', badgeColor: '#007a3d' },
    ],
  },
  {
    groupKey: 'education',
    groupLabel: '교육청',
    groupColor: '#6b2fbe',
    groupBg: '#f5f0ff',
    displayMode: 'examYear',
    types: [
      { key: 'mar', label: '3월 학력평가',  month:  3, badgeBg: '#f5f0ff', badgeColor: '#6b2fbe' },
      { key: 'apr', label: '4월 학력평가',  month:  4, badgeBg: '#f5f0ff', badgeColor: '#6b2fbe' },
      { key: 'jul', label: '7월 학력평가',  month:  7, badgeBg: '#f5f0ff', badgeColor: '#6b2fbe' },
      { key: 'oct', label: '10월 학력평가', month: 10, badgeBg: '#f5f0ff', badgeColor: '#6b2fbe' },
    ],
  },
  {
    groupKey: 'military',
    groupLabel: '사관학교',
    groupColor: '#a05c00',
    groupBg: '#fdf4e8',
    displayMode: 'gradeYear',
    types: [
      { key: 'military_annual', label: '1차 시험', month: 7, badgeBg: '#fdf4e8', badgeColor: '#a05c00' },
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
    groupKey: 'preliminary',
    groupLabel: '평가원 예비',
    groupColor: '#7c3aed',
    groupBg: '#f5f3ff',
    displayMode: 'gradeYear',
    types: [
      { key: 'prelim', label: '예비시험', month: 5, badgeBg: '#f5f3ff', badgeColor: '#7c3aed' },
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
