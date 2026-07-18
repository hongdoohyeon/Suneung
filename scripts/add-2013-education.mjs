#!/usr/bin/env node
// EBSi 공개 아카이브의 2013년 고1·고2 학력평가 누락분을 exams.json에 추가한다.

import { readFile, writeFile } from 'node:fs/promises';
import { fetchPaperList } from './fetch-ebsi-paper-list.mjs';

const DATA_PATH = new URL('../data/exams.json', import.meta.url);
const SHOULD_WRITE = process.argv.includes('--write');
const SHOULD_CHECK_LINKS = process.argv.includes('--check-links');
const TYPE_BY_MONTH = { 3: 'mar', 6: 'jun', 9: 'sep', 11: 'nov' };

const SOCIAL = new Map([
  ['도덕', '도덕'], ['일반사회', '일반사회'], ['지리', '지리'],
  ['생활과 윤리', '생활과윤리'], ['윤리와 사상', '윤리와사상'],
  ['한국지리', '한국지리'], ['세계지리', '세계지리'],
  ['동아시아사', '동아시아사'], ['세계사', '세계사'],
  ['법과정치', '법과정치'], ['경제', '경제'], ['사회문화', '사회·문화'],
]);
const SCIENCE = new Map([
  ['물리', '물리Ⅰ'], ['화학', '화학Ⅰ'], ['생명과학', '생명과학Ⅰ'], ['지구과학', '지구과학Ⅰ'],
  ['물리Ⅰ', '물리Ⅰ'], ['화학Ⅰ', '화학Ⅰ'], ['생명과학Ⅰ', '생명과학Ⅰ'], ['지구과학Ⅰ', '지구과학Ⅰ'],
]);
const JOB = new Set(['농생명산업', '공업', '상업정보', '수산해운', '가사실업']);
const SECOND_LANGUAGE = new Set(['독일어Ⅰ', '프랑스어Ⅰ', '스페인어Ⅰ', '중국어Ⅰ', '일본어Ⅰ', '러시아어Ⅰ', '한문']);

function sourceSubject(title) {
  return title.replace(/^.*학평\([^)]*\)\s*/, '').replace(/^.*학평\s*/, '').trim();
}

function classify(title) {
  const raw = sourceSubject(title);
  if (raw === '사회·과학탐구') return ['통합탐구', null];
  if (raw === '한국사') return ['한국사', null];
  if (SOCIAL.has(raw)) return ['사회탐구', SOCIAL.get(raw)];
  if (SCIENCE.has(raw)) return ['과학탐구', SCIENCE.get(raw)];
  if (JOB.has(raw)) return ['직업탐구', raw === '수산해운' ? '수산·해운' : raw];
  if (SECOND_LANGUAGE.has(raw)) return ['제2외국어', raw.replace(/Ⅰ$/, '')];

  for (const subject of ['국어', '수학', '영어']) {
    if (!raw.startsWith(subject)) continue;
    const suffix = raw.slice(subject.length).replace(/형$/, '');
    return [subject, suffix ? `${suffix}형` : null];
  }
  throw new Error(`분류하지 못한 과목: ${title}`);
}

function downloadName(grade, month, subject, subSubject, kind) {
  const area = subSubject ? `${subject}(${subSubject})` : subject;
  return `2013년 ${month}월 학력평가 고${grade} ${area} ${kind}.pdf`;
}

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
if (exams.some(e => e.typeGroup === 'education' && e.examYear === 2013 && [1, 2].includes(e.studentGrade))) {
  throw new Error('2013년 고1·고2 학력평가 데이터가 이미 있습니다. 중복 추가를 중단합니다.');
}

const rawCards = [];
for (const grade of [1, 2]) {
  const cards = await fetchPaperList(2013, grade);
  const expected = grade === 1 ? 37 : 85;
  if (cards.length !== expected) throw new Error(`고${grade} EBSi 목록 ${cards.length}건 (예상 ${expected}건)`);
  rawCards.push(...cards.map(card => ({ grade, ...card })));
}

let nextId = Math.max(...exams.map(e => e.id)) + 1;
const additions = rawCards
  .sort((a, b) => a.grade - b.grade || a.month - b.month || a.title.localeCompare(b.title, 'ko'))
  .map(card => {
    const [subject, subSubject] = classify(card.title);
    if (!TYPE_BY_MONTH[card.month] || !card.downloads.P || !card.downloads.H) {
      throw new Error(`필수 파일/회차 누락: ${card.title}`);
    }
    return {
      id: nextId++,
      curriculum: '2009',
      gradeYear: 2013,
      examYear: 2013,
      month: card.month,
      studentGrade: card.grade,
      typeGroup: 'education',
      type: TYPE_BY_MONTH[card.month],
      subject,
      subSubject,
      questionUrl: card.downloads.P,
      answerUrl: null,
      solutionUrl: card.downloads.H,
      questionDownload: downloadName(card.grade, card.month, subject, subSubject, '문제지'),
      answerDownload: null,
      source: 'ebsi-public-archive',
    };
  });

console.log(`추가 예정: ${additions.length}건 (고1 ${additions.filter(e => e.studentGrade === 1).length}, 고2 ${additions.filter(e => e.studentGrade === 2).length})`);
if (SHOULD_CHECK_LINKS) {
  const urls = additions.flatMap(e => [e.questionUrl, e.solutionUrl]);
  for (let i = 0; i < urls.length; i += 12) {
    await Promise.all(urls.slice(i, i + 12).map(async url => {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/pdf')) {
        throw new Error(`PDF 확인 실패: ${response.status} ${contentType} ${url}`);
      }
    }));
  }
  console.log(`EBSi PDF ${urls.length}개 응답·형식 확인 완료`);
}
if (SHOULD_WRITE) {
  await writeFile(DATA_PATH, `${JSON.stringify([...exams, ...additions], null, 2)}\n`, 'utf8');
  console.log('data/exams.json 저장 완료');
} else {
  console.log('미리보기만 수행했습니다. 저장하려면 --write를 추가하세요.');
}
