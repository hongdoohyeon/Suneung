#!/usr/bin/env node
// 고1·고2 학평 및 논술 기출 커버리지를 집계하고 회귀 조건을 검증한다.

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const exams = JSON.parse(await readFile(new URL('data/exams.json', ROOT), 'utf8'));
const answers = JSON.parse(await readFile(new URL('data/answers.json', ROOT), 'utf8'));
const essayTarget = JSON.parse(await readFile(new URL('data/sources/essay-universities-2027.json', ROOT), 'utf8'));
const essayReports2026 = JSON.parse(await readFile(new URL('data/sources/essay-reports-2026.json', ROOT), 'utf8'));
const manualRatios = JSON.parse(await readFile(new URL('data/admissions/manual-ratios.json', ROOT), 'utf8'));
const manualResults = JSON.parse(await readFile(new URL('data/admissions/manual-results.json', ROOT), 'utf8'));
const adigaCoverage = JSON.parse(await readFile(new URL('data/admissions/adiga-coverage-2026.json', ROOT), 'utf8'));
const adigaRatios = JSON.parse(await readFile(new URL('data/admissions/sources/adiga-regular-ratios-2027.json', ROOT), 'utf8'));
const ratioSupplements = JSON.parse(await readFile(new URL('data/admissions/sources/regular-ratio-supplements-2027.json', ROOT), 'utf8'));
const historicalKiceSolutions = JSON.parse(await readFile(new URL('data/sources/ebsi-kice-solutions-2006-2020.json', ROOT), 'utf8'));
const leet2027 = JSON.parse(await readFile(new URL('data/sources/leet-2027.json', ROOT), 'utf8'));
const military2027 = JSON.parse(await readFile(new URL('data/sources/military-2027.json', ROOT), 'utf8'));
const materialBackfills = JSON.parse(await readFile(new URL('data/sources/material-backfills.json', ROOT), 'utf8'));
const errors = [];

const recentEducation = exams.filter(e => e.typeGroup === 'education' && e.examYear >= 2025);
if (recentEducation.some(e => !e.questionUrl || !e.answerUrl)) {
  errors.push('2025년 이후 학평 문제지 또는 정답·해설 누락');
}
if (recentEducation.some(e => !e.answerIncludesSolution)) {
  errors.push('2025년 이후 학평 정답·해설 문서 분류 누락');
}

const modernKice = exams.filter(e => e.typeGroup === 'suneung' && e.gradeYear >= 2022
  && ['csat', 'june', 'sept'].includes(e.type));
const missingModernKiceSolutions = modernKice.filter(e => !e.solutionUrl);
if (missingModernKiceSolutions.length) {
  errors.push(`2022학년도 이후 평가원 정답·해설 누락 ${missingModernKiceSolutions.length}건`);
}
if (modernKice.some(e => e.solutionUrl && e.solutionSource === 'EBSi'
  && !e.solutionUrl.startsWith('https://wdown.ebsi.co.kr/'))) {
  errors.push('EBSi 평가원 해설 출처와 URL 호스트 불일치');
}
const historicalKiceSolutionIds = new Set(historicalKiceSolutions.records.map(record => record.id));
if (historicalKiceSolutions.count !== 1588
  || historicalKiceSolutions.records.length !== historicalKiceSolutions.count
  || historicalKiceSolutionIds.size !== historicalKiceSolutions.count) {
  errors.push(`2007~2021학년도 EBSi 평가원 해설 출처 ${historicalKiceSolutions.records.length}건 무결성 불일치`);
}
if (historicalKiceSolutions.records.some(record => {
  const exam = exams.find(item => item.id === record.id);
  return !exam || exam.solutionUrl !== record.solutionUrl || exam.solutionSource !== 'EBSi'
    || exam.gradeYear !== record.gradeYear || exam.type !== record.type
    || exam.subject !== record.subject || exam.subSubject !== record.subSubject;
})) {
  errors.push('2007~2021학년도 EBSi 평가원 해설과 exams.json 불일치');
}

const leet2027Ids = new Set(leet2027.records.map(record => record.id));
if (leet2027.records.length !== 3 || leet2027Ids.size !== 3
  || leet2027.records.map(record => record.subject).sort().join(',') !== '논술,언어이해,추리논증') {
  errors.push('2027학년도 LEET 공식 자료 구성 불일치');
}
if (leet2027.records.some(record => {
  const exam = exams.find(item => item.id === record.id);
  const expectedAnswerUrl = record.answerAsset
    ? `https://suneung-files.hdh061224.workers.dev/leet-v1/${record.answerAsset}`
    : null;
  return !exam || exam.gradeYear !== leet2027.gradeYear || exam.examYear !== leet2027.examYear
    || exam.curriculum !== 'LEET' || exam.typeGroup !== 'leet' || exam.type !== 'leet_annual'
    || exam.subject !== record.subject || exam.sourcePage !== record.sourcePost
    || !exam.questionUrl.startsWith(`https://suneung-files.hdh061224.workers.dev/leet-v1/${record.questionAsset}`)
    || (expectedAnswerUrl ? !exam.answerUrl?.startsWith(expectedAnswerUrl) : exam.answerUrl !== null)
    || !/^[0-9a-f]{64}$/.test(record.questionSha256);
})) {
  errors.push('2027학년도 LEET 공식 출처와 exams.json 불일치');
}
if (leet2027.records.some(record => {
  const stored = answers[String(record.id)];
  return record.answers === null ? stored !== undefined : JSON.stringify(stored) !== JSON.stringify(record.answers);
})) {
  errors.push('2027학년도 LEET 공식 정답과 answers.json 불일치');
}

const military2027Keys = military2027.records.map(record => `${record.subject}|${record.subSubject ?? ''}`);
if (military2027.gradeYear !== 2027 || military2027.examYear !== 2026
  || military2027.releaseTag !== 'military-v1' || military2027.records.length !== 5
  || new Set(military2027.records.map(record => record.id)).size !== 5
  || new Set(military2027Keys).size !== 5
  || military2027Keys.sort().join(',') !== '국어|,수학|기하,수학|미적분,수학|확률과통계,영어|') {
  errors.push('2027학년도 사관학교 공식 자료 구성 불일치');
}
if (military2027.answerStatus !== 'official_objection_period'
  || !military2027.answerStatusNote?.includes('2026-08-04 17:00(KST)')) {
  errors.push('2027학년도 사관학교 공식 답안 상태 메타데이터 불일치');
}
if (Object.values(military2027.documents).some(document => !document.asset
  || !document.sourceUrl?.startsWith('https://rokaf.airforce.mil.kr/')
  || !/^[0-9a-f]{64}$/.test(document.sha256))) {
  errors.push('2027학년도 사관학교 공식 원문 해시 또는 출처 누락');
}
if (military2027.records.some(record => {
  const exam = exams.find(item => item.id === record.id);
  const question = military2027.documents[record.questionDocument];
  const answer = military2027.documents[record.answerDocument];
  return !exam || !question || !answer || exam.curriculum !== '사관'
    || exam.gradeYear !== military2027.gradeYear || exam.examYear !== military2027.examYear
    || exam.typeGroup !== 'military' || exam.type !== 'military_annual'
    || exam.subject !== record.subject || exam.subSubject !== record.subSubject
    || exam.solutionUrl !== null || exam.answerStatus !== military2027.answerStatus
    || exam.source !== military2027.officialPublisher || exam.sourcePage !== military2027.officialPage
    || !exam.questionUrl?.startsWith(`https://suneung-files.hdh061224.workers.dev/${military2027.releaseTag}/${question.asset}`)
    || !exam.answerUrl?.startsWith(`https://suneung-files.hdh061224.workers.dev/${military2027.releaseTag}/${answer.asset}`)
    || JSON.stringify(answers[String(record.id)]) !== JSON.stringify(record.answers);
})) {
  errors.push('2027학년도 사관학교 공식 자료와 exams.json 또는 answers.json 불일치');
}

const materialBackfillIds = new Set(materialBackfills.records.map(record => record.id));
if (materialBackfillIds.size !== materialBackfills.records.length) {
  errors.push('자료 보강 목록 id 중복');
}
if (materialBackfills.records.some(record => {
  const exam = exams.find(item => item.id === record.id);
  return !exam || Object.entries(record.set).some(([field, value]) => exam[field] !== value);
})) {
  errors.push('자료 보강 목록과 exams.json 불일치');
}

const education2013 = {};
for (const grade of [1, 2]) {
  const rows = exams.filter(e => e.typeGroup === 'education' && e.examYear === 2013 && e.studentGrade === grade);
  const months = [...new Set(rows.map(e => e.month))].sort((a, b) => a - b);
  education2013[grade] = { rows, months };
  const expected = grade === 1 ? 37 : 85;
  if (rows.length !== expected) errors.push(`2013 고${grade} ${rows.length}건 (예상 ${expected}건)`);
  if (months.join(',') !== '3,6,9,11') errors.push(`2013 고${grade} 회차 ${months.join(',')}`);
  if (rows.some(e => !e.questionUrl || !e.solutionUrl)) errors.push(`2013 고${grade} 문제지/해설 누락`);
}

const essays = exams.filter(e => e.typeGroup === 'essay');
const essayYears = Object.entries(essays.reduce((acc, e) => {
  acc[e.gradeYear] = (acc[e.gradeYear] || 0) + 1;
  return acc;
}, {})).sort((a, b) => Number(a[0]) - Number(b[0]));
const essaySchools = Object.entries(essays.reduce((acc, e) => {
  acc[e.subject] = (acc[e.subject] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));

const rounds = new Map();
for (const e of essays) {
  const key = `${e.subject}\t${e.gradeYear}\t${e.type}`;
  const round = rounds.get(key) || { school: e.subject, year: e.gradeYear, type: e.type, q: 0, a: 0, s: 0 };
  round.q += Boolean(e.questionUrl);
  round.a += Boolean(e.answerUrl);
  round.s += Boolean(e.solutionUrl);
  rounds.set(key, round);
}
const questionOnly = [...rounds.values()].filter(r => r.q > 0 && r.a === 0 && r.s === 0);
const questionOnlySchools = Object.entries(questionOnly.reduce((acc, r) => {
  acc[r.school] = (acc[r.school] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));

const targetSchools = new Set(essayTarget.universities);
if (essayTarget.universities.length !== essayTarget.expectedUniversityCount) {
  errors.push(`2027 논술 시행대학 목록 ${essayTarget.universities.length}개 (예상 ${essayTarget.expectedUniversityCount}개)`);
}
if (targetSchools.size !== essayTarget.universities.length) errors.push('2027 논술 시행대학 목록 중복');

const representedTargetSchools = new Set(essays.filter(e => targetSchools.has(e.subject)).map(e => e.subject));
const missingTargetSchools = essayTarget.universities.filter(school => !representedTargetSchools.has(school));
if (missingTargetSchools.length) errors.push(`논술 전체 이력 누락 대학: ${missingTargetSchools.join(', ')}`);

const represented2026TargetSchools = new Set(essays
  .filter(e => e.gradeYear === 2026 && e.type === 'essay_annual' && targetSchools.has(e.subject))
  .map(e => e.subject));
const missing2026TargetSchools = essayTarget.universities.filter(school => !represented2026TargetSchools.has(school));
if (missing2026TargetSchools.length) errors.push(`2026학년도 논술 기출 누락 대학: ${missing2026TargetSchools.join(', ')}`);

const latestOfficial = essays.filter(e => e.source === 'essay-v19');
if (latestOfficial.length !== 7) errors.push(`essay-v19 ${latestOfficial.length}건 (예상 7건)`);
if (latestOfficial.some(e => !e.questionUrl?.includes('/essay-v19/') || !e.solutionUrl?.includes('/essay-v19/'))) {
  errors.push('essay-v19 문제/해설 URL 누락');
}
const latest2026Worker = essays.filter(e => e.source === 'essay-v20');
if (latest2026Worker.length !== 38) errors.push(`essay-v20 ${latest2026Worker.length}건 (예상 38건)`);
if (latest2026Worker.some(e => !e.questionUrl?.includes('/essay-v20/') || !e.solutionUrl?.includes('/essay-v20/')
  || !e.questionUrl_source_original || !e.solutionUrl_source_original)) {
  errors.push('essay-v20 문제/해설 URL 또는 공식 원문 출처 누락');
}
if (essayReports2026.documents.length !== 14) errors.push(`2026 공식 보고서 출처 ${essayReports2026.documents.length}개 (예상 14개)`);
const reportUniversities = new Set(essayReports2026.documents.map(document => document.university));
if (reportUniversities.size !== essayReports2026.documents.length) errors.push('2026 공식 보고서 출처 대학 중복');
const reportAssets = new Set(essayReports2026.documents.flatMap(document => document.asset ? [document.asset] : []));
if (reportAssets.size !== 13) errors.push(`essay-v20 원문 자산 ${reportAssets.size}개 (예상 13개)`);
if (essayReports2026.documents.some(document => !document.officialPage || !Number.isInteger(document.pages)
  || document.pages < 1 || !/^[0-9a-f]{64}$/.test(document.sha256))) {
  errors.push('2026 공식 보고서 출처 메타데이터 누락');
}
if (latest2026Worker.some(e => !reportAssets.has(new URL(e.questionUrl).pathname.split('/').at(-1)))) {
  errors.push('essay-v20 URL과 공식 보고서 출처 자산 불일치');
}
const kangnamOfficial = essays.filter(e => e.source === 'kangnam-official');
if (kangnamOfficial.length !== 3) errors.push(`강남대 공식 원문 ${kangnamOfficial.length}건 (예상 3건)`);
if (kangnamOfficial.some(e => !e.questionUrl?.startsWith('https://admission.kangnam.ac.kr/')
  || e.solutionUrl !== e.questionUrl || !e.questionUrl_source_original)) {
  errors.push('강남대 공식 원문 URL 또는 출처 누락');
}

const ratioSlugs = Object.keys(manualRatios).filter(slug => slug !== '_meta');
const ratioTrackCount = ratioSlugs.reduce((sum, slug) => sum + (manualRatios[slug].tracks?.length || 0), 0);
const resultSlugs = Object.keys(manualResults).filter(slug => slug !== '_meta');
const resultUnitCount = resultSlugs.reduce((total, slug) => total + Object.entries(manualResults[slug])
  .filter(([year, units]) => /^20\d{2}$/.test(year) && Array.isArray(units))
  .reduce((sum, [, units]) => sum + units.length, 0), 0);
const adigaSchools = Object.entries(adigaCoverage.schools || {});
const adigaNumeric = adigaSchools.filter(([, school]) => school.status === 'numeric_cut_available');
const adigaNoNumeric = adigaSchools.filter(([, school]) => school.status === 'no_numeric_cut' || school.status === 'no_rows');
const adigaUnlisted = adigaSchools.filter(([, school]) => school.status === 'not_listed_in_adiga');
const directSupplements = adigaSchools.filter(([, school]) => school.directSupplement);
const adigaUniversities = Object.entries(adigaCoverage.universities || {});
const adigaUniversityNumeric = adigaUniversities.filter(([, university]) => university.status === 'numeric_cut_available');
const adigaUniversityNoNumeric = adigaUniversities.filter(([, university]) => university.status !== 'numeric_cut_available');
const adigaAdditionalUniversities = adigaUniversities.filter(([, university]) => !(university.targetSlugs || []).length);
const adigaAdditionalNumeric = adigaAdditionalUniversities.filter(([, university]) => university.status === 'numeric_cut_available');
const adigaAdditionalUnitCount = adigaAdditionalUniversities.reduce((sum, [, university]) => sum + university.numericCutCount, 0);
const adigaRatioUniversities = Object.entries(adigaRatios.universities || {});
const adigaRatioStructured = adigaRatioUniversities.filter(([, university]) => university.status === 'structured_ratio_available');
const adigaRatioText = adigaRatioUniversities.filter(([, university]) => university.status === 'ratio_text_available');
const adigaRatioCriteriaOnly = adigaRatioUniversities.filter(([, university]) => university.status === 'criteria_text_available');
const adigaRatioUnavailable = adigaRatioUniversities.filter(([, university]) => university.status === 'no_selection_criteria');
const adigaRatioTableCount = adigaRatioUniversities.reduce((sum, [, university]) => sum + university.ratioTableCount, 0);
const adigaAdditionalRatioUniversities = adigaRatioUniversities.filter(([code]) => !(adigaCoverage.universities?.[code]?.targetSlugs || []).length);
const adigaAdditionalRatioAvailable = adigaAdditionalRatioUniversities.filter(([, university]) => university.status === 'structured_ratio_available' || university.status === 'ratio_text_available');
const ratioSupplementUniversities = Object.entries(ratioSupplements.universities || {});
const ratioSupplementStructured = ratioSupplementUniversities.filter(([, university]) => university.status === 'structured_ratio_available');
const ratioSupplementNoCsat = ratioSupplementUniversities.filter(([, university]) => university.status === 'no_csats_based_regular');
const resolvedRatioSupplements = {};

function resolveRatioSupplement(code) {
  if (resolvedRatioSupplements[code]) return resolvedRatioSupplements[code];
  const supplement = ratioSupplements.universities?.[code];
  if (!supplement) return adigaRatios.universities?.[code];
  const inherited = supplement.inheritFrom ? resolveRatioSupplement(supplement.inheritFrom) : adigaRatios.universities?.[code];
  const resolved = { ...(inherited || {}), ...supplement };
  if (!Object.hasOwn(supplement, 'ratioTables')) resolved.ratioTables = inherited?.ratioTables || [];
  if (!Object.hasOwn(supplement, 'sectionText')) resolved.sectionText = inherited?.sectionText || '';
  delete resolved.inheritFrom;
  resolvedRatioSupplements[code] = resolved;
  return resolved;
}

for (const [code] of ratioSupplementUniversities) resolveRatioSupplement(code);
const mergedRatioUniversities = {
  ...(adigaRatios.universities || {}),
  ...resolvedRatioSupplements,
};
const mergedRatioEntries = Object.entries(mergedRatioUniversities);
const mergedRatioStructured = mergedRatioEntries.filter(([, university]) => university.status === 'structured_ratio_available');
const mergedRatioText = mergedRatioEntries.filter(([, university]) => university.status === 'ratio_text_available');
const mergedRatioNoCsat = mergedRatioEntries.filter(([, university]) => university.status === 'no_csats_based_regular');
const mergedRatioUnresolved = mergedRatioEntries.filter(([, university]) => university.status === 'criteria_text_available' || university.status === 'no_selection_criteria');
const mergedRatioTableCount = mergedRatioEntries.reduce((sum, [, university]) => sum + (university.ratioTables?.length || 0), 0);
const mergedAdditionalRatioUniversities = mergedRatioEntries.filter(([code]) => !(adigaCoverage.universities?.[code]?.targetSlugs || []).length);
const mergedAdditionalRatioAvailable = mergedAdditionalRatioUniversities.filter(([, university]) => university.status === 'structured_ratio_available' || university.status === 'ratio_text_available');
const mergedAdditionalRatioNoCsat = mergedAdditionalRatioUniversities.filter(([, university]) => university.status === 'no_csats_based_regular');
const ratioSupplementTableCount = Object.values(resolvedRatioSupplements).reduce((sum, university) => sum + (university.ratioTables?.length || 0), 0);

if (ratioSlugs.length !== 103 || manualRatios._meta?.schoolCount !== ratioSlugs.length) {
  errors.push(`정시 반영비율 ${ratioSlugs.length}개교 (예상 103개교)`);
}
if (adigaCoverage._meta?.targetSchoolCount !== ratioSlugs.length
  || adigaCoverage._meta?.auditedSchoolCount !== adigaSchools.length
  || adigaSchools.length !== ratioSlugs.length) {
  errors.push(`2026 어디가 감사 ${adigaSchools.length}/${ratioSlugs.length}개교`);
}
if (adigaUniversities.length !== 220
  || adigaCoverage._meta?.auditedOfficialUniversityCount !== adigaUniversities.length
  || adigaCoverage._meta?.officialUniversityCount !== adigaUniversities.length) {
  errors.push(`2026 어디가 전체 감사 ${adigaUniversities.length}/220개 대학·캠퍼스`);
}
if (adigaUniversityNumeric.length !== 182
  || adigaCoverage._meta?.officialUniversitiesWithNumericCut !== adigaUniversityNumeric.length
  || adigaCoverage._meta?.officialNumericCutCount !== 4821) {
  errors.push(`2026 어디가 전체 숫자 공개 ${adigaUniversityNumeric.length}곳 ${adigaCoverage._meta?.officialNumericCutCount}건 (예상 182곳 4821건)`);
}
if (adigaUniversityNoNumeric.length !== 38
  || adigaCoverage._meta?.officialUniversitiesWithoutNumericCut !== adigaUniversityNoNumeric.length) {
  errors.push(`2026 어디가 전체 숫자 미공개 ${adigaUniversityNoNumeric.length}곳 (예상 38곳)`);
}
if (adigaAdditionalUniversities.length !== 103 || adigaAdditionalNumeric.length !== 73 || adigaAdditionalUnitCount !== 1070) {
  errors.push(`반영비율 외 공식 입결 ${adigaAdditionalUniversities.length}코드 · 숫자 ${adigaAdditionalNumeric.length}곳 ${adigaAdditionalUnitCount}건`);
}
if (adigaRatioUniversities.length !== 220
  || adigaRatios._meta?.auditedOfficialUniversityCount !== adigaRatioUniversities.length
  || adigaRatioStructured.length !== 176 || adigaRatioText.length !== 17
  || adigaRatioCriteriaOnly.length !== 1 || adigaRatioUnavailable.length !== 26
  || adigaRatioTableCount !== 391) {
  errors.push(`2027 어디가 반영비율 감사 ${adigaRatioUniversities.length}/220 · 구조화 ${adigaRatioStructured.length} · 텍스트 ${adigaRatioText.length} · 기타 ${adigaRatioCriteriaOnly.length} · 미공개 ${adigaRatioUnavailable.length} · 표 ${adigaRatioTableCount}`);
}
if (adigaAdditionalRatioUniversities.length !== 103 || adigaAdditionalRatioAvailable.length !== 83) {
  errors.push(`추가 대학 공식 반영비율 ${adigaAdditionalRatioAvailable.length}/${adigaAdditionalRatioUniversities.length}곳 (예상 83/103)`);
}
const rawUnresolvedRatioCodes = [...adigaRatioCriteriaOnly, ...adigaRatioUnavailable].map(([code]) => code).sort();
const supplementedRatioCodes = ratioSupplementUniversities.map(([code]) => code).sort();
if (rawUnresolvedRatioCodes.join(',') !== supplementedRatioCodes.join(',')) {
  errors.push(`2027 정시 보강 코드 불일치: 원본 ${rawUnresolvedRatioCodes.length}곳 · 보강 ${supplementedRatioCodes.length}곳`);
}
if (ratioSupplementUniversities.length !== 27 || ratioSupplementStructured.length !== 16
  || ratioSupplementNoCsat.length !== 11 || ratioSupplementTableCount !== 35
  || ratioSupplements._meta?.resolvedUniversityCount !== 27) {
  errors.push(`2027 정시 공식 보강 ${ratioSupplementUniversities.length}곳 · 구조화 ${ratioSupplementStructured.length} · 수능 미반영 ${ratioSupplementNoCsat.length} · 표 ${ratioSupplementTableCount}`);
}
if (mergedRatioEntries.length !== 220 || mergedRatioStructured.length !== 192 || mergedRatioText.length !== 17
  || mergedRatioNoCsat.length !== 11 || mergedRatioUnresolved.length !== 0 || mergedRatioTableCount !== 426) {
  errors.push(`2027 정시 최종 해소 ${mergedRatioEntries.length}/220 · 구조화 ${mergedRatioStructured.length} · 텍스트 ${mergedRatioText.length} · 수능 미반영 ${mergedRatioNoCsat.length} · 미해결 ${mergedRatioUnresolved.length} · 표 ${mergedRatioTableCount}`);
}
if (mergedAdditionalRatioUniversities.length !== 103 || mergedAdditionalRatioAvailable.length !== 93
  || mergedAdditionalRatioNoCsat.length !== 10) {
  errors.push(`추가 대학 최종 정시 상태: 비율 ${mergedAdditionalRatioAvailable.length} · 수능 미반영 ${mergedAdditionalRatioNoCsat.length} / ${mergedAdditionalRatioUniversities.length}`);
}
if (adigaNumeric.length !== 94 || adigaCoverage._meta?.schoolsWithNumericCut !== adigaNumeric.length
  || adigaCoverage._meta?.numericCutCount !== 3751) {
  errors.push(`2026 어디가 숫자 공개 ${adigaNumeric.length}개교 ${adigaCoverage._meta?.numericCutCount}건 (예상 94개교 3751건)`);
}
if (adigaNoNumeric.length !== 5 || adigaUnlisted.length !== 4
  || adigaCoverage._meta?.schoolsWithoutNumericCut !== adigaNoNumeric.length + adigaUnlisted.length) {
  errors.push(`2026 어디가 숫자 미공개 상태: 등재 ${adigaNoNumeric.length}개교, 미등재 ${adigaUnlisted.length}개교`);
}
if (manualResults._meta?.schoolCount !== resultSlugs.length || manualResults._meta?.unitCount !== resultUnitCount) {
  errors.push(`정시 누적 입결 메타 불일치: ${resultSlugs.length}개교 ${resultUnitCount}건`);
}
const ratioSlugSet = new Set(ratioSlugs);
const missingAdigaSlugs = ratioSlugs.filter(slug => !adigaCoverage.schools?.[slug]);
const extraAdigaSlugs = adigaSchools.map(([slug]) => slug).filter(slug => !ratioSlugSet.has(slug));
if (missingAdigaSlugs.length || extraAdigaSlugs.length) {
  errors.push(`정시 대상/어디가 slug 불일치: 누락 ${missingAdigaSlugs.join(', ') || '없음'}, 초과 ${extraAdigaSlugs.join(', ') || '없음'}`);
}

const supplementStatusLabel = {
  alternative_metric_available: '백분위가 아닌 대학 환산점수 공개',
  regular_result_not_published: '2026학년도 정시 성적자료 미게시',
  official_result_notice_published: '대학 공식 결과 공지 확인',
  official_analysis_attachment_published: '대학 공식 결과 분석 첨부 확인',
  official_cut_not_confirmed: '공식 사이트에서 구조화된 70%컷 미확인',
};
const unavailableLines = [...adigaNoNumeric, ...adigaUnlisted]
  .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko'))
  .map(([, school]) => `- ${school.name}: ${school.status === 'not_listed_in_adiga' ? '어디가 일반대학 목록 미등재' : '어디가 결과표에 백분위 70% 평균 공개값 없음'}`);
const supplementLines = directSupplements
  .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko'))
  .map(([, school]) => `- ${school.name}: ${supplementStatusLabel[school.directSupplement.status] || school.directSupplement.status}`);
const allUnavailableLines = adigaUniversityNoNumeric
  .sort((a, b) => a[1].officialName.localeCompare(b[1].officialName, 'ko') || a[1].campus.localeCompare(b[1].campus, 'ko'))
  .map(([, university]) => `- ${university.officialName}${university.campus === '본교' ? '' : ` (${university.campus})`}: ${Object.entries(university.missingReasons || {}).map(([reason, count]) => `${reason} ${count}건`).join(' · ') || '수능위주전형 결과 표 없음'}`);
const ratioSupplementLines = ratioSupplementUniversities
  .sort((a, b) => a[1].officialName.localeCompare(b[1].officialName, 'ko') || a[1].campus.localeCompare(b[1].campus, 'ko'))
  .map(([code, university]) => `- ${university.officialName}${university.campus === '본교' ? '' : ` (${university.campus})`}: ${university.status === 'structured_ratio_available' ? `반영비율 공식 표 ${resolvedRatioSupplements[code].ratioTables.length}개` : '수능 미반영·수능위주 미시행 공식 확인'} · ${university.sourceName}`);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const report = `# 데이터 커버리지 현황

기준일 ${today} · \`data/exams.json\` 실측

## 고1·고2 학력평가

- 고1: ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 1).length}건
- 고2: ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 2).length}건
- 2013년 보강: 고1 ${education2013[1].rows.length}건, 고2 ${education2013[2].rows.length}건
- 2013년 회차: 고1·고2 모두 ${education2013[1].months.join('·')}월
- 2013년 문제지·해설지: ${education2013[1].rows.length + education2013[2].rows.length}건 모두 EBSi 공식 PDF 연결

## 대학 논술

- 전체: ${essays.length}건 / ${essaySchools.length}개교 / ${rounds.size}개 회차
- 학년도 범위: ${essayYears[0][0]}~${essayYears.at(-1)[0]}
- 문제는 있으나 답안·해설이 없는 회차: ${questionOnly.length}개
- 2027학년도 시행대학 전체 이력: ${representedTargetSchools.size}/${essayTarget.expectedUniversityCount}개교
- 2027학년도 시행대학의 2026학년도 기출: ${represented2026TargetSchools.size}/${essayTarget.expectedUniversityCount}개교
- 2027학년도: ${essays.filter(e => e.gradeYear === 2027).length}건
- 2026학년도 공식 보고서 보강: 14개교 ${latest2026Worker.length + kangnamOfficial.length}개 시험 세트
- 2027학년도 공식 모의논술 보강: 중앙대 2건, 세종대 3건, 연세대 미래캠퍼스 2건

### 학년도별 건수

${essayYears.map(([year, count]) => `- ${year}: ${count}건`).join('\n')}

### 학교별 건수

${essaySchools.map(([school, count]) => `- ${school}: ${count}건`).join('\n')}

### 문제만 보유한 회차

${questionOnlySchools.map(([school, count]) => `- ${school}: ${count}회차`).join('\n')}

## 정시 반영비율·입결

- 표준화 반영비율: ${ratioSlugs.length}개교 / ${ratioTrackCount}개 전형
- 2027학년도 어디가 수능위주전형 전체 감사: ${adigaRatioUniversities.length}/${adigaRatios._meta.officialUniversityCount}개 대학·캠퍼스
- 어디가 원본 반영비율 공개: ${adigaRatioStructured.length + adigaRatioText.length}곳 (구조화 표 ${adigaRatioStructured.length}곳 ${adigaRatioTableCount}개 · 공식 텍스트 ${adigaRatioText.length}곳)
- 어디가 원본 미시행·기타·비율 미공개: ${adigaRatioCriteriaOnly.length + adigaRatioUnavailable.length}곳
- 대학 입학처·공식 자료 보강: ${ratioSupplementUniversities.length}/${adigaRatioUniversities.length - adigaRatioStructured.length - adigaRatioText.length}곳 (구조화 ${ratioSupplementStructured.length}곳 ${ratioSupplementTableCount}개 표 · 수능 미반영·미시행 ${ratioSupplementNoCsat.length}곳)
- 최종 공식 상태 해소: ${mergedRatioEntries.length}/${adigaRatioUniversities.length}곳 (반영비율 ${mergedRatioStructured.length + mergedRatioText.length}곳 · 수능 미반영·미시행 ${mergedRatioNoCsat.length}곳 · 미해결 ${mergedRatioUnresolved.length}곳)
- 최종 구조화 표: ${mergedRatioStructured.length}곳 / ${mergedRatioTableCount}개
- 기존 103개교 밖 추가 공식 상태: 반영비율 ${mergedAdditionalRatioAvailable.length}/${mergedAdditionalRatioUniversities.length}개 대학코드 · 수능 미반영·미시행 ${mergedAdditionalRatioNoCsat.length}개 · 미해결 ${mergedAdditionalRatioUniversities.length - mergedAdditionalRatioAvailable.length - mergedAdditionalRatioNoCsat.length}개
- 2026학년도 어디가 일반대학 전체 감사: ${adigaUniversities.length}/${adigaCoverage._meta.officialUniversityCount}개 대학·캠퍼스
- 전체 공식 백분위 70% 평균 공개: ${adigaUniversityNumeric.length}곳 / ${adigaCoverage._meta.officialNumericCutCount}개 모집단위
- 전체 공식 숫자 미공개: ${adigaUniversityNoNumeric.length}곳
- 반영비율 외 추가 공식 입결: ${adigaAdditionalUniversities.length}개 대학코드 중 ${adigaAdditionalNumeric.length}곳 / ${adigaAdditionalUnitCount}개 모집단위
- 반영비율 대상 공식 결과 감사: ${adigaSchools.length}/${ratioSlugs.length}개교 · 숫자 ${adigaNumeric.length}개교 / ${adigaCoverage._meta.numericCutCount}개 모집단위
- 반영비율 대상 공식 숫자 미공개: ${adigaNoNumeric.length + adigaUnlisted.length}개교 (어디가 등재 ${adigaNoNumeric.length}개교, 과학기술원 등 미등재 ${adigaUnlisted.length}개교)
- 2021~2026학년도 누적 참고 입결: ${resultSlugs.length}개교 / ${resultUnitCount}개 모집단위
- 대학 입학처 별도 공개 상태 보강: ${directSupplements.length}개교

### 2026학년도 공식 숫자 미공개 대학

${unavailableLines.join('\n')}

### 대학 입학처 별도 확인

${supplementLines.join('\n')}

### 어디가 전체 공식 숫자 미공개 대학·캠퍼스

${allUnavailableLines.join('\n')}

### 2027학년도 어디가 누락 27곳 공식 보강

${ratioSupplementLines.join('\n')}

## 해석 주의

- 논술 본고사는 대학이 예시답안·해설을 공개하지 않는 경우가 많아, 문제만 있는 회차가 곧 수집 실패를 뜻하지는 않는다.
- 2027학년도 모의논술은 대학별 공개 일정이 달라 수시로 갱신해야 한다.
- 2027학년도 어디가 원본에서 비율이 없던 27개 대학·캠퍼스는 대학 입학처 시행계획과 공식 어디가 문구로 모두 보강했다. 반영비율 16곳과 수능 미반영·미시행 11곳으로 분리해 미해결 상태는 0곳이다.
- 캠퍼스 통합 시행계획과 수시 미충원 이월 전형은 적용 범위를 별도 표기하며, 선택 영역을 임의로 동일 비율로 정규화하지 않는다.
- 어디가 220개 대학·캠퍼스 중 38곳, 반영비율 대상 103개교 중 9개교는 공식 수치 미공개 또는 미등재 상태다. 대체 척도는 백분위로 변환하지 않는다.
- 정시 데이터의 원본-사이트 동기화는 \`npm run validate-admissions\`에서 별도 검증한다.
`;

console.log(`고1 ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 1).length}건 / 고2 ${exams.filter(e => e.typeGroup === 'education' && e.studentGrade === 2).length}건`);
console.log(`2025년 이후 학평 ${recentEducation.length}건 문제지·정답·해설 분류 완전`);
console.log(`2022학년도 이후 평가원 ${modernKice.length}건 중 정답·해설 ${modernKice.filter(e => e.solutionUrl).length}건 (2022 수능 과탐 합본 1건 제외 완전)`);
console.log(`2027학년도 LEET ${leet2027.records.length}과목 공식 문제지 · 객관식 정답 ${leet2027.records.filter(record => record.answers).length}과목`);
console.log(`논술 ${essays.length}건 / ${essaySchools.length}개교 / 문제만 ${questionOnly.length}회차 / 2027학년도 ${essays.filter(e => e.gradeYear === 2027).length}건`);
console.log(`2027 시행대학 전체 이력 ${representedTargetSchools.size}/${essayTarget.expectedUniversityCount}개교 / 2026 기출 ${represented2026TargetSchools.size}/${essayTarget.expectedUniversityCount}개교`);
console.log(`정시 반영비율 표준화 ${ratioSlugs.length}개교 ${ratioTrackCount}전형 / 2027 최종 ${mergedRatioEntries.length}곳 해소 · 비율 ${mergedRatioStructured.length + mergedRatioText.length}곳 · 수능 미반영 ${mergedRatioNoCsat.length}곳 · 미해결 ${mergedRatioUnresolved.length}곳 / 2026 입결 ${adigaUniversityNumeric.length}곳 ${adigaCoverage._meta.officialNumericCutCount}컷`);
if (errors.length) {
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
if (process.argv.includes('--write')) {
  await writeFile(new URL('docs/데이터-커버리지-현황.md', ROOT), report, 'utf8');
  console.log('docs/데이터-커버리지-현황.md 갱신 완료');
}
