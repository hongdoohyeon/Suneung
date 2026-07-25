#!/usr/bin/env node
// EBSi 공개 아카이브의 평가원 해설을 기존 시험 항목에 정확히 일치할 때만 보강한다.

import { readFile, writeFile } from 'node:fs/promises';
import { fetchPaperList } from './fetch-ebsi-paper-list.mjs';

const ROOT = new URL('../', import.meta.url);
const DATA_PATH = new URL('data/exams.json', ROOT);
const SOURCE_PATH = new URL('data/sources/ebsi-kice-solutions-2006-2020.json', ROOT);
const SHOULD_WRITE = process.argv.includes('--write');
const SHOULD_CHECK_LINKS = process.argv.includes('--check-links');
const VERBOSE = process.argv.includes('--verbose');
const SOURCE_PAGE = 'https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=D300';

const SUBJECT_BY_FLAG = new Map([
  ['국어', '국어'], ['언어', '국어'],
  ['수학', '수학'], ['수리', '수학'],
  ['영어', '영어'], ['외국어', '영어'],
  ['한국사', '한국사'],
  ['사탐', '사회탐구'], ['사회탐구', '사회탐구'],
  ['과탐', '과학탐구'], ['과학탐구', '과학탐구'],
  ['직탐', '직업탐구'], ['직업탐구', '직업탐구'],
  ['제2외국어', '제2외국어'],
]);

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replaceAll('Ⅰ', '1')
    .replaceAll('Ⅱ', '2')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

function eventType(card) {
  if (card.title.includes('대학수학능력시험')) return 'csat';
  if (!/(?:모평|모의평가)/.test(card.title) || !card.title.includes('평가원')) return null;
  if (/9월/.test(card.title) || card.month === 9) return 'sept';
  if (/6월/.test(card.title) || card.month === 6) return 'june';
  return null;
}

function gradeYear(card) {
  const match = card.title.match(/(\d{4})학년도/);
  return match ? Number(match[1]) : card.year + 1;
}

function requestedSubSubject(subject, title, candidates) {
  const bare = normalized(title.replace(/\s*(?:홀수형|짝수형)\s*$/, ''));
  if (subject === '국어') {
    if (/(?:국어|언어)a형?$/.test(bare)) return candidates.includes('A형') ? 'A형' : '가형';
    if (/(?:국어|언어)b형?$/.test(bare)) return candidates.includes('B형') ? 'B형' : '나형';
    return null;
  }
  if (subject === '수학') {
    if (/(?:수학|수리)(?:가형|a형?)$/.test(bare)) return candidates.includes('가형') ? '가형' : 'A형';
    if (/(?:수학|수리)(?:나형|b형?)$/.test(bare)) return candidates.includes('나형') ? '나형' : 'B형';
    return null;
  }
  if (subject === '영어') {
    if (/(?:영어|외국어)a형?$/.test(bare)) return 'A형';
    if (/(?:영어|외국어)b형?$/.test(bare)) return 'B형';
    return null;
  }
  if (subject === '한국사') return null;

  const comparable = subject === '제2외국어' ? bare.replace(/(?:1|i)$/, '') : bare;
  return candidates
    .filter(Boolean)
    .sort((a, b) => normalized(b).length - normalized(a).length)
    .find(candidate => comparable.endsWith(normalized(candidate))) ?? null;
}

function solutionDownload(exam) {
  const round = { csat: '수능', june: '6월 모평', sept: '9월 모평' }[exam.type];
  const area = exam.subSubject ? `${exam.subject}(${exam.subSubject})` : exam.subject;
  return `${exam.gradeYear}학년도 ${round} ${area} 정답·해설.pdf`;
}

const exams = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const targetExams = exams.filter(exam => exam.typeGroup === 'suneung'
  && exam.examYear >= 2006 && exam.examYear <= 2020
  && ['csat', 'june', 'sept'].includes(exam.type));
const groups = new Map();
for (const exam of targetExams) {
  const key = `${exam.gradeYear}\t${exam.type}\t${exam.subject}`;
  const group = groups.get(key) ?? [];
  group.push(exam);
  groups.set(key, group);
}

const cards = [];
for (let year = 2006; year <= 2020; year++) {
  cards.push(...await fetchPaperList(year, 3));
}

const matches = [];
const unmatched = [];
for (const card of cards.filter(card => card.downloads.H)) {
  const type = eventType(card);
  const subject = SUBJECT_BY_FLAG.get(card.subjectFlag);
  if (!type || !subject) continue;

  const year = gradeYear(card);
  const candidates = groups.get(`${year}\t${type}\t${subject}`) ?? [];
  const subSubject = requestedSubSubject(subject, card.title, candidates.map(exam => exam.subSubject));
  const exact = candidates.filter(exam => (exam.subSubject ?? null) === subSubject);
  if (exact.length !== 1) {
    unmatched.push({ year, type, subject, subSubject, title: card.title, candidateIds: exact.map(exam => exam.id) });
    continue;
  }

  const exam = exact[0];
  if (exam.solutionUrl) continue;
  matches.push({
    id: exam.id,
    gradeYear: exam.gradeYear,
    type: exam.type,
    subject: exam.subject,
    subSubject: exam.subSubject,
    solutionUrl: card.downloads.H,
    solutionDownload: solutionDownload(exam),
    solutionSource: 'EBSi',
    solutionSourcePage: SOURCE_PAGE,
  });
}

const matchesById = Map.groupBy(matches, match => match.id);
const uniqueMatches = [];
for (const [id, idMatches] of matchesById) {
  const urls = [...new Set(idMatches.map(match => match.solutionUrl))];
  if (urls.length === 1) {
    uniqueMatches.push(idMatches[0]);
  } else {
    unmatched.push({
      id,
      title: '한 시험에 서로 다른 복수 해설이 대응되어 자동 연결하지 않음',
      solutionUrls: urls,
    });
  }
}

console.log(`평가원 해설 보강: ${uniqueMatches.length}건`);
console.log(`공식 해설이 있으나 정확히 매칭하지 못한 카드: ${unmatched.length}건`);
if (VERBOSE && unmatched.length) console.log(JSON.stringify(unmatched, null, 2));

let publishableMatches = uniqueMatches;
if (SHOULD_CHECK_LINKS) {
  const checked = [];
  async function check(match) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(match.solutionUrl, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
        const contentType = response.headers.get('content-type') ?? '';
        return { match, ok: response.ok && contentType.includes('application/pdf'), status: response.status, contentType };
      } catch (error) {
        if (attempt === 3) return { match, ok: false, status: 0, contentType: '', error: error.message };
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }
  for (let i = 0; i < uniqueMatches.length; i += 12) {
    checked.push(...await Promise.all(uniqueMatches.slice(i, i + 12).map(check)));
  }
  publishableMatches = checked.filter(result => result.ok).map(result => result.match);
  const failed = checked.filter(result => !result.ok);
  console.log(`EBSi 해설 PDF ${publishableMatches.length}개 응답·형식 확인 완료`);
  if (failed.length) {
    console.log(`응답이 유효하지 않아 제외: ${failed.length}건`);
    console.log(JSON.stringify(failed.map(({ match, status, contentType, error }) => ({
      id: match.id, status, contentType, error, solutionUrl: match.solutionUrl,
    })), null, 2));
  }
}

if (SHOULD_WRITE) {
  const byId = new Map(publishableMatches.map(match => [match.id, match]));
  for (const exam of exams) {
    const match = byId.get(exam.id);
    if (!match) continue;
    exam.solutionUrl = match.solutionUrl;
    exam.solutionDownload = match.solutionDownload;
    exam.solutionSource = match.solutionSource;
    exam.solutionSourcePage = match.solutionSourcePage;
  }
  await writeFile(DATA_PATH, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
  await writeFile(SOURCE_PATH, `${JSON.stringify({
    source: 'EBSi 공개 기출문제 아카이브',
    sourcePage: SOURCE_PAGE,
    fetchedAt: new Date().toISOString(),
    count: publishableMatches.length,
    records: publishableMatches,
  }, null, 2)}\n`, 'utf8');
  console.log('exams.json 및 출처 스냅샷 저장 완료');
}
