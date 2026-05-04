'use strict';
// 표시·라벨 공통 포매터.
// displayYear / typeLabelNoMonth 가 3+곳에 복제돼 있던 것을 단일화.

import { getTypeConf } from '../config.js';

// 시험 항목의 학년도 라벨. examYear 모드(학평)는 "2026년 3월" / 일반은 "2027학년도".
export function displayYear(item) {
  if (item.gradeYear === 'preliminary') return { label: '예비시험', suffix: '' };
  const tc = getTypeConf(item.type);
  if (tc?.displayMode === 'examYear') {
    return { label: `${item.examYear}년 ${item.month}월`, suffix: '' };
  }
  return { label: String(item.gradeYear), suffix: '학년도' };
}

// tc.label 이 "3월 학력평가" 처럼 month 포함이면 — examYear 모드일 때 중복되므로
// leading "N월 " prefix 제거. "학력평가" 만 반환.
export function typeLabelNoMonth(tc) {
  if (!tc) return '';
  return (tc.label ?? '').replace(/^\d+월\s*/, '');
}

// 시험 항목 + 옵션으로 회차 라벨을 만든다.
// "2027학년도 수능 · 국어(화법과작문)" 같이.
export function buildHeadLabel(item, { withSubject = true } = {}) {
  const tc = getTypeConf(item.type);
  const dy = displayYear(item);
  const isPrelim = item.gradeYear === 'preliminary';
  const typeLbl = tc?.displayMode === 'examYear' ? typeLabelNoMonth(tc) : (tc?.label ?? '');
  const head = isPrelim
    ? '예비시험'
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${typeLbl}`
        : `${dy.label}${dy.suffix} ${typeLbl}`);
  if (!withSubject) return head;
  const subject = item.subSubject ? `${item.subject}(${item.subSubject})` : item.subject;
  return `${head} · ${subject}`;
}
