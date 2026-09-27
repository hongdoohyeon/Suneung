// 들어온 자료 오류 제보 보기 — node cloudflare/smart-search/reports.mjs [--all]
// (스팸으로 보이는 것은 기본으로 숨김. wrangler 로그인 필요)
import { execSync } from 'node:child_process';
const run = c => execSync(c, { cwd: import.meta.dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const keys = JSON.parse(run('npx -y wrangler@4 kv key list --binding REPORTS --remote'));
const all = process.argv.includes('--all');
const rows = keys.filter(k => all || !(k.metadata?.spam > 0.7)).sort((a, b) => b.name.localeCompare(a.name));
console.log(`제보 ${keys.length}건 (표시 ${rows.length})`);
for (const k of rows) {
  const r = JSON.parse(run(`npx -y wrangler@4 kv key get --binding REPORTS --remote "${k.name}"`));
  console.log(`${r.ts.slice(0, 16)}  https://kicegg.com/exam-${r.examId}.html  [${r.kind}${r.field ? ' · ' + r.field : ''}]${r.jev ? ` jev:${r.jev.kind} spam:${(r.jev.spam ?? 0).toFixed(2)}` : ''}\n    ${r.text || '(내용 없음)'}`);
}
