'use strict';
// 임시 페이지 — 부정행위자 N명 시뮬레이터. 2026학년도 수능 표준점수 분포(data/cheat-sim.json)로
// "상위 N명이 맨 뒤로 갔다면 내 등급은?"을 계산한다. 등급 컷 비율 4·11·23·40·60·77·89·96%.
const CUT = [4, 11, 23, 40, 60, 77, 89, 96];
const MAX_N = 100000;
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const pct = (r, d = 2) => (r * 100).toFixed(d) + '%';
const $ = id => document.getElementById(id);
const S = { exam: 0, subj: 0, mode: 'std', input: 0, elec: 0, score: 0, n: 300 };
let EXAMS = [];
let DATA = [];

function gradeOf(above, total) {
  if (total <= 0) return 1;
  const r = above / total * 100;
  for (let i = 0; i < CUT.length; i++) if (r < CUT[i]) return i + 1;
  return 9;
}

function prep(s) {
  s.T = s.dist.reduce((a, [, c]) => a + c, 0);
  let cum = 0; s.above = {}; s.cutScore = {};
  for (const [sc, c] of s.dist) {
    s.above[sc] = cum;
    s.cutScore[gradeOf(cum, s.T)] = sc;   // 높은 점수순으로 돌며 덮어써서 등급별 최저 점수가 남는다
    cum += c;
  }
  s.max = s.dist[0][0]; s.min = s.dist[s.dist.length - 1][0];
  // 백분위 = (내 점수 미만 인원 + 동점자 절반) / 응시 인원 × 100, 반올림
  s.pctOf = {}; s.byPct = {};
  for (const [sc, c] of s.dist) {
    const p = Math.round((s.T - s.above[sc] - c / 2) / s.T * 100);
    s.pctOf[sc] = p; (s.byPct[p] ??= []).push([sc, c]);
  }
}

function rawAnchors(s) {
  const set = s.rawSets[S.elec] || s.rawSets[0]; if (!set) return null;
  const out = [[0, s.min]];
  for (let i = 7; i >= 0; i--) if (set.raw[i] > out[out.length - 1][0]) out.push([set.raw[i], s.cutScore[i + 1]]);
  if (s.full > out[out.length - 1][0]) out.push([s.full, s.max]);
  return out;
}
function rawToStd(s, v) {
  const a = rawAnchors(s); if (!a) return null;
  v = Math.min(Math.max(v, 0), s.full);
  for (let i = 1; i < a.length; i++) if (v <= a[i][0]) { const [x0, y0] = a[i - 1], [x1, y1] = a[i]; return Math.round(y0 + (y1 - y0) * (v - x0) / (x1 - x0)); }
  return s.max;
}
function stdToRaw(s, std) {
  const a = rawAnchors(s); if (!a) return 0;
  for (let i = 1; i < a.length; i++) if (std <= a[i][1]) { const [x0, y0] = a[i - 1], [x1, y1] = a[i]; return Math.round(x0 + (x1 - x0) * (std - y0) / (y1 - y0)); }
  return s.full;
}
function pctToStd(s, p) {
  let k = p; const keys = Object.keys(s.byPct).map(Number);
  if (!s.byPct[k]) k = keys.reduce((b, x) => Math.abs(x - p) < Math.abs(b - p) ? x : b, keys[0]);
  const band = s.byPct[k].slice().sort((a, b) => a[0] - b[0]);   // 같은 백분위 구간은 응시자 중앙값
  const tot = band.reduce((a, [, c]) => a + c, 0); let acc = 0;
  for (const [sc, c] of band) { acc += c; if (acc >= tot / 2) return sc; }
  return band[band.length - 1][0];
}
function currentStd() {
  const s = DATA[S.subj];
  if (S.mode === 'raw') return rawToStd(s, S.input) ?? defaultStd(s);
  if (S.mode === 'pct') return pctToStd(s, Math.min(Math.max(S.input, 0), 100));
  return S.input;
}
function defaultStd(s) {
  for (const g of [2, 3, 1, 4, 5]) if (s.cutScore[g] != null) return s.cutScore[g];
  return s.dist[Math.floor(s.dist.length / 2)][0];
}
function aboveOf(s, sc) { let a = 0; for (const [x, c] of s.dist) { if (x > sc) a += c; else break; } return a; }
function countAt(s, sc) { const f = s.dist.find(([x]) => x === sc); return f ? f[1] : 0; }

// 부정행위자 N명은 최상위 점수였다가 맨 뒤로 간다 → 내 앞 인원만 N명 줄고 응시 인원은 그대로.
function calc() {
  const s = DATA[S.subj], sc = S.score, N = Math.max(0, S.n | 0);
  const A = aboveOf(s, sc), T = s.T, cnt = countAt(s, sc);
  const A1 = Math.max(0, A - N);
  const g0 = gradeOf(A, T), g1 = gradeOf(A1, T);
  let need = null;
  if (g1 > 1) {
    const c = CUT[g1 - 2] / 100;
    const n = Math.floor(A - c * T) + 1;   // (A-n)/T < c 를 만족하는 최소 n
    need = Math.max(n, N + 1);
    if (need > A) need = null;
  }
  return { s, sc, N, A, T, A1, g0, g1, cnt, need };
}

function render() {
  S.score = currentStd();
  const r = calc(), { s, sc, N } = r;
  const rg = $('cs-range'), cv = $('cs-conv');
  if (S.mode === 'std') { rg.textContent = `${s.name} 표준점수 범위 ${s.min}~${s.max}점 · 응시 ${fmt(s.T)}명`; cv.hidden = true; }
  else if (S.mode === 'raw') {
    const el = s.rawSets.length > 1 ? s.rawSets[S.elec].label + ' · ' : '';
    rg.textContent = `${el}만점 ${s.full}점`; cv.hidden = false;
    cv.textContent = `원점수 ${S.input}점 ≈ 표준점수 ${sc}점 · 추정값이에요`;
  } else {
    rg.textContent = `0~100 · 응시 ${fmt(s.T)}명`; cv.hidden = false;
    cv.textContent = `백분위 ${S.input} ≈ 표준점수 ${sc}점 · 표점 분포로 계산했고, 같은 백분위 구간에서는 응시자 중앙값을 써요`;
  }
  document.querySelectorAll('#cs-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === S.mode)));
  $('cs-g0').innerHTML = `${r.g0}<small>등급</small>`;
  $('cs-g1').innerHTML = `${r.g1}<small>등급</small>`;
  $('cs-s0').textContent = `상위 ${pct(r.A / r.T)}`;
  $('cs-s1').textContent = `상위 ${pct(r.A1 / r.T)}`;
  const d = r.g0 - r.g1, el = $('cs-delta'); el.innerHTML = '';
  const pill = (t, c = '') => { const e = document.createElement('span'); e.className = 'cs-pill ' + c; e.textContent = t; el.appendChild(e); };
  if (d > 0) pill(`▲ ${d}등급 상승`, 'up'); else pill('등급 변화 없음');
  if (r.need && r.g1 > 1) pill(`${r.g1 - 1}등급까지 N ≥ ${fmt(r.need)}명`);
  else if (r.g1 === 1) pill('이미 1등급');
  else pill('내 앞 인원을 모두 보내도 한 등급 위는 불가');
  if (N > r.A + r.cnt) pill(`N이 내 점수 이상 인원(${fmt(r.A + r.cnt)}명)보다 커요`, 'warn');
  else if (N > r.A) pill(`N이 내 앞 인원(${fmt(r.A)}명)보다 커요`, 'warn');
  $('cs-rank').innerHTML = `${fmt(r.A + 1)}<em>위</em> <span class="to">→ ${fmt(r.A1 + 1)}위</span>`;
  $('cs-pct').innerHTML = `${pct(r.A / r.T)} <span class="to">→ ${pct(r.A1 / r.T)}</span>`;
  $('cs-total').innerHTML = `${fmt(r.T)}<em>명</em>`;
  $('cs-mini').innerHTML = `실제 <b>${r.g0}등급</b> → 정상 <b class="to">${r.g1}등급</b> <small>상위 ${pct(r.A / r.T)} → ${pct(r.A1 / r.T)}</small>`;
  drawHist(r); drawLine(r);
  document.querySelectorAll('#cs-presets button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === N)));
}

function drawHist(r) {
  const { s, sc, N } = r, W = 640, H = 220, L = 8, R = 8, T = 26, B = 26, iw = W - L - R, ih = H - T - B;
  const lo = s.min, hi = s.max, span = hi - lo + 1, SLOT = 5, bw = iw / (span + SLOT), ox = L + SLOT * bw;
  const map = new Map(s.dist), maxC = Math.max(...s.dist.map(([, c]) => c));
  let rem = N, cutoff = hi + 1;   // 위에서부터 N명이 걸리는 점수(원래 자리는 흐리게)
  for (const [x, c] of s.dist) { if (rem <= 0) break; cutoff = x; rem -= c; }
  let svg = '';
  for (let x = lo; x <= hi; x++) {
    const c = map.get(x) || 0; if (!c) continue;
    const h = Math.max(1, c / maxC * ih), px = ox + (x - lo) * bw, moved = N > 0 && x >= cutoff;
    svg += `<rect x="${px.toFixed(2)}" y="${(T + ih - h).toFixed(2)}" width="${Math.max(1, bw - .8).toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="${moved ? 'var(--t5)' : 'var(--line-strong)'}" ${moved ? 'fill-opacity=".28" stroke="var(--t5)" stroke-dasharray="2 2" stroke-width=".8"' : ''}/>`;
  }
  if (N > 0) {
    const h = Math.max(Math.min(1, N / maxC) * ih, 2), w = bw * 3;
    svg += `<rect x="${(L + bw * .5).toFixed(2)}" y="${(T + ih - h).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="var(--t5)"/>`;
    svg += `<text x="${L + bw * 2}" y="${T + ih - h - 6}" text-anchor="middle" style="fill:var(--t5);font-weight:600">${fmt(N)}명</text>`;
    svg += `<text x="${L + bw * 2}" y="${H - 8}" text-anchor="middle" class="cs-ko" style="fill:var(--t5)">맨 뒤</text>`;
  }
  const mx = ox + (Math.min(Math.max(sc, lo), hi) - lo) * bw + bw / 2;
  const anchor = mx > W - 80 ? 'end' : (mx < 80 ? 'start' : 'middle');
  svg += `<line x1="${mx}" x2="${mx}" y1="${T - 4}" y2="${T + ih}" stroke="var(--tb-suneung)" stroke-width="2"/>`;
  svg += `<circle cx="${mx}" cy="${T - 4}" r="4" fill="var(--tb-suneung)"/>`;
  svg += `<text x="${mx}" y="${T - 9}" text-anchor="${anchor}" style="fill:var(--tb-suneung);font-weight:600">${sc}</text>`;
  svg += `<line x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}" stroke="var(--line)"/>`;
  const step = span > 80 ? 20 : 10;
  for (let x = Math.ceil(lo / step) * step; x <= hi; x += step) svg += `<text x="${ox + (x - lo) * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${x}</text>`;
  $('cs-hist').innerHTML = svg;
}

function drawLine(r) {
  const { N, A, T } = r, W = 640, H = 240, L = 44, R = 14, Tp = 14, B = 30, iw = W - L - R, ih = H - Tp - B;
  const r0 = A / T * 100;
  if (A === 0) { $('cs-line').innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="cs-ko">내 앞에 아무도 없어서 변화가 없어요</text>`; $('cs-line-note').textContent = ''; return; }
  const need = r.need || 0;
  const xmax = Math.min(A, Math.max(200, N * 1.6, need * 1.35, A * 0.02));
  const ymax = Math.max(r0 * 1.08, 1);
  const X = n => L + n / xmax * iw, Y = v => Tp + ih - (v / ymax) * ih;
  let svg = '';
  CUT.forEach((c, i) => {
    if (c < ymax) {
      svg += `<line x1="${L}" x2="${W - R}" y1="${Y(c)}" y2="${Y(c)}" stroke="var(--line)" stroke-dasharray="3 4"/>`;
      svg += `<text x="${L - 8}" y="${Y(c) + 4}" text-anchor="end">${c}%</text>`;
      svg += `<text x="${W - R - 2}" y="${Y(c) - 5}" text-anchor="end" class="cs-ko">${i + 1}등급 경계</text>`;
    }
  });
  const pts = [], K = 120;
  for (let i = 0; i <= K; i++) { const n = xmax * i / K; pts.push(`${X(n).toFixed(1)},${Y((A - n) / T * 100).toFixed(1)}`); }
  svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink-2)" stroke-width="2.2" stroke-linejoin="round"/>`;
  if (N <= xmax) {
    const y = Math.max(0, A - N) / T * 100, x = X(N);
    svg += `<line x1="${x}" x2="${x}" y1="${Tp}" y2="${Tp + ih}" stroke="var(--tb-suneung)" stroke-opacity=".35"/>`;
    svg += `<circle cx="${x}" cy="${Y(y)}" r="5" fill="var(--tb-suneung)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  if (r.need && r.need <= xmax) {
    const y = (A - r.need) / T * 100, x = X(r.need);
    svg += `<circle cx="${x}" cy="${Y(y)}" r="4.5" fill="var(--surface)" stroke="var(--t1)" stroke-width="2.2"/>`;
  }
  svg += `<line x1="${L}" x2="${W - R}" y1="${Tp + ih}" y2="${Tp + ih}" stroke="var(--line)"/>`;
  for (let i = 0; i <= 4; i++) { const n = xmax * i / 4; svg += `<text x="${X(n)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${fmt(n)}명</text>`; }
  $('cs-line').innerHTML = svg;
  $('cs-line-note').textContent = r.need
    ? `파란 점은 현재 N=${fmt(N)}명, 초록 고리는 ${r.g1 - 1}등급에 닿는 N=${fmt(r.need)}명이에요.`
    : (r.g1 === 1 ? '이미 1등급이에요.' : '내 앞 인원을 전부 보내도 한 등급 위로 올라갈 수 없어요.');
}

function init() {
  const sel = $('cs-subj'), el = $('cs-elective');
  const hasRaw = s => s.rawSets.length > 0;
  function fillSubjects() {
    const keep = String(S.subj); sel.innerHTML = ''; const groups = {};
    DATA.forEach((s, i) => { if (S.mode === 'raw' && !hasRaw(s)) return; (groups[s.group] ??= []).push([i, s]); });
    for (const [g, items] of Object.entries(groups)) {
      const og = document.createElement('optgroup'); og.label = g;
      items.forEach(([i, s]) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name; og.appendChild(o); });
      sel.appendChild(og);
    }
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep; else { S.subj = +sel.options[0].value; sel.value = S.subj; }
  }
  function fillElective() {
    const s = DATA[S.subj], show = S.mode === 'raw' && s.rawSets.length > 1;
    $('cs-elec-field').hidden = !show; el.innerHTML = '';
    s.rawSets.forEach((x, i) => { const o = document.createElement('option'); o.value = i; o.textContent = x.label; el.appendChild(o); });
    if (S.elec >= s.rawSets.length) S.elec = 0; el.value = S.elec;
  }
  function defaultInput() {
    const s = DATA[S.subj], c = defaultStd(s);
    S.input = S.mode === 'raw' ? stdToRaw(s, c) : S.mode === 'pct' ? s.pctOf[c] : c;
    $('cs-score').value = S.input;
  }
  const clamp = v => { const s = DATA[S.subj]; return S.mode === 'raw' ? Math.min(Math.max(v, 0), s.full) : S.mode === 'pct' ? Math.min(Math.max(v, 0), 100) : v; };
  const LBL = { std: '내 표준점수', raw: '내 원점수', pct: '내 백분위' };
  function setExam(i) {
    const name = DATA[S.subj] && DATA[S.subj].name;
    S.exam = i; DATA = EXAMS[i].subjects;
    S.subj = Math.max(0, DATA.findIndex(s => s.name === name)); S.elec = 0;
    document.querySelectorAll('#cs-exam button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.e === i)));
    $('cs-eyebrow').textContent = `임시 페이지 · ${EXAMS[i].label} 공식 점수 분포 기반`;
    $('cs-src').textContent = `출처: ${EXAMS[i].src}. 실제 사례나 인원과 무관한 가정 계산입니다.`;
    fillSubjects(); fillElective(); defaultInput(); render();
  }
  function setMode(m) { S.mode = m; $('cs-score-lbl').textContent = LBL[m]; fillSubjects(); fillElective(); defaultInput(); render(); }
  function setSubject(i) { S.subj = +i; sel.value = i; S.elec = 0; fillElective(); defaultInput(); render(); }
  function setN(n) { S.n = Math.min(MAX_N, Math.max(0, n | 0)); $('cs-n').value = S.n; $('cs-nr').value = S.n; render(); }
  const pr = $('cs-presets');
  [0, 10, 50, 100, 300, 1000, 3000, 10000, 100000].forEach(n => { const b = document.createElement('button'); b.type = 'button'; b.dataset.n = n; b.textContent = n === 0 ? '없음' : fmt(n) + '명'; b.onclick = () => setN(n); pr.appendChild(b); });
  sel.onchange = () => setSubject(sel.value);
  el.onchange = () => { S.elec = +el.value; render(); };
  document.querySelectorAll('#cs-mode button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  $('cs-score').oninput = e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) { S.input = clamp(v); render(); } };
  $('cs-score').onchange = () => { $('cs-score').value = S.input; };
  $('cs-dec').onclick = () => { S.input = clamp(S.input - 1); $('cs-score').value = S.input; render(); };
  $('cs-inc').onclick = () => { S.input = clamp(S.input + 1); $('cs-score').value = S.input; render(); };
  $('cs-n').oninput = e => { const v = parseInt(e.target.value, 10); setN(isNaN(v) ? 0 : v); };
  $('cs-nr').oninput = e => setN(+e.target.value);
  const ex = $('cs-exam');
  EXAMS.forEach((e, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.e = i; b.textContent = e.short; b.onclick = () => setExam(i); ex.appendChild(b); });
  setExam(0);
}

fetch('data/cheat-sim.json', { credentials: 'omit' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(j => { EXAMS = j.exams; EXAMS.forEach(e => e.subjects.forEach(prep)); DATA = EXAMS[0].subjects; document.querySelector('.cs').classList.remove('is-loading'); init(); })
  .catch(() => { document.querySelector('.cs').classList.add('is-error'); });
