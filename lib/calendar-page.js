
// calendar.html 전용 — 월간 캘린더 + 날짜별 일정 패널.
import { loadCalendar, CAT_COLORS } from './calendar.js?v=bddadf8f83c93d076be4';

/* ============================================================
   데이터
   ============================================================ */
let EVENTS = [];

const CATS = [
  {id:'csat',     label:'수능'},
  {id:'kice',     label:'평가원'},
  {id:'edu',      label:'학평'},
  {id:'수시',     label:'수시'},
  {id:'정시',     label:'정시'},
  {id:'사관',     label:'사관'},
  {id:'경찰',     label:'경찰'},
  {id:'리트',     label:'LEET'},
  {id:'미트',     label:'MDEET'},
  {id:'검정고시', label:'검정고시'},
  {id:'대학별',   label:'대학별'}
].map(c => ({...c, color: CAT_COLORS[c.id]}));
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const WD = ['일','월','화','수','목','금','토'];
const DAY = 86400000;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COMPACT_MQ = window.matchMedia('(max-width: 680px)');
const LONG_RANGE_DAYS = 7;

const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfWeek = d => { const x = new Date(d); x.setDate(x.getDate()-x.getDay()); return x; };
const dayDiff = (a,b) => Math.round((Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()) - Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())) / DAY);

const evStartS = e => e.date || e.dateRange[0];
const evEndS = e => e.date || e.dateRange[1];
const evStart = e => parseYmd(evStartS(e));
const evEnd = e => parseYmd(evEndS(e));
const isRange = e => !!e.dateRange;
const evDays = e => dayDiff(evEnd(e), evStart(e)) + 1;
const isLongRange = e => isRange(e) && evDays(e) >= LONG_RANGE_DAYS;
const catOf = e => CAT[e.category] || {label:e.category,color:'#6c6c70'};
const shortTitle = s => s.replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
const BAR_LABEL_RULES = [
  [/^10월 전국연합학력평가$/, '10월 학력평가'],
  [/^2027학년도 대학수학능력시험$/, '2027 수능'],
  [/^2027학년도 수능 예비소집$/, '2027 수능 예비소집'],
  [/^2027학년도 사관학교·국간사 1차 시험$/, '사관·국간사 1차'],
  [/^2027학년도 경찰대학 1차 필기시험$/, '경찰대 1차'],
  [/^2027학년도 의·치의학교육입문검사$/, 'MDEET'],
  [/^2026년 제1회 고등검정고시$/, '제1회 고등검정고시'],
  [/^2026년 제2회 고등검정고시$/, '제2회 고등검정고시']
];
function barLabel(title){
  const t = shortTitle(title);
  for (const [re,label] of BAR_LABEL_RULES) if (re.test(t)) return label;
  return t;
}

const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

const state = {
  view: 'month',
  cursor: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  cat: null,
  uni: null,
  focusDay: ymd(TODAY),
  selectedDay: ymd(TODAY)
};

/* ---------- 계산 ---------- */
function filtered(){
  let out = state.cat ? EVENTS.filter(e => e.category === state.cat) : EVENTS;
  if (state.uni) out = out.filter(e => e.uni === state.uni);
  return out;
}
function eventsBetween(a,b){
  const A = ymd(a), B = ymd(b);
  return filtered()
    .filter(e => evStartS(e) <= B && evEndS(e) >= A)
    .sort((x,y) => evStartS(x).localeCompare(evStartS(y)) || evEndS(y).localeCompare(evEndS(x)) || x.title.localeCompare(y.title,'ko'));
}
function eventsOn(key){
  return filtered()
    .filter(e => evStartS(e) <= key && evEndS(e) >= key)
    .sort((x,y) => evStartS(x).localeCompare(evStartS(y)) || evEndS(y).localeCompare(evEndS(x)) || x.title.localeCompare(y.title,'ko'));
}
function eventsInMonth(y,m){ return eventsBetween(new Date(y,m,1), new Date(y,m+1,0)); }
function agendaEvents(){
  const startKey = ymd(new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1));
  return filtered()
    .filter(e => evEndS(e) >= startKey)
    .sort((a,b) => evStartS(a).localeCompare(evStartS(b)) || evEndS(a).localeCompare(evEndS(b)) || a.title.localeCompare(b.title,'ko'));
}
function statusOf(e){
  const s = evStart(e), t = evEnd(e);
  if (!isRange(e) && s.getTime() === TODAY.getTime()) return {kind:'today', label:'D-DAY'};
  if (s <= TODAY && t >= TODAY) return {kind:'ongoing', label:'진행 중'};
  const diff = dayDiff(s,TODAY);
  if (diff > 0) return {kind:'future', label:'D-'+diff};
  return {kind:'past', label:'종료'};
}
function ddayForHeader(){
  const exams = EVENTS
    .filter(e => e.category === 'csat' && e.type === 'exam' && e.date && evStart(e) >= TODAY)
    .sort((a,b) => evStartS(a).localeCompare(evStartS(b)));
  if (exams.length) return exams[0];
  const nearest = EVENTS.filter(e => e.type === 'exam' && evEnd(e) >= TODAY).sort((a,b) => evStartS(a).localeCompare(evStartS(b)));
  return nearest[0] || null;
}

/* ---------- 포맷 ---------- */
function fullDate(d){ return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
function shortDate(d){ return `${pad(d.getMonth()+1)}.${pad(d.getDate())}`; }
function shortRange(e){
  const s = evStart(e), t = evEnd(e);
  return isRange(e) ? `${shortDate(s)}–${shortDate(t)}` : `${shortDate(s)} ${WD[s.getDay()]}`;
}
function rowDate(e){
  const s = evStart(e), t = evEnd(e);
  if (!isRange(e)) return `<b>${pad(s.getMonth()+1)}.${pad(s.getDate())}</b><span>${WD[s.getDay()]}요일</span>`;
  return `<b>${shortRange(e)}</b><span>${evDays(e)}일</span>`;
}
function gradeText(grades){
  if (!grades || !grades.length) return '';
  if (grades.length === 3) return '고1·고2·고3';
  return grades.map(g => '고'+g).join('·');
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


/* ---------- 필터 메뉴 ---------- */
function buildFilterMenu(){
  const menu = document.getElementById('filterMenu');
  const check = `<svg class="pl-option__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
  menu.innerHTML = `<div class="pl-menu__head">일정 종류</div>
    <button type="button" class="pl-option" role="option" data-cat="" aria-selected="true" style="--c:var(--ink-4)">
      <span class="pl-option__dot" style="--c:var(--line-strong)" aria-hidden="true"></span>
      <span>전체 일정</span>${check}
    </button>
    <div class="pl-menu__sep" role="separator"></div>
    ${CATS.map(c => `<button type="button" class="pl-option" role="option" data-cat="${escapeHtml(c.id)}" aria-selected="false" style="--c:${c.color}">
      <span class="pl-option__dot" style="--c:${c.color}" aria-hidden="true"></span>
      <span>${escapeHtml(c.label)}</span>${check}
    </button>`).join('')}`;

  menu.addEventListener('click', e => {
    const opt = e.target.closest('.pl-option');
    if (!opt) return;
    state.cat = opt.dataset.cat || null;
    if (state.cat !== '대학별') state.uni = null;
    updateFilterButton();
    updateUniButton();
    closeFilterMenu(true);
    renderAll();
    announceFilter();
  });

  menu.addEventListener('keydown', e => {
    const opts = [...menu.querySelectorAll('.pl-option')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      closeFilterMenu(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'ArrowDown' ? opts[(i+1) % opts.length] : opts[(i-1+opts.length) % opts.length];
      next.focus();
    } else if (e.key === 'Home' || e.key === 'End'){
      e.preventDefault(); e.stopPropagation();
      opts[e.key === 'Home' ? 0 : opts.length-1].focus();
    } else if (e.key === 'Tab'){
      closeFilterMenu(false);
    }
  });
}
function updateFilterButton(){
  const label = state.cat ? CAT[state.cat].label : '전체';
  document.getElementById('filterLabel').textContent = label;
  const dot = document.getElementById('filterDot');
  if (state.cat){ dot.hidden = false; dot.style.setProperty('--c', CAT[state.cat].color); }
  else dot.hidden = true;
  document.getElementById('filterBtn').setAttribute('aria-label', `일정 종류: ${label}`);
  document.querySelectorAll('#filterMenu .pl-option').forEach(opt => {
    const on = (opt.dataset.cat || null) === state.cat;
    opt.setAttribute('aria-selected', String(on));
  });
}
function announceFilter(){
  document.getElementById('liveStatus').textContent = state.uni ? `${state.uni} 일정만 표시합니다.`
    : (state.cat ? `${CAT[state.cat].label} 일정만 표시합니다.` : '전체 일정을 표시합니다.');
}
function openFilterMenu(){
  const menu = document.getElementById('filterMenu');
  const btn = document.getElementById('filterBtn');
  menu.hidden = false;
  btn.setAttribute('aria-expanded','true');
  const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.pl-option');
  selected?.focus();
}
function closeFilterMenu(focusBtn){
  const menu = document.getElementById('filterMenu');
  const btn = document.getElementById('filterBtn');
  menu.hidden = true;
  btn.setAttribute('aria-expanded','false');
  if (focusBtn) btn.focus();
}
function initFilter(){
  buildFilterMenu();
  updateFilterButton();
  document.getElementById('filterBtn').addEventListener('click', e => {
    e.stopPropagation();
    closeUniMenu(false);
    const menu = document.getElementById('filterMenu');
    if (menu.hidden) openFilterMenu(); else closeFilterMenu(true);
  });
  document.addEventListener('click', e => {
    const menu = document.getElementById('filterMenu');
    if (menu.hidden) return;
    if (!e.target.closest('.pl-filterwrap')) closeFilterMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('filterMenu').hidden){
      closeFilterMenu(true);
    }
  });
}

/* ---------- 대학 필터 ---------- */
function uniOptions(){
  return [...new Set(EVENTS.map(e => e.uni).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
}
function buildUniMenu(){
  const menu = document.getElementById('uniFilterMenu');
  const check = `<svg class="pl-option__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
  menu.innerHTML = `<div class="pl-menu__head">대학</div>
    <button type="button" class="pl-option" role="option" data-uni="" aria-selected="true"><span>전체 대학</span>${check}</button>
    <div class="pl-menu__sep" role="separator"></div>
    ${uniOptions().map(u => `<button type="button" class="pl-option" role="option" data-uni="${escapeHtml(u)}" aria-selected="false"><span>${escapeHtml(u)}</span>${check}</button>`).join('')}`;

  menu.addEventListener('click', e => {
    const opt = e.target.closest('.pl-option');
    if (!opt) return;
    state.uni = opt.dataset.uni || null;
    if (state.uni && state.cat !== '대학별'){ state.cat = '대학별'; updateFilterButton(); }
    updateUniButton();
    closeUniMenu(true);
    renderAll();
    announceFilter();
  });

  menu.addEventListener('keydown', e => {
    const opts = [...menu.querySelectorAll('.pl-option')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      closeUniMenu(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'ArrowDown' ? opts[(i+1) % opts.length] : opts[(i-1+opts.length) % opts.length];
      next.focus();
    } else if (e.key === 'Home' || e.key === 'End'){
      e.preventDefault(); e.stopPropagation();
      opts[e.key === 'Home' ? 0 : opts.length-1].focus();
    } else if (e.key === 'Tab'){
      closeUniMenu(false);
    }
  });
}
function updateUniButton(){
  const label = state.uni || '전체';
  document.getElementById('uniFilterLabel').textContent = label;
  const dot = document.getElementById('uniDot');
  if (state.uni){ dot.hidden = false; dot.style.setProperty('--c', CAT_COLORS['대학별']); }
  else dot.hidden = true;
  document.getElementById('uniFilterBtn').setAttribute('aria-label', `대학: ${label}`);
  document.querySelectorAll('#uniFilterMenu .pl-option').forEach(opt => {
    opt.setAttribute('aria-selected', String((opt.dataset.uni || null) === state.uni));
  });
}
function openUniMenu(){
  const menu = document.getElementById('uniFilterMenu');
  const btn = document.getElementById('uniFilterBtn');
  menu.hidden = false;
  menu.style.left = '';
  menu.style.right = '';
  if (window.matchMedia('(max-width: 680px)').matches){
    // 좁은 화면에서 메뉴가 뷰포트를 넘지 않게 왼쪽으로 당긴다
    const r = menu.getBoundingClientRect();
    const pad = 12;
    const over = r.right - (window.innerWidth - pad);
    if (over > 0){
      menu.style.left = `${-over}px`;
      menu.style.right = 'auto';
    }
  }
  btn.setAttribute('aria-expanded','true');
  const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.pl-option');
  selected?.focus();
}
function closeUniMenu(focusBtn){
  const menu = document.getElementById('uniFilterMenu');
  const btn = document.getElementById('uniFilterBtn');
  if (!menu || !btn) return;
  menu.hidden = true;
  btn.setAttribute('aria-expanded','false');
  if (focusBtn) btn.focus();
}
function initUniFilter(){
  buildUniMenu();
  updateUniButton();
  document.getElementById('uniFilterBtn').addEventListener('click', e => {
    e.stopPropagation();
    closeFilterMenu(false);
    const menu = document.getElementById('uniFilterMenu');
    if (menu.hidden) openUniMenu(); else closeUniMenu(true);
  });
  document.addEventListener('click', e => {
    const menu = document.getElementById('uniFilterMenu');
    if (menu.hidden) return;
    if (!e.target.closest('#uniFilterWrap')) closeUniMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('uniFilterMenu').hidden){
      closeUniMenu(true);
    }
  });
}

/* ---------- 월간 달력 ---------- */
function maxLanes(){ return COMPACT_MQ.matches ? 99 : 3; }

function layoutWeek(weekStart, evs, lanes){
  const rowEnd = addDays(weekStart,6);
  const segs = [];
  for (const e of evs){
    const s = evStart(e), t = evEnd(e);
    if (t < weekStart || s > rowEnd) continue;

    if (isLongRange(e)){
      // 1주일 이상: 시작일과 종료일에만 마커를 둔다
      if (s >= weekStart && s <= rowEnd){
        const c0 = dayDiff(s, weekStart);
        segs.push({ e, c0, c1:c0, contL:false, contR:false, marker:'start' });
      }
      if (t >= weekStart && t <= rowEnd){
        const c0 = dayDiff(t, weekStart);
        segs.push({ e, c0, c1:c0, contL:false, contR:false, marker:'end' });
      }
      continue;
    }

    const cs = s < weekStart ? weekStart : s;
    const ce = t > rowEnd ? rowEnd : t;
    segs.push({
      e,
      c0: dayDiff(cs, weekStart),
      c1: dayDiff(ce, weekStart),
      contL: s < weekStart,
      contR: t > rowEnd
    });
  }

  segs.sort((a,b) => a.c0-b.c0 || (b.c1-b.c0)-(a.c1-a.c0) || a.e.title.localeCompare(b.e.title,'ko'));
  const laneEnds = [];
  for (const sg of segs){
    let lane = laneEnds.findIndex(end => end < sg.c0);
    if (lane === -1){ lane = laneEnds.length; laneEnds.push(-1); }
    laneEnds[lane] = sg.c1;
    sg.lane = lane;
  }
  const overflow = Array(7).fill(0);
  for (const sg of segs){
    if (sg.lane >= lanes) for (let c=sg.c0; c<=sg.c1; c++) overflow[c]++;
  }
  return {segs, overflow};
}

function barHtml(sg){
  const e = sg.e, c = catOf(e);
  const span = sg.c1 - sg.c0 + 1;
  const cont = [sg.contL?'l':'', sg.contR?'r':''].filter(Boolean).join(' ');
  const tag = sg.marker ? `<span class="pl-bar__tag">${sg.marker === 'start' ? '시작' : '종료'}</span>` : '';
  return `<div class="pl-bar" data-cont="${cont}" ${sg.marker?`data-marker="${sg.marker}"`:''} aria-hidden="true"
    style="--c:${c.color};--c0:${sg.c0};--span:${span};--lane:${sg.lane};--il:${sg.contL?0:4}px;--ir:${sg.contR?0:4}px">
    ${tag}<span class="pl-bar__t">${escapeHtml(barLabel(e.title))}</span>
  </div>`;
}

const MOBILE_LABEL = {csat:'수능',kice:'평가원',edu:'학평','수시':'수시','정시':'정시','사관':'사관','경찰':'경찰','리트':'LEET','미트':'미트','검정고시':'검정'};
function mobileLabel(e){
  const t = e.title;
  if (e.uni) return e.uni.replace(/\s*\([^)]*\)\s*$/, '');
  let m;
  if ((m = t.match(/(\d+)월\s*모의평가/))) return `${m[1]}모`;
  if ((m = t.match(/(\d+)월\s*(?:전국연합)?학력평가/))) return `${m[1]}학평`;
  if (/수능 예비소집/.test(t)) return '예비';
  if (/수능 문제·정답 이의신청/.test(t)) return '이의';
  if (/수능 정답 확정/.test(t)) return '정답';
  if (/수능 성적 통지/.test(t)) return '성적';
  if (/대학수학능력시험/.test(t)) return '수능';
  if (/수시 합격자 발표/.test(t)) return '합격';
  if (/수시 합격자 등록/.test(t)) return '등록';
  if (/수시 미등록 충원/.test(t)) return '충원';
  if (/정시 최초합격자 발표/.test(t)) return '합격';
  if (/정시 합격자 등록/.test(t)) return '등록';
  if (/정시 미등록 충원/.test(t)) return '충원';
  if (/추가모집/.test(t)) return '추가';
  if (/LEET|법학적성시험/.test(t)) return 'LEET';
  if (/MDEET|의·치의학교육입문검사/.test(t)) return '미트';
  if (/검정고시/.test(t)) return '검정';
  if (/사관학교/.test(t)) return '사관';
  if (/경찰대학/.test(t)) return '경찰';
  if (/수시/.test(t)) return '수시';
  if (/정시/.test(t)) return '정시';
  if (/대학수학능력시험|수능/.test(t)) return '수능';
  const c = catOf(e);
  return MOBILE_LABEL[c.id] || c.label;
}
function cellMinis(key, evs){
  const shown = evs.filter(e => !isLongRange(e) || evStartS(e) === key || evEndS(e) === key).slice(0,3);
  return `<div class="pl-minis">${shown.map(e => {
    const c = catOf(e);
    const start = evStartS(e) === key, end = evEndS(e) === key;
    const left = isRange(e) && end && !start ? '<span class="pl-mini__arrow" aria-hidden="true">‹</span>' : '';
    const right = isRange(e) && start && !end ? '<span class="pl-mini__arrow" aria-hidden="true">›</span>' : '';
    return `<span class="pl-mini" style="--c:${c.color}">${left}<span class="pl-mini__t">${escapeHtml(mobileLabel(e))}</span>${right}</span>`;
  }).join('')}</div>`;
}

function renderGrid(){
  const y = state.cursor.getFullYear(), m = state.cursor.getMonth();
  const first = new Date(y,m,1);
  const gridStart = startOfWeek(first);
  const last = new Date(y,m+1,0);
  const gridEnd = addDays(startOfWeek(last),6);
  const evs = eventsBetween(gridStart,gridEnd);
  const lanes = maxLanes();
  const compact = COMPACT_MQ.matches;
  const todayKey = ymd(TODAY);
  const monthKey = `${y}-${pad(m+1)}`;
  let focusKey = state.focusDay;
  if (!focusKey || !focusKey.startsWith(monthKey)){
    focusKey = todayKey.startsWith(monthKey) ? todayKey : ymd(first);
  }
  let html = '';
  for (let cur = new Date(gridStart); cur <= gridEnd; cur = addDays(cur,7)){
    const weekStart = new Date(cur);
    const {segs, overflow} = layoutWeek(weekStart, evs, lanes);
    let cells = '';
    for (let i=0; i<7; i++){
      const d = addDays(weekStart,i), key = ymd(d), wd = d.getDay();
      const out = String(d.getMonth()+1) !== String(m+1) || d.getFullYear() !== y;
      const dayEvs = eventsOn(key);
      const aria = `${d.getMonth()+1}월 ${d.getDate()}일 ${WD[wd]}요일` +
        (dayEvs.length ? `, 일정 ${dayEvs.length}건: ${dayEvs.map(e=>e.title).join(', ')}` : ', 일정 없음');
      cells += `<div class="pl-cell" role="gridcell" tabindex="${key===focusKey?0:-1}"
        data-day="${key}" data-wd="${wd}" data-out="${out?1:0}" data-today="${key===todayKey?1:0}"
        data-selected="${key===state.selectedDay?1:0}"
        aria-label="${escapeHtml(aria)}"
        aria-selected="${key===state.selectedDay}"${key===todayKey?' aria-current="date"':''}>
        <span class="pl-date">${d.getDate()}</span>
        ${compact ? cellMinis(key, dayEvs) : ''}
        ${(!compact && overflow[i]) ? `<span class="pl-more" aria-hidden="true">+${overflow[i]}</span>` : ''}
      </div>`;
    }
    let bars = '';
    if (!compact){
      bars = `<div class="pl-bars">${segs.filter(sg => sg.lane < lanes).map(barHtml).join('')}</div>`;
    }
    html += `<div class="pl-week" role="row">${cells}${bars}</div>`;
  }
  document.getElementById('grid').innerHTML = html;
}

/* ---------- 레일 ---------- */
function railItem(e, next){
  const c = catOf(e);
  const st = statusOf(e);
  const side = st.kind === 'ongoing'
    ? `<span class="pl-dday pl-dday--ongoing">진행 중</span>`
    : `<span class="pl-dday${next ? ' pl-dday--next' : ''}">${st.label}</span>`;
  return `<div class="pl-up__item" style="--c:${c.color}">
    <span class="pl-up__date"><b>${shortDate(evStart(e))}</b><span>${isRange(e) ? '~'+shortDate(evEnd(e)) : WD[evStart(e).getDay()]+'요일'}</span></span>
    <span class="pl-up__body">
      <span class="pl-up__title">${escapeHtml(shortTitle(e.title))}</span>
      <span class="pl-up__org">${escapeHtml(e.org || (isRange(e) ? evDays(e)+'일 일정' : c.label))}</span>
    </span>
    <span class="pl-up__side">${side}<span class="pl-up__cat">${escapeHtml(c.label)}</span></span>
  </div>`;
}
function renderRail(){
  const list = filtered();
  const ongoing = list.filter(e => evStartS(e) < ymd(TODAY) && evEndS(e) >= ymd(TODAY))
    .sort((a,b) => evEndS(a).localeCompare(evEndS(b)) || evStartS(a).localeCompare(evStartS(b)));
  const upcoming = list.filter(e => evStartS(e) >= ymd(TODAY))
    .sort((a,b) => evStartS(a).localeCompare(evStartS(b)) || evEndS(a).localeCompare(evEndS(b)) || a.title.localeCompare(b.title,'ko'));

  const ongoingSec = document.getElementById('ongoingSec');
  if (ongoing.length){
    ongoingSec.hidden = false;
    document.getElementById('ongoingCount').textContent = String(ongoing.length);
    document.getElementById('ongoingList').innerHTML = ongoing.map(e => railItem(e,false)).join('');
  } else {
    ongoingSec.hidden = true;
    document.getElementById('ongoingList').innerHTML = '';
  }

  const up = upcoming.slice(0,5);
  document.getElementById('upcomingCount').textContent = upcoming.length ? String(upcoming.length) : '';
  document.getElementById('upcomingList').innerHTML = up.length
    ? up.map((e,i) => railItem(e,i===0)).join('')
    : `<p class="pl-emptysmall">오늘 이후 예정된 일정이 없습니다.</p>`;
}

/* ---------- 목록 ---------- */
function rowHtml(e){
  const c = catOf(e);
  const st = statusOf(e);
  const side = st.kind === 'ongoing'
    ? `<span class="pl-dday pl-dday--ongoing">진행 중</span>`
    : `<span class="pl-dday">${st.label}</span>`;
  return `<div class="pl-row">
    <div class="pl-row__date">${rowDate(e)}</div>
    <div class="pl-row__body">
      <span class="pl-row__title">${escapeHtml(e.title)}</span>
      <span class="pl-row__meta">
        <span class="pl-cat" style="--c:${c.color}">${escapeHtml(c.label)}</span>
        ${e.org ? `<span class="pl-row__org-inline">${escapeHtml(e.org)}</span>` : ''}
        ${(e.grades && !(e.org && e.org.includes('고'))) ? `<span class="pl-row__grade">${escapeHtml(gradeText(e.grades))}</span>` : ''}
        <span class="pl-row__status-inline">${side}</span>
      </span>
    </div>
    <div class="pl-row__side">${side}</div>
  </div>`;
}
function renderList(){
  const start = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const startKey = ymd(start);
  const evs = agendaEvents();
  const list = document.getElementById('list');
  const cond = state.cat || state.uni;
  if (!evs.length){
    list.innerHTML = `<div class="pl-list__head"><h2>일정 목록</h2><span>0건</span></div>
      <div class="pl-list__empty">
        <h3>${cond ? '선택한 조건의 일정이 없습니다.' : '이 달 이후 등록된 일정이 없습니다.'}</h3>
        <p>${cond ? '다른 조건을 선택하거나 전체 일정을 확인해 보세요.' : '이전 달로 이동해 지난 일정을 확인할 수 있습니다.'}</p>
        ${cond ? `<button type="button" class="pl-btn" id="emptyReset">전체 일정 보기</button>` : `<button type="button" class="pl-btn" id="emptyToday">오늘로 이동</button>`}
      </div>`;
    const reset = document.getElementById('emptyReset');
    if (reset) reset.addEventListener('click', () => { state.cat = null; state.uni = null; updateFilterButton(); updateUniButton(); renderAll(); });
    const today = document.getElementById('emptyToday');
    if (today) today.addEventListener('click', goToday);
    return;
  }
  const groups = new Map();
  for (const e of evs){
    const key = evStartS(e) < startKey ? startKey.slice(0,7) : evStartS(e).slice(0,7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const keys = [...groups.keys()];
  const first = keys[0], lastKey = keys[keys.length-1];
  const [fy,fm] = first.split('-').map(Number), [ly,lm] = lastKey.split('-').map(Number);
  const range = first === lastKey ? `${fy}년 ${fm}월` : (fy === ly ? `${fy}년 ${fm}월 – ${lm}월` : `${fy}년 ${fm}월 – ${ly}년 ${lm}월`);
  const rows = keys.map(key => {
    const items = groups.get(key);
    const [gy,gm] = key.split('-').map(Number);
    return `<div class="pl-list__mhead" data-month="${key}"><h3>${gy}년 ${gm}월</h3><span>${items.length}건</span></div>` + items.map(rowHtml).join('');
  }).join('');
  list.innerHTML = `<div class="pl-list__head"><h2>${range}</h2><span>${evs.length}건</span></div>
    <div class="pl-list__rows">${rows}</div>`;
}

/* ---------- 선택한 날짜 ---------- */
function renderDayPanel(){
  const panel = document.getElementById('dayPanel');
  if (!state.selectedDay){
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const key = state.selectedDay;
  const d = parseYmd(key);
  const evs = eventsOn(key);
  const isToday = key === ymd(TODAY);
  const rows = evs.map(e => {
    const c = catOf(e);
    const st = statusOf(e);
    const tag = isLongRange(e) ? (evStartS(e) === key ? '시작' : (evEndS(e) === key ? '종료' : '')) : '';
    const meta = [c.label];
    if (isRange(e)) meta.push(shortRange(e), evDays(e)+'일');
    if (e.org) meta.push(e.org);
    if (e.grades && !(e.org && e.org.includes('고'))) meta.push(gradeText(e.grades));
    const src = (e.source && /^https?:\/\//.test(e.source))
      ? ` · <a class="pl-dayitem__link" href="${escapeHtml(e.source)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(e.title)} 출처 (새 탭)">출처 ↗</a>`
      : '';
    return `<div class="pl-dayitem" style="--c:${c.color}">
      <span class="pl-dayitem__dot" aria-hidden="true"></span>
      <span>
        <span class="pl-dayitem__title">${escapeHtml(e.title)}${tag?`<span class="pl-dayitem__tag">${tag}</span>`:''}</span>
        <span class="pl-dayitem__meta">${escapeHtml(meta.join(' · '))}${src}</span>
      </span>
    </div>`;
  }).join('');
  panel.innerHTML = `<div class="pl-daypanel__head">
      <h3 class="pl-daypanel__date">${d.getMonth()+1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일</h3>
      ${isToday?'<span class="pl-daypanel__today">오늘</span>':''}
      <span class="pl-daypanel__year">${d.getFullYear()}년</span>
      <span class="pl-daypanel__count">일정 ${evs.length}건</span>
      <button type="button" class="pl-daypanel__close" id="dayPanelClose">닫기</button>
    </div>
    ${evs.length ? `<div class="pl-daypanel__list">${rows}</div>` : `<p class="pl-daypanel__empty">이 날에는 등록된 일정이 없습니다.</p>`}`;
  panel.hidden = false;
  document.getElementById('dayPanelClose').addEventListener('click', () => {
    const key = state.selectedDay;
    state.selectedDay = null;
    markSelection();
    panel.hidden = true;
    panel.innerHTML = '';
    if (key) focusCell(key);
  });
}
function markSelection(){
  document.querySelectorAll('.pl-cell').forEach(c => {
    const on = c.dataset.day === state.selectedDay;
    c.dataset.selected = on ? '1' : '0';
    c.setAttribute('aria-selected', String(on));
  });
}
function selectDay(key, opts={}){
  state.selectedDay = key;
  state.focusDay = key;
  markSelection();
  renderDayPanel();
  if (opts.scroll !== false){
    requestAnimationFrame(() => {
      const panel = document.getElementById('dayPanel');
      if (panel && !panel.hidden) panel.scrollIntoView({block:'nearest', behavior: REDUCED?'auto':'smooth'});
    });
  }
}

/* ---------- 렌더 ---------- */
function updateMonthLabel(){
  const y = state.cursor.getFullYear(), m = state.cursor.getMonth();
  document.getElementById('monthLabel').textContent = `${y}년 ${m+1}월`;
  document.getElementById('liveStatus').textContent = `${y}년 ${m+1}월${state.cat ? ', '+CAT[state.cat].label+' 일정' : ''}.`;
}
function renderAll(){
  updateMonthLabel();
  renderGrid();
  renderRail();
  renderList();
  renderDayPanel();
}
function renderView(){
  const month = state.view === 'month';
  document.getElementById('monthView').hidden = !month;
  document.getElementById('listView').hidden = month;
  document.getElementById('viewMonthTab').setAttribute('aria-selected', String(month));
  document.getElementById('viewListTab').setAttribute('aria-selected', String(!month));
  document.getElementById('viewMonthTab').tabIndex = month ? 0 : -1;
  document.getElementById('viewListTab').tabIndex = month ? -1 : 0;
}

/* ---------- 이동 ---------- */
function animateCal(dir){
  if (REDUCED) return;
  const cal = document.getElementById('cal');
  cal.style.animation = 'none';
  void cal.offsetWidth;
  cal.style.animation = `cal-move-${dir>0?'next':'prev'} .2s var(--ease)`;
  setTimeout(() => { cal.style.animation = ''; }, 220);
}
const styleEl = document.createElement('style');
styleEl.textContent = `@keyframes cal-move-next{from{opacity:.55;translate:7px 0}to{opacity:1;translate:0 0}}@keyframes cal-move-prev{from{opacity:.55;translate:-7px 0}to{opacity:1;translate:0 0}}`;
document.head.appendChild(styleEl);

function shiftMonth(dir){
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth()+dir, 1);
  state.selectedDay = null;
  const monthKey = `${state.cursor.getFullYear()}-${pad(state.cursor.getMonth()+1)}`;
  state.focusDay = ymd(TODAY).startsWith(monthKey) ? ymd(TODAY) : ymd(state.cursor);
  renderAll();
  if (state.view === 'month') animateCal(dir);
}
function goToday(){
  state.cursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  state.focusDay = ymd(TODAY);
  if (state.view === 'list'){
    state.selectedDay = null;
    renderAll();
    renderView();
    requestAnimationFrame(() => {
      const head = document.querySelector(`.pl-list__mhead[data-month="${ymd(TODAY).slice(0,7)}"]`);
      (head || document.getElementById('listView')).scrollIntoView({behavior: REDUCED?'auto':'smooth', block:'start'});
    });
    return;
  }
  state.selectedDay = ymd(TODAY);
  renderAll();
  renderView();
  requestAnimationFrame(() => {
    focusCell(ymd(TODAY));
    const panel = document.getElementById('dayPanel');
    if (panel && !panel.hidden) panel.scrollIntoView({block:'nearest', behavior: REDUCED?'auto':'smooth'});
  });
}
function focusCell(key){
  const el = document.querySelector(`.pl-cell[data-day="${key}"]`);
  if (!el) return;
  document.querySelectorAll('.pl-cell').forEach(c => c.tabIndex = -1);
  el.tabIndex = 0;
  el.focus({preventScroll:true});
  state.focusDay = key;
}
function goToDate(d){
  const old = new Date(state.cursor);
  const key = ymd(d);
  const sameMonth = d.getFullYear() === state.cursor.getFullYear() && d.getMonth() === state.cursor.getMonth();
  if (!sameMonth){
    const y = window.scrollY;
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    state.selectedDay = key;
    state.focusDay = key;
    renderAll();
    focusCell(key);
    window.scrollTo(0, y);
    animateCal(state.cursor > old ? 1 : -1);
  } else {
    selectDay(key, {scroll:false});
    focusCell(key);
  }
}

/* ---------- 달력 이벤트 ---------- */
function initCalendar(){
  const grid = document.getElementById('grid');
  grid.addEventListener('click', e => {
    if (grid.dataset.swiped === '1'){ grid.dataset.swiped = '0'; return; }
    const cell = e.target.closest('.pl-cell');
    if (cell) selectDay(cell.dataset.day);
  });
  grid.addEventListener('keydown', e => {
    const cell = e.target.closest('.pl-cell');
    if (!cell || e.target !== cell) return;
    const key = cell.dataset.day;
    const d = parseYmd(key);
    let target = null;
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); selectDay(key); return; }
    if (e.key === 'ArrowLeft') target = addDays(d,-1);
    else if (e.key === 'ArrowRight') target = addDays(d,1);
    else if (e.key === 'ArrowUp') target = addDays(d,-7);
    else if (e.key === 'ArrowDown') target = addDays(d,7);
    else if (e.key === 'Home') target = startOfWeek(d);
    else if (e.key === 'End') target = addDays(startOfWeek(d),6);
    else if (e.key === 'PageUp') target = new Date(d.getFullYear(), d.getMonth()-1, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth(), 0).getDate()));
    else if (e.key === 'PageDown') target = new Date(d.getFullYear(), d.getMonth()+1, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth()+2, 0).getDate()));
    if (!target) return;
    e.preventDefault();
    goToDate(target);
  });

  let sx = 0, sy = 0, tracking = false;
  grid.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    sx = e.clientX; sy = e.clientY; tracking = true;
    grid.dataset.swiped = '0';
  }, {passive:true});
  grid.addEventListener('pointerup', e => {
    if (!tracking) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    tracking = false;
    if (Math.abs(dx) > 56 && Math.abs(dy) < 42){
      grid.dataset.swiped = '1';
      shiftMonth(dx < 0 ? 1 : -1);
    }
  }, {passive:true});
  grid.addEventListener('pointercancel', () => { tracking = false; }, {passive:true});
}

/* ---------- JSON-LD ---------- */
function injectEventJsonLd(){
  if (!EVENTS || !EVENTS.length) return;
  const existing = document.getElementById('jsonld-calendar-events');
  if (existing) existing.remove();
  const entries = EVENTS.map(ev => {
    const startDate = ev.date || (ev.dateRange && ev.dateRange[0]);
    const endDate = ev.date || (ev.dateRange && ev.dateRange[1]);
    if (!startDate) return null;
    return {
      '@type': 'Event',
      name: ev.title,
      startDate,
      ...(endDate && endDate !== startDate ? { endDate } : {}),
      ...(ev.org ? { organizer: { '@type': 'Organization', name: ev.org } } : {}),
      url: 'https://kicegg.com/calendar.html',
    };
  }).filter(Boolean);
  if (!entries.length) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'jsonld-calendar-events';
  script.textContent = JSON.stringify({'@context':'https://schema.org','@graph':entries});
  document.head.appendChild(script);
}

/* ---------- 헤더 D-day 칩 ---------- */
function initDdayChip(){
  document.addEventListener('click', ev => {
    const chip = ev.target.closest('.dday-chip');
    if (!chip || !EVENTS.length) return;
    const exam = ddayForHeader();
    if (!exam) return;
    ev.preventDefault();
    const key = evStartS(exam);
    state.cursor = new Date(evStart(exam).getFullYear(), evStart(exam).getMonth(), 1);
    state.view = 'month';
    state.cat = null;
    state.uni = null;
    state.focusDay = key;
    state.selectedDay = key;
    updateFilterButton();
    updateUniButton();
    renderAll();
    renderView();
    document.getElementById('calendar').scrollIntoView({behavior: REDUCED?'auto':'smooth', block:'start'});
    requestAnimationFrame(() => {
      focusCell(key);
      const panel = document.getElementById('dayPanel');
      if (panel && !panel.hidden) panel.scrollIntoView({block:'nearest', behavior: REDUCED?'auto':'smooth'});
    });
  });
}

/* ---------- 초기 ---------- */
async function init(){
  try {
    EVENTS = await loadCalendar();
  } catch (e) {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = '<p class="cal-empty">일정을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.</p>';
    for (const id of ['prevMonth','nextMonth','todayBtn','filterBtn','uniFilterBtn']) {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    }
    return;
  }

  initFilter();
  initUniFilter();
  initCalendar();
  renderAll();
  renderView();
  document.body.classList.add('cal-js');
  injectEventJsonLd();
  initDdayChip();

  document.getElementById('prevMonth').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => shiftMonth(1));
  document.getElementById('todayBtn').addEventListener('click', goToday);

  document.querySelectorAll('.pl-view').forEach(tab => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      renderView();
    });
  });
  document.querySelector('.pl-views').addEventListener('keydown', ev => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const tabs = [...document.querySelectorAll('.pl-view')];
    const i = tabs.indexOf(document.activeElement);
    let next;
    if (ev.key === 'Home') next = tabs[0];
    else if (ev.key === 'End') next = tabs[tabs.length-1];
    else next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (next){ next.focus(); next.click(); }
  });

  window.addEventListener('keydown', ev => {
    if (ev.defaultPrevented) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const menu = document.getElementById('filterMenu');
    if (menu && !menu.hidden) return;
    if (ev.key === 'ArrowLeft' && state.view === 'month' && !ev.target.closest('.pl-bar')){ ev.preventDefault(); shiftMonth(-1); }
    else if (ev.key === 'ArrowRight' && state.view === 'month' && !ev.target.closest('.pl-bar')){ ev.preventDefault(); shiftMonth(1); }
    else if (ev.key === 't' || ev.key === 'T'){ ev.preventDefault(); goToday(); }
  });

  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { renderGrid(); }, 140);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
