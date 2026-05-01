#!/usr/bin/env node
// 메가스터디 raw 등급컷 → 사이트 형식.
// 입력:  data/raw/megastudy/gradecuts-raw.json
// 출력:  data/raw/megastudy/gradecuts-normalized.json (적재 직전 형식)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.resolve(ROOT, 'data/raw/megastudy/gradecuts-raw.json');
const OUT = path.resolve(ROOT, 'data/raw/megastudy/gradecuts-normalized.json');
const EXAMS = path.resolve(ROOT, 'data/exams.json');

const raw = JSON.parse(await readFile(SRC, 'utf-8'));
const exams = JSON.parse(await readFile(EXAMS, 'utf-8'));

// type 매핑: 시험 일자 + typeRaw → 사이트 type
function siteType(typeRaw, month, year) {
  const t = typeRaw.replace(/<.*$/, '').trim();
  if (t === '수능') return 'csat';
  if (t === '모의평가') {
    if (month === 6) return 'june';
    if (month === 9) return 'sept';
    return null;
  }
  if (t === '학력평가') {
    return ({3:'mar', 4:'apr', 5:'apr', 7:'jul', 10:'oct', 11:'oct'})[month] ?? null;
  }
  return null;
}

// 영역명 → (subject, subSubject)
const SUBJ_MAP = {
  '국어': ['국어', null],
  '수학': ['수학', null],
  '수학(가)': ['수학', '가형'],
  '수학(나)': ['수학', '나형'],
  '영어': ['영어', null],
  '한국사': ['한국사', null],
  '생활과윤리': ['사회탐구', '생활과윤리'],
  '윤리와사상': ['사회탐구', '윤리와사상'],
  '한국지리': ['사회탐구', '한국지리'],
  '세계지리': ['사회탐구', '세계지리'],
  '동아시아사': ['사회탐구', '동아시아사'],
  '세계사': ['사회탐구', '세계사'],
  '경제': ['사회탐구', '경제'],
  '사회문화': ['사회탐구', '사회·문화'],
  '법과정치': ['사회탐구', '법과정치'],
  '정치와법': ['사회탐구', '정치와법'],
  '물리 I': ['과학탐구', '물리Ⅰ'],
  '물리 II': ['과학탐구', '물리Ⅱ'],
  '물리학 I': ['과학탐구', '물리학Ⅰ'],
  '물리학 II': ['과학탐구', '물리학Ⅱ'],
  '화학 I': ['과학탐구', '화학Ⅰ'],
  '화학 II': ['과학탐구', '화학Ⅱ'],
  '생명과학 I': ['과학탐구', '생명과학Ⅰ'],
  '생명과학 II': ['과학탐구', '생명과학Ⅱ'],
  '지구과학 I': ['과학탐구', '지구과학Ⅰ'],
  '지구과학 II': ['과학탐구', '지구과학Ⅱ'],
};

// curriculum 추정
function curriculumFor(year) {
  if (year >= 2014) return '2015';
  return '2009';
}

const records = [];
const seen = new Set();
let typeNull = 0, subjNull = 0;
const sampleSubj = new Set(), sampleType = new Set();

for (const item of raw) {
  const type = siteType(item.typeRaw, item.month, item.examYear);
  if (!type) { typeNull++; sampleType.add(item.typeRaw); continue; }
  const map = SUBJ_MAP[item.subjectName];
  if (!map) { subjNull++; sampleSubj.add(item.subjectName); continue; }
  const [subject, subSubject] = map;

  // rows: ['최고점'/'1등급'~'8등급', 표준점수, 백분위, 누적비율]
  // 등급별 표준점수 추출
  const cuts = {};
  const percentile = {};
  const cumPct = {};
  let highest = null;
  for (const row of item.rows) {
    const label = row[0];
    if (label === '최고점') {
      highest = parseInt((row[1]||'').replace(/[^\d]/g,''), 10) || null;
      continue;
    }
    const m = label.match(/^(\d)등급$/);
    if (!m) continue;
    const g = Number(m[1]);
    const score = parseInt((row[1]||'').replace(/[^\d]/g,''), 10);
    const pct = parseInt((row[2]||'').replace(/[^\d]/g,''), 10);
    const cum = parseFloat((row[3]||'').replace(/[^\d.]/g,''));
    if (Number.isFinite(score)) cuts[g] = score;
    if (Number.isFinite(pct)) percentile[g] = pct;
    if (Number.isFinite(cum)) cumPct[g] = cum;
  }
  // 1~8등급 컷 모음
  const standardCuts = [1,2,3,4,5,6,7,8].map(g => cuts[g] ?? null);
  if (standardCuts.filter(v => v!=null).length < 6) continue;   // 너무 부족하면 skip

  const key = `${item.gradeYear}|${type}|${subject}|${subSubject ?? ''}`;
  if (seen.has(key)) continue;
  seen.add(key);

  records.push({
    curriculum: curriculumFor(item.gradeYear),
    gradeYear: item.gradeYear,
    examYear: item.examYear,
    month: item.month,
    typeGroup: 'suneung',
    type,
    subject,
    subSubject,
    standardCuts,
    standardPercentile: [1,2,3,4,5,6,7,8].map(g => percentile[g] ?? null),
    cumulativePercent: [1,2,3,4,5,6,7,8].map(g => cumPct[g] ?? null),
    highestStandardScore: highest,
    source: 'megastudy',
    examSeq: item.examSeq,
  });
}

console.log(`매칭: ${records.length}건`);
console.log(`type 매핑 실패: ${typeNull}건  (typeRaw 종류: ${[...sampleType].join(', ')})`);
console.log(`subject 매핑 실패: ${subjNull}건  (subjectName 종류: ${[...sampleSubj].join(', ')})`);

// 분포
import { writeFile as wf } from 'node:fs/promises';
const yt = {};
for (const r of records) {
  const k = `${r.gradeYear}_${r.type}`;
  yt[k] = (yt[k]||0) + 1;
}
console.log(`\n시험별 분포 (TOP 20):`);
const sorted = Object.entries(yt).sort((a,b) => a[0].localeCompare(b[0]));
for (const [k, c] of sorted.slice(0, 20)) console.log(`  ${k}: ${c}`);

await writeFile(OUT, JSON.stringify(records, null, 2));
console.log(`\n저장: data/raw/megastudy/gradecuts-normalized.json`);
