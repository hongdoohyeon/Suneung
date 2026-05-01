#!/usr/bin/env node
// 평가원 표준점수 도수분포 CSV → 사이트용 JSON.
// 입력:
//   data/raw/kice/csat_freq_dist.csv         (수능, 가장 최근)
//   data/raw/kice/csat_mock_freq_dist.csv    (모의평가, 가장 최근)
// 출력:
//   data/score-distribution.json
//
// 구조:
//   [
//     {
//       year: 2026, type: 'csat',
//       subject: '국어', subSubject: null,   // 또는 선택과목
//       distribution: { '147': {male: 157, female: 104}, ... },
//     }, ...
//   ]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.resolve(ROOT, 'data/score-distribution.json');

const SOURCES = [
  { path: 'data/raw/kice/csat_freq_dist.csv',      year: 2026, type: 'csat', month: 11 },
  { path: 'data/raw/kice/csat_mock_freq_dist.csv', year: 2026, type: 'sept', month: 9 },
];

// 영역|유형 라벨 정규화 후 (subject, subSubject)로 매핑
function normLabel(s) {
  return String(s ?? '').replace(/\s+/g,'').replace('Ⅰ','I').replace('Ⅱ','II').trim();
}
// 키는 정규화 후
const SUBJ_MAP = {
  '국어|국어':       { subject: '국어',     subSubject: null },
  '국어|화법과작문': { subject: '국어',     subSubject: '화법과작문' },
  '국어|언어와매체': { subject: '국어',     subSubject: '언어와매체' },
  '수학|수학':       { subject: '수학',     subSubject: null },
  '수학|확률과통계': { subject: '수학',     subSubject: '확률과통계' },
  '수학|미적분':     { subject: '수학',     subSubject: '미적분' },
  '수학|기하':       { subject: '수학',     subSubject: '기하' },
  '영어|영어':       { subject: '영어',     subSubject: null },
  '한국사|한국사':   { subject: '한국사',   subSubject: null },
  '사회탐구|생활과윤리':  { subject: '사회탐구', subSubject: '생활과윤리' },
  '사회탐구|윤리와사상':  { subject: '사회탐구', subSubject: '윤리와사상' },
  '사회탐구|한국지리':    { subject: '사회탐구', subSubject: '한국지리' },
  '사회탐구|세계지리':    { subject: '사회탐구', subSubject: '세계지리' },
  '사회탐구|동아시아사':   { subject: '사회탐구', subSubject: '동아시아사' },
  '사회탐구|세계사':       { subject: '사회탐구', subSubject: '세계사' },
  '사회탐구|경제':         { subject: '사회탐구', subSubject: '경제' },
  '사회탐구|사회·문화':    { subject: '사회탐구', subSubject: '사회·문화' },
  '사회탐구|정치와법':     { subject: '사회탐구', subSubject: '정치와법' },
  '과학탐구|물리학I':       { subject: '과학탐구', subSubject: '물리학Ⅰ' },
  '과학탐구|물리학II':      { subject: '과학탐구', subSubject: '물리학Ⅱ' },
  '과학탐구|화학I':         { subject: '과학탐구', subSubject: '화학Ⅰ' },
  '과학탐구|화학II':        { subject: '과학탐구', subSubject: '화학Ⅱ' },
  '과학탐구|생명과학I':     { subject: '과학탐구', subSubject: '생명과학Ⅰ' },
  '과학탐구|생명과학II':    { subject: '과학탐구', subSubject: '생명과학Ⅱ' },
  '과학탐구|지구과학I':     { subject: '과학탐구', subSubject: '지구과학Ⅰ' },
  '과학탐구|지구과학II':    { subject: '과학탐구', subSubject: '지구과학Ⅱ' },
  // 직업탐구 (사이트엔 없음, 보존만)
  '직업탐구|성공적인직업생활': { subject: '직업탐구', subSubject: '성공적인직업생활' },
  '직업탐구|농업기초기술':     { subject: '직업탐구', subSubject: '농업기초기술' },
  '직업탐구|공업일반':         { subject: '직업탐구', subSubject: '공업일반' },
  '직업탐구|상업경제':         { subject: '직업탐구', subSubject: '상업경제' },
  '직업탐구|수산·해운산업기초': { subject: '직업탐구', subSubject: '수산해운산업기초' },
  '직업탐구|인간발달':         { subject: '직업탐구', subSubject: '인간발달' },
};

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(s => s.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i] ?? '');
    return obj;
  });
}

const out = [];
for (const src of SOURCES) {
  const text = await readFile(path.resolve(ROOT, src.path), 'utf-8');
  const rows = parseCsv(text);

  // 그룹: (영역, 유형) → 점수별 {male, female}
  const groups = new Map();
  for (const row of rows) {
    const area = (row['영역'] || '').replace(/\s+/g,' ').trim();
    const type_ = (row['유형'] || '').replace(/\s+/g,' ').trim();
    const score = parseInt(row['표준점수'], 10);
    const male = parseInt(row['남자'].replace(/[^\d]/g,''), 10);
    const female = parseInt(row['여자'].replace(/[^\d]/g,''), 10);
    if (!area || !type_ || isNaN(score)) continue;

    const key = `${normLabel(area)}|${normLabel(type_)}`;
    if (!groups.has(key)) groups.set(key, { area, type_, points: {} });
    groups.get(key).points[score] = { male: male||0, female: female||0 };
  }

  for (const [key, g] of groups) {
    const map = SUBJ_MAP[key];
    if (!map) {
      console.warn(`매핑 없음: ${key}`);
      continue;
    }
    out.push({
      year: src.year,
      examYear: src.year - 1,
      month: src.month,
      type: src.type,
      typeGroup: 'suneung',
      subject: map.subject,
      subSubject: map.subSubject,
      distribution: g.points,
    });
  }
}

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`도수분포 적재: ${out.length}건 → data/score-distribution.json`);
const byType = out.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
console.log(`  유형별:`, byType);
