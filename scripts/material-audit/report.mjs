// 3단계: report.json → 사람이 훑어볼 HTML (tmp/material-audit/report.html)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'tmp/material-audit');
const r = JSON.parse(fs.readFileSync(path.join(DIR, 'report.json'), 'utf8'));
const exams = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8')).map(e => [e.id, e]));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = u => crypto.createHash('sha1').update(u.split('?')[0]).digest('hex').slice(0, 12);
const GROUPS = [
  ['broken', '파일이 열리지 않음', '링크가 죽었거나 서버 오류. 바로 고쳐야 하는 것.'],
  ['kind', '문서 종류가 다름', '문제지 자리에 정답표가 있는 식.'],
  ['org', '출제 기관이 다름', '평가원 시험에 교육청 자료가 붙은 식.'],
  ['subject', '영역이 다름', ''],
  ['year', '학년도가 다름', '문서에 적힌 학년도와 등록 학년도가 다름 (코드 판정).'],
  ['month', '시행 월이 다름', '문서에 적힌 월과 등록 월이 다름 (코드 판정).'],
  ['grade', '대상 학년이 다름', ''],
  ['subsub', '세부 과목이 다름', '본문에 다른 선택과목 이름이 적혀 있고 등록된 과목명은 없음.'],
  ['label', '이름 체계 (참고)', '2014~2016학년도 수학·국어 A/B형 문서를 가형/나형으로 등록. 파일은 맞고 이름만 다름.'],
];
const FIELD = { questionUrl: '문제지', questionUrlEven: '짝수형 문제지', answerUrl: '정답', solutionUrl: '해설', scriptUrl: '듣기 대본' };
function label(e) {
  const t = { csat: '수능', june: '6모', sept: '9모', prelim: '예비' }[e.type] || (e.month ? `${e.month}월` : e.type);
  return `${e.gradeYear}학년도 ${t} ${e.subject}${e.subSubject ? ' · ' + e.subSubject : ''}${e.studentGrade ? ` (고${e.studentGrade})` : ''}`;
}
let body = '';
for (const [code, title, desc] of GROUPS) {
  const list = r.issues.filter(i => i.code === code);
  if (!list.length) continue;
  body += `<section><h2>${title} <span class="n">${list.length}</span></h2>${desc ? `<p class="d">${esc(desc)}</p>` : ''}<ol>`;
  for (const i of list) {
    const e = exams.get(i.ids[0]);
    let snip = '';
    try { const p = JSON.parse(fs.readFileSync(path.join(DIR, 'pages', h(i.url) + '.json'), 'utf8')); snip = (p.page1 || '').slice(0, 180); } catch {}
    const more = i.ids.length > 1 ? ` 외 ${i.ids.length - 1}건` : '';
    body += `<li><div class="t"><a href="https://kicegg.com/exam-${e.id}.html" target="_blank">${esc(label(e))}</a>${more}
      <span class="f">${FIELD[i.field] || i.field}</span>${i.conf ? `<span class="c">확신 ${Math.round(i.conf * 100)}%</span>` : ''}</div>
      <div class="m">${esc(i.msg)} · <a href="${esc(i.url)}" target="_blank">파일 열기</a> · id ${i.ids.join(', ')}</div>
      ${snip ? `<div class="s">${esc(snip)}</div>` : ''}</li>`;
  }
  body += '</ol></section>';
}
const st = r.stats;
fs.writeFileSync(path.join(DIR, 'report.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>자료 검수 결과</title><style>
:root{--bg:#f4f4f5;--s:#fff;--l:#e2e2e6;--i:#121214;--i4:#6c6c74;--p:#0066cc}
@media(prefers-color-scheme:dark){:root{--bg:#0d0d0f;--s:#16161a;--l:#27272d;--i:#f1f1f3;--i4:#8c8c96;--p:#6aaeff}}
body{margin:0;background:var(--bg);color:var(--i);font:15px/1.55 -apple-system,"Pretendard",system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 64px}h1{font-size:26px;margin:0 0 6px}.sum{color:var(--i4);margin:0 0 24px}
section{background:var(--s);border:1px solid var(--l);border-radius:14px;padding:18px 20px;margin:0 0 16px}
h2{font-size:17px;margin:0 0 4px}.n{color:var(--i4);font-weight:500}.d{color:var(--i4);margin:0 0 10px;font-size:13.5px}
ol{margin:0;padding-left:22px}li{padding:10px 0;border-top:1px solid var(--l)}li:first-child{border-top:0}
a{color:var(--p);text-decoration:none}.t{font-weight:650}.f,.c{margin-left:8px;font-size:12px;font-weight:600;color:var(--i4);background:var(--bg);padding:1px 7px;border-radius:6px}
.m{font-size:13.5px;margin-top:2px}.s{font-size:12px;color:var(--i4);margin-top:4px;word-break:break-all}
</style><main><h1>자료 검수 결과</h1>
<p class="sum">PDF ${st.items.toLocaleString()}건 검사 · JEV 판정 ${st.judged.toLocaleString()}건 · 텍스트 없는 스캔본 ${st.noText}건(판정 제외) · JEV 비용 $${st.costUSD} · ${esc(r.generatedAt.slice(0, 16).replace('T', ' '))} UTC</p>
${body}</main></html>`);
console.log('tmp/material-audit/report.html');
