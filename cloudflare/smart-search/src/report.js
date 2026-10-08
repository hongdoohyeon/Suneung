// kicegg.com/api/report — 자료 오류 제보 접수. KV(REPORTS)에 90일 보관, JEV 로 유형·스팸 여부를 미리 분류해 둔다.
// 개인정보는 받지 않는다(이름·연락처 없음). IP 는 도배 방지 상한에만 쓰고 저장하지 않는다.
// 원인 파악용으로 브라우저(UA)·화면 크기·국가만 남긴다(앱 안 브라우저 다운로드 실패 같은 기기 탓 문제 구분).
// 접수되면 운영자에게 메일 알림(비밀값 REPORT_TO, 스팸 판정·상한 초과는 생략).
import { EmailMessage } from 'cloudflare:email';
const KINDS = { broken: '파일이 안 열려요', wrong: '다른 시험·과목 파일이에요', answer: '정답·해설이 틀려요', cut: '등급컷·난이도가 이상해요', other: '기타' };
const FIELDS = ['questionUrl', 'answerUrl', 'solutionUrl', 'listenUrl', 'scriptUrl', ''];
// UA → 사람이 읽는 짧은 환경 이름 (예: 'Android · 카카오톡 앱 안 브라우저')
function uaLabel(ua) {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '기타';
  const app = [[/KAKAOTALK/i, '카카오톡'], [/NAVER\(inapp/i, '네이버 앱'], [/Instagram/, '인스타그램'], [/FBAN|FBAV/, '페이스북'], [/Line\//, '라인'], [/everytimeApp/i, '에브리타임'], [/DaumApps/, '다음 앱']].find(([re]) => re.test(ua));
  if (app) return `${os} · ${app[1]} 앱 안 브라우저`;
  if (/; wv\)/.test(ua)) return `${os} · 앱 안 브라우저(WebView)`;
  const br = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Whale/.test(ua) ? '웨일' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '알 수 없는 브라우저';
  return `${os} · ${br}`;
}
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
  const ua = (request.headers.get('user-agent') || '').slice(0, 300);
  const screen = /^\d{2,5}x\d{2,5}$/.test(String(b.screen || '')) ? String(b.screen) : '';
  const rec = { ts: new Date().toISOString(), examId, kind, field, text, page: String(b.page || '').slice(0, 120),
    env: uaLabel(ua), ua, screen, country: request.cf?.country || '' };
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
  if (env.REPORT_TO && !(rec.jev?.spam > 0.8)) ctx.waitUntil(notify(env, rec).catch(e => console.log('mail', e.message)));
  return json({ ok: true });
}

// ── 메일 알림 ──
const b64 = str => { const u = new TextEncoder().encode(str); let bin = ''; for (const c of u) bin += String.fromCharCode(c); return btoa(bin); };
const FIELD_KO = { questionUrl: '문제지', answerUrl: '정답', solutionUrl: '해설', listenUrl: '듣기 파일', scriptUrl: '듣기 대본', '': '모름' };
async function notify(env, rec) {
  if (!(await env.REPORT_MAIL.limit({ key: 'all' })).success) return;
  const from = 'report@kicegg.com', to = env.REPORT_TO;
  const url = `https://kicegg.com/exam-${rec.examId}.html`;
  const subject = `[kicegg 제보] ${KINDS[rec.kind]} · exam-${rec.examId}`;
  const body = [
    `새 자료 오류 제보가 들어왔어요.`, ``,
    `페이지: ${url}`,
    `종류: ${KINDS[rec.kind]}`,
    `자료: ${FIELD_KO[rec.field] ?? rec.field}`,
    `내용: ${rec.text || '(없음)'}`,
    rec.jev ? `자동 분류(JEV): ${KINDS[rec.jev.kind] || rec.jev.kind || '-'} (확신 ${Math.round((rec.jev.conf || 0) * 100)}%) · 스팸 점수 ${Math.round((rec.jev.spam || 0) * 100)}%` : '',
    `환경: ${rec.env}${rec.screen ? ` · 화면 ${rec.screen}` : ''}${rec.country ? ` · ${rec.country}` : ''}`,
    `UA: ${rec.ua || '-'}`,
    `시각: ${rec.ts}`, ``,
    `전체 목록: node cloudflare/smart-search/reports.mjs`,
  ].filter(x => x !== null).join('\n');
  const raw = [
    `From: =?UTF-8?B?${b64('kicegg 제보')}?= <${from}>`, `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@kicegg.com>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    b64(body).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  await env.MAILER.send(new EmailMessage(from, to, raw));
}
