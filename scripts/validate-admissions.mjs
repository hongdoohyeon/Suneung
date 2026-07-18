#!/usr/bin/env node
// 정시 반영비율·입결 JSON의 구조, 메타 집계, 값 범위를 검증한다.

import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
const errors = [];
const err = message => errors.push(message);

const [manualRatios, lookupPayload, manualResults] = await Promise.all([
  readJson('data/admissions/manual-ratios.json'),
  readJson('data/admissions/ratios-lookup.json'),
  readJson('data/admissions/manual-results.json'),
]);

const ratioSchools = Object.keys(manualRatios).filter(k => k !== '_meta');
const resultSchools = Object.keys(manualResults).filter(k => k !== '_meta');
const lookup = lookupPayload.lookup || {};
const lookupSchools = Object.keys(lookup);

if (manualRatios._meta?.schoolCount !== ratioSchools.length) {
  err(`manual-ratios schoolCount=${manualRatios._meta?.schoolCount}, 실제=${ratioSchools.length}`);
}
if (manualResults._meta?.schoolCount !== resultSchools.length) {
  err(`manual-results schoolCount=${manualResults._meta?.schoolCount}, 실제=${resultSchools.length}`);
}
if (lookupPayload._meta?.count !== lookupSchools.length) {
  err(`ratios-lookup count=${lookupPayload._meta?.count}, 실제=${lookupSchools.length}`);
}

let manualTrackCount = 0;
for (const slug of ratioSchools) {
  const school = manualRatios[slug];
  if (!school?.name || !Array.isArray(school.tracks) || !school.tracks.length) {
    err(`manual-ratios ${slug}: name 또는 tracks 누락`);
    continue;
  }
  manualTrackCount += school.tracks.length;
  if (!lookup[slug]) err(`manual-ratios ${slug}: ratios-lookup에서 누락`);
  for (const [index, track] of school.tracks.entries()) {
    if (!track.label || !track.ratios || typeof track.ratios !== 'object') {
      err(`manual-ratios ${slug}.tracks[${index}]: label/ratios 누락`);
      continue;
    }
    for (const [area, value] of Object.entries(track.ratios)) {
      const validNumber = typeof value === 'number' && Number.isFinite(value);
      const validNote = typeof value === 'string' && value.trim().length > 0;
      if (!validNumber && !validNote) err(`manual-ratios ${slug} ${area}: 잘못된 값 ${JSON.stringify(value)}`);
    }
  }
}

let lookupWithRatio = 0;
for (const [slug, school] of Object.entries(lookup)) {
  if (!school?.name || !Array.isArray(school.tracks)) err(`ratios-lookup ${slug}: name/tracks 누락`);
  if (school.tracks.some(track => track.ratios && Object.keys(track.ratios).length)) lookupWithRatio++;
  for (const [index, track] of school.tracks.entries()) {
    for (const [area, value] of Object.entries(track.ratios || {})) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        err(`ratios-lookup ${slug}.tracks[${index}].ratios.${area}: 숫자가 아님`);
      }
    }
  }
}
if (lookupPayload._meta?.with_ratio !== lookupWithRatio) {
  err(`ratios-lookup with_ratio=${lookupPayload._meta?.with_ratio}, 실제=${lookupWithRatio}`);
}

let resultUnitCount = 0;
const resultYearSchools = {};
for (const slug of resultSchools) {
  const years = manualResults[slug];
  for (const [year, units] of Object.entries(years)) {
    if (!/^20\d{2}$/.test(year) || !Array.isArray(units)) {
      err(`manual-results ${slug}.${year}: 연도 키 또는 배열 형식 오류`);
      continue;
    }
    resultYearSchools[year] = (resultYearSchools[year] || 0) + 1;
    for (const [index, unit] of units.entries()) {
      resultUnitCount++;
      if (typeof unit.unit !== 'string' || !unit.unit.trim()) err(`manual-results ${slug}.${year}[${index}]: 모집단위 누락`);
      if (typeof unit.pct70 !== 'number' || !Number.isFinite(unit.pct70) || unit.pct70 < 0 || unit.pct70 > 100) {
        err(`manual-results ${slug}.${year}[${index}]: pct70 범위 오류 ${JSON.stringify(unit.pct70)}`);
      }
    }
  }
}

console.log(`정시 반영비율: ${ratioSchools.length}개교 / ${manualTrackCount}개 전형`);
console.log(`정시 70%컷: ${resultSchools.length}개교 / ${resultUnitCount}개 모집단위`);
console.log(`연도별 입결 학교 수: ${Object.entries(resultYearSchools).sort().map(([y, n]) => `${y}=${n}`).join(', ')}`);
if (errors.length) {
  console.error(`\n검증 실패 ${errors.length}건`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('정시 데이터 검증 OK');
