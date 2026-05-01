#!/usr/bin/env node
// 이투스 archived raw → 사이트 형식 normalize.
// 표 순서로 영역 매핑 (표 헤더에 영역명 없음, 사이트 영역 정의 순서로 매칭).
//
// 입력:  data/raw/etoos/rawcuts-archived-v2.json (시험 직후 캡처, 원점수 채워짐)
// 출력:  data/raw/etoos/rawcuts-normalized.json

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.resolve(ROOT, 'data/raw/etoos/rawcuts-archived-v2.json');
const OUT = path.resolve(ROOT, 'data/raw/etoos/rawcuts-normalized.json');
const EXAMS = path.resolve(ROOT, 'data/exams.json');

const raw = JSON.parse(await readFile(SRC, 'utf-8'));
const sites = JSON.parse(await readFile(EXAMS, 'utf-8'));
console.log(`입력: ${raw.length}건 시험`);

// 표 → cuts 추출
function parseTable(t) {
  if (!t || t.length < 9) return null;
  const head = t[0];
  if (head[0] !== '등급') return null;
  const data = t.slice(1);
  // 등급/원점수/표준점수/백분위 (4컬럼)
  // 만점/최고점 행 → 만점값
  const top = data[0];
  const fullScore = parseInt(top[1], 10);
  const stdMax = parseInt(top[2], 10);
  // 1~8등급
  const out = { rawCuts: [], standardCuts: [], standardPercentile: [] };
  for (let i = 1; i <= 8; i++) {
    const r = data[i];
    if (!r) { out.rawCuts.push(null); out.standardCuts.push(null); out.standardPercentile.push(null); continue; }
    const rawStr = (r[1] || '').replace(/\s/g, '');
    const rawNum = rawStr ? parseInt(rawStr.split('~')[0], 10) : null;
    const stdNum = parseInt(r[2], 10);
    const pctNum = parseInt(r[3], 10);
    out.rawCuts.push(Number.isFinite(rawNum) ? rawNum : null);
    out.standardCuts.push(Number.isFinite(stdNum) ? stdNum : null);
    out.standardPercentile.push(Number.isFinite(pctNum) ? pctNum : null);
  }
  out.fullScore = fullScore;
  out.stdMax = stdMax;
  return out;
}

// 학년도 + type → 사이트 영역 순서 (sub14.asp 표 순서와 매칭)
// 이투스 sub14.asp 의 표 순서 (시험 시기에 따라 다름):
// - 2022학년도 이후 (통합형): 화작, 언매, 확통, 미적, 기하, [영어, 한국사]?, 사탐 9개, 과탐 8개
// - 2014~2021학년도: 가형, 나형 (국어/수학), [영어, 한국사], 사탐, 과탐
//
// 사이트의 영역 순서 (subject + subSubject 사전순) 와 이투스 표 순서가 다를 수 있어
// 표의 fullScore (100/50) + stdMax 패턴으로 영역 추정.
//
// 핵심 휴리스틱:
//   fullScore=100, stdMax >= 130 → 국어 또는 수학
//   fullScore=50, stdMax >= 60 → 사탐 또는 과탐
//   원점수/표준점수 컬럼 모두 비어있으면 절대평가/직탐/제2외 (사이트 영역 외)

// (examYear, month) → 사이트 type 매핑
function siteTypeFor(examYear, month, typeRaw) {
  const tr = (typeRaw || '').replace(/<.*$/, '').trim();
  if (tr === '수능' || month === 11) return 'csat';
  if (tr === '모의평가') {
    if (month === 6) return 'june';
    if (month === 9) return 'sept';
  }
  if (tr === '학력평가') {
    if (month === 3) return 'mar';
    if (month === 4) return 'apr';
    if (month === 7) return 'jul';
    if (month === 10) return 'oct';
  }
  return null;
}

// 이투스 표 순서: 국어 → 영어(절대평가 시 stdMax='-' 자동 필터) → 수학 → 한국사(절대) → 사탐 → 과탐 → 직탐 → 제2외
// 사탐/과탐은 평가원 교육과정 순. SKIP 항목은 표는 있지만 사이트에 없는 영역 (영어/한국사 상대평가일 때).
function buildEtoosOrder(gradeYear) {
  const order = [];
  // 국어
  if (gradeYear <= 2016) {
    order.push({ subject: '국어', subSubject: 'A형' });
    order.push({ subject: '국어', subSubject: 'B형' });
  } else {
    order.push({ subject: '국어', subSubject: null });
  }
  // 영어: 2018학년도부터 절대평가 → stdMax='-' 자동 필터됨 (validCls 에 안 들어감)
  // 2017학년도 이전: 영어 상대평가 → 표 valid 하지만 사이트에서 제외 → SKIP
  if (gradeYear <= 2017) {
    order.push({ skip: true, label: '영어' });
  }
  // 수학
  if (gradeYear <= 2016) {
    order.push({ subject: '수학', subSubject: 'A형' });
    order.push({ subject: '수학', subSubject: 'B형' });
  } else if (gradeYear <= 2021) {
    order.push({ subject: '수학', subSubject: '가형' });
    order.push({ subject: '수학', subSubject: '나형' });
  } else {
    order.push({ subject: '국어', subSubject: '화법과작문' });
    order.push({ subject: '국어', subSubject: '언어와매체' });
    order.push({ subject: '수학', subSubject: '확률과통계' });
    order.push({ subject: '수학', subSubject: '미적분' });
    order.push({ subject: '수학', subSubject: '기하' });
  }
  // 한국사: 2017학년도부터 절대평가 → stdMax='-' 자동 필터
  // 2016 이전에는 사탐 일부였으니 사탐 안에 포함됨
  // 사탐 (평가원 순서)
  ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','법과정치','경제','사회·문화'].forEach(s =>
    order.push({ subject: '사회탐구', subSubject: s }));
  // 과탐 (평가원 순서)
  ['물리Ⅰ','화학Ⅰ','생명과학Ⅰ','지구과학Ⅰ','물리Ⅱ','화학Ⅱ','생명과학Ⅱ','지구과학Ⅱ'].forEach(s =>
    order.push({ subject: '과학탐구', subSubject: s }));
  return order;
}

const records = [];
let okCnt = 0, skipCnt = 0;
for (const item of raw) {
  const cls = item.tables.map(parseTable).filter(Boolean);
  const siteType = siteTypeFor(item.examYear, item.month, item.typeRaw);
  if (!siteType) {
    console.log(`  [type 매핑 불가] ${item.examDate} typeRaw=${item.typeRaw}`);
    skipCnt++;
    continue;
  }
  // megastudy/etoos data 의 gradeYear 가 examYear 로 잘못 들어옴 → +1 보정 (수능 기준 학년도)
  const gradeYear = item.examYear + 1;
  const validCls = cls.filter(c => c.fullScore && c.stdMax && Number.isFinite(c.fullScore) && Number.isFinite(c.stdMax));

  const etoosOrder = buildEtoosOrder(gradeYear);
  if (validCls.length < etoosOrder.length) {
    console.log(`  [표 부족] ${item.examDate} (${siteType}, gy=${gradeYear}) etoos=${validCls.length}개 vs expected=${etoosOrder.length}개`);
    skipCnt++;
    continue;
  }

  // 사이트의 (gradeYear, type) 영역 lookup
  const siteByKey = new Map();
  sites.filter(e => e.gradeYear === gradeYear && e.type === siteType)
    .forEach(e => siteByKey.set(`${e.subject}|${e.subSubject ?? ''}`, e));

  let matched = 0;
  for (let i = 0; i < etoosOrder.length; i++) {
    const o = etoosOrder[i];
    const c = validCls[i];
    if (o.skip) continue;
    const key = `${o.subject}|${o.subSubject ?? ''}`;
    const exam = siteByKey.get(key);
    if (!exam) continue;   // 사이트에 없는 영역
    if (!c.rawCuts.some(v => v != null)) continue;
    records.push({
      gradeYear,
      examYear: item.examYear,
      month: item.month,
      type: siteType,
      curriculum: exam.curriculum,
      typeGroup: exam.typeGroup,
      subject: exam.subject,
      subSubject: exam.subSubject,
      rawCuts: c.rawCuts,
      standardCuts: c.standardCuts,
      standardPercentile: c.standardPercentile,
      fullScore: c.fullScore,
      highestStandardScore: c.stdMax,
      source: 'etoos-archived',
      snapshotTs: item.snapshotTs,
    });
    matched++;
  }
  if (matched === 0) {
    console.log(`  [매칭 0] ${item.examDate} (${siteType}, gy=${gradeYear})`);
    skipCnt++;
  } else {
    okCnt++;
  }
}

await writeFile(OUT, JSON.stringify(records, null, 2));
console.log(`\n매칭 적재: ${records.length}건`);
const byYear = {};
records.forEach(r => { byYear[r.gradeYear] = (byYear[r.gradeYear]||0) + 1; });
console.log(`학년도별:`, byYear);
