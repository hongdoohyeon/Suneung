#!/usr/bin/env node
// data/exams.json 의 스키마 + 비즈니스 룰 검증.
// 외부 의존성 없음. `npm run validate` 또는 직접 실행.
//
// 종료 코드: 0 = OK, 1 = 검증 실패.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, normalize, isAbsolute } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_PATH    = resolve(ROOT, 'data/exams.json');
const SCHEMA_PATH  = resolve(ROOT, 'data/exams.schema.json');
const ANSWERS_PATH = resolve(ROOT, 'data/answers.json');
const GRADECUTS_PATH = resolve(ROOT, 'data/gradecuts.json');

const TRUSTED_DOCUMENT_HOSTS = new Set([
  'admission.kangnam.ac.kr',
  'suneung-files.hdh061224.workers.dev',
  'wdown.ebsi.co.kr',
]);

// 표준 문항 수 (normalize-answers.mjs 와 동일 정의 — 단일 진실 소스로 유지)
const SUNEUNG_LIKE = new Set(['suneung', 'education']);
const SUNEUNG_LENGTH = {
  '국어': 45, '영어': 45, '수학': 30, '한국사': 20, '사회탐구': 20, '과학탐구': 20,
};
const PRELIM_LENGTH = {
  '국어': 45, '수학': 30, '통합사회': 25, '통합과학': 24,
};
function expectedAnswerLength(exam) {
  // 평가원 예비(prelim) 는 typeGroup='suneung' 이지만 문항수가 다름 → type 우선 분기
  if (exam.type === 'prelim') return PRELIM_LENGTH[exam.subject] ?? null;
  if (SUNEUNG_LIKE.has(exam.typeGroup)) return SUNEUNG_LENGTH[exam.subject] ?? null;
  return null;
}

const errors = [];
const warns  = [];
const err  = (m) => errors.push(m);
const warn = (m) => warns.push(m);

function checkType(val, type, path) {
  if (Array.isArray(type)) return type.some(t => checkType(val, t, path));
  if (type === 'null')    return val === null;
  if (type === 'integer') return Number.isInteger(val);
  if (type === 'string')  return typeof val === 'string';
  if (type === 'object')  return val && typeof val === 'object' && !Array.isArray(val);
  return typeof val === type;
}

function validateAgainstSchema(data, schema) {
  const itemSchema = schema.definitions?.Exam;
  if (!itemSchema) return err('schema.definitions.Exam missing');

  const allowedProps = new Set(Object.keys(itemSchema.properties));
  const required     = new Set(itemSchema.required || []);

  data.forEach((item, idx) => {
    const at = `[${idx}](id=${item?.id})`;
    if (!checkType(item, 'object', at)) {
      return err(`${at} not an object`);
    }
    // additionalProperties — schema additionalProperties:true 면 알수없는 속성 허용
    if (itemSchema.additionalProperties === false) {
      for (const k of Object.keys(item)) {
        if (!allowedProps.has(k)) err(`${at} unknown property "${k}"`);
      }
    }
    // required + per-property
    for (const [k, spec] of Object.entries(itemSchema.properties)) {
      const has = k in item;
      if (!has) {
        if (required.has(k)) err(`${at} missing required "${k}"`);
        continue;
      }
      const v = item[k];
      // type
      if (spec.type) {
        const types = Array.isArray(spec.type) ? spec.type : [spec.type];
        if (!types.some(t => checkType(v, t))) {
          err(`${at} "${k}" type mismatch: expected ${types.join('|')}, got ${v === null ? 'null' : typeof v}`);
          continue;
        }
      } else if (spec.anyOf) {
        const ok = spec.anyOf.some(s => {
          if (s.type === 'null') return v === null;
          if (s.type === 'string') return typeof v === 'string';
          return false;
        });
        if (!ok) err(`${at} "${k}" anyOf mismatch`);
      }
      // enum
      if (spec.enum && !spec.enum.includes(v)) {
        err(`${at} "${k}" not in enum: "${v}" (allowed: ${spec.enum.join(', ')})`);
      }
      // numeric range
      if (typeof v === 'number') {
        if (spec.minimum !== undefined && v < spec.minimum) err(`${at} "${k}"=${v} < min ${spec.minimum}`);
        if (spec.maximum !== undefined && v > spec.maximum) err(`${at} "${k}"=${v} > max ${spec.maximum}`);
      }
    }
  });
}

function validateBusinessRules(data) {
  // 1. id 유니크
  const idCount = new Map();
  for (const ex of data) {
    idCount.set(ex.id, (idCount.get(ex.id) || 0) + 1);
  }
  for (const [id, c] of idCount) {
    if (c > 1) err(`id 중복: ${id} (${c}회)`);
  }

  // 2. (curriculum, gradeYear, type, subject, subSubject, studentGrade) 조합 유니크
  // 학평은 같은 year/type/subject라도 학년(고1/2/3) 다르면 별개 시험.
  // 검정고시는 같은 year/회차/과목이라도 학력(초·중·고졸) 다르면 별개 → curriculum 포함.
  const comboCount = new Map();
  for (const ex of data) {
    const k = JSON.stringify([
      ex.curriculum, ex.gradeYear, ex.type, ex.subject, ex.subSubject,
      ex.studentGrade ?? null,
    ]);
    if (!comboCount.has(k)) comboCount.set(k, []);
    comboCount.get(k).push(ex.id);
  }
  for (const [k, ids] of comboCount) {
    if (ids.length > 1) {
      // 옛 수능(1994~1998 가/나형) 자료는 KICE 게시글이 분리되어 있어 자연스러운 중복 발생.
      // 배포 차단 사유로는 부적절 — 경고로 격하. 신규 자료에서만 중복 검증 강화 필요.
      warn(`동일 조합 중복 ${k} → ids=${ids.join(',')}`);
    }
  }

  // 3. URL 검증 — 신뢰 문서 호스트 외 URL은 경고, 상대 경로는 실제 파일 존재 필요
  const urlKeys = ['questionUrl', 'answerUrl', 'solutionUrl'];
  for (const ex of data) {
    for (const k of urlKeys) {
      const v = ex[k];
      if (!v || typeof v !== 'string') continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
        try {
          const u = new URL(v);
          if (!['http:', 'https:'].includes(u.protocol)) {
            err(`id=${ex.id} ${k} 허용되지 않는 URL 스킴: ${u.protocol}`);
            continue;
          }
          if (!TRUSTED_DOCUMENT_HOSTS.has(u.hostname)) {
            warn(`id=${ex.id} ${k} 외부 호스트: ${u.hostname}`);
          }
        } catch {
          err(`id=${ex.id} ${k} URL 파싱 실패: ${v}`);
        }
      } else {
        if (v.startsWith('//') || isAbsolute(v)) {
          err(`id=${ex.id} ${k} 안전하지 않은 경로: ${v}`);
          continue;
        }
        const localPath = resolve(ROOT, normalize(v.split(/[?#]/, 1)[0]));
        if (!localPath.startsWith(ROOT) || !existsSync(localPath)) {
          // 옛 학평 일부 자료 파일이 git에 없음 — 배포 차단 사유로는 부적절. warning 으로 격하.
          warn(`id=${ex.id} ${k} 상대 경로 파일 없음: ${v}`);
        }
      }
    }
  }

  // 4. download 필드는 있을 경우 .pdf 끝나는지 (null 허용 — 논술 등)
  for (const ex of data) {
    for (const k of ['questionDownload', 'answerDownload']) {
      if (k in ex && ex[k] !== null) {
        const v = String(ex[k]);
        // 옛 LEET/MEET (~2021학년도) 자료는 .hwp 원본만 존재 — 허용.
        const lower = v.toLowerCase();
        if (!lower.endsWith('.pdf') && !lower.endsWith('.hwp')) {
          warn(`id=${ex.id} ${k}가 .pdf/.hwp로 끝나지 않음: ${v}`);
        }
      }
    }
  }

  // 5. typeGroup ↔ type 정합성 (대표 매핑)
  // 평가원 예비(prelim) 는 평가원(suneung) 그룹에 흡수 — 'preliminary' typeGroup 폐기.
  // 학평 type: 고3은 mar/apr/jul/oct, 고1·고2는 mar/jun/sep/nov.
  const tgTypeMap = {
    education:   new Set(['mar', 'apr', 'may', 'jun', 'jul', 'sep', 'oct', 'nov', 'dec']),
    suneung:     new Set(['csat', 'june', 'sept', 'prelim']),
    military:    new Set(['military_annual']),
    police:      new Set(['police_annual']),
    leet:        new Set(['leet_annual', 'prelim']),
    meet:        new Set(['meet_annual', 'prelim']),
    essay:       new Set(['essay_annual', 'essay_mock']),
    reference:   new Set(['stat']),
    ged:         new Set(['ged_1', 'ged_2']),
  };
  for (const ex of data) {
    const allowed = tgTypeMap[ex.typeGroup];
    if (allowed && !allowed.has(ex.type)) {
      err(`id=${ex.id} typeGroup="${ex.typeGroup}" 와 type="${ex.type}" 불일치`);
    }
  }
}

async function validateAnswers(exams) {
  let raw;
  try { raw = await readFile(ANSWERS_PATH, 'utf-8'); }
  catch (e) { warn(`answers.json 읽기 실패: ${e.message}`); return; }
  let answers;
  try { answers = JSON.parse(raw); }
  catch (e) { err(`answers.json 파싱 실패: ${e.message}`); return; }

  const examById = new Map(exams.map(e => [e.id, e]));
  let lengthMismatch = 0, totalChecked = 0;
  let unknownAnswerExams = 0, unknownAnswerCells = 0;
  let invalidAnswerCells = 0;
  const samples = [];
  for (const [eid_str, arr] of Object.entries(answers)) {
    if (!Array.isArray(arr)) {
      err(`answers id=${eid_str} 배열이 아님`);
      continue;
    }
    const unknown = arr.filter(value => value === '?').length;
    if (unknown > 0) {
      unknownAnswerExams++;
      unknownAnswerCells += unknown;
    }
    invalidAnswerCells += arr.filter(
      value => typeof value !== 'string' || !/^\d+(,\d+)*$/.test(value)
    ).length;
    const exam = examById.get(Number(eid_str));
    if (!exam) {
      warn(`answers id=${eid_str} 매칭 시험 없음 (orphan)`);
      continue;
    }
    const expected = expectedAnswerLength(exam);
    if (expected == null) continue;   // LEET/MEET 등 기준 미정의
    totalChecked++;
    if (arr.length !== expected) {
      lengthMismatch++;
      if (samples.length < 10) samples.push(`id=${exam.id} ${exam.subject} ${arr.length}≠${expected}`);
    }
  }
  if (lengthMismatch > 0) {
    err(`answers 길이 불일치 ${lengthMismatch}/${totalChecked}건 — npm run normalize-answers 후 원본 재검증 필요`);
    for (const s of samples) errors.push('  ' + s);
  } else if (totalChecked > 0) {
    console.log(`answers 길이 검증: ${totalChecked}건 모두 정상`);
  }
  if (unknownAnswerCells > 0) {
    err(`answers 미확정 값('?') ${unknownAnswerCells}개 / ${unknownAnswerExams}개 시험 — 검증 데이터에 포함할 수 없음`);
  }
  if (invalidAnswerCells > 0) {
    err(`answers 허용되지 않은 값 ${invalidAnswerCells}개 — 숫자 또는 쉼표로 구분한 복수정답만 허용`);
  }
}

// 등급컷(gradecuts.json) rawCuts 위생 검증 — 손상 데이터(비단조·결손) 회귀 차단.
// (만점 초과는 직업탐구 등 fullScore 메타 이슈와 얽혀 별도 — 여기선 비단조·결손만.)
async function validateGradecuts() {
  let raw;
  try { raw = await readFile(GRADECUTS_PATH, 'utf-8'); }
  catch (e) { warn(`gradecuts.json 읽기 실패: ${e.message}`); return; }
  let cuts;
  try { cuts = JSON.parse(raw); }
  catch (e) { err(`gradecuts.json 파싱 실패: ${e.message}`); return; }
  if (!Array.isArray(cuts)) { err('gradecuts.json 은 배열이어야 함'); return; }
  let badRaw = 0;
  const samples = [];
  for (const c of cuts) {
    const r = c.rawCuts;
    if (!Array.isArray(r)) continue;            // rawCuts 없음(준비중) = 정상
    // non-null 값들의 부분수열이 단조감소가 아니면 손상(역전). 중간 null(부분결손)은
    // '—'로 정상 표시되므로 손상으로 보지 않는다.
    const nn = r.filter(v => v != null && Number.isFinite(v));
    const nonmono = nn.some((v, i) => i > 0 && nn[i - 1] < v);
    if (nonmono) {
      badRaw++;
      if (samples.length < 10) samples.push(`id=${c.id} ${c.subject}${c.subSubject ? '/' + c.subSubject : ''} ${c.gradeYear} ${c.type} [${r.join(',')}]`);
    }
  }
  if (badRaw > 0) {
    warn(`gradecuts rawCuts 손상(비단조/결손) ${badRaw}건 — 손상 데이터 (build-gradecuts.mjs 위생가드로 제거되어야 함)`);
    for (const s of samples) warns.push('  ' + s);
  } else {
    console.log(`gradecuts rawCuts 위생: 손상 0건`);
  }
}

function summarize(data) {
  const c = {};
  for (const ex of data) {
    c.curriculum ??= new Map(); c.typeGroup ??= new Map();
    c.curriculum.set(ex.curriculum, (c.curriculum.get(ex.curriculum) || 0) + 1);
    c.typeGroup .set(ex.typeGroup,  (c.typeGroup .get(ex.typeGroup)  || 0) + 1);
  }
  return c;
}

(async () => {
  const [rawData, rawSchema] = await Promise.all([
    readFile(DATA_PATH, 'utf-8'),
    readFile(SCHEMA_PATH, 'utf-8'),
  ]);
  let data, schema;
  try { data = JSON.parse(rawData); }   catch (e) { console.error('exams.json 파싱 실패:', e.message); process.exit(1); }
  try { schema = JSON.parse(rawSchema); } catch (e) { console.error('schema 파싱 실패:', e.message); process.exit(1); }

  if (!Array.isArray(data)) { console.error('exams.json 은 배열이어야 함'); process.exit(1); }

  // 총 건수 하한 — build-data.py 단독 재실행 등으로 surgical append 데이터가
  // 통째로 소실되는 회귀를 차단 (2026-06 기준 6,954건 — 중복 655건 정리 후.
  // 대량 정리로 하한을 낮춰야 한다면 의도된 변경인지 반드시 확인할 것).
  const MIN_ENTRIES = 6500;
  if (data.length < MIN_ENTRIES) {
    err(`총 항목 ${data.length}건 < 하한 ${MIN_ENTRIES}건 — 데이터 소실 의심 (build-data.py 단독 실행 금지, scripts/README.md 참고)`);
  }

  validateAgainstSchema(data, schema);
  validateBusinessRules(data);
  await validateAnswers(data);
  await validateGradecuts();

  const sum = summarize(data);
  console.log(`총 항목: ${data.length}`);
  console.log(`curriculum 분포: ${[...sum.curriculum].map(([k,v])=>`${k}=${v}`).join(', ')}`);

  if (warns.length) {
    console.log(`\n⚠️  경고 ${warns.length}건`);
    const warningRank = message => message.includes('answers') || message.startsWith('  id=')
      ? 0 : message.includes('외부 호스트') ? 2 : 1;
    const displayWarns = [...warns].sort((a, b) => warningRank(a) - warningRank(b));
    for (const w of displayWarns.slice(0, 20)) console.log('  ' + w);
    if (warns.length > 20) console.log(`  ... +${warns.length - 20} 건 더`);
  }
  if (errors.length) {
    console.log(`\n❌ 오류 ${errors.length}건`);
    for (const e of errors.slice(0, 50)) console.log('  ' + e);
    if (errors.length > 50) console.log(`  ... +${errors.length - 50} 건 더`);
    process.exit(1);
  } else {
    console.log('\n✅ 검증 통과');
  }
})();
