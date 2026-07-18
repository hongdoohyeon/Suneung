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

const [manualRatios, lookupPayload, manualResults, officialSource, officialRatioSource, publicCoverage] = await Promise.all([
  readJson('data/admissions/manual-ratios.json'),
  readJson('data/admissions/ratios-lookup.json'),
  readJson('data/admissions/manual-results.json'),
  readJson('data/admissions/sources/adiga-regular-2026.json'),
  readJson('data/admissions/sources/adiga-regular-ratios-2027.json'),
  readJson('data/admissions/adiga-coverage-2026.json'),
]);

const ratioSchools = slugsOf(manualRatios);
const resultSchools = slugsOf(manualResults);
const lookup = lookupPayload.lookup || {};
const lookupSchools = Object.keys(lookup);
const officialSchools = officialSource.schools || {};
const officialSlugs = Object.keys(officialSchools);
const coverageSchools = publicCoverage.schools || {};
const officialUniversities = officialSource.universities || {};
const officialUniversityCodes = Object.keys(officialUniversities);
const officialRatioMeta = officialRatioSource._meta || {};
const officialRatioUniversities = officialRatioSource.universities || {};
const officialRatioCodes = Object.keys(officialRatioUniversities);
const coverageUniversities = publicCoverage.universities || {};

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
  auditedOfficialUniversityCount: 220,
  officialUniversitiesWithNumericCut: 182,
  officialUniversitiesWithoutNumericCut: 38,
  officialNumericCutCount: 4821,
  targetSchoolCount: 103,
  mappedSchoolCount: 99,
  unlistedSchoolCount: 4,
  queriedCodeCount: 117,
  schoolsWithNumericCut: 94,
  schoolsWithoutNumericCut: 9,
  numericCutCount: 3751,
  official2027SelectionSourceFile: 'data/admissions/sources/adiga-regular-ratios-2027.json',
  official2027UniversitiesWithStructuredRatioTable: 176,
  official2027UniversitiesWithRatioText: 17,
  official2027UniversitiesWithCriteriaTextOnly: 1,
  official2027UniversitiesWithoutSelectionCriteria: 26,
  official2027StructuredRatioTableCount: 391,
};
for (const [key, value] of Object.entries(expectedCurrent)) expectMeta(officialMeta, key, value, 'adiga-source');
expectMeta(officialMeta, 'auditedSchoolCount', officialSlugs.length, 'adiga-source');
if (!/^\d{4}-\d{2}-\d{2}$/.test(officialMeta.collectedAt || '')) err('adiga-source collectedAt 형식 오류');
if (officialMeta.source !== '대입정보포털 어디가') err('adiga-source 공식 출처명 오류');
if (!sameJson(sorted(ratioSchools), sorted(officialSlugs))) err('반영비율 103개교와 어디가 감사 대상 slug 불일치');
if (!sameJson(sorted(officialSlugs), sorted(Object.keys(coverageSchools)))) err('공개 상태 파일의 학교 slug 불일치');
expectMeta(officialMeta, 'auditedOfficialUniversityCount', officialUniversityCodes.length, 'adiga-source');
if (!sameJson(sorted(officialUniversityCodes), sorted(Object.keys(coverageUniversities)))) err('공개 상태 파일의 대학코드 불일치');
if (!sameJson(sorted(officialUniversityCodes), sorted(officialRatioCodes))) err('입결 원본과 반영비율 원본의 대학코드 불일치');

const expectedRatioCurrent = {
  searchSyr: 2027,
  selectionYear: 2027,
  officialUniversityCount: 220,
  auditedOfficialUniversityCount: 220,
  universitiesWithStructuredRatioTable: 176,
  universitiesWithRatioText: 17,
  universitiesWithCriteriaTextOnly: 1,
  universitiesWithoutSelectionCriteria: 26,
  structuredRatioTableCount: 391,
};
for (const [key, value] of Object.entries(expectedRatioCurrent)) expectMeta(officialRatioMeta, key, value, 'adiga-ratio-source');
if (!/^\d{4}-\d{2}-\d{2}$/.test(officialRatioMeta.collectedAt || '')) err('adiga-ratio-source collectedAt 형식 오류');
if (officialRatioMeta.source !== '대입정보포털 어디가') err('adiga-ratio-source 공식 출처명 오류');

const allowedRatioStatuses = new Set([
  'structured_ratio_available',
  'ratio_text_available',
  'criteria_text_available',
  'no_selection_criteria',
]);
const ratioStatusCounts = new Map();
let fullRatioTableCount = 0;

for (const [code, selection] of Object.entries(officialRatioUniversities)) {
  const label = `adiga-ratio-source universities.${code}`;
  const resultUniversity = officialUniversities[code];
  if (!resultUniversity || selection?.unvCd !== code
    || selection.officialName !== resultUniversity.officialName
    || selection.campus !== resultUniversity.campus) {
    err(`${label}: 입결 원본과 대학코드/이름/캠퍼스 불일치`);
  }
  if (!allowedRatioStatuses.has(selection?.status)) err(`${label}: status 오류 ${JSON.stringify(selection?.status)}`);
  if (typeof selection?.sectionText !== 'string' || !Number.isInteger(selection?.criteriaTextLength)
    || selection.criteriaTextLength < 0 || selection.criteriaTextLength > selection.sectionText.length
    || !Array.isArray(selection?.ratioTables)) {
    err(`${label}: 텍스트/길이/표 배열 오류`);
    continue;
  }
  if (selection.sourceUrl !== resultUniversity.sourceUrl) err(`${label}: 공식 상세 URL 불일치`);
  if (selection.ratioTableCount !== selection.ratioTables.length) err(`${label}: ratioTableCount 불일치`);
  if ((selection.status === 'structured_ratio_available') !== (selection.ratioTables.length > 0)) {
    err(`${label}: 구조화 표 status 불일치`);
  }
  if (selection.status === 'criteria_text_available' && selection.criteriaTextLength < 30) {
    err(`${label}: criteria_text_available인데 유효 텍스트 부족`);
  }
  if (selection.status === 'no_selection_criteria' && selection.criteriaTextLength >= 30) {
    err(`${label}: no_selection_criteria인데 유효 텍스트 존재`);
  }
  ratioStatusCounts.set(selection.status, (ratioStatusCounts.get(selection.status) || 0) + 1);
  fullRatioTableCount += selection.ratioTables.length;
  for (const [tableIndex, table] of selection.ratioTables.entries()) {
    const tableLabel = `${label}.ratioTables[${tableIndex}]`;
    if (typeof table?.context !== 'string' || table.context.length > 500 || !Array.isArray(table?.rows) || !table.rows.length) {
      err(`${tableLabel}: context/rows 오류`);
      continue;
    }
    for (const [rowIndex, row] of table.rows.entries()) {
      if (!Array.isArray(row) || !row.length) {
        err(`${tableLabel}.rows[${rowIndex}]: 빈 행`);
        continue;
      }
      for (const [cellIndex, cell] of row.entries()) {
        if (typeof cell?.text !== 'string' || typeof cell?.header !== 'boolean'
          || !Number.isInteger(cell?.rowspan) || cell.rowspan < 1 || cell.rowspan > 100
          || !Number.isInteger(cell?.colspan) || cell.colspan < 1 || cell.colspan > 100) {
          err(`${tableLabel}.rows[${rowIndex}][${cellIndex}]: 셀 구조 오류`);
        }
      }
    }
  }
}

expectMeta(officialRatioMeta, 'universitiesWithStructuredRatioTable', ratioStatusCounts.get('structured_ratio_available') || 0, 'adiga-ratio-source');
expectMeta(officialRatioMeta, 'universitiesWithRatioText', ratioStatusCounts.get('ratio_text_available') || 0, 'adiga-ratio-source');
expectMeta(officialRatioMeta, 'universitiesWithCriteriaTextOnly', ratioStatusCounts.get('criteria_text_available') || 0, 'adiga-ratio-source');
expectMeta(officialRatioMeta, 'universitiesWithoutSelectionCriteria', ratioStatusCounts.get('no_selection_criteria') || 0, 'adiga-ratio-source');
expectMeta(officialRatioMeta, 'structuredRatioTableCount', fullRatioTableCount, 'adiga-ratio-source');
expectMeta(officialMeta, 'official2027UniversitiesWithStructuredRatioTable', ratioStatusCounts.get('structured_ratio_available') || 0, 'adiga-source');
expectMeta(officialMeta, 'official2027UniversitiesWithRatioText', ratioStatusCounts.get('ratio_text_available') || 0, 'adiga-source');
expectMeta(officialMeta, 'official2027UniversitiesWithCriteriaTextOnly', ratioStatusCounts.get('criteria_text_available') || 0, 'adiga-source');
expectMeta(officialMeta, 'official2027UniversitiesWithoutSelectionCriteria', ratioStatusCounts.get('no_selection_criteria') || 0, 'adiga-source');
expectMeta(officialMeta, 'official2027StructuredRatioTableCount', fullRatioTableCount, 'adiga-source');

const allowedSchoolStatuses = new Set(['numeric_cut_available', 'no_numeric_cut', 'no_rows', 'not_listed_in_adiga']);
const allowedSupplementStatuses = new Set([
  'alternative_metric_available',
  'regular_result_not_published',
  'official_result_notice_published',
  'official_analysis_attachment_published',
  'official_cut_not_confirmed',
]);
const requiredSupplements = ['dgist', 'gachon', 'gist', 'jnue', 'kentech', 'mokpo', 'skuniv', 'snue', 'unist'];
let fullNumericUniversityCount = 0;
let fullOfficialUnitCount = 0;
let fullUnexpectedRowCount = 0;
let mappedOfficialCodeCount = 0;
const officialUnitKeysByCode = new Map();

for (const [code, university] of Object.entries(officialUniversities)) {
  const label = `adiga-source universities.${code}`;
  if (!/^\d{7}$/.test(code) || university?.unvCd !== code || !university?.officialName || !university?.campus) {
    err(`${label}: 대학코드/이름/캠퍼스 누락`);
  }
  if (!['numeric_cut_available', 'no_numeric_cut', 'no_rows'].includes(university?.status)) {
    err(`${label}: status 오류 ${JSON.stringify(university?.status)}`);
  }
  if (!Array.isArray(university?.units) || !Array.isArray(university?.targetSlugs)) {
    err(`${label}: units/targetSlugs 배열 누락`);
    continue;
  }
  if (university.targetSlugs.length) mappedOfficialCodeCount++;
  if (new Set(university.targetSlugs).size !== university.targetSlugs.length
    || university.targetSlugs.some(slug => !ratioSchools.includes(slug))) {
    err(`${label}: targetSlugs 중복 또는 미등록 slug`);
  }
  if (!Number.isInteger(university.rowCount) || university.rowCount < 0
    || !Number.isInteger(university.numericCutCount) || university.numericCutCount < 0
    || !Number.isInteger(university.unexpectedRowCount) || university.unexpectedRowCount < 0) {
    err(`${label}: 행 집계 오류`);
  }
  const missingCount = Object.entries(university.missingReasons || {}).reduce((sum, [reason, count]) => {
    if (!reason || !Number.isInteger(count) || count < 1) err(`${label}: 미제출 사유 집계 오류`);
    return sum + (Number.isInteger(count) ? count : 0);
  }, 0);
  if (university.rowCount !== university.numericCutCount + university.unexpectedRowCount + missingCount) {
    err(`${label}: 전체 행=${university.rowCount}, 숫자+미제출+예외=${university.numericCutCount + university.unexpectedRowCount + missingCount}`);
  }
  const derivedStatus = university.units.length
    ? 'numeric_cut_available'
    : (university.rowCount ? 'no_numeric_cut' : 'no_rows');
  if (university.status !== derivedStatus || university.numericCutCount !== university.units.length) {
    err(`${label}: status 또는 numericCutCount 불일치`);
  }
  if (!university.sourceUrl?.startsWith('https://m.adiga.kr/')) err(`${label}: 공식 상세 URL 누락`);
  if (university.status === 'numeric_cut_available') fullNumericUniversityCount++;
  fullOfficialUnitCount += university.units.length;
  fullUnexpectedRowCount += university.unexpectedRowCount;

  const unitKeys = new Set();
  for (const [index, unit] of university.units.entries()) {
    const unitLabel = `${label}.units[${index}]`;
    if (unit.unvCd !== code || !unit.unit || !unit.track || !unit.admissionGroup || unit.campus !== university.campus) {
      err(`${unitLabel}: 대학코드/모집단위/전형/군/캠퍼스 불일치`);
    }
    if (typeof unit.pct70 !== 'number' || !Number.isFinite(unit.pct70) || unit.pct70 <= 0 || unit.pct70 > 100) {
      err(`${unitLabel}: pct70 범위 오류 ${JSON.stringify(unit.pct70)}`);
    }
    if (unit.pct70 === 1) err(`${unitLabel}: 어디가 1.0 대체값 잔존`);
    const key = [unit.unvCd, unit.track, unit.admissionGroup, unit.unit, unit.pct70].join('\t');
    if (unitKeys.has(key)) err(`${unitLabel}: 중복 모집단위`);
    unitKeys.add(key);
  }
  officialUnitKeysByCode.set(code, unitKeys);
}

expectMeta(officialMeta, 'officialUniversitiesWithNumericCut', fullNumericUniversityCount, 'adiga-source');
expectMeta(officialMeta, 'officialUniversitiesWithoutNumericCut', officialUniversityCodes.length - fullNumericUniversityCount, 'adiga-source');
expectMeta(officialMeta, 'officialNumericCutCount', fullOfficialUnitCount, 'adiga-source');
if (mappedOfficialCodeCount !== officialMeta.queriedCodeCount) err(`대상 매핑 대학코드 ${mappedOfficialCodeCount}, 메타 ${officialMeta.queriedCodeCount}`);
if (officialUniversityCodes.length - mappedOfficialCodeCount !== 103) err(`반영비율 미매핑 대학코드 ${officialUniversityCodes.length - mappedOfficialCodeCount}, 예상 103`);
if (fullUnexpectedRowCount) err(`adiga-source 전체 대학 예상 밖 표 행 ${fullUnexpectedRowCount}건`);

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
    const officialUniversity = officialUniversities[campus.unvCd];
    const expectedCampus = officialUniversity && Object.fromEntries(
      Object.entries(officialUniversity).filter(([key]) => key !== 'units' && key !== 'targetSlugs')
    );
    if (!officialUniversity || !officialUniversity.targetSlugs.includes(slug) || !sameJson(campus, expectedCampus)) {
      err(`${label}: 220개 대학 원본에서 파생되지 않음`);
    }
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
    if (!officialUnitKeysByCode.get(unit.unvCd)?.has(key)) err(`${label}: 220개 대학 원본 모집단위에서 누락`);
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
const expectedCoverageUniversities = Object.fromEntries(Object.entries(officialUniversities).map(([code, university]) => [
  code,
  {
    ...Object.fromEntries(Object.entries(university).filter(([key]) => key !== 'units')),
    ratioStatus: officialRatioUniversities[code]?.status,
    ratioTableCount: officialRatioUniversities[code]?.ratioTableCount,
    ratioSourceUrl: officialRatioUniversities[code]?.sourceUrl,
    ratioTextLength: officialRatioUniversities[code]?.criteriaTextLength,
  },
]));
if (!sameJson(publicCoverage._meta, officialMeta)) err('공개 상태 파일과 공식 원본의 _meta 불일치');
if (!sameJson(coverageSchools, expectedCoverageSchools)) err('공개 상태 파일이 공식 원본의 경량 사본과 불일치');
if (!sameJson(coverageUniversities, expectedCoverageUniversities)) err('공개 대학코드 상태가 공식 원본의 경량 사본과 불일치');
if (Object.values(coverageSchools).some(school => Object.hasOwn(school, 'units'))) err('공개 상태 파일에 대용량 units 배열 포함');
if (Object.values(coverageUniversities).some(university => Object.hasOwn(university, 'units'))) err('공개 대학코드 상태에 대용량 units 배열 포함');
if (Object.values(coverageUniversities).some(university => Object.hasOwn(university, 'ratioTables') || Object.hasOwn(university, 'sectionText'))) {
  err('공개 대학코드 상태에 대용량 반영비율 원문 포함');
}

expectMeta(manualResults._meta, 'scoreYear', officialMeta.resultYear, 'manual-results');
expectMeta(manualResults._meta, 'official2026TargetSchoolCount', officialMeta.targetSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026MappedSchoolCount', officialMeta.mappedSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026UnlistedSchoolCount', officialMeta.unlistedSchoolCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026SchoolCount', officialMeta.schoolsWithNumericCut, 'manual-results');
expectMeta(manualResults._meta, 'official2026UnitCount', officialMeta.numericCutCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026UniversityCount', officialMeta.auditedOfficialUniversityCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026UniversityNumericCount', officialMeta.officialUniversitiesWithNumericCut, 'manual-results');
expectMeta(manualResults._meta, 'official2026UniversityUnitCount', officialMeta.officialNumericCutCount, 'manual-results');
expectMeta(manualResults._meta, 'official2026StatusFile', 'data/admissions/sources/adiga-regular-2026.json', 'manual-results');
expectMeta(manualResults._meta, 'official2026CoverageFile', 'data/admissions/adiga-coverage-2026.json', 'manual-results');

console.log(`정시 반영비율: ${ratioSchools.length}개교 / ${manualTrackCount}개 전형`);
console.log(`정시 70%컷: ${resultSchools.length}개교 / ${resultUnitCount}개 모집단위`);
console.log(`2027 어디가 반영비율 감사: ${officialRatioCodes.length}/${officialRatioMeta.officialUniversityCount}개 대학·캠퍼스 · 공식 비율 ${((ratioStatusCounts.get('structured_ratio_available') || 0) + (ratioStatusCounts.get('ratio_text_available') || 0))}곳 · 구조화 표 ${fullRatioTableCount}개 · 미시행·기타·미공개 ${((ratioStatusCounts.get('criteria_text_available') || 0) + (ratioStatusCounts.get('no_selection_criteria') || 0))}곳`);
console.log(`2026 어디가 전체 감사: ${officialUniversityCodes.length}/${officialMeta.officialUniversityCount}개 대학·캠퍼스 · 숫자 ${fullNumericUniversityCount}곳 ${fullOfficialUnitCount}건 · 미공개 ${officialUniversityCodes.length - fullNumericUniversityCount}곳`);
console.log(`2026 어디가 공식 감사: ${officialSlugs.length}/${ratioSchools.length}개교 · 숫자 ${numericSchoolCount}개교 ${officialUnitCount}건 · 미공개 ${officialSlugs.length - numericSchoolCount}개교`);
console.log(`연도별 입결 학교 수: ${Object.entries(resultYearSchools).sort().map(([year, count]) => `${year}=${count}`).join(', ')}`);
if (errors.length) {
  console.error(`\n검증 실패 ${errors.length}건`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('정시 데이터 검증 OK');
