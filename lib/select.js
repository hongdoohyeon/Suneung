'use strict';
// 기출검색 여러 시험 선택 → 한 PDF 로 합치기 / 개별(많으면 ZIP) 다운로드.
// 선택 목록은 탭·페이지를 오가도 남도록 localStorage 에 둔다. 파일 주소는 다운로드 창을 열 때 data/exam/{id}.json 에서 받는다.
import { saveBlob, IS_IN_APP } from './download.js?v=fe2cb6d13adbbb9e6486';
import { publicFileUrl } from './dom.js?v=fe2cb6d13adbbb9e6486';

const STORE_KEY = 'kicegg:selection';
const MAX_ITEMS = 200;   // '전체 선택'이 한 페이지를 통째로 담는 정도(옛 수능 탐구 많은 페이지 최대 197개)
const HEAVY = 60;        // 파일이 이보다 많으면 휴대폰 메모리 경고
const ZIP_OVER = 10;   // 파일이 이보다 많으면 개별 대신 ZIP 하나로
const KINDS = [
  ['q', '문제지', 'questionUrl', 'questionDownload'],
  ['a', '정답', 'answerUrl', 'answerDownload'],
  ['s', '해설', 'solutionUrl', 'solutionDownload'],
];
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let items = load();            // [{ id, label }]
let selecting = false;
let onModeChange = () => {};
let getResults = () => [];   // 지금 필터의 검색 결과 [{ id, label, gradeYear, examYear, exam }] — app.js 가 넘김
let dataVersion = '';
const metaCache = new Map();

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => x && x.id != null && x.label).slice(0, MAX_ITEMS) : [];
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); } catch { /* 저장 못 해도 이번 화면에선 동작 */ }
}

export const isSelecting = () => selecting;
export const isSelected = id => items.some(x => String(x.id) === String(id));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 표·카드에 넣는 선택 칸 — 줄 전체를 덮어 아무 데나 눌러도 고른다(다운로드 버튼은 위에 떠 있음)
export function checkboxHTML(id, label, cls) {
  return `<label class="${cls} sel-hit"><input type="checkbox" data-sel="${esc(id)}" data-sel-label="${esc(label)}"${isSelected(id) ? ' checked' : ''} aria-label="${esc(label)} 선택"><span class="sel-box" aria-hidden="true"></span></label>`;
}

function setSelected(id, label, on) {
  const i = items.findIndex(x => String(x.id) === String(id));
  if (on && i < 0) {
    if (items.length >= MAX_ITEMS) return false;
    items.push({ id, label });
  } else if (!on && i >= 0) items.splice(i, 1);
  return true;
}

function syncChecks() {
  document.querySelectorAll('input[data-sel]').forEach(cb => { cb.checked = isSelected(cb.dataset.sel); });
}

function changed() {
  save();
  renderBar();
}

function markSelecting(on) {
  selecting = on;
  document.body.classList.toggle('is-selecting', on);
  const t = document.getElementById('selectToggle');
  if (t) { t.setAttribute('aria-pressed', String(on)); t.querySelector('.select-toggle__label').textContent = on ? '선택 끝내기' : '선택'; }
}

// 끝내면 고른 것도 비운다 — 선택 모드 밖에 'n개 선택' 바만 남지 않게
export function setSelecting(on) {
  markSelecting(on);
  if (!on && items.length) { items = []; syncChecks(); save(); }
  renderBar();
  onModeChange();
}


// ── 하단 바 ────────────────────────────────────────────────
let bar;
function renderBar() {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'selbar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '선택한 시험');
    document.body.appendChild(bar);
    bar.addEventListener('click', e => {
      const act = e.target.closest('[data-selbar]')?.dataset.selbar;
      if (act === 'clear') { items = []; syncChecks(); changed(); }
      if (act === 'done') setSelecting(false);
      if (act === 'open') openDialog();
      if (act === 'all') openRangeDialog();
    });
  }
  const n = items.length;
  bar.hidden = !selecting;
  // '전체 선택 옵션' = 지금 검색 결과(모든 페이지)에서 연도 범위를 골라 한 번에 담기 — 선택 모드에서만
  const allBtn = selecting ? '<button type="button" class="btn btn--sm" data-selbar="all" aria-haspopup="dialog">전체 선택 옵션</button>' : '';
  bar.innerHTML = n
    ? `<span class="selbar__count"><b>${n}</b>개 선택</span>
       ${allBtn}
       <button type="button" class="btn btn--sm selbar__ghost" data-selbar="clear">선택 해제</button>
       <button type="button" class="btn btn--primary btn--sm" data-selbar="open">다운로드</button>`
    : `<span class="selbar__count">목록에서 시험을 고르세요</span>
       ${allBtn}
       <button type="button" class="btn btn--sm" data-selbar="done">끝내기</button>`;
}

// ── 전체 선택(연도 범위) 창 ──────────────────────────────
// 학평만 있는 결과는 시행 '년', 그 밖엔 '학년도'(학평도 학년도로 환산돼 있음) 기준
let rangeDlg;
function rangeYears(list) {
  const byExam = list.length > 0 && list.every(x => x.exam);
  const key = x => (byExam ? x.examYear : x.gradeYear);
  return { key, unit: byExam ? '년' : '학년도', years: [...new Set(list.map(key).filter(Number.isInteger))].sort((a, b) => b - a) };
}

function openRangeDialog() {
  const list = getResults();
  if (!list.length) return;
  const { key, unit, years } = rangeYears(list);
  if (!rangeDlg) {
    rangeDlg = document.createElement('dialog');
    rangeDlg.className = 'report-dlg selrange';
    rangeDlg.setAttribute('aria-labelledby', 'selrangeTitle');
    document.body.appendChild(rangeDlg);
    rangeDlg.addEventListener('click', e => {
      const act = e.target.closest('[data-selrange]')?.dataset.selrange;
      if (act === 'cancel') rangeDlg.close();
      if (act === 'go') {
        for (const x of rangeDlg._pick()) setSelected(x.id, x.label, true);
        syncChecks(); changed();
        rangeDlg.close();
      }
    });
  }
  const opts = sel => years.map(y => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`).join('');
  // 기본 시작 = 2022학년도(통합수능 첫해, 학평만이면 같은 해인 2021년) — 그해가 없으면 그 뒤 가장 이른 해, 그것도 없으면 가장 옛날
  const want = unit === '년' ? 2021 : 2022;
  const start = years.filter(y => y >= want).pop() ?? years[years.length - 1];
  rangeDlg.innerHTML = `
    <form class="report-form" method="dialog">
      <h2 id="selrangeTitle">전체 선택</h2>
      <p class="report-form__lead">지금 검색 결과 ${list.length.toLocaleString()}개 중에서 고를 범위를 정하세요. 필터를 먼저 걸면 편해요.</p>
      <div class="selrange__row">
        <select id="selrangeFrom" aria-label="시작 연도">${opts(start)}</select>
        <span>${unit}부터</span>
        <select id="selrangeTo" aria-label="끝 연도">${opts(years[0])}</select>
        <span>${unit}까지</span>
      </div>
      <p class="report-form__status" id="selrangeInfo" role="status" aria-live="polite"></p>
      <div class="report-form__actions">
        <button type="button" class="btn" data-selrange="cancel">취소</button>
        <button type="button" class="btn btn--primary" data-selrange="go">선택</button>
      </div>
    </form>`;
  const from = rangeDlg.querySelector('#selrangeFrom'), to = rangeDlg.querySelector('#selrangeTo');
  rangeDlg._pick = () => {
    const hi = Math.max(+from.value, +to.value), lo = Math.min(+from.value, +to.value);
    return list.filter(x => key(x) >= lo && key(x) <= hi && !isSelected(x.id));
  };
  const update = () => {
    const add = rangeDlg._pick().length, room = MAX_ITEMS - items.length;
    const go = rangeDlg.querySelector('[data-selrange="go"]');
    go.textContent = add ? `${add}개 선택` : '선택';
    go.disabled = !add || add > room;
    rangeDlg.querySelector('#selrangeInfo').textContent = !add ? '이 범위는 이미 다 골랐어요'
      : add > room ? `한 번에 ${MAX_ITEMS}개까지예요(지금 ${items.length}개 선택됨). 범위나 필터를 좁혀 주세요` : '';
  };
  from.addEventListener('change', update);
  to.addEventListener('change', update);
  update();
  rangeDlg.showModal();
}

// ── 파일 주소 ──────────────────────────────────────────────
async function examMeta(id) {
  if (!metaCache.has(id)) {
    metaCache.set(id, fetch(`data/exam/${encodeURIComponent(id)}.json?v=${dataVersion}`)
      .then(r => (r.ok ? r.json() : null)).catch(() => null));
  }
  return metaCache.get(id);
}

function nameFrom(url, given, fallback) {
  if (given) return given;
  try { const n = new URL(url).searchParams.get('name'); if (n) return n; } catch { /* 아래로 */ }
  return fallback;
}

// 파일을 받을 수 있는 주소 — kicegg.com 에선 같은 도메인(/files), 그 밖(로컬 미리보기 등)에선 CSP 가 허용하는 워커 주소
function fetchUrl(url) {
  if (typeof url !== 'string') return '';
  const pub = publicFileUrl(url);
  if (!pub.startsWith('https://kicegg.com/files/')) return '';
  return location.hostname === 'kicegg.com' ? pub : url;
}

function filesOf(meta, label, kinds) {
  if (!meta) return [];
  const seen = new Set(), out = [];
  for (const [k, word, urlKey, nameKey] of KINDS) {
    const url = meta[urlKey];
    if (!kinds.has(k) || typeof url !== 'string' || seen.has(url)) continue;
    seen.add(url);
    out.push({ kind: word, url: fetchUrl(url), name: nameFrom(url, meta[nameKey], `${label} ${word}.pdf`) });
  }
  return out;
}

// ── 다운로드 창 ────────────────────────────────────────────
let dlg, busy = false, abortCtl = null;
const dlgState = { mode: 'merge', kinds: new Set(['q']) };

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function buildDialog() {
  dlg = document.createElement('dialog');
  dlg.className = 'report-dlg seldlg';
  dlg.setAttribute('aria-labelledby', 'seldlgTitle');
  dlg.innerHTML = `
    <form class="report-form" method="dialog">
      <h2 id="seldlgTitle">선택한 시험 다운로드</h2>
      <fieldset class="seldlg__seg" aria-label="받는 방식">
        <label class="report-opt"><input type="radio" name="selmode" value="merge" checked>하나의 PDF로 합치기</label>
        <label class="report-opt"><input type="radio" name="selmode" value="each">파일별로 받기</label>
      </fieldset>
      <fieldset class="seldlg__kinds"><legend>포함할 자료</legend>
        ${KINDS.map(([k, w]) => `<label class="seldlg__kind"><input type="checkbox" name="selkind" value="${k}"${k === 'q' ? ' checked' : ''}>${w}</label>`).join('')}
      </fieldset>
      <div class="seldlg__listhead"><span>순서</span><small>줄을 끌어서 옮기세요(휴대폰은 ⠿ 손잡이)</small>
        <button type="button" class="btn btn--sm seldlg__reverse" data-seldlg="reverse" title="최신순 ↔ 옛날순"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>순서 뒤집기</button></div>
      <ol class="seldlg__list" id="seldlgList"></ol>
      <label class="report-form__row seldlg__name" id="seldlgNameRow">파일 이름
        <input type="text" id="seldlgName" maxlength="80" autocomplete="off" spellcheck="false">
      </label>
      <p class="report-form__note" id="seldlgNote"></p>
      <div class="ll" id="seldlgProg" data-status="working" hidden>
        <span class="ll__grid" aria-hidden="true"><span class="ll__layer ll__run">${LL_CELLS.map(u => `<i${u == null ? ' data-hole' : ` style="animation-delay:${Math.round(u * LL_STEP)}ms"`}></i>`).join('')}</span><span class="ll__layer ll__mark">${LL_CELLS.map(() => '<i></i>').join('')}</span></span>
        <span class="ll__text"><b class="ll__label"></b><small class="ll__sub"></small></span>
        <span class="ll__timer" aria-hidden="true">0.0s</span>
        <i class="ll__bar" aria-hidden="true"><i></i></i>
      </div>
      <p class="report-form__status" id="seldlgStatus" role="status" aria-live="polite"></p>
      <div class="report-form__actions">
        <button type="button" class="btn" data-seldlg="cancel">닫기</button>
        <button type="button" class="btn btn--primary" data-seldlg="go">다운로드</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#seldlgName').value = `kicegg 모음 ${today()}`;

  dlg.addEventListener('change', e => {
    if (e.target.name === 'selmode') dlgState.mode = e.target.value;
    if (e.target.name === 'selkind') {
      if (e.target.checked) dlgState.kinds.add(e.target.value); else dlgState.kinds.delete(e.target.value);
    }
    refreshDialog();
  });
  dlg.addEventListener('click', e => {
    const act = e.target.closest('[data-seldlg]')?.dataset.seldlg;
    if (!act) return;
    if (act === 'cancel') { if (busy) abortCtl?.abort(); else dlg.close(); return; }
    if (act === 'go') { run(); return; }
    if (act === 'reverse') { if (!busy) { items.reverse(); save(); renderList(); } return; }
    const li = e.target.closest('li');
    const i = [...li.parentNode.children].indexOf(li);
    if (act === 'del') { items.splice(i, 1); syncChecks(); changed(); }
    if (act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    save();
    renderList(act === 'up' ? i - 1 : act === 'down' ? i + 1 : -1, act);
    if (!items.length) dlg.close();
  });
  dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  // 파일 이름 칸에서 엔터 = 다운로드 (form method="dialog" 기본 동작은 창만 닫음)
  dlg.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    if (!dlg.querySelector('[data-seldlg="go"]').disabled) run();
  });
  enableDrag(dlg.querySelector('#seldlgList'));
}

function renderList(focusIdx = -1, focusAct = '') {
  const list = dlg.querySelector('#seldlgList');
  list.innerHTML = items.map((x, i) => `
    <li class="seldlg__item" data-id="${esc(x.id)}">
      <span class="seldlg__grip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
      <span class="seldlg__no">${i + 1}</span>
      <span class="seldlg__label">${esc(x.label)}<small data-files></small></span>
      <button type="button" class="seldlg__icon" data-seldlg="up" aria-label="위로"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button>
      <button type="button" class="seldlg__icon" data-seldlg="down" aria-label="아래로"${i === items.length - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <button type="button" class="seldlg__icon" data-seldlg="del" aria-label="목록에서 빼기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </li>`).join('');
  if (focusIdx >= 0) list.children[focusIdx]?.querySelector(`[data-seldlg="${focusAct}"]:not(:disabled)`)?.focus();
  refreshDialog();
}

// 자료 종류·방식에 따라 각 줄의 파일 표시와 안내 문구를 갱신한다(주소는 받아 둔 것 기준)
async function refreshDialog() {
  const metas = await Promise.all(items.map(x => examMeta(x.id)));
  let total = 0, skipped = 0;
  const kindsUsed = new Set();
  dlg.querySelectorAll('.seldlg__item').forEach(li => {
    const i = items.findIndex(x => String(x.id) === li.dataset.id);
    if (i < 0) return;
    const files = filesOf(metas[i], items[i].label, dlgState.kinds);
    const ok = files.filter(f => f.url);
    total += ok.length; skipped += files.length - ok.length;
    ok.forEach(f => kindsUsed.add(f.kind));
    li.querySelector('[data-files]').textContent = ok.length ? ok.map(f => f.kind).join(' · ') : '받을 파일 없음';
    li.classList.toggle('is-empty', !ok.length);
  });
  const merge = dlgState.mode === 'merge';
  dlg.querySelector('#seldlgNameRow').hidden = !merge && total <= ZIP_OVER && !(IS_IOS && total > 1);
  const how = merge ? (kindsUsed.size > 1 ? `${[...kindsUsed].join('·')} 각각 PDF로 합쳐요(${kindsUsed.size}개 파일)` : 'PDF 하나로 합쳐요')
    : (total > ZIP_OVER || (IS_IOS && total > 1)) ? `ZIP 하나로 묶어서 받아요${total > ZIP_OVER ? `(${ZIP_OVER}개 초과)` : ''}`
    : '파일을 하나씩 차례로 받아요. 브라우저가 여러 파일 다운로드를 허용할지 물을 수 있어요';
  dlg.querySelector('#seldlgNote').textContent =
    `파일 ${total}개 · ${how}${skipped ? ` · 한글(hwp) 등 ${skipped}개는 제외` : ''}${total > HEAVY ? ' · 파일이 많아 휴대폰에서는 멈출 수 있어요. 나눠 받기를 권해요' : ''}`;
  dlg.querySelector('[data-seldlg="go"]').disabled = busy || total === 0;
}

function openDialog() {
  if (!items.length) return;
  if (!dlg) buildDialog();
  dlg.querySelector('#seldlgStatus').textContent = '';
  if (!busy) dlg.querySelector('#seldlgProg').hidden = true;
  renderList();
  dlg.showModal();
}

// 끌어서 순서 바꾸기 — 줄이 포인터를 그대로 따라오고, 이웃 줄 가운데를 넘으면 자리를 바꾼다.
// 마우스는 줄 어디를 잡아도, 터치는 손잡이로(줄을 끌면 목록 스크롤). 목록 위·아래 끝에선 자동 스크롤.
function enableDrag(list) {
  let d = null;
  const place = () => {
    const { li } = d;
    li.style.transform = `translateY(${d.y - d.base}px)`;
    const prev = li.previousElementSibling, next = li.nextElementSibling, r = li.getBoundingClientRect();
    if (next && r.bottom > next.getBoundingClientRect().top + next.offsetHeight / 2) {
      list.insertBefore(next, li); d.base += next.offsetHeight; place();
    } else if (prev && r.top < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
      list.insertBefore(li, prev); d.base -= prev.offsetHeight; place();
    }
  };
  const tick = () => {
    if (!d?.active) return;
    const box = list.getBoundingClientRect(), edge = 36;
    const step = d.y < box.top + edge ? -8 : d.y > box.bottom - edge ? 8 : 0;
    if (step) {
      const before = list.scrollTop;
      list.scrollTop += step;
      d.base -= list.scrollTop - before;
      place();
    }
    d.raf = requestAnimationFrame(tick);
  };
  list.addEventListener('pointerdown', e => {
    if (busy || e.button !== 0 || e.target.closest('button')) return;
    const li = e.target.closest('li');
    if (!li || (e.pointerType !== 'mouse' && !e.target.closest('.seldlg__grip'))) return;
    d = { li, id: e.pointerId, startY: e.clientY, y: e.clientY, base: e.clientY, active: false };
    if (e.target.closest('.seldlg__grip')) e.preventDefault();
  });
  list.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    d.y = e.clientY;
    if (!d.active) {
      if (Math.abs(d.y - d.startY) < 4) return;
      d.active = true;
      d.li.classList.add('is-dragging');
      list.classList.add('is-sorting');
      d.li.setPointerCapture(d.id);
      d.raf = requestAnimationFrame(tick);
    }
    e.preventDefault();
    place();
  });
  const end = () => {
    if (!d) return;
    const was = d.active;
    cancelAnimationFrame(d.raf);
    d.li.classList.remove('is-dragging');
    d.li.style.transform = '';
    list.classList.remove('is-sorting');
    d = null;
    if (!was) return;
    const order = [...list.children].map(li => li.dataset.id);
    items.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
    save();
    renderList();
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

// ── 받기 · 합치기 · ZIP ────────────────────────────────────
async function fetchBytes(url, signal) {
  const res = await fetch(url, { credentials: 'omit', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
const isPdf = b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;   // %PDF
const fileSafe = s => s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'kicegg';

// ── 진행 표시(점 격자 로더) — reactbits.dev Lattice Loader 의 orbit 패턴을 그대로 옮긴 바닐라 판 ──
// 3×3 점이 테두리를 따라 돌고, 끝나면 초록 체크 / 실패면 빨간 X. 숫자 대신 지금 하는 일과 경과 시간·얇은 막대로 보여 준다.
const LL_CELLS = [0, 1, 2, 7, null, 3, 6, 5, 4];
const LL_STEP = 108;   // 90ms × 1.2 — 한 바퀴 864ms
const LL_MARKS = { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] };
let llTimer = 0;
function progStart() {
  const el = dlg.querySelector('#seldlgProg'), t0 = performance.now();
  el.hidden = false;
  el.dataset.status = 'working';
  el.querySelectorAll('.ll__mark i').forEach(i => i.removeAttribute('data-on'));
  progSet('준비 중', '', 0);
  clearInterval(llTimer);
  const timer = el.querySelector('.ll__timer');
  const tick = () => { const ds = Math.floor((performance.now() - t0) / 100); timer.textContent = ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`; };
  tick();
  llTimer = setInterval(tick, 100);
}
function progSet(label, sub, frac) {
  const el = dlg.querySelector('#seldlgProg');
  el.querySelector('.ll__label').textContent = label;
  el.querySelector('.ll__sub').textContent = sub;
  if (frac != null) el.querySelector('.ll__bar i').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
}
function progEnd(state, label, sub = '') {
  clearInterval(llTimer);
  const el = dlg.querySelector('#seldlgProg');
  el.dataset.status = state;
  [...el.querySelectorAll('.ll__mark i')].forEach((i, k) => i.toggleAttribute('data-on', LL_MARKS[state].includes(k)));
  progSet(label, sub, state === 'done' ? 1 : null);
}
const shortName = n => n.replace(/\.pdf$/i, '');

async function run() {
  if (busy) return;
  const status = dlg.querySelector('#seldlgStatus');
  status.textContent = '';
  if (IS_IN_APP) { handOff(status); return; }
  const metas = await Promise.all(items.map(x => examMeta(x.id)));
  const files = items.flatMap((x, i) => filesOf(metas[i], x.label, dlgState.kinds)).filter(f => f.url);
  if (!files.length) return;
  const merge = dlgState.mode === 'merge';
  const zip = !merge && (files.length > ZIP_OVER || (IS_IOS && files.length > 1));
  const base = fileSafe(dlg.querySelector('#seldlgName').value);

  busy = true; abortCtl = new AbortController();
  dlg.classList.add('is-busy');
  dlg.querySelector('[data-seldlg="go"]').disabled = true;
  dlg.querySelector('[data-seldlg="cancel"]').textContent = '취소';
  const failed = [];
  progStart();
  try {
    if (merge) {
      progSet('준비 중', 'PDF 도구 불러오는 중', 0);
      const { PDFDocument } = await import('./vendor/pdf-lib/pdf-lib.esm.min.js?v=fe2cb6d13adbbb9e6486');
      // 문제지·정답·해설은 종류별로 따로 합친다(같은 순서) — 종류가 하나면 이름에 종류를 붙이지 않음
      const groups = KINDS.map(([, word]) => [word, files.filter(f => f.kind === word)]).filter(([, g]) => g.length);
      let done = 0, saved = 0;
      for (const [word, group] of groups) {
        const out = await PDFDocument.create();
        for (const f of group) {
          progSet(`${word} 받는 중`, shortName(f.name), done++ / files.length);
          try {
            const bytes = await fetchBytes(f.url, abortCtl.signal);
            if (!isPdf(bytes)) { failed.push(f.name); continue; }
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
            (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
          } catch (err) { if (err.name === 'AbortError') throw err; failed.push(f.name); }
        }
        if (!out.getPageCount()) continue;
        progSet(`${word} 합치는 중`, `${base}${groups.length > 1 ? ' ' + word : ''}.pdf`, done / files.length);
        saveBlob(new Blob([await out.save()], { type: 'application/pdf' }), groups.length > 1 ? `${base} ${word}.pdf` : `${base}.pdf`);
        saved++;
        await new Promise(r => setTimeout(r, 350));
      }
      if (!saved) throw new Error('합칠 수 있는 PDF가 없어요');
    } else if (zip) {
      const entries = [];
      for (const [i, f] of files.entries()) {
        progSet('받는 중', shortName(f.name), i / files.length);
        try { entries.push({ name: f.name, data: await fetchBytes(f.url, abortCtl.signal) }); }
        catch (err) { if (err.name === 'AbortError') throw err; failed.push(f.name); }
      }
      if (!entries.length) throw new Error('받은 파일이 없어요');
      progSet('ZIP 묶는 중', `${base}.zip`, 1);
      saveBlob(makeZip(entries), `${base}.zip`);
    } else {
      for (const [i, f] of files.entries()) {
        progSet('받는 중', shortName(f.name), i / files.length);
        try {
          saveBlob(new Blob([await fetchBytes(f.url, abortCtl.signal)], { type: 'application/pdf' }), f.name);
          await new Promise(r => setTimeout(r, 350));   // 연달아 저장하면 일부 브라우저가 몇 개를 버린다
        } catch (err) { if (err.name === 'AbortError') throw err; failed.push(f.name); }
      }
    }
    progEnd('done', '다 받았어요', failed.length ? '일부 파일은 받지 못했어요' : '');
    if (failed.length) status.textContent = `받지 못한 파일: ${failed.map(shortName).join(', ')}`;
  } catch (err) {
    progEnd('error', err.name === 'AbortError' ? '취소했어요' : '받지 못했어요', err.name === 'AbortError' ? '' : (err.message || '잠시 뒤 다시 시도해 주세요'));
  } finally {
    busy = false; abortCtl = null;
    dlg.classList.remove('is-busy');
    dlg.querySelector('[data-seldlg="cancel"]').textContent = '닫기';
    refreshDialog();
  }
}

// 압축 없는(STORE) ZIP — PDF 는 이미 압축돼 있어 다시 압축해도 거의 줄지 않는다
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = [], used = new Set();
  let offset = 0;
  for (const { name, data } of entries) {
    let n = name, k = 2;
    while (used.has(n)) n = name.replace(/(\.[^.]*)?$/, m => ` (${k})${m}`), k++;
    used.add(n);
    const nb = enc.encode(n), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
    head.setUint16(26, nb.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nb.length, true); cen.setUint32(42, offset, true);
    parts.push(head, nb, data);
    central.push(cen, nb);
    offset += 30 + nb.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// ── 앱 안 브라우저 → 외부 브라우저로 이어 받기 ─────────────────────
// 카톡·네이버·인스타 등 앱 안 브라우저는 blob: 저장을 못 해 합치기·ZIP·여러 개 받기가 안 된다.
// 고른 목록·옵션을 주소(?seldl=)에 담아 외부 브라우저로 열고, 거기서 받기 창을 그대로 다시 띄운다.
// (선택 목록은 localStorage 라 브라우저를 건너가지 못한다)
const HANDOFF_KEY = 'seldl';
const b64url = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

function handOffUrl() {
  const u = new URL(location.href);
  u.hash = '';
  u.searchParams.set(HANDOFF_KEY, b64url(JSON.stringify({
    i: items.map(x => [x.id, x.label]), m: dlgState.mode, k: [...dlgState.kinds].join(''), n: dlg.querySelector('#seldlgName').value,
  })));
  return u.href;
}

function handOff(status) {
  const url = handOffUrl();
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
  else if (/Line\//.test(ua)) location.href = url + '&openExternalBrowser=1';
  else if (/Android/i.test(ua)) location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
  else {
    // iOS 의 네이버·인스타 등은 바깥 브라우저를 여는 방법이 없다 → 주소를 복사해 사파리에 붙여 넣게
    navigator.clipboard?.writeText(url).then(
      () => { status.textContent = '이 앱에서는 파일을 저장할 수 없어요. 링크를 복사했으니 사파리 주소창에 붙여 넣으면 고른 그대로 이어서 받을 수 있어요.'; },
      () => { status.textContent = '이 앱에서는 파일을 저장할 수 없어요. 메뉴(⋯)의 \'Safari로 열기\'를 누르면 고른 그대로 이어서 받을 수 있어요.'; });
    return;
  }
  status.textContent = '외부 브라우저에서 이어서 받아요. 열리지 않으면 메뉴의 \'다른 브라우저로 열기\'를 눌러 주세요.';
}

// 이어 받기 주소로 들어왔으면 목록·옵션을 되살리고 받기 창을 연다(앱 안 브라우저면 다시 넘기지 않게 그대로 둠)
function resumeHandOff() {
  const u = new URL(location.href);
  const raw = u.searchParams.get(HANDOFF_KEY);
  if (!raw) return;
  u.searchParams.delete(HANDOFF_KEY);
  u.searchParams.delete('openExternalBrowser');
  history.replaceState(history.state, '', u.href);
  let p;
  try { p = JSON.parse(unb64url(raw)); } catch { return; }
  const got = (Array.isArray(p?.i) ? p.i : []).filter(x => Array.isArray(x) && x[0] != null && x[1]).slice(0, MAX_ITEMS);
  if (!got.length) return;
  items = got.map(([id, label]) => ({ id: String(id), label: String(label) }));
  save();
  if (p.m === 'merge' || p.m === 'each') dlgState.mode = p.m;
  const kinds = String(p.k || '').split('').filter(k => KINDS.some(([q]) => q === k));
  if (kinds.length) dlgState.kinds = new Set(kinds);
  if (!dlg) buildDialog();
  dlg.querySelectorAll('input[name="selmode"]').forEach(r => { r.checked = r.value === dlgState.mode; });
  dlg.querySelectorAll('input[name="selkind"]').forEach(c => { c.checked = dlgState.kinds.has(c.value); });
  if (p.n) dlg.querySelector('#seldlgName').value = String(p.n).slice(0, 80);
  openDialog();
}

// ── 초기화 ─────────────────────────────────────────────────
export function initSelect({ version, onMode, results }) {
  dataVersion = version;
  onModeChange = onMode;
  getResults = results;
  document.getElementById('selectToggle')?.addEventListener('click', () => setSelecting(!selecting));
  document.addEventListener('change', e => {
    const cb = e.target.closest('input[data-sel]');
    if (!cb) return;
    if (!setSelected(cb.dataset.sel, cb.dataset.selLabel, cb.checked)) {
      cb.checked = false;
      alert(`한 번에 ${MAX_ITEMS}개까지 고를 수 있어요`);
    }
    changed();
  });
  // 다른 탭에서 바꾼 선택도 반영
  window.addEventListener('storage', e => { if (e.key === STORE_KEY) { items = load(); syncChecks(); renderBar(); } });
  // 다른 페이지에서 고르다 왔으면 선택 모드로 이어서
  resumeHandOff();
  if (items.length) markSelecting(true);
  renderBar();
  syncChecks();
}
