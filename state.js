'use strict';
import { CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, getTypeConf } from './config.js';

export const state = {
  exams:    [],
  loading:  true,

  curriculum: '2015',

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

export function currConf() {
  return CURRICULUM_CONFIG[state.curriculum];
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

export function availableGradeYears() {
  const curr = state.curriculum;
  const tg   = state.typeGroup;
  return [...new Set(
    state.exams
      .filter(e => {
        if (e.curriculum !== curr) return false;
        if (tg !== 'all' && e.typeGroup !== tg) return false;
        return true;
      })
      .map(e => e.gradeYear)
  )].sort((a, b) => {
    if (a === 'preliminary') return -1;
    if (b === 'preliminary') return 1;
    return Number(b) - Number(a);
  });
}

export function filtered() {
  const items = state.exams.filter(e => {
    if (e.curriculum !== state.curriculum)                                    return false;
    if (state.typeGroup  !== 'all' && e.typeGroup  !== state.typeGroup)       return false;
    if (state.type       !== 'all' && e.type       !== state.type)            return false;
    if (state.gradeYear  !== 'all' && String(e.gradeYear) !== state.gradeYear) return false;
    if (state.subject    !== 'all' && e.subject    !== state.subject)          return false;
    if (state.subSubject !== 'all' && e.subSubject !== state.subSubject)       return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const tc = getTypeConf(e.type);
      const hay = [e.subject, e.subSubject, String(e.gradeYear), String(e.examYear), tc?.label, tc?.groupLabel]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // ── 정렬: config.js 의 subjects/subs 순서가 곧 진실 ──
  // 학년도↓ → month↓ → 영역(config 정의 순) → 소과목(config 정의 순)
  const conf = currConf();
  const subjectKeys = Object.keys(conf.subjects);
  const idxOrLast = (arr, v) => {
    const i = arr.indexOf(v);
    return i === -1 ? 999 : i;
  };

  return items.sort((a, b) => {
    // 학년도: 'preliminary' 최상단, 그 외 숫자 desc
    if (a.gradeYear !== b.gradeYear) {
      if (a.gradeYear === 'preliminary') return -1;
      if (b.gradeYear === 'preliminary') return 1;
      return Number(b.gradeYear) - Number(a.gradeYear);
    }
    if (a.month !== b.month) return b.month - a.month;
    const sa = idxOrLast(subjectKeys, a.subject);
    const sb = idxOrLast(subjectKeys, b.subject);
    if (sa !== sb) return sa - sb;
    const subs = conf.subjects[a.subject]?.subs ?? [];
    return idxOrLast(subs, a.subSubject) - idxOrLast(subs, b.subSubject);
  });
}

export function subjectCounts() {
  const base = state.exams.filter(e => {
    if (e.curriculum !== state.curriculum) return false;
    if (state.typeGroup !== 'all' && e.typeGroup !== state.typeGroup) return false;
    if (state.type      !== 'all' && e.type      !== state.type)      return false;
    if (state.gradeYear !== 'all' && String(e.gradeYear) !== state.gradeYear) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const tc = getTypeConf(e.type);
      const hay = [e.subject, e.subSubject, String(e.gradeYear), String(e.examYear), tc?.label, tc?.groupLabel]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
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
