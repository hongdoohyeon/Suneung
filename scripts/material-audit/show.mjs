// 보고서 훑어보기: node scripts/material-audit/show.mjs [code] [n]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '../..');
const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp/material-audit/report.json'), 'utf8'));
const exams = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8')).map(e => [e.id, e]));
const [code, n = 8] = process.argv.slice(2);
for (const i of r.issues.filter(i => !code || i.code === code).slice(0, +n)) {
  const e = exams.get(i.ids[0]);
  const h = crypto.createHash('sha1').update(i.url.split('?')[0]).digest('hex').slice(0, 12);
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp/material-audit/pages', h + '.json'), 'utf8'));
  console.log(`[${i.code}] ${i.msg} ${i.conf ? '(' + i.conf.toFixed(2) + ')' : ''} · id ${i.ids.join(',')} · ${e.gradeYear} ${e.typeGroup}/${e.type} ${e.subject}/${e.subSubject || ''} ${i.field}`);
  console.log('   ', (p.page1 || '').slice(0, 220).replace(/\s+/g, ' '));
}
