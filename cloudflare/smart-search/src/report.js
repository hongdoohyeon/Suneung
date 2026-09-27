// kicegg.com/api/report — 자료 오류 제보 접수. KV(REPORTS)에 90일 보관, JEV 로 유형·스팸 여부를 미리 분류해 둔다.
// 개인정보는 받지 않는다(이름·연락처 없음). IP 는 도배 방지 상한에만 쓰고 저장하지 않는다.
const KINDS = { broken: '파일이 안 열려요', wrong: '다른 시험·과목 파일이에요', answer: '정답·해설이 틀려요', cut: '등급컷·난이도가 이상해요', other: '기타' };
const FIELDS = ['questionUrl', 'answerUrl', 'solutionUrl', 'listenUrl', 'scriptUrl', ''];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function handleReport(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return json({ error: 'forbidden' }, 403);
  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  const { success } = await env.REPORT_IP.limit({ key: ip });
  if (!success) return json({ error: 'too_many' }, 429);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'body' }, 400); }
  const examId = Number(b.examId);
  const kind = KINDS[b.kind] ? b.kind : null;
  const field = FIELDS.includes(b.field || '') ? (b.field || '') : '';
  const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 500);
  if (!Number.isInteger(examId) || examId <= 0 || examId > 1e6 || !kind) return json({ error: 'invalid' }, 400);
  const rec = { ts: new Date().toISOString(), examId, kind, field, text, page: String(b.page || '').slice(0, 120) };
  // JEV: 스팸·무의미 여부와 실제 유형 (텍스트가 있을 때만)
  // IP 를 바꿔 가며 보내도 유료 API 호출이 무한정 늘지 않게 전체 상한 — 넘으면 분류 없이 저장만
  const jevOk = text && env.TYPESAFE_API_KEY && (await env.REPORT_JEV.limit({ key: 'all' })).success;
  if (jevOk) {
    try {
      const r = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', signal: AbortSignal.timeout(2500),
        headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state: { 선택한_유형: KINDS[kind], 내용: text }, questions: {
          spam: { type: 'noul', instructions: '이 제보가 광고·욕설·의미 없는 글인가?' },
          kind: { type: 'choice', instructions: '제보 내용이 실제로 가리키는 문제는?', criteria: { ...KINDS, none: '판단 불가' } },
        } }),
      });
      if (r.ok) { const a = (await r.json()).answers; rec.jev = { spam: a.spam?.noul, kind: a.kind?.choice, conf: a.kind?.confidence }; }
    } catch {}
  }
  const key = `r:${rec.ts}:${crypto.randomUUID().slice(0, 8)}`;
  await env.REPORTS.put(key, JSON.stringify(rec), { expirationTtl: 90 * 24 * 3600, metadata: { examId, kind, spam: rec.jev?.spam ?? null } });
  return json({ ok: true });
}
