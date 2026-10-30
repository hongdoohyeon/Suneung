// 문항 검색 — kicegg 기출검색과 같은 필터·검색 막대·카드. 선택지는 서버가 데이터에서 센 것만(교육과정마다 달라도 됨)
(() => {
// 주소: 로컬은 /api·/img, kicegg 는 <body data-api="/api/items" data-img="/qimg">
const API_BASE = document.body.dataset.api || '/api', IMG_BASE = document.body.dataset.img || '/img';
const $ = s => document.querySelector(s), out = $('#out'), dlg = $('#dlg'), fb = $('#fb'), panel = $('#filterPanel');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = ['q', 'group', 'subject', 'era', 'year', 'exam', 'no', 'kind', 'sort'];
const FILTERS = ['group', 'subject', 'era', 'year', 'exam', 'no'];
const DEF = { q: '', group: '', subject: '', era: '', year: '', exam: '', no: '', kind: 'all', sort: 'rel' };
// kicegg config.js 영역 색 · 시험 배지(평가원: 수능은 진한 남색 tg-csat, 6모·9모는 파랑 tg-suneung)
const COLOR = { 국어: '#c44b00', 수학: '#1a4fd6', 영어: '#0077a8', 한국사: '#8f5610', 과학탐구: '#6b2fbe', 사회탐구: '#2a7a2a', 직업탐구: '#a06b00', 제2외국어: '#5a2ea8' };
const MINOR = new Set(['직업탐구', '제2외국어']);   // 영역을 고르지 않은 전체 검색에서 기본으로 빼는 영역
const EXAM = { 수능: ['수능', 'tg-suneung tg-csat'], '6월': ['6모', 'tg-suneung'], '9월': ['9모', 'tg-suneung'], 예비평가: ['예비', 'tg-suneung'] };
const st = { ...DEF, offset: 0 };
let META, R = null, list = [], seq = 0;

// ── 익명 식별자: 같은 방문 안의 검색·클릭을 로그에서 잇는 용도(개인 정보 아님, 탭을 닫으면 사라짐)
const rand = () => {
  try { return crypto.randomUUID().replace(/-/g, '') } catch (e) {}
  try { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('') } catch (e) {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};
const SID = (() => { try { let v = sessionStorage.getItem('qs:sid'); if (!v) { v = rand(); sessionStorage.setItem('qs:sid', v) } return v } catch (e) { return rand() } })();
let RID = rand();

// ── 크기(카드 폭·상세 확대) — 이 브라우저에 기억
const pref = (k, d) => { try { return localStorage.getItem(k) || d } catch (e) { return d } };
const save = (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} };
const press = (sel, v) => document.querySelectorAll(sel + ' > button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v == v));
function setSize(v) { $('.qs').style.setProperty('--card-w', v + 'px'); press('#size', v); save('qs:size', v) }
function setZoom(v) { v = Math.max(50, Math.min(200, v)); dlg.style.setProperty('--dz', v); $('#zv').textContent = v + '%'; save('qs:zoom', v) }
setSize(pref('qs:size', 260)); setZoom(+pref('qs:zoom', 85));
$('#size').onclick = e => { const b = e.target.closest('button'); if (b) setSize(b.dataset.v) };
document.querySelector('.qs-zoom').onclick = e => { const b = e.target.closest('button'); if (b) setZoom(parseInt($('#zv').textContent) + +b.dataset.z) };
$('#sort').onclick = e => { const b = e.target.closest('button'); if (b) set({ sort: b.dataset.v }) };

// ── 상태 ↔ 주소
function toURL(push) {
  const p = new URLSearchParams(); for (const k of KEYS) if (st[k] && st[k] !== DEF[k]) p.set(k, st[k]);
  const u = p.toString() ? '?' + p : location.pathname;
  if (u !== (location.search || location.pathname)) history[push ? 'pushState' : 'replaceState'](null, '', u);
}
function fromURL() { const p = new URLSearchParams(location.search); for (const k of KEYS) st[k] = p.get(k) || DEF[k]; st.offset = 0 }
let lastAct = '';   // 방금 한 일이 검색('query')인지 필터('filter')인지 — 둘이 부딪칠 때 이걸 우선
let near = 0;       // 필터를 연달아 누를 때 120ms 동안 모아 한 번만 검색
function set(o, push = true) {
  const isQuery = 'q' in o && o.q !== st.q;
  lastAct = isQuery ? 'query' : 'filter';
  Object.assign(st, o, { offset: 0 });
  clearTimeout(near);
  if (isQuery) { exact = false; run(push) } else near = setTimeout(() => run(push), 120);
}
addEventListener('popstate', () => { if (dlg.open) { dlg.close(); return } fromURL(); run(false, true) });

// ── 검색 막대(기출검색과 같은 동작: Enter로 검색, / 로 포커스)
const q = $('#q'), clr = $('#clear');
q.oninput = () => clr.style.display = q.value ? '' : 'none';
clr.onclick = () => { q.value = ''; clr.style.display = 'none'; set({ q: '' }); q.focus() };
$('#f').onsubmit = e => {
  e.preventDefault(); q.blur(); const v = q.value.trim(); exact = false;
  // 번호만 치면("30", "30번", "15 21 30번") 검색 대신 번호 필터로
  const m = v.match(/^(\d{1,2}(?:\s*번)?(?:[\s,·]+\d{1,2}(?:\s*번)?)*)$/);
  if (m) { const nos = v.match(/\d{1,2}/g).filter(x => +x >= 1 && +x <= 45); if (nos.length) return set({ q: '', no: [...new Set([...vals('no'), ...nos.map(String)])].join(',') }) }
  set({ q: v });
};
addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !dlg.open) { e.preventDefault(); q.focus(); q.select() }
  if (dlg.open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step(e.key === 'ArrowLeft' ? -1 : 1);
});

// ── 필터 시트(≤960px) — kicegg와 같은 열고 닫기
const backdrop = $('#filterBackdrop'), toggle = $('#filterToggleInline');
function sheet(open) {
  panel.classList.toggle('is-open', open); backdrop.classList.toggle('is-open', open); backdrop.hidden = !open;
  document.body.classList.toggle('is-sheet-open', open); toggle.setAttribute('aria-expanded', open);
  panel.setAttribute('role', open ? 'dialog' : 'region');
}
toggle.onclick = () => matchMedia('(max-width: 960px)').matches ? sheet(true) : $('.main').classList.toggle('filters-hidden');
$('#filterSheetClose').onclick = $('#filterSheetApply').onclick = backdrop.onclick = () => sheet(false);
const resetAll = () => set(Object.fromEntries(FILTERS.map(k => [k, ''])));
$('#filterSheetReset').onclick = $('#resetBtn').onclick = resetAll;

// ── 필터 그리기(kicegg 마크업: filter__section / seg / year-row / subject-row)
const n = (c, k, v) => (c[k] || {})[v] || 0;
// 필터 값은 여러 개(쉼표로 이어 주소에 저장): 같은 필터 안은 '또는'
const vals = k => st[k] ? st[k].split(',') : [];
const has = (k, v) => vals(k).includes(String(v));
const toggled = (k, v) => { const a = vals(k), i = a.indexOf(String(v)); i < 0 ? a.push(String(v)) : a.splice(i, 1); return a.join(',') };
const fmt = x => x.toLocaleString();
fb.onclick = e => {
  const b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
  const k = b.dataset.k, v = b.dataset.v, o = {};
  if (k === 'kind') { track('filter', { k, v, label: KIND[v] }); return set({ kind: v }) }
  if (!v) { o[k] = ''; if (k === 'year') o.era = ''; track('filter', { k, v: 'all', label: '전체' }); return set(o) }   // '전체' = 그 필터 풀기
  track('filter', { k, v, label: label(k, v) });
  o[k] = toggled(k, v);
  if (k === 'group' && !has('group', v)) o.subject = vals('subject').filter(x => !x.startsWith(v + ':') && !(META.subjects[v] || []).includes(x)).join(',');   // 영역을 끄면 그 세부도
  set(o);
};
function drawFilters(c) {
  const sec = (title, body, hint = '') => `<div class="filter__section">${hint ? `<div class="filter__title-row"><h3 class="filter__title">${title}</h3><span class="filter__hint">${hint}</span></div>` : `<h3 class="filter__title">${title}</h3>`}${body}</div>`;
  const segBtn = (k, v, l) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${k === 'kind' ? st[k] === v : v ? has(k, v) : !st[k]}">${l}</button>`;
  const kd = (R && R.kinds) || {}, dis = v => R && v !== 'all' && !kd[v] && st.kind !== v ? ' disabled' : '';
  let h = sec('종류', `<div class="seg">${['all', 'item', 'passage'].map(v => segBtn('kind', v, KIND[v]).replace('<button ', `<button${dis(v)} `)).join('')}</div>`);
  h += sec('시험', `<div class="seg">${segBtn('exam', '', '전체')}${['수능', '6월', '9월', '예비평가'].map(e => segBtn('exam', e, EXAM[e][0])).join('')}</div>`);
  // 학년도 — 교육과정별 묶음(기출검색과 같은 4칸), 묶음 머리를 누르면 그 교육과정 전체
  const yp = y => { const on = has('year', y), k = n(c, 'year', String(y));
    return `<button type="button" class="pill${on ? ' is-active' : ''}" data-k="year" data-v="${y}" aria-pressed="${on}" ${!k && !on ? 'disabled' : ''}>${y}</button>` };
  h += sec('학년도', `<div class="year-row"><button type="button" class="pill${!st.year && !st.era ? ' is-active' : ''}" data-k="year" data-v="">전체</button>${META.eras.map(e =>
    `<button type="button" class="year-row__header qs-era${has('era', e.id) ? ' is-active' : ''}" data-k="era" data-v="${e.id}">${esc(e.name.replace(' 교육과정', ''))} 전체</button>${e.years.map(yp).join('')}`).join('')}</div>`);
  // 영역 → 세부(데이터에 있는 것만)
  h += sec('영역', `<div class="subject-list">${META.groups.map(g => {
    const on = has('group', g), subs = (META.subjects[g] || []).filter(v => v.includes(':') || !v.endsWith(' 공통'));
    const rows = subs.filter(v => n(c, 'subject', v) || has('subject', v)).map(v => { const a = has('subject', v);
      return `<button type="button" class="sub-row${a ? ' is-active' : ''}" data-k="subject" data-v="${esc(v)}">${esc(v.split(':').pop())}</button>` }).join('');
    const cnt = n(c, 'group', g);
    return `<div class="subject-item"><button type="button" class="subject-row${rows ? ' has-subs' : ''}${on ? ' is-active is-open' : ''}" data-k="group" data-v="${g}" aria-pressed="${on}" ${!cnt && !on ? 'disabled' : ''} style="--subject-color:${COLOR[g]}"><span class="subject-row__dot"></span><span class="subject-row__name">${g}</span><span class="subject-row__count">${cnt || ''}</span><span class="subject-row__caret">›</span></button>${on && rows ? `<div class="subject-subs__inner">${rows}</div>` : ''}</div>`;
  }).join('')}</div>`);
  const nos = Array.from({ length: 45 }, (_, i) => i + 1).filter(i => n(c, 'no', i) || has('no', i));   // 고른 과목에 있는 번호만
  h += sec('문항 번호', `<div class="qs-nos">${nos.map(i => { const on = has('no', i), k = n(c, 'no', i);
    return `<button type="button" class="pill${on ? ' is-active' : ''}" data-k="no" data-v="${i}" aria-pressed="${on}" ${!k && !on ? 'disabled' : ''}>${i}</button>` }).join('')}</div>`);
  fb.innerHTML = h;
}

// ── 적용된 필터 태그 · 결과 수
function label(k, v) {
  if (k === 'subject') return v.includes(':') ? v.replace(':', ' ') : v;
  if (k === 'era') return (META.era_names[v] || v).replace(' 교육과정', '');
  if (k === 'year') return v + '학년도';
  if (k === 'exam') return (EXAM[v] || [v])[0];
  if (k === 'no') return v + '번';
  return v;
}
function drawTags() {
  const sg = vals('subject').map(x => x.includes(':') ? x.split(':')[0] : Object.keys(META.subjects).find(g => META.subjects[g].includes(x)));
  const act = FILTERS.flatMap(k => vals(k).filter(v => !(k === 'group' && sg.includes(v))).map(v => [k, v]));   // 세부를 고른 영역은 세부 태그만
  $('#activeTags').innerHTML = act.map(([k, v]) => `<span class="tag"><span class="tag__t">${esc(label(k, v))}</span><button type="button" data-k="${k}" data-v="${esc(v)}" aria-label="${esc(label(k, v))} 지우기">✕</button></span>`).join('');
  const psg = st.kind === 'passage', total = R ? (psg ? R.total_passages : R.total_items) || 0 : 0;
  $('#resultCount').textContent = R ? `${fmt(total)}${psg ? '지문' : '문항'}` : ''; $('#filterSheetCount').textContent = fmt(total);
  $('#resetBtn').hidden = !act.length;
  press('#sort', (R && R.sort) === 'num' ? 'new' : st.sort); $('#sort').hidden = !st.q;   // 학년도·시험 검색은 실제로 최신 시험→번호순
  let badge = toggle.querySelector('.filter-badge');
  if (act.length) { if (!badge) { badge = document.createElement('span'); badge.className = 'filter-badge'; toggle.append(badge) } badge.textContent = act.length } else badge?.remove();
}
$('#activeTags').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { track('filter', { k: b.dataset.k, v: b.dataset.v, label: label(b.dataset.k, b.dataset.v) }); set({ [b.dataset.k]: toggled(b.dataset.k, b.dataset.v) }) } };

// ── 카드(kicegg .card: 메타 줄[시험 배지·학년도·번호] → 제목[영역] → 시험지)
const img = id => `${IMG_BASE}/${id}.webp?v=4`;   // v: 크롭을 고치면 올림(브라우저·Cloudflare 캐시 모두 새로 받음)
const badge = x => EXAM[x.exam] ? `<span class="type-badge ${EXAM[x.exam][1]}">${EXAM[x.exam][0]}</span>` : '';
const low = x => x.low ? '<span class="qs-low">관련도 낮음</span>' : '';
const title = x => x.cat ? `${x.subject} ${x.cat}` : (x.sub !== x.subject ? x.sub : x.subject);
const icard = x => `<button type="button" class="card qs-card${x.low ? ' is-low' : ''}" data-id="${x.id}" style="--subject-color:${COLOR[x.subject] || 'var(--ink-4)'}">
  <div class="card__meta">${badge(x)}<span class="chiplet chiplet--ink">${x.year}학년도</span>${low(x)}<span class="qs-no">${x.no}번</span></div>
  <h4 class="card__title">${esc(title(x))}</h4>
  <div class="qs-paper"><img loading="lazy" decoding="async" src="${img(x.id)}" alt="${esc(x.label)} ${x.no}번"></div></button>`;
const pcard = p => `<button type="button" class="card qs-card qs-card--p${p.low ? ' is-low' : ''}" data-pid="${p.id}" style="--subject-color:${COLOR[p.subject] || 'var(--ink-4)'}">
  <div class="card__meta">${badge(p)}<span class="chiplet chiplet--ink">${p.year}학년도</span>${low(p)}<span class="qs-no">${p.frm}~${p.to}번</span></div>
  <h4 class="card__title">${esc(title(p))} 지문</h4>
  <div class="qs-paper"><img loading="lazy" decoding="async" src="${img(p.id)}" alt="${esc(p.label)} 지문"></div>
  <div class="card__divider"></div><p class="card__sub">지문과 문항 ${p.items.length}개 보기 →</p></button>`;
document.addEventListener('click', e => {
  const z = e.target.closest('.qs-sheet img'); if (z) { open(z.src, '_blank'); return }
  const sg = e.target.closest('[data-sug]'); if (sg && R?.suggest) {   // 검색 제안 칩
    const s = R.suggest[+sg.dataset.sug];
    if (s) {
      track('suggest', { k: s.type, v: s.q || s.v || s.kind || '', label: s.label });
      if (s.type === 'query') { q.value = s.q; set({ q: s.q }) }
      else if (s.type === 'filter') set({ [s.k]: s.v });
      else if (s.type === 'kind') set({ kind: s.kind });
    }
    return;
  }
  const c = e.target.closest('.qs-card'); if (!c) return;
  if (c.dataset.id) {
    const i = list.findIndex(x => x.id === c.dataset.id);
    track('click', { id: c.dataset.id, pos: i >= 0 ? String(i + 1) : '', kind: 'item' }); openItem(c.dataset.id);
  } else {
    const i = (R?.passages || []).findIndex(p => p.id === c.dataset.pid);
    track('click', { id: c.dataset.pid, pos: i >= 0 ? String(i + 1) : '', kind: 'passage' }); openPassage(c.dataset.pid);
  }
});

// ── 검색·목록
let exact = false, allMode = false;   // '원래 검색어로 찾기'를 누르면 오타 교정 끔(검색어가 바뀌면 다시 켜짐)
function params(extra = {}) {
  const p = new URLSearchParams({ q: st.q, kind: st.kind, sort: st.sort, offset: st.offset, ...(exact ? { exact: 1 } : {}), ...(allMode ? { all: 1 } : {}), ...extra });
  for (const k of FILTERS) if (st[k]) p.set(k, st[k]); return p;
}
// 맥 서버가 꺼져 있으면(Worker가 503 maintenance) 점검 중 화면
async function api(path, p, opt = {}) {
  let r, j;
  const url = API_BASE + path.replace(/^\/api/, '') + (p ? '?' + p : '');
  try {
    r = await fetch(url, { signal: opt.signal, keepalive: !!opt.keepalive, headers: { 'X-QS-SID': SID, 'X-QS-RID': RID } });
    j = await r.json();
  } catch (e) {
    if (e.name === 'AbortError' || opt.signal?.aborted) throw e;   // 새 검색으로 취소한 요청은 화면을 건드리지 않음
    maintenance(); throw new Error('점검 중');
  }
  if (j.maintenance) { maintenance(); throw new Error('점검 중') }
  if (j.error) throw new Error(j.error); return j;
}
// 클릭·필터·지문 열기 같은 행동 로그(응답을 기다리지 않음, 실패해도 검색에 영향 없음)
function track(e, o = {}) {
  try {
    const p = new URLSearchParams({ e, q: st.q, kind: st.kind, sid: SID, rid: RID });
    for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v);
    fetch(API_BASE + '/event?' + p, { keepalive: true, headers: { 'X-QS-SID': SID, 'X-QS-RID': RID } }).catch(() => {});
  } catch (e) {}
}
function maintenance() {
  if (dlg.open) dlg.close();
  $('.qs').innerHTML = `<div class="qs-empty qs-down"><b>문항 검색 점검 중이에요</b>잠시 후 다시 와 주세요. 그동안 시험지 단위 기출은 기출검색에서 볼 수 있어요.
    <div class="qs-hints"><a class="btn btn--primary" href="./">기출검색으로 가기</a><button type="button" class="btn" id="retry">다시 시도</button></div></div>`;
  $('#retry').onclick = () => location.reload();   // kicegg CSP는 인라인 onclick을 막음
  document.querySelector('.topbar-wrap')?.setAttribute('hidden', '');
}
// 필터 알잘딱: 서로 맞지 않는 조건은 화면이 알아서 정리하고 한 줄로 알림(되돌리기 가능)
const KIND = { all: '문항+지문', item: '문항', passage: '지문' };
let undo = null;
function fixups(r) {
  const before = { ...st }, msg = [];
  const dead = (r.dead || []).filter(([k, v]) => has(k, v));
  for (const [k, v] of dead) st[k] = vals(k).filter(x => x !== v).join(',');   // 예: 수학 + 45번 → 45번 빼기
  if (dead.length) msg.push(`다른 조건과 맞는 문항이 없어 뺐어요: ${dead.map(([k, v]) => label(k, v)).join(', ')}`);
  const k = r.kinds || {};
  if (st.kind === 'passage' && !k.passage && k.item) { st.kind = 'all'; msg.push('지문이 없는 조건이라 문항으로 보여 드려요') }   // 예: 수학 + 지문
  else if (st.kind === 'item' && !k.item && k.passage) { st.kind = 'all'; msg.push('문항이 없어 지문으로 보여 드려요') }
  if (!msg.length) return false;
  undo = before; say('맞지 않는 조건을 정리했어요', msg.join(' · '), '되돌리기', 'undo'); return true;
}
// 검색어와 필터가 부딪쳐 0건이면: 방금 검색했으면 필터를, 방금 필터를 바꿨으면 검색어를 풀어 줌(알림·되돌리기)
const anyFilter = () => FILTERS.some(k => st[k]);
const shownTotal = r => (st.kind === 'passage' ? r.total_passages : (r.total_items || 0) + (st.kind === 'all' ? r.total_passages || 0 : 0)) || 0;
const wideTotal = r => Object.entries((r.facets || {}).group || {}).reduce((a, [g, b]) => a + (MINOR.has(g) ? 0 : b), 0);   // 같은 검색어, 조건 없이(전체 검색 기본값)
function say(small, text, btn, mode) {
  const n = $('#note'); n.querySelector('small').textContent = small; $('#noteText').textContent = text;
  $('#noteUndo').textContent = btn; $('#noteUndo').hidden = !btn; $('#noteUndo').dataset.mode = mode; n.hidden = false;
}
function clash(r) {
  if (r.no_data || !st.q || !(r.weak || !shownTotal(r))) return false;   // '자료 없음'은 필터 충돌이 아님
  if (lastAct === 'query' && anyFilter() && wideTotal(r)) {
    undo = { ...st }; for (const k of FILTERS) st[k] = '';
    say('필터에 맞는 결과가 없어요', `필터를 풀고 ‘${st.q}’를 전체에서 찾았어요`, '되돌리기', 'undo'); return true;
  }
  if (lastAct === 'filter' && anyFilter()) {
    undo = { ...st }; const q0 = st.q; st.q = '';
    say(`‘${q0}’와 맞는 문항이 없어요`, '검색어를 빼고 고른 조건의 문항을 모두 보여 드려요', '되돌리기', 'undo'); return true;
  }
  return false;
}
// 새로 검색했는데 필터가 걸려 있으면, 필터 안 결과라는 것과 전체 수를 알려 줌
function scopeHint(r) {
  const all = wideTotal(r), here = shownTotal(r);
  if (!st.q || !anyFilter() || all <= here) return;
  say('필터 안에서 찾았어요', `필터 없이 찾으면 ${all.toLocaleString()}문항이에요`, '전체에서 보기', 'wide');
}

// 오타를 고쳐 찾았거나(백터→벡터) 다른 말로 바꿔 찾았거나, 관련 있는 게 없어 가까운 것을 보여 줄 때
function noteSearch(r) {
  const n = $('#note');
  if ($('#noteUndo').dataset.mode === 'undo' && !n.hidden) return true;   // 방금 정리한 알림은 그대로
  if (r.no_data) { n.hidden = true; return false }   // '자료 없음'은 결과 칸의 빈 화면 안내로 한 번만
  if (r.intent) {   // '사문 도표'·'상중하'처럼 내용어를 자료 유형으로 바꿔 찾은 경우
    n.querySelector('small').textContent = '검색어를 유형으로 바꿔 찾았어요';
    $('#noteText').textContent = r.structured ? `‘${r.structured.label}’ · ${r.intent.label}` : `‘${st.q}’ → ${r.intent.label}`;
    $('#noteUndo').hidden = true; n.hidden = false; return true;
  }
  if (r.structured) {   // '20270611'·'25학년도 수학'처럼 내용 대신 시험 정보로 찾은 경우
    n.querySelector('small').textContent = '시험 정보로 찾았어요';
    $('#noteText').textContent = `‘${r.structured.label}’ 검색 결과`;
    $('#noteUndo').hidden = true; n.hidden = false; return true;
  }
  if (r.rewritten) {   // 동의어·줄임말로 바꾼 경우가 오타 교정보다 설명이 정확함
    n.querySelector('small').textContent = '다른 말로 바꿔 찾았어요'; $('#noteText').textContent = `‘${r.rewritten[1]}’ 검색 결과`;
    $('#noteUndo').textContent = `‘${r.rewritten[0]}’ 그대로 찾기`; $('#noteUndo').hidden = false; $('#noteUndo').dataset.mode = 'exact'; n.hidden = false;
  } else if (r.corrected) {
    n.querySelector('small').textContent = '오타를 고쳐 찾았어요'; $('#noteText').textContent = `‘${r.corrected[1]}’ 검색 결과`;
    $('#noteUndo').textContent = `‘${r.corrected[0]}’로 찾기`; $('#noteUndo').hidden = false; $('#noteUndo').dataset.mode = 'exact'; n.hidden = false;
  } else if (r.weak) {
    n.querySelector('small').textContent = '딱 맞는 문항이 없어요'; $('#noteText').textContent = '가까운 문항을 관련도 순으로 보여 드려요';
    $('#noteUndo').hidden = true; n.hidden = false;
  } else { n.hidden = true; return false }
  return true;
}
$('#noteUndo').onclick = () => {
  const mode = $('#noteUndo').dataset.mode;
  if (mode === 'exact') { track('exact', { label: $('#noteText').textContent }); exact = true; $('#noteUndo').dataset.mode = ''; skipFix = true; return run(false) }
  if (mode === 'wide') { track('wide', {}); $('#noteUndo').dataset.mode = ''; return set(Object.fromEntries(FILTERS.map(k => [k, '']))) }
  if (undo) { track('undo', {}); Object.assign(st, undo); undo = null; $('#note').hidden = true; skipFix = true; run() }
};
let skipFix = false, ctl = null, moreCtl = null, dlgCtl = null;
async function run(push = true, fromPop = false) {
  clearTimeout(near); near = 0; allMode = false;
  q.value = st.q; clr.style.display = st.q ? '' : 'none'; if (!fromPop) toURL(push);
  const my = ++seq, home = !st.q && !FILTERS.some(k => st[k]), skip = skipFix; skipFix = false;
  ctl?.abort(); moreCtl?.abort();   // 이전 검색·더 보기 요청 취소(서버도 같은 요청은 한 번만 계산)
  const ac = new AbortController(); ctl = ac; RID = rand();
  if (!home) out.innerHTML = '<p class="qs-status">찾는 중…</p>';
  try {
    let r = await api('/api/search', params(), { signal: ac.signal }); if (my !== seq) return;
    if (!skip && (fixups(r) || clash(r))) { toURL(false); r = await api('/api/search', params(), { signal: ac.signal }); if (my !== seq) return }
    else if (!skip) $('#note').hidden = true;
    const act = lastAct; lastAct = '';
    if (!noteSearch(r) && act === 'query') scopeHint(r);
    R = home ? null : r; list = r.items.slice(); drawFilters(r.facets); drawTags();
    home ? showHome() : render(r);
  } catch (err) {
    if (ac.signal.aborted || err.name === 'AbortError') return;
    out.innerHTML = `<div class="qs-empty"><b>문제가 생겼어요</b>${esc(err.message)}</div>`;
  } finally { if (ctl === ac) ctl = null }
}
function render(r, append = false) {
  const psg = st.kind === 'passage', no = !!r.no_data;
  if (!append) {
    let h = '', sug = r.suggest || [];
    if (sug.length) h += `<div class="qs-sug"><span class="qs-sug__k">이렇게도 찾아보세요</span>${sug.map((s, i) => `<button type="button" class="pill" data-sug="${i}">${esc(s.label)}</button>`).join('')}</div>`;
    if (!no && r.passages.length) {
      const head = `<h2 class="qs-h">지문<span>${r.total_passages}</span></h2>`;
      const grid = `<div class="qs-pgrid" id="pg">${r.passages.map(pcard).join('')}</div>`;
      const more = !psg && r.total_passages > r.passages.length ? `<div class="qs-more qs-more--p"><button type="button" class="btn" data-allp>지문 ${r.total_passages}개 모두 보기 →</button></div>` : '';
      h += `${head}${grid}${more}`;   // 문항+지문 보기는 지문을 6개만 보여 줌
    }
    if (!no && r.items.length) h += `${(r.passages.length && !no) ? `<h2 class="qs-h">문항<span>${fmt(r.total_items)}</span></h2>` : ''}<div class="qs-items" id="ig">${r.items.map(icard).join('')}</div>`;
    if (no || (!r.items.length && !r.passages.length)) h += `<div class="qs-empty"><b>${no ? '기출에서 찾지 못했어요' : '맞는 문항이 없어요'}</b>${no ? '다른 말로 바꾸거나 검색어를 줄여 보세요.' : '다른 말로 바꾸거나 필터를 줄여 보세요.'}</div>`;
    out.innerHTML = h;
  } else psg ? $('#pg').insertAdjacentHTML('beforeend', r.passages.map(pcard).join('')) : $('#ig').insertAdjacentHTML('beforeend', r.items.map(icard).join(''));
  out.querySelector('.qs-more:not(.qs-more--p)')?.remove();
  out.querySelector('[data-allp]')?.addEventListener('click', () => { track('filter', { k: 'kind', v: 'passage', label: KIND.passage }); set({ kind: 'passage' }) });
  // '지문만' 보기면 지문으로, 아니면 문항으로 더 보기
  const shown = out.querySelectorAll(psg ? '#pg .qs-card' : '#ig .qs-card').length, total = (psg ? r.total_passages : r.total_items) || 0;
  const hid = (r.hidden_items || 0) + (r.hidden_passages || 0);
  if (!no && shown < total) {
    out.insertAdjacentHTML('beforeend', `<div class="qs-more"><button type="button" class="btn" id="more">더 보기 · ${fmt(total - shown)}</button></div>`);
    $('#more').onclick = async () => {
      const my = seq; st.offset = shown; RID = rand(); track('more', { offset: String(st.offset) });
      moreCtl?.abort(); const ac = new AbortController(); moreCtl = ac;
      try {
        const x = await api('/api/search', params(), { signal: ac.signal }); if (my !== seq) return;
        if (psg && R) R.passages = [...(R.passages || []), ...x.passages];
        list.push(...x.items); render(x, true);
      } catch (e) { if (!ac.signal.aborted) out.insertAdjacentHTML('beforeend', '<p class="qs-status">더 불러오지 못했어요</p>') }
      finally { if (moreCtl === ac) moreCtl = null }
    };
  } else if (!no && st.q && hid && !allMode) {
    out.insertAdjacentHTML('beforeend', `<div class="qs-more"><button type="button" class="btn" id="all">관련성 낮은 결과도 보기</button></div>`);
    $('#all').onclick = async () => {
      const my = seq; st.offset = 0; RID = rand(); track('all', { v: String(hid) });
      moreCtl?.abort(); const ac = new AbortController(); moreCtl = ac;
      try {
        const x = await api('/api/search', params({ all: 1 }), { signal: ac.signal }); if (my !== seq) return;
        allMode = true; x.all = 1; R = x; list = x.items.slice(); drawFilters(x.facets); drawTags(); render(x);
      } catch (e) { if (!ac.signal.aborted) out.insertAdjacentHTML('beforeend', '<p class="qs-status">더 불러오지 못했어요</p>') }
      finally { if (moreCtl === ac) moreCtl = null }
    };
  }
}
// 첫 화면: 기능별 예시(누르면 바로 검색·필터 적용)
const EXAMPLES = [
  ['기억나는 장면으로', '문제 문장을 몰라도 떠오르는 대로', [['실 끊기면 가속도 바뀌는 문제'], ['도선 세 개 자기장']]],
  ['문제에 없는 이름도', '문제에 적히지 않은 사상가·개념까지 찾아요', [['공자'], ['미분가능성']]],
  ['유형·분야로', '문항 유형과 지문 분야를 알아들어요', [['문장 삽입'], ['법 지문'], ['고전 소설']]],
  ['번호·시험으로', '번호만 치면 번호 필터가 걸려요', [['30번'], ['25 수능 수학 공통', { q: '', group: '수학', subject: '수학:공통', year: '2025', exam: '수능' }]]],
  ['오타가 나도', '가까운 낱말로 고쳐 찾아요', [['백터의 내적'], ['frame of referense']]],
];
function showHome() {
  out.innerHTML = `<div class="qs-home"><h2 class="qs-home__title">어떤 문항을 찾나요?</h2>
  <p class="qs-home__sub">15개정·09개정 평가원 기출 ${META ? META.total.toLocaleString() : ''}문항을 문항 하나씩 찾아요. 필터를 적용해 검색하면 더 정확한 결과를 얻을 수 있어요.</p>
  <p class="qs-home__notice"><span class="qs-home__beta">베타 v2</span><span>2014학년도부터 지금까지의 평가원 수능·모평을 지원해요.</span></p>
  <div class="qs-home__grid">${EXAMPLES.map(([t, d, xs], gi) => `<section class="qs-ex"><h3>${t}</h3><p>${d}</p>
    <div class="qs-ex__row">${xs.map(([l], xi) => `<button type="button" class="pill" data-ex="${gi}:${xi}">${esc(l)}</button>`).join('')}</div></section>`).join('')}</div></div>`;
  out.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => {
    const [gi, xi] = b.dataset.ex.split(':'), [l, f] = EXAMPLES[gi][2][xi];
    if (f) set({ ...Object.fromEntries(FILTERS.map(k => [k, ''])), ...f }); else { q.value = l; $('#f').requestSubmit() }   // 검색어 예시는 검색창에 넣어 실제로 검색(번호·오타 처리도 그대로)
  });
}

// ── 상세 서랍: 머리(닫기·위치·확대) / 제목(배지·학년도·과목, 번호·배점) / 문항|지문 탭 / 정답 / 비슷한 문항 / 아래 이전·다음
let cur = -1;
function openDrawer(wide) {
  dlg.classList.toggle('is-wide', !!wide); $('#pos').textContent = ''; $('#db').innerHTML = '<p class="qs-status">불러오는 중…</p>';
  if (!dlg.open) { dlg.showModal(); history.pushState({ d: 1 }, '') } dlg.scrollTop = 0;
}
function closeDrawer() { if (dlg.open) { dlg.close(); if (history.state?.d) history.back() } }
$('#dclose').onclick = closeDrawer; dlg.addEventListener('click', e => { if (e.target === dlg) closeDrawer() }); dlg.addEventListener('cancel', e => { e.preventDefault(); closeDrawer() });
$('#prev').onclick = () => step(-1); $('#next').onclick = () => step(1);
function step(d) { const i = cur + d; if (i >= 0 && i < list.length) openItem(list[i].id) }
// 정답: 오지선다는 ①~⑤, 수학 단답형은 숫자 그대로
const CIRC = ['', '①', '②', '③', '④', '⑤'];
function shortAnswer(x) {
  if (x.subject !== '수학') return false;
  if (['가형', '나형', 'A형', 'B형', '수학'].includes(x.sub)) return x.no >= 22;   // 옛 가·나형·A·B형, 2028 예비(선택 없음)는 22~30번이 단답형
  return (x.no >= 16 && x.no <= 22) || x.no >= 29;
}
const ansText = x => !shortAnswer(x) && CIRC[+x.answer] ? CIRC[+x.answer] : esc(x.answer);
const answer = x => `<div class="qs-answer"><span class="qs-answer__k">정답</span><b class="qs-answer__v spoil-val">${ansText(x)}</b><button type="button" class="btn btn--sm" data-show>정답 보기</button>${x.point ? `<span class="qs-answer__pt">${x.point}점</span>` : ''}</div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-show]'); if (b) { b.previousElementSibling.classList.remove('spoil-val'); b.remove() } });
const dhead = (x, big) => `<header class="qs-dhead"><div class="card__meta">${badge(x)}<span class="chiplet chiplet--ink">${x.year}학년도</span><span class="qs-dhead__subj" style="--subject-color:${COLOR[x.subject] || 'var(--ink-4)'}">${esc(title(x))}</span></div><h2 class="qs-dhead__t">${big}</h2></header>`;
function setNav() {
  const on = cur >= 0 && list.length > 1;
  $('#dfoot').hidden = !on; $('#prev').disabled = cur <= 0; $('#next').disabled = cur < 0 || cur >= list.length - 1;
  $('#pos').textContent = cur >= 0 ? `${cur + 1} / ${list.length}` : '';
}
async function openItem(id) {
  cur = list.findIndex(x => x.id === id); openDrawer(false); setNav();
  dlgCtl?.abort(); const ac = new AbortController(); dlgCtl = ac;
  try {
    const x = await api('/api/item', new URLSearchParams({ id, subject: st.subject || st.group }), { signal: ac.signal }), pc = x.passage_card;
    $('#db').innerHTML = `${dhead(x, `${x.no}번`)}
      ${pc ? `<div class="seg qs-tabs" role="tablist"><button type="button" role="tab" data-tab="q" aria-selected="true">문항</button><button type="button" role="tab" data-tab="p" aria-selected="false">지문 ${pc.frm}~${pc.to}번</button></div>` : ''}
      <div class="qs-sheet" data-pane="q"><img src="${img(x.id)}" alt="${esc(x.label)} ${x.no}번"></div>
      ${pc ? `<div class="qs-sheet" data-pane="p" hidden><img src="${img(pc.id)}" alt="지문 ${pc.frm}~${pc.to}번"></div>` : ''}
      ${answer(x)}
      ${pc ? `<button type="button" class="qs-row" id="topsg"><span>지문과 딸린 문항 ${pc.items.length}개 한 번에 보기</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>` : ''}
      ${x.similar.length ? `<section class="qs-sec"><h3>비슷한 문항<span>${x.similar.length}</span></h3><div class="qs-hrow">${x.similar.map(icard).join('')}</div></section>` : ''}`;
    $('#db').querySelector('.qs-tabs')?.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      $('#db').querySelectorAll('[data-tab]').forEach(t => t.setAttribute('aria-selected', t === b));
      $('#db').querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
    });
    if ($('#topsg')) $('#topsg').onclick = () => { track('click', { id: pc.id, kind: 'passage', label: 'drawer' }); openPassage(pc.id) };
  } catch (err) { if (!ac.signal.aborted) $('#db').innerHTML = `<p class="qs-empty">${esc(err.message)}</p>` }
  finally { if (dlgCtl === ac) dlgCtl = null }
}
async function openPassage(id) {
  cur = -1; openDrawer(true); setNav();
  dlgCtl?.abort(); const ac = new AbortController(); dlgCtl = ac;
  try {
    const p = await api('/api/passage', new URLSearchParams({ id }), { signal: ac.signal });
    $('#db').innerHTML = `${dhead(p, `${p.frm}~${p.to}번 지문`)}<div class="qs-pv"><div class="qs-sheet"><img src="${img(p.id)}" alt="${esc(p.label)} 지문"></div>
      <div class="qs-qs">${p.item_cards.map(x => `<article class="qs-q"><h3>${x.no}번</h3><div class="qs-sheet"><img loading="lazy" src="${img(x.id)}" alt="${x.no}번"></div>${answer(x)}</article>`).join('')}</div></div>`;
  } catch (err) { if (!ac.signal.aborted) $('#db').innerHTML = `<p class="qs-empty">${esc(err.message)}</p>` }
  finally { if (dlgCtl === ac) dlgCtl = null }
}

api('/api/meta', '').then(m => { META = m; fromURL(); run(false, true) }).catch(() => {});
})();
// 시험 종류 탭 — 지금은 평가원 하나뿐. 교육청 등 자료가 들어오면 disabled를 풀고 검색 요청에 src를 붙인다
document.querySelectorAll('#srcTabs .nav-tab').forEach(b => b.addEventListener('click', () => {
  if (b.disabled) return;
  document.querySelectorAll('#srcTabs .nav-tab').forEach(x => { x.classList.toggle('is-active', x === b); x.toggleAttribute('aria-current', x === b) });
}));
