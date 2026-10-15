// 들어온 자료 오류 제보 보기 — node cloudflare/smart-search/reports.mjs [--all]
// (스팸·해결된 것은 기본으로 숨김, --all 이면 전부. wrangler 로그인 필요)
// 해결 표시 — node cloudflare/smart-search/reports.mjs --resolve <키 끝 8자리|전체 키> "무엇을 했는지"
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = c => execSync(c, { cwd: import.meta.dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const keys = JSON.parse(run('npx -y wrangler@4 kv key list --binding REPORTS --remote'));
const get = name => JSON.parse(run(`npx -y wrangler@4 kv key get --binding REPORTS --remote "${name}"`));

const ri = process.argv.indexOf('--resolve');
if (ri >= 0) {
  const id = process.argv[ri + 1], note = process.argv[ri + 2] || '';
  const k = keys.find(k => k.name === id || k.name.endsWith(':' + id));
  if (!k) { console.error(`키 없음: ${id}`); process.exit(1); }
  const r = get(k.name);
  r.resolved = { at: new Date().toISOString(), note };
  const f = join(tmpdir(), `report-${process.pid}.json`);
  writeFileSync(f, JSON.stringify(r));
  const meta = JSON.stringify({ ...k.metadata, resolved: 1 }).replace(/'/g, "'\\''");
  run(`npx -y wrangler@4 kv key put --binding REPORTS --remote "${k.name}" --path "${f}" --metadata '${meta}'${k.expiration ? ` --expiration ${k.expiration}` : ''}`);
  rmSync(f);
  console.log(`해결 표시: ${k.name} — ${note}`);
  process.exit(0);
}

const all = process.argv.includes('--all');
const rows = keys.filter(k => all || !(k.metadata?.spam > 0.7 || k.metadata?.resolved)).sort((a, b) => b.name.localeCompare(a.name));
console.log(`제보 ${keys.length}건 (표시 ${rows.length}, 해결 ${keys.filter(k => k.metadata?.resolved).length})`);
for (const k of rows) {
  const r = get(k.name);
  console.log(`${r.ts.slice(0, 16)}  https://kicegg.com/exam-${r.examId}.html  [${r.kind}${r.field ? ' · ' + r.field : ''}]${r.jev ? ` jev:${r.jev.kind} spam:${(r.jev.spam ?? 0).toFixed(2)}` : ''}  키:${k.name.slice(-8)}\n    ${r.text || '(내용 없음)'}${r.env ? `\n    환경: ${r.env}${r.screen ? ' · ' + r.screen : ''}${r.country ? ' · ' + r.country : ''}` : ''}${r.resolved ? `\n    ✅ 해결 ${r.resolved.at.slice(0, 10)}: ${r.resolved.note}` : ''}`);
}
