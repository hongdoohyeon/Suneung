import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { state, resetFilters, filtered } from '../state.js';
import { CURRICULUM_CONFIG } from '../config.js';

const exams = JSON.parse(readFileSync(new URL('../data/exams.json', import.meta.url)));
test('수록된 논술 대학 모두를 필터에서 선택할 수 있다', () => {
  for (const exam of exams.filter(e => e.typeGroup === 'essay')) {
    assert.ok(CURRICULUM_CONFIG['논술'].subjects[exam.subject], exam.subject);
  }
});
function search(query, tab = 'senior') {
  resetFilters();
  state.tab = tab;
  state.exams = exams;
  state.query = query;
  return filtered();
}

test('국어 검색은 제2외국어를 포함하지 않는다', () => {
  for (const query of ['27 9월 국어', '2026년 9월 국어', '27 9월 "국어"']) {
    assert.deepEqual(search(query).map(e => e.id).sort(), [12733, 12734]);
  }
});
test('과탐 I/II 표기와 숫자 표기가 같은 과목을 찾는다', () => {
  for (const [roman, number] of [['I', '1'], ['II', '2']]) {
    const expected = search(`27 9월 화학${number}`).map(e => e.id);
    assert.equal(expected.length, 1);
    assert.deepEqual(search(`27 9월 화학${roman}`).map(e => e.id), expected);
  }
});
test('수학 선택과목과 영어 검색을 유지한다', () => {
  assert.equal(search('27 9월 수학').length, 3);
  assert.equal(search('27 9월 영어')[0].id, 12738);
  assert.equal(search('27 9월 화법과작문')[0].id, 12733);
});
test('전체 검색에서 논술과 고1 시험을 찾는다', () => {
  const essay = search('연세대 논술', 'all');
  assert.ok(essay.length > 0);
  assert.ok(essay.every(e => e.typeGroup === 'essay' && e.subject.includes('연세')));
  assert.ok(search('연세대 논술 수학', 'all').length > 0);
  const freshman = search('고1 영어', 'all');
  assert.ok(freshman.length > 0);
  assert.ok(freshman.every(e => e.studentGrade === 1 && e.subject === '영어'));
});
test('제외어만 있어도 적용하며 국어 제외는 제2외국어를 제외하지 않는다', () => {
  const results = search('-국어');
  assert.ok(results.length > 0);
  assert.ok(results.every(e => e.subject !== '국어'));
  assert.ok(results.some(e => e.subject === '제2외국어'));
});
test('학년도 뒤에 숫자만 적은 달을 회차로 읽는다', () => {
  for (const [short, full] of [['25 6', '25 6모'], ['24 9', '24 9모'], ['25 11', '25 수능'], ['25 6 국어', '25 6모 국어']]) {
    const expected = search(full).map(e => e.id);
    assert.ok(expected.length > 0, full);
    assert.deepEqual(search(short).map(e => e.id), expected, short);
  }
});
test('줄임말 검색에 오타 보정 결과가 섞이지 않는다', () => {
  assert.ok(search('사문').every(e => e.subSubject === '사회·문화'));
  assert.ok(search('화작').every(e => e.subSubject === '화법과작문'));
  assert.ok(search('세사').every(e => e.subSubject === '세계사'));
});
test('맞는 결과가 없을 때는 오타 보정으로 찾는다', () => {
  const typo = search('스능 국어');
  assert.ok(typo.length > 0);
  assert.ok(typo.every(e => e.subject === '국어' && e.type === 'csat'));
  assert.ok(search('생활과윤라').every(e => e.subSubject === '생활과윤리'));
});

// ── 2026-11-12 고도화: 실제 검색어(GA 90일) 재생에서 찾은 문제들 ──
import { tabCounts } from '../state.js';
import { SCHOOLS, schoolOf } from '../lib/search-vocab.js';

test('논술 대학은 모두 공용 사전(lib/search-vocab.js)에 있다', () => {
  for (const e of exams.filter(x => x.typeGroup === 'essay')) {
    const name = e.subject.replace(/[\s()]/g, '');
    assert.ok(SCHOOLS.some(s => name.includes(s)), e.subject);
  }
  assert.equal(schoolOf('연대'), '연세대');
  assert.equal(schoolOf('이화여대'), '이화여자대');
  assert.equal(schoolOf('숭실'), '숭실대');
  assert.equal(schoolOf('아주'), null);   // "아주 어려운"
});
test('네 자리 학년도는 YYMM 으로 읽지 않는다', () => {
  for (const y of [2005, 2008, 2010, 2011]) {
    const r = search(String(y));
    assert.ok(r.length > 0, y);
    assert.equal(r[0].gradeYear, y, y);
  }
  assert.ok(search('1706').every(e => e.gradeYear === 2017 && e.type === 'june'));
});
test('학년도+달의 여러 표기를 읽는다', () => {
  const june25 = search('25 6모').map(e => e.id);
  for (const q of ['256월', '25학년도 6', '2025학년도 6']) assert.deepEqual(search(q).map(e => e.id), june25, q);
  assert.ok(search('27년').length > 0);
});
test('띄어 쓴 과목 이름과 줄임말을 찾는다', () => {
  assert.deepEqual(search('생활과 윤리').map(e => e.id), search('생활과윤리').map(e => e.id));
  assert.ok(search('정법').length > 0 && search('정법').every(e => /정치|법과/.test(e.subSubject)));
  assert.ok(search('사회').length > 0);
  assert.ok(search('물1').every(e => /물리/.test(e.subSubject)));
  assert.ok(search('물1').some(e => e.subSubject === '물리Ⅰ') && search('물1').some(e => e.subSubject === '물리학Ⅰ'));
});
test('대학 이름은 논술에서만 찾고, 다른 탭엔 엉뚱한 결과를 내지 않는다', () => {
  for (const q of ['연대', '이대', '수원대', '단국', '성대', '서울과기대']) {
    assert.equal(search(q).length, 0, q);
    const essay = search(q, 'essay');
    assert.ok(essay.length > 0 && essay.every(e => e.typeGroup === 'essay'), q);
  }
});
test('검색어로 예비 시험을 찾으면 보여 준다', () => {
  assert.ok(search('예비시행').length > 0);
  assert.ok(search('예비시행').every(e => e.type === 'prelim'));
});
test('학년도 정확 일치가 시행 연도보다 먼저 온다', () => {
  assert.equal(search('수능 국어 2024')[0].gradeYear, 2024);
});
test('탭별 건수 — 다른 탭에만 있는 검색어', () => {
  assert.deepEqual(Object.keys(tabCounts(exams, '단국대')), ['essay']);
  assert.ok(tabCounts(exams, '고1 영어').freshman > 0);
  assert.equal(tabCounts(exams, '고1 영어').senior, undefined);
  assert.equal(Object.keys(tabCounts(exams, '반씨전')).length, 0);
});
