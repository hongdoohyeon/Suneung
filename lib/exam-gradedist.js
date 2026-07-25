'use strict';
// 등급별 원점수 컷 표 렌더 — exam.html / exam-{id}.html 의 #gradeDistBody 에 주입.

import { $ } from './dom.js';

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// 등급별 원점수 컷 HTML 표 — rawCuts[i] 는 (i+1)등급 컷.
// 절대평가는 rawCuts 길이가 9 미만일 수 있어 부족분은 '—' 채움.
export function gradeDistTable(rawCuts, fullScore, absolute, estimated = false) {
  const head = GRADES.map(g =>
    `<th class="grade-table__h grade-table__h--g${g}" scope="col">${g}</th>`
  ).join('');

  const body = GRADES.map((_, i) => {
    const v = rawCuts[i];
    const cell = (v == null) ? '—' : v;
    return `<td class="grade-table__c grade-table__c--g${i + 1}">${cell}</td>`;
  }).join('');

  const caption = absolute
    ? `등급별 원점수 컷 · 절대평가${fullScore ? ` · 만점 ${fullScore}점` : ''}`
    : `등급별 원점수 컷${estimated ? ' · 7개 기관 예상컷 평균' : ''}${fullScore ? ` · 만점 ${fullScore}점` : ''}`;

  return `
    <table class="grade-table" role="table" aria-label="등급별 원점수 컷">
      <thead>
        <tr><th class="grade-table__corner" scope="col">등급</th>${head}</tr>
      </thead>
      <tbody>
        <tr><th class="grade-table__corner" scope="row">컷</th>${body}</tr>
      </tbody>
    </table>
    <p class="grade-table__legend">${caption}</p>
  `;
}

// 등급 분포 카드 본문 렌더 — 등급컷 표만.
// 반환값: 등급컷이 있어 표를 렌더했으면 cut 객체, 없으면 null.
export function renderGradeDist(exam, allCuts) {
  const body = $('gradeDistBody');
  const hint = $('gradeDistHint');

  const matchBase = c =>
    c.curriculum === exam.curriculum &&
    String(c.gradeYear) === String(exam.gradeYear) &&
    c.type === exam.type &&
    c.subject === exam.subject &&
    (c.subSubject ?? null) === (exam.subSubject ?? null);
  // 학평(education)은 고1/고2/고3 컷이 다르므로 학년(studentGrade) 정확매칭을 우선하고,
  // 학년별 컷이 없으면 학년무관(studentGrade=null) 컷만 폴백한다 — 다른 학년 컷으로는
  // 폴백하지 않는다(타학년 등급컷을 자기 컷처럼 오노출하는 것 방지). 수능 등은 5요소 매칭.
  const cut = exam.typeGroup === 'education'
    ? (allCuts.find(c => matchBase(c) && (c.studentGrade ?? null) === (exam.studentGrade ?? null))
       || allCuts.find(c => matchBase(c) && (c.studentGrade ?? null) === null))
    : allCuts.find(matchBase);
  const hasRaw = cut && Array.isArray(cut.rawCuts) && cut.rawCuts.some(v => v != null);
  if (!hasRaw) {
    const officialRawUnavailable = cut?.rawCutStatus === 'official_raw_unavailable';
    if (hint) hint.textContent = officialRawUnavailable ? '공식 원점수 컷 없음' : '준비 중';
    body.innerHTML = officialRawUnavailable
      ? `<p class="exam-card__sub">선택과목 조정으로 단일 공식 원점수 컷이 없어 추정값은 표시하지 않아요.</p>`
      : `<p class="exam-card__sub">이 시험의 원점수 등급컷 데이터가 아직 없어요.</p>`;
    return null;
  }

  if (hint) hint.textContent = `1등급 ${cut.rawCutsEstimated ? '예상컷 평균 ' : '컷 '}${cut.rawCuts[0]}점${cut.absolute ? ' · 절대평가' : ''}`;
  body.innerHTML = gradeDistTable(cut.rawCuts, cut.fullScore ?? 100, !!cut.absolute, cut.rawCutsEstimated === true);
  return cut;
}
