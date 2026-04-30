#!/usr/bin/env node
// data/exams.json 의 스키마 + 비즈니스 룰 검증.
// 외부 의존성 없음. `npm run validate` 또는 직접 실행.
//
// 종료 코드: 0 = OK, 1 = 검증 실패.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_PATH   = resolve(ROOT, 'data/exams.json');
const SCHEMA_PATH = resolve(ROOT, 'data/exams.schema.json');

const WORKER_HOST = 'suneung-files.hdh061224.workers.dev';

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
    // additionalProperties: false
    for (const k of Object.keys(item)) {
      if (!allowedProps.has(k)) err(`${at} unknown property "${k}"`);
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

  // 2. (gradeYear, type, subject, subSubject) 조합 유니크
  const comboCount = new Map();
  for (const ex of data) {
    const k = JSON.stringify([ex.gradeYear, ex.type, ex.subject, ex.subSubject]);
    if (!comboCount.has(k)) comboCount.set(k, []);
    comboCount.get(k).push(ex.id);
  }
  for (const [k, ids] of comboCount) {
    if (ids.length > 1) err(`동일 조합 중복 ${k} → ids=${ids.join(',')}`);
  }

  // 3. URL 도메인 검증 — http로 시작하는 URL은 worker 호스트여야 함
  const urlKeys = ['questionUrl', 'answerUrl', 'solutionUrl'];
  for (const ex of data) {
    for (const k of urlKeys) {
      const v = ex[k];
      if (!v || typeof v !== 'string') continue;
      if (v.startsWith('http')) {
        try {
          const u = new URL(v);
          if (u.hostname !== WORKER_HOST) {
            warn(`id=${ex.id} ${k} 외부 호스트: ${u.hostname}`);
          }
        } catch {
          err(`id=${ex.id} ${k} URL 파싱 실패: ${v}`);
        }
      } else {
        // 상대 경로 — 외부 호스팅으로 통일했으므로 발견 시 경고
        warn(`id=${ex.id} ${k} 상대 경로 (로컬): ${v}`);
      }
    }
  }

  // 4. download 필드는 있을 경우 .pdf 끝나는지 (null 허용 — 논술 등)
  for (const ex of data) {
    for (const k of ['questionDownload', 'answerDownload']) {
      if (k in ex && ex[k] !== null && !String(ex[k]).endsWith('.pdf')) {
        warn(`id=${ex.id} ${k}가 .pdf로 끝나지 않음: ${ex[k]}`);
      }
    }
  }

  // 5. typeGroup ↔ type 정합성 (대표 매핑)
  const tgTypeMap = {
    education:   new Set(['mar', 'apr', 'jul', 'oct']),
    suneung:     new Set(['csat', 'june', 'sept']),
    military:    new Set(['military_annual']),
    police:      new Set(['police_annual']),
    leet:        new Set(['leet_annual', 'prelim']),
    meet:        new Set(['meet_annual', 'prelim']),
    preliminary: new Set(['prelim']),
  };
  for (const ex of data) {
    const allowed = tgTypeMap[ex.typeGroup];
    if (allowed && !allowed.has(ex.type)) {
      err(`id=${ex.id} typeGroup="${ex.typeGroup}" 와 type="${ex.type}" 불일치`);
    }
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

  validateAgainstSchema(data, schema);
  validateBusinessRules(data);

  const sum = summarize(data);
  console.log(`총 항목: ${data.length}`);
  console.log(`curriculum 분포: ${[...sum.curriculum].map(([k,v])=>`${k}=${v}`).join(', ')}`);

  if (warns.length) {
    console.log(`\n⚠️  경고 ${warns.length}건`);
    for (const w of warns.slice(0, 20)) console.log('  ' + w);
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
