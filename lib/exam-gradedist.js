'use strict';
// 등급별 원점수 컷 표 렌더 — exam.html / exam-{id}.html 의 #gradeDistBody 에 주입.

import { $ } from './dom.js?v=340ff5f6b518f0ca1824';

// 등급별 원점수·표준점수·백분위·누적 표 — scripts/build-data.py grade_table_html() 과 같은 형식.
// 값은 .spoil-val 로 감싸 스포일러 방지 시 흐리게 표시된다.
export function gradeDistTable(cut, absolute) {
  const cols = [['원점수', cut.rawCuts || [], '']];
  // 범위를 벗어난 값이 섞인 열(원천 데이터 오류)은 통째로 뺀다 — build-data.py clean_cut_series 와 동일
  for (const [key, label, unit, lo, hi] of [['standardCuts', '표준점수', '', 1, 200], ['standardPercentile', '백분위', '', 0, 100], ['cumulativePercent', '누적', '%', 0, 100]]) {
    const vals = cut[key];
    const ok = Array.isArray(vals) && vals.some(v => v != null) && vals.every(v => v == null || (typeof v === 'number' && v >= lo && v <= hi));
    if (!absolute && ok) cols.push([label, vals, unit]);
  }
  const n = Math.min(9, Math.max(...cols.map(([, v]) => v.length)));
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (cols.every(([, v]) => v[i] == null)) continue;
    const tds = cols.map(([, v, unit], j) => v[i] == null ? '<td>—</td>' : `<td${j > 1 ? ' class="is-muted"' : ''}>${v[i]}${unit}</td>`).join('');
    rows.push(`<tr><td>${i + 1}</td>${tds}</tr>`);
  }
  const note = cut.rawCutBasis === 'academy_reverse_calculated' ? '입시기관 역산값'
    : cut.rawCutBasis === 'academy_integerized_threshold' ? '입시기관 추정 정수 경계'
    : cut.rawCutBasis === 'academy_consensus_estimate' ? '공식 표준점수 컷 기준 입시기관 추정 종합' : '';
  const legend = ['등급별 컷', absolute ? '절대평가' : '', note, cut.fullScore ? `만점 ${cut.fullScore}점` : ''].filter(Boolean).join(' · ');
  return `<table class="grade-table"><thead><tr><th scope="col">등급</th>${cols.map(([l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
    <tbody${absolute ? '' : ' class="spoil-val"'}>${rows.join('')}</tbody></table><p class="grade-table__legend">${legend}</p>`;
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

  const reverseCalculated = cut.rawCutBasis === 'academy_reverse_calculated';
  const integerizedThreshold = cut.rawCutBasis === 'academy_integerized_threshold';
  const consensus = cut.rawCutBasis === 'academy_consensus_estimate';
  // 1등급 컷 값은 스포일러라 머리글 힌트에는 쓰지 않는다
  if (hint) hint.textContent = reverseCalculated ? '입시기관 역산값' : integerizedThreshold ? '추정 경계' : consensus ? '입시기관 추정' : '';
  if (body.querySelector('.grade-table')) return cut;   // SSG 표 유지
  body.innerHTML = gradeDistTable(cut, !!cut.absolute);
  return cut;
}
