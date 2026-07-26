import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const EXAMS_PATH = new URL('data/exams.json', ROOT);
const ANSWERS_PATH = new URL('data/answers.json', ROOT);
const SOURCE_PATH = new URL('data/sources/leet-2027.json', ROOT);
const WRITE = process.argv.includes('--write');
const WORKER = 'https://suneung-files.hdh061224.workers.dev/leet-v1';

const [exams, answers, source] = await Promise.all([
  readFile(EXAMS_PATH, 'utf8').then(JSON.parse),
  readFile(ANSWERS_PATH, 'utf8').then(JSON.parse),
  readFile(SOURCE_PATH, 'utf8').then(JSON.parse),
]);

const additions = source.records.filter(record =>
  !exams.some(exam =>
    exam.id === record.id ||
    (exam.gradeYear === source.gradeYear &&
      exam.type === 'leet_annual' &&
      exam.subject === record.subject)
  )
);

for (const record of additions) {
  const label = record.subject;
  exams.push({
    id: record.id,
    curriculum: 'LEET',
    gradeYear: source.gradeYear,
    examYear: source.examYear,
    month: 7,
    typeGroup: 'leet',
    type: 'leet_annual',
    subject: label,
    subSubject: null,
    solutionUrl: null,
    questionUrl: `${WORKER}/${record.questionAsset}?name=${encodeURIComponent(`${source.gradeYear}학년도 LEET ${label} 문제지.pdf`)}`,
    answerUrl: record.answerAsset
      ? `${WORKER}/${record.answerAsset}?name=${encodeURIComponent(`${source.gradeYear}학년도 LEET ${label} 정답.pdf`)}`
      : null,
    questionDownload: `${source.gradeYear}학년도 LEET ${label} 문제지.pdf`,
    answerDownload: record.answerAsset
      ? `${source.gradeYear}학년도 LEET ${label} 정답.pdf`
      : null,
    source: '법학적성시험',
    sourcePage: record.sourcePost,
  });

  if (record.answers) answers[String(record.id)] = record.answers;
}

console.log(`2027학년도 LEET 추가 대상: ${additions.length}건`);
if (!WRITE) {
  console.log('확인만 수행했습니다. 반영하려면 --write를 사용하세요.');
  process.exit(additions.length === 0 ? 0 : 1);
}

await Promise.all([
  writeFile(EXAMS_PATH, `${JSON.stringify(exams, null, 2)}\n`),
  writeFile(ANSWERS_PATH, `${JSON.stringify(answers, null, 2)}\n`),
]);
console.log(`반영 완료: exams ${exams.length}건`);
