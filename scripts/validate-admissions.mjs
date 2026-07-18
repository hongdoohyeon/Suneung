#!/usr/bin/env node
// 정시 반영비율·입결 JSON의 구조, 공식 출처 동기화, 값 범위를 검증한다.

import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
const errors = [];
const err = message => errors.push(message);
const slugsOf = payload => Object.keys(payload).filter(key => key !== '_meta');
const sorted = values => [...values].sort((a, b) => a.localeCompare(b));
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const expectMeta = (meta, key, actual, label) => {
  const stored = meta?.[key];
  const matches = (stored && typeof stored === 'object') || (actual && typeof actual === 'object')
    ? sameJson(stored, actual)
    : stored === actual;
  if (!matches) err(`${label} ${key}=${JSON.stringify(stored)}, 실제=${JSON.stringify(actual)}`);
};

const [manualRatios, lookupPayload, manualResults, officialSource, publicCoverage] = await Promise.all([
  readJson('data/admissions/manual-ratios.json'),
  readJson('data/admissions/ratios-lookup.json'),
  readJson('data/admissions/manual-results.json'),
  readJson('data/admissions/sources/adiga-regular-2026.json'),
  readJson('data/admissions/adiga-coverage-2026.json'),
]);

const ratioSchools = slugsOf(manualRatios);
const resultSchools = slugsOf(manualResults);
const lookup = lookupPayload.lookup || {};
const lookupSchools = Object.keys(lookup);
const officialSchools = officialSource.schools || {};
const officialSlugs = Object.keys(officialSchools);
const coverageSchools = publicCoverage.schools || {};

expectMeta(manualRatios._meta, 'schoolCount', ratioSchools.length, 'manual-ratios');
expectMeta(manualResults._meta, 'schoolCount', resultSchools.length, 'manual-results');
expectMeta(lookupPayload._meta, 'count', lookupSchools.length, 'ratios-lookup');
if (!sameJson(sorted(ratioSchools), sorted(lookupSchools))) err('manual-ratios와 ratios-lookup 학교 slug 불일치');

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
  if (!school?.name || !Array.isArray(school.tracks)) {
    err(`ratios-lookup ${slug}: name/tracks 누락`);
    continue;
  }
  if (school.tracks.some(track => track.ratios && Object.keys(track.ratios).length)) lookupWithRatio++;
  for (const [index, track] of school.tracks.entries()) {
    for (const [area, value] of Object.entries(track.ratios || {})) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        err(`ratios-lookup ${slug}.tracks[${index}].ratios.${area}: 숫자가 아님`);
      }
    }
  }
}
expectMeta(lookupPayload._meta, 'with_ratio', lookupWithRatio, 'ratios-lookup');

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
      if (typeof unit.pct70 !== 'number' || !Number.isFinite(unit.pct70) || unit.pct70 <= 0 || unit.pct70 > 100) {
        err(`manual-results ${slug}.${year}[${index}]: pct70 범위 오류 ${JSON.stringify(unit.pct70)}`);
      }
    }
  }
}
expectMeta(manualResults._meta, 'unitCount', resultUnitCount, 'manual-results');
expectMeta(manualResults._meta, 'yearSchoolCounts', resultYearSchools, 'manual-results');

const officialMeta = officialSource._meta || {};
const expectedCurrent = {
  resultYear: 2026,
  searchSyr: 2027,
  officialUniversityCount: 220,
  targetSchoolCount: 103,
  mappedSchoolCount: 99,
  unlistedSchoolCount: 4,
  queriedCodeCount: 117,
  schoolsWithNumericCut: 94,
  schoolsWithoutNumericCut: 9,
  numericCutCount: 3751,
};
for (const [key, value] of Object.entries(expectedCurrent)) expectMeta(officialMeta, key, value, 'adiga-source');
expectMeta(officialMeta, 'auditedSchoolCount', officialSlugs.length, 'adiga-source');
if (!/^\d{4}-\d{2}-\d{2}$/.test(officialMeta.collectedAt || '')) err('adiga-source collectedAt 형식 오류');
if (officialMeta.source !== '대입정보포털 어디가') err('adiga-source 공식 출처명 오류');
if (!sameJson(sorted(ratioSchools), sorted(officialSlugs))) err('반영비율 103개교와 어디가 감사 대상 slug 불일치');
if (!sameJson(sorted(officialSlugs), sorted(Object.keys(coverageSchools)))) err('공개 상태 파일의 학교 slug 불일치');

const allowedSchoolStatuses = new Set(['numeric_cut_available', 'no_numeric_cut', 'no_rows', 'not_listed_in_adiga']);
const allowedSupplementStatuses = new Set([
  'alternative_metric_available',
  'regular_result_not_published',
  'official_result_notice_published',
  'official_analysis_attachment_published',
  'official_cut_not_confirmed',
]);
const requiredSupplements = ['dgist', 'gachon', 'gist', 'jnue', 'kentech', 'mokpo', 'skuniv', 'snue', 'unist'];
let numericSchoolCount = 0;
let unlistedSchoolCount = 0;
let queriedCodeCount = 0;
let officialUnitCount = 0;
let unexpectedRowCount = 0;
const supplementSlugs = [];

for (const [slug, school] of Object.entries(officialSchools)) {
  if (!school?.name || !allowedSchoolStatuses.has(school.status)) err(`adiga-source ${slug}: name/status 오류`);
  if (!Array.isArray(school.campuses) || !Array.isArray(school.units)) {
    err(`adiga-source ${slug}: campuses/units 배열 누락`);
    continue;
  }
  queriedCodeCount += school.campuses.length;
  officialUnitCount += school.units.length;
  if (school.numericCutCount !== school.units.length) err(`adiga-source ${slug}: numericCutCount 불일치`);
  if (school.status === 'numeric_cut_available') numericSchoolCount++;
  if (school.status === 'not_listed_in_adiga') {
    unlistedSchoolCount++;
    if (school.campuses.length || school.units.length || !school.statusReason) err(`adiga-source ${slug}: 어디가 미등재 상태 오류`);
  } else {
    const derivedStatus = school.units.length
      ? 'numeric_cut_available'
      : (school.campuses.some(campus => campus.rowCount > 0) ? 'no_numeric_cut' : 'no_rows');
    if (school.status !== derivedStatus) err(`adiga-source ${slug}: status=${school.status}, 실제=${derivedStatus}`);
  }

  const campusByCode = new Map();
  for (const [index, campus] of school.campuses.entries()) {
    const label = `adiga-source ${slug}.campuses[${index}]`;
    if (!/^\d{7}$/.test(campus.unvCd || '') || !campus.officialName || !campus.campus) err(`${label}: 대학코드/이름/캠퍼스 누락`);
    if (campusByCode.has(campus.unvCd)) err(`${label}: 대학코드 중복 ${campus.unvCd}`);
    campusByCode.set(campus.unvCd, campus);
    if (!Number.isInteger(campus.rowCount) || campus.rowCount < 0
      || !Number.isInteger(campus.numericCutCount) || campus.numericCutCount < 0
      || !Number.isInteger(campus.unexpectedRowCount) || campus.unexpectedRowCount < 0) {
      err(`${label}: 행 집계 오류`);
    }
    if (!campus.sourceUrl?.startsWith('https://m.adiga.kr/')) err(`${label}: 공식 상세 URL 누락`);
    const missingCount = Object.entries(campus.missingReasons || {}).reduce((sum, [reason, count]) => {
      if (!reason || !Number.isInteger(count) || count < 1) err(`${label}: 미제출 사유 집계 오류`);
      return sum + (Number.isInteger(count) ? count : 0);
    }, 0);
    if (campus.rowCount !== campus.numericCutCount + campus.unexpectedRowCount + missingCount) {
      err(`${label}: 전체 행=${campus.rowCount}, 숫자+미제출+예외=${campus.numericCutCount + campus.unexpectedRowCount + missingCount}`);
    }
    unexpectedRowCount += campus.unexpectedRowCount;
  }

  const unitKeys = new Set();
  const unitCountByCode = new Map();
  for (const [index, unit] of school.units.entries()) {
    const label = `adiga-source ${slug}.units[${index}]`;
    if (!unit.unit || !unit.track || !unit.admissionGroup || !unit.campus || !campusByCode.has(unit.unvCd)) {
      err(`${label}: 모집단위/전형/군/캠퍼스/대학코드 누락`);
    }
    if (typeof unit.pct70 !== 'number' || !Number.isFinite(unit.pct70) || unit.pct70 <= 0 || unit.pct70 > 100) {
      err(`${label}: pct70 범위 오류 ${JSON.stringify(unit.pct70)}`);
    }
    if (unit.pct70 === 1) err(`${label}: 어디가 1.0 대체값 잔존`);
    const key = [unit.unvCd, unit.track, unit.admissionGroup, unit.unit, unit.pct70].join('\t');
    if (unitKeys.has(key)) err(`${label}: 중복 모집단위`);
    unitKeys.add(key);
    unitCountByCode.set(unit.unvCd, (unitCountByCode.get(unit.unvCd) || 0) + 1);
  }
  for (const campus of school.campuses) {
    if (campus.numericCutCount !== (unitCountByCode.get(campus.unvCd) || 0)) {
      err(`adiga-source ${slug} ${campus.unvCd}: 캠퍼스 숫자 집계 불일치`);
    }
  }

  const supplement = school.directSupplement;
  if (supplement) {
    supplementSlugs.push(slug);
    if (!allowedSupplementStatuses.has(supplement.status) || !supplement.source || !/^https:\/\//.test(supplement.sourceUrl || '')
      || !Array.isArray(supplement.results) || !supplement.note) {
      err(`adiga-source ${slug}: 대학 입학처 보강 메타데이터 오류`);
    }
    if (supplement.status === 'alternative_metric_available') {
      if (!supplement.metric || !supplement.results.length) err(`adiga-source ${slug}: 대체 척도 설명/결과 누락`);
      for (const [index, result] of supplement.results.entries()) {
        if (!result.unit || !result.track || typeof result.cut !== 'number' || !Number.isFinite(result.cut) || result.cut <= 0) {
          err(`adiga-source ${slug}.directSupplement.results[${index}]: 대체 척도 값 오류`);
        }
      }
    } else if (supplement.results.length) {
      err(`adiga-source ${slug}: 수치 미확인 상태에 결과 값이 포함됨`);
    }
  }

  const manual2026 = manualResults[slug]?.['2026'];
  if (school.units.length) {
    const expectedRows = school.units.map(unit => ({
      unit: unit.unit,
      pct70: unit.pct70,
      note: [unit.track, unit.admissionGroup, unit.campus, '어디가 공식'].filter(Boolean).join(' · '),
      track: unit.track,
      admissionGroup: unit.admissionGroup,
      campus: unit.campus,
      source: '대입정보포털 어디가',
      sourceUrl: campusByCode.get(unit.unvCd)?.sourceUrl,
    }));
    if (!sameJson(manual2026, expectedRows)) err(`manual-results ${slug}.2026: 공식 원본과 불일치`);
  } else if (manual2026?.some(unit => unit?.source === '대입정보포털 어디가')) {
    err(`manual-results ${slug}.2026: 공식 숫자가 없는 대학에 어디가 행 잔존`);
  }
}

expectMeta(officialMeta, 'queriedCodeCount', queriedCodeCount, 'adiga-source');
expectMeta(officialMeta, 'schoolsWithNumericCut', numericSchoolCount, 'adiga-source');
expectMeta(officialMeta, 'schoolsWithoutNumericCut', officialSlugs.length - numericSchoolCount, 'adiga-source');
expectMeta(officialMeta, 'unlistedSchoolCount', unlistedSchoolCount, 'adiga-source');
expectMeta(officialMeta, 'mappedSchoolCount', officialSlugs.length - unlistedSchoolCount, 'adiga-source');
expectMeta(officialMeta, 'numericCutCount', officialUnitCount, 'adiga-source');
if (unexpectedRowCount) err(`adiga-source 예상 밖 표 행 ${unexpectedRowCount}건`);
if (!sameJson(sorted(supplementSlugs), requiredSupplements)) err(`대학 입학처 보강 대상 불일치: ${sorted(supplementSlugs).join(', ')}`);

const expectedCoverageSchools = Object.fromEntries(Object.entries(officialSchools).map(([slug, school]) => [
  slug,
  Object.fromEntries(Object.entries(school).filter(([key]) => key !== 'units')),
]));
if (!sameJson(publicCoverage._meta, officialMeta)) err('공개 상태 파일과 공식 원본의 _meta 불일치');
if (!sameJson(coverageSchools, expectedCoverageSchools)) err('공개 상태 파일이 공식 원본의 경량 사본과 불일치');
if (Object.values(coverageSchools).some(school => Object.hasOwn(school, 'units'))) err('공개 상태 파일에 대용량 units 배열 포함');

expectMeta(manualResults._meta, 'scoreYear', officialMeta.resultYear, 'manual-results');
expectMeta(manualResults._meta, 'official2026TargetSchoolCount', officialMeta.targetSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026MappedSchoolCount', officialMeta.mappedSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026UnlistedSchoolCount', officialMeta.unlistedSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026SchoolCount', officialMeta.schoolsWithNumericCut, 'manual-results');
expectMeta(manualResults._meta, 'official2026UnitCount', officialMeta.numericCutCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026StatusFile', 'data/admissions/sources/adiga-regular-2026.json', 'manual-results');
expectMeta(manualResults._meta, 'official2026CoverageFile', 'data/admissions/adiga-coverage-2026.json', 'manual-results');

console.log(`정시 반영비율: ${ratioSchools.length}개교 / ${manualTrackCount}개 전형`);
console.log(`정시 70%컷: ${resultSchools.length}개교 / ${resultUnitCount}개 모집단위`);
console.log(`2026 어디가 공식 감사: ${officialSlugs.length}/${ratioSchools.length}개교 · 숫자 ${numericSchoolCount}개교 ${officialUnitCount}건 · 미공개 ${officialSlugs.length - numericSchoolCount}개교`);
console.log(`연도별 입결 학교 수: ${Object.entries(resultYearSchools).sort().map(([year, count]) => `${year}=${count}`).join(', ')}`);
if (errors.length) {
  console.error(`\n검증 실패 ${errors.length}건`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('정시 데이터 검증 OK');
