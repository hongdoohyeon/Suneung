import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const EXAMS_PATH = new URL('data/exams.json', ROOT);
const ANSWERS_PATH = new URL('data/answers.json', ROOT);
const SOURCE_PATH = new URL('data/sources/military-2027.json', ROOT);
const WRITE = process.argv.includes('--write');

const [exams, answers, source] = await Promise.all([
  readFile(EXAMS_PATH, 'utf8').then(JSON.parse),
  readFile(ANSWERS_PATH, 'utf8').then(JSON.parse),
  readFile(SOURCE_PATH, 'utf8').then(JSON.parse),
]);

const ids = new Set();
const logicalKeys = new Set();
for (const record of source.records) {
  if (!Number.isInteger(record.id) || ids.has(record.id)) {
    throw new Error(`유효하지 않거나 중복된 id: ${record.id}`);
  }
  ids.add(record.id);
  const key = `${record.subject}|${record.subSubject ?? ''}`;
  if (logicalKeys.has(key)) throw new Error(`중복된 과목 조합: ${key}`);
  logicalKeys.add(key);
  if (!Array.isArray(record.answers) || record.answers.length !== 30
      || record.answers.some(value => !/^\d+(,\d+)*$/.test(value))) {
    throw new Error(`id=${record.id} 공식 정답 배열이 유효하지 않습니다.`);
  }
  if (!source.documents[record.questionDocument] || !source.documents[record.answerDocument]) {
    throw new Error(`id=${record.id} 원문 문서 참조가 없습니다.`);
  }
}

const existingIds = new Set(exams.map(exam => exam.id));
const existingKeys = new Set(exams.map(exam => [
  exam.curriculum,
  exam.gradeYear,
  exam.type,
  exam.subject,
  exam.subSubject ?? '',
].join('|')));
const additions = [];

for (const record of source.records) {
  const question = source.documents[record.questionDocument];
  const answer = source.documents[record.answerDocument];
  const logicalKey = ['사관', source.gradeYear, 'military_annual', record.subject, record.subSubject ?? ''].join('|');
  const mathCombined = record.subject === '수학';
  const questionDownload = mathCombined
    ? `${source.gradeYear}학년도 사관학교 1차 수학 공통·선택 문제지.pdf`
    : `${source.gradeYear}학년도 사관학교 1차 ${record.subject} 문제지.pdf`;
  const answerDownload = mathCombined
    ? `${source.gradeYear}학년도 사관학교 1차 수학 공통·선택 정답.pdf`
    : `${source.gradeYear}학년도 사관학교 1차 ${record.subject} 정답.pdf`;

  if (existingIds.has(record.id) || existingKeys.has(logicalKey)) continue;

  additions.push({
    id: record.id,
    curriculum: '사관',
    gradeYear: source.gradeYear,
    examYear: source.examYear,
    month: 8,
    typeGroup: 'military',
    type: 'military_annual',
    subject: record.subject,
    subSubject: record.subSubject,
    solutionUrl: null,
    questionUrl: `https://suneung-files.hdh061224.workers.dev/${source.releaseTag}/${question.asset}?name=${encodeURIComponent(questionDownload)}`,
    answerUrl: `https://suneung-files.hdh061224.workers.dev/${source.releaseTag}/${answer.asset}?name=${encodeURIComponent(answerDownload)}`,
    questionDownload,
    answerDownload,
    answerStatus: source.answerStatus,
    answerStatusNote: source.answerStatusNote,
    source: source.officialPublisher,
    sourcePage: source.officialPage,
    sourcePublishedDate: source.publishedDate,
    questionSourceOriginal: question.sourceUrl,
    answerSourceOriginal: answer.sourceUrl,
  });
}

console.log(`2027학년도 사관학교 추가 대상: ${additions.length}건`);
if (!WRITE) {
  console.log('확인만 수행했습니다. 반영하려면 --write를 사용하세요.');
  process.exit(0);
}

for (const record of source.records) {
  if (additions.some(exam => exam.id === record.id)) {
    answers[String(record.id)] = record.answers;
  }
}

await Promise.all([
  writeFile(EXAMS_PATH, `${JSON.stringify([...exams, ...additions], null, 2)}\n`),
  writeFile(ANSWERS_PATH, `${JSON.stringify(answers, null, 2)}\n`),
]);
console.log(`반영 완료: exams ${exams.length + additions.length}건`);
