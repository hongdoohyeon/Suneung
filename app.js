'use strict';
import { enableForcedDownloads } from './lib/download.js?v=eb19941835145d64bc85';
import { publicFileUrl } from './lib/dom.js?v=eb19941835145d64bc85';
enableForcedDownloads();
import {
  CURRICULUM_CONFIG, EXAM_TYPE_CONFIG, TAB_CONFIG,
  getTypeConf, getGroupConf, getTabConf, legacyTabKey, prettySub, navTabKey, navSiblings,
} from './config.js?v=eb19941835145d64bc85';
import {
  state, PAGE_SIZE,
  resetFilters, toggleMulti,
  getDisplayYear, availableGradeYears,
  filtered, subjectCounts,
  tabCurriculums, tabCurriculumConfs, tabSubjects, curriculumOfGradeYear,
} from './state.js?v=eb19941835145d64bc85';
import { renderAllAdSlots, renderAdSlot } from './lib/ads.js?v=eb19941835145d64bc85';
import { recentItems, clearRecent } from './lib/recent.js?v=eb19941835145d64bc85';
import { initSelect, isSelecting, checkboxHTML } from './lib/select.js?v=eb19941835145d64bc85';
import { vt, flipChips, resize, underline, onSwipe, EASE as M } from './lib/motion.js?v=eb19941835145d64bc85';
let placeTabInk = null;   // 시험 종류 탭 밑줄 옮기기(아래 markActiveNavTab) — 모듈 초기에 탭 표시가 먼저 불릴 수 있어 맨 위에 선언

const tabConf = () => getTabConf(state.tab);

// 탭이 포함하는 모든 typeGroup 합집합 (UI 칩 렌더용)
// educationOnly 탭(고1/고2)은 평가원 칩 제외 — 교육청 학평만 노출.
const tabAvailableTypeGroups = () => {
  const conf = tabConf();
  const set = new Set();
  for (const c of tabCurriculumConfs()) {
    for (const tg of c.availableTypeGroups) set.add(tg);
  }
  if (conf?.educationOnly) {
    return [...set].filter(tg => tg === 'education');
  }
  return [...set];
};
// 탭이 단일 typeGroup + 모든 curriculum 이 singleType 일 때 → typeGroup 칩 숨김
// educationOnly 탭도 단일 typeGroup이므로 칩 숨김.
const tabIsSingleType = () => {
  const tgs = tabAvailableTypeGroups();
  if (tgs.length !== 1) return false;
  if (tabConf()?.educationOnly) return true;
  return tabCurriculumConfs().every(c => c.singleType);
};

// 검색 첫 진입에서 9MB 전체 목록을 받지 않고 현재 탭 split만 로드한다.
// CI render-site.py가 data/archive/{tab}.json을 exams.json에서 생성한다.
const DATA_VERSION = 'eb19941835145d64bc85';
const FULL_DATA_URL = `data/exams.json?v=${DATA_VERSION}`;
const tabDataCache = new Map();
let fullDataCache = null;
let dataRequestId = 0;

const $ = id => document.getElementById(id);
// 전체 선택 창이 쓰는 검색 결과 — 이름은 표의 줄 이름(rowHTML)과 같게
initSelect({
  version: DATA_VERSION,
  onMode: () => { renderCards(); selectionMotion(isSelecting()); },
  results: () => filtered().filter(e => !e.searchOnly).map(e => {
    const { main, sub } = rowLabel(e);
    return { id: e.id, label: `${setTitle(e)} ${main}${sub ? ' ' + sub : ''}`, gradeYear: e.gradeYear, examYear: e.examYear,
             exam: getTypeConf(e.type)?.displayMode === 'examYear' };
  }),
});

// ── 보기 방식(표/카드) · 1등급컷 인덱스 ─────────────────────
// cuts.json: { id: [원점수 1컷, 표준점수 최고점, 난이도 1~5|null, 절대평가 0/1] } — render-site.py 생성.
const VIEW_KEY = 'kicegg:archive-view';
// 폰(≤560)은 보기 전환 버튼이 없어 늘 표 — 넓은 화면에서 고른 카드 보기가 폰에 따라오지 않게
let viewMode = (() => { try { return !matchMedia('(max-width: 560px)').matches && localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } })();
let cutsIndex = null;
let cutsRequested = false;
let cutsPromise = null;
let firstRenderDone = false;   // 첫 그리기 전에 도착한 등급컷은 첫 그리기가 반영한다(따로 한 번 더 그리지 않음)
function loadCuts() {
  if (cutsRequested) return cutsPromise;
  cutsRequested = true;
  // site-prefs.js 가 <head> 에서 미리 시작한 요청이 있으면 이어받는다
  const pre = window.__kiceggCuts;
  window.__kiceggCuts = null;
  cutsPromise = (pre || fetch(`data/archive/cuts.json?v=${DATA_VERSION}`).then(res => res.ok ? res.json() : null))
    .then(data => { if (data) { cutsIndex = data; state.cuts = data; if (!state.loading && firstRenderDone) render(); } })
    .catch(() => {});
  return cutsPromise;
}
// 첫 그리기 전에 등급컷 표를 잠깐(최대 0.8초) 기다린다 — 없는 채로 그렸다가 다시 그리지 않게
function cutsReadyForFirstRender() {
  const pre = window.__kiceggCuts;
  if (!pre) return Promise.resolve();
  // 빌드 때 미리 그린 표가 이미 보이면 끝까지 기다린다 — 등급컷 없이 한 번 더 그리면 첫 표시(LCP)가 늦게 잡힌다
  if ($('cardsGrid')?.dataset.prerendered === '1' && !urlHasStateParams()) return pre.then(() => {}, () => {});
  return Promise.race([pre.then(() => {}, () => {}), new Promise(r => setTimeout(r, 800))]);
}
// 표 HTML 지문 — 미리 그린 표와 지금 그릴 표가 같으면 DOM 을 갈아끼우지 않는다(scripts/prerender-home.py)
function htmlSig(html) {
  let h = 5381;
  for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return `${html.length}.${h >>> 0}`;
}
const TIER_LABEL = { 1: '매우 쉬움', 2: '쉬움', 3: '보통', 4: '어려움', 5: '매우 어려움' };
// 열고 닫힘·목록 갱신을 '틱' 대신 짧게 미끄러지듯 — 움직임 줄이기 설정이면 즉시
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// 펼침·접힘은 같은 시간·같은 곡선(천천히 출발해 천천히 멈춤) — 펼칠 때만 툭 튀어나오지 않게
const EASE_FOLD = 'cubic-bezier(.65,0,.35,1)';
function slideHeight(el, from, to, duration = 300) {
  if (reduceMotion.matches || from === to) return Promise.resolve();
  el.style.overflow = 'hidden';
  return el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: EASE_FOLD }).finished
    .catch(() => {}).finally(() => { el.style.overflow = ''; });
}
document.addEventListener('click', e => {
  const sum = e.target.closest('details.rfold > summary');
  if (!sum || reduceMotion.matches) return;
  const d = sum.parentElement, rows = d.querySelector('.rfold__rows');
  if (!rows || d.classList.contains('is-closing')) return;
  e.preventDefault();
  if (d.open) {
    d.classList.add('is-closing');
    slideHeight(rows, rows.offsetHeight, 0).then(() => { d.open = false; d.classList.remove('is-closing'); });
  } else {
    d.open = true;
    slideHeight(rows, 0, rows.offsetHeight);
  }
});

// 탐구 등 접힌 영역의 펼침 상태 — 한 번 펼친 영역은 다른 회차·페이지에서도 펼쳐 둔다
const FOLD_KEY = 'kicegg:open-folds';
const openFolds = new Set((() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch { return []; } })());
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.fold) return;
  const name = d.dataset.fold;
  if (d.open === openFolds.has(name)) return;
  if (d.open) openFolds.add(name); else openFolds.delete(name);
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...openFolds])); } catch {}
  document.querySelectorAll(`details.rfold[data-fold="${CSS.escape(name)}"]`).forEach(x => { if (x !== d) x.open = d.open; });
}, true);

// ── URL 파라미터 처리 ──────────────────────────────────────
// 모든 필터 상태를 URL searchParams 에 반영해 뒤로가기·새로고침·링크 공유 시 복원.
// 다중 선택은 쉼표로 직렬화. "all"·빈 상태는 URL에서 키 자체를 제거해 짧게 유지.

const URL_KEYS = ['focus', 'tab','typeGroup','type','gradeYear','subject','subjects','subSubject','subSubjects','has','cut','sort','tier','q','search','page'];
const HAS_LABEL = { listen: '듣기 있음', script: '대본 있음', solution: '해설 있음', even: '짝수형' };
const SORT_LABEL = { hard: '난이도 높은 순', easy: '난이도 낮은 순', old: '오래된 순' };

function serializeMulti(v) {
  if (v === 'all' || v == null) return '';
  if (Array.isArray(v)) return v.length ? v.join(',') : '';
  return String(v);
}
function parseMulti(s) {
  if (!s) return 'all';
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return 'all';
  return parts.length === 1 ? parts[0] : parts;
}
function allowMulti(value, allowed) {
  if (value === 'all') return 'all';
  const values = Array.isArray(value) ? value : [value];
  const valid = values.filter(v => allowed.has(String(v)));
  if (!valid.length) return 'all';
  return valid.length === 1 ? valid[0] : valid;
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);

  // history 이동 시 URL에 없는 값이 이전 화면에서 새어 나오지 않도록 먼저 기본화.
  clearTimeout(searchTimer);
  resetFilters();
  state.tab = 'senior';

  const rawTab = params.get('tab');
  if (rawTab) {
    const tab = legacyTabKey(rawTab);
    if (getTabConf(tab)) state.tab = tab;
  }
  markActiveNavTab();
  centerActiveTab();

  // 탭 변경 후 default typeGroup 적용 — URL에 typeGroup 명시되어 있으면 곧 덮어씀
  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    state.typeGroup = tabConf().defaultTypeGroup;
  }

  // URL 파라미터를 알려진 값에 대해 화이트리스트 검증 — 임의 변조 시 stuck-state 방지
  if (params.has('typeGroup')) {
    const v = params.get('typeGroup') || 'all';
    state.typeGroup = (v === 'all' || tabAvailableTypeGroups().includes(v)) ? v : 'all';
  }
  if (params.has('type')) {
    const knownTypes = new Set(EXAM_TYPE_CONFIG.flatMap(g => g.types.map(t => String(t.key))));
    state.type = allowMulti(parseMulti(params.get('type')), knownTypes);
  }
  if (params.has('gradeYear')) {
    const knownYears = new Set(availableGradeYears().map(String));
    state.gradeYear = allowMulti(parseMulti(params.get('gradeYear')), knownYears);
  }
  // 예비 curriculum 학년도 URL은 type 파라미터가 없어도 실제 예비시험으로 복원한다.
  if (!params.has('type') && state.gradeYear !== 'all') {
    const years = Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear];
    if (years.some(y => curriculumOfGradeYear(Number(y))?.id === '예비')) state.type = ['prelim'];
  }
  if (params.has('subject')) {
    const subject = params.get('subject') || 'all';
    state.subject = subject === 'all' || tabSubjects()[subject] ? subject : 'all';
  }
  if (params.has('subSubject')) {
    const sub = params.get('subSubject') || 'all';
    const allSubs = new Set(Object.values(tabSubjects()).flatMap(s => s.subs || []).map(String));
    state.subSubject = sub === 'all' || allSubs.has(sub) ? sub : 'all';
  }

  if (params.has('subjects')) {
    const known = tabSubjects();
    state.subjects = (params.get('subjects') || '').split(',').filter(s => known[s]);
  }

  if (params.has('has')) state.has = (params.get('has') || '').split(',').filter(k => HAS_LABEL[k]);
  if (params.has('subSubjects')) state.subSubjects = (params.get('subSubjects') || '').split(',').filter(Boolean).slice(0, 12);
  if (params.has('cut')) {
    const [lo, hi] = (params.get('cut') || '').split('-').map(v => (v === '' ? null : Number(v)));
    if ([lo, hi].some(v => v != null && Number.isFinite(v))) { state.cut = { min: lo ?? null, max: hi ?? null }; loadCuts(); }
  }
  if (SORT_LABEL[params.get('sort')]) { state.sort = params.get('sort'); if (state.sort !== 'old') loadCuts(); }

  if (params.has('tier')) {
    state.tier = allowMulti(parseMulti(params.get('tier')), new Set(['1', '2', '3', '4', '5']));
    loadCuts();
  }

  const search = params.get('q') || params.get('search');
  if (search) {
    state.query = search.trim();
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = search;
      const clear = document.getElementById('clearSearch');
      if (clear) clear.style.display = 'flex';
    }
  } else {
    state.query = '';
    const input = document.getElementById('searchInput');
    if (input && input.value) input.value = '';
    const clear = document.getElementById('clearSearch');
    if (clear) clear.style.display = 'none';
  }

  const pageRaw = parseInt(params.get('page') || '1', 10);
  state.page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
}

// 옛 단일 함수 이름 유지 (호출부 호환)
const applyUrlTab = applyUrlState;

// 현재 state 로부터 다음 URL 을 계산만 (history 조작 X).
function buildUrlFromState() {
  const url = new URL(location.href);
  for (const k of URL_KEYS) url.searchParams.delete(k);

  url.searchParams.set('tab', state.tab);

  const tg = serializeMulti(state.typeGroup);
  if (tg && tg !== 'all') url.searchParams.set('typeGroup', tg);

  const t = serializeMulti(state.type);
  if (t) url.searchParams.set('type', t);

  const gy = serializeMulti(state.gradeYear);
  if (gy) url.searchParams.set('gradeYear', gy);

  if (state.subject    && state.subject    !== 'all') url.searchParams.set('subject', state.subject);
  if (state.subSubject && state.subSubject !== 'all') url.searchParams.set('subSubject', state.subSubject);
  if (state.subjects.length) url.searchParams.set('subjects', state.subjects.join(','));
  if (state.has.length) url.searchParams.set('has', state.has.join(','));
  if (state.subSubjects.length) url.searchParams.set('subSubjects', state.subSubjects.join(','));
  if (state.cut) url.searchParams.set('cut', `${state.cut.min ?? ''}-${state.cut.max ?? ''}`);
  if (state.sort) url.searchParams.set('sort', state.sort);
  const tr = serializeMulti(state.tier);
  if (tr) url.searchParams.set('tier', tr);
  if (state.query) url.searchParams.set('q', state.query);
  if (state.page > 1) url.searchParams.set('page', String(state.page));

  return url.toString();
}

// archive 의 현재 필터 상태를 sessionStorage 에 저장 — exam 상세 → 뒤로가기 시 복원에 사용
function persistArchiveState() {
  try {
    const u = new URL(buildUrlFromState());
    // 경로 + query 만 저장 (/?... 그대로)
    sessionStorage.setItem('lastArchiveUrl', u.pathname + u.search);
  } catch {}
}

// 필터 변경 — 현재 history entry 의 URL 만 교체 (history 깊이 보존)
function syncUrl() {
  // 스마트 검색 결과를 다듬는 중이면 표시(원래 검색어로)를 유지
  history.replaceState(history.state?.smart ? history.state : {}, '', buildUrlFromState());
  persistArchiveState();
}

// 탭 전환 등 큰 전환 — 새 history entry 추가하여 진정한 뒤로가기 가능
// 단, URL 이 그대로면 pushState 가 무의미한 중복 entry 를 만드니 skip.
function pushUrl() {
  const next = buildUrlFromState();
  if (next === location.href) return;
  history.pushState({}, '', next);
  persistArchiveState();
}

// 호환용 — 옛 syncUrlTab 호출부에서도 동작
const syncUrlTab = syncUrl;

// ── 데이터 로드 ────────────────────────────────────────────
function showDataError(msg) {
  // 상단 고정 배너로 데이터 로드 실패 안내. 사용자가 silent broken state 모르고 헤매는 것 방지.
  if (document.getElementById('dataErrorBanner')) return;
  const div = document.createElement('div');
  div.id = 'dataErrorBanner';
  // z-index 100 — site-header(80) 위. 모바일 padding은 작게.
  div.style.cssText = 'position:sticky;top:0;z-index:100;background:#fef3c7;color:#92400e;padding:10px 12px;text-align:center;font-size:13px;line-height:1.5;border-bottom:1px solid #fde68a';
  div.innerHTML = `<strong>시험 목록 오류</strong> · ${msg} · <button type="button" class="data-reload" style="color:#92400e;text-decoration:underline;background:none;border:0;font:inherit;cursor:pointer;padding:0">다시 시도</button>`;
  document.body.prepend(div);
  div.querySelector('.data-reload')?.addEventListener('click', () => location.reload());
}

function showDataFallbackNotice() {
  if (document.getElementById('dataFallbackBanner')) return;
  const div = document.createElement('div');
  div.id = 'dataFallbackBanner';
  div.style.cssText = 'position:sticky;top:0;z-index:100;background:#eff6ff;color:#1e3a5f;padding:8px 12px;text-align:center;font-size:12px;line-height:1.5;border-bottom:1px solid #bfdbfe';
  div.textContent = '전체 목록으로 보여 드려요. 조금 느릴 수 있어요.';
  document.body.prepend(div);
}

function tabFromLocation() {
  const raw = new URLSearchParams(location.search).get('tab');
  if (!raw) return 'senior';
  const tab = legacyTabKey(raw);
  return getTabConf(tab) ? tab : 'senior';
}

// 받는 중인 탭 — 탭에 손가락·마우스를 올릴 때 미리 시작한 요청을 클릭이 이어받는다(같은 파일 두 번 받지 않게)
const tabDataPending = new Map();
function fetchTabData(tab) {
  if (tabDataCache.has(tab)) return Promise.resolve(tabDataCache.get(tab));
  if (!tabDataPending.has(tab)) tabDataPending.set(tab, loadTabData(tab).finally(() => tabDataPending.delete(tab)));
  return tabDataPending.get(tab);
}
async function loadTabData(tab) {
  // lib/site-prefs.js 가 <head> 에서 미리 시작한 요청이 있으면 이어받는다 (같은 버전일 때만)
  const pre = window.__kiceggArchive;
  if (pre && pre.tab === tab) {
    window.__kiceggArchive = null;
    const early = await pre.data;
    if (Array.isArray(early)) { tabDataCache.set(tab, early); return early; }
  }
  const res = await fetch(`data/archive/${encodeURIComponent(tab)}.json?v=${DATA_VERSION}`);
  if (!res.ok) throw new Error(`archive split HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('archive split 형식 오류');
  tabDataCache.set(tab, data);
  return data;
}

async function fetchFullData() {
  if (fullDataCache) return fullDataCache;
  const res = await fetch(FULL_DATA_URL);
  if (!res.ok) throw new Error(`exams.json HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('exams.json 형식 오류');
  fullDataCache = data;
  return data;
}

// 파일 주소는 첫 그리기 뒤에 따로 받아 목록에 합친다(목록 JSON 용량 152KB → 35KB). 합치면 한 번 더 그려 버튼 주소를 바꾼다.
const URL_FIELDS = ['questionUrl', 'answerUrl', 'solutionUrl', 'listenUrl', 'scriptUrl', 'questionUrlEven'];
const DL_FIELDS = ['questionDownload', 'answerDownload', 'solutionDownload', 'listenDownload'];
const urlsLoaded = new Set();
async function loadTabUrls(tab, list) {
  if (urlsLoaded.has(tab) || !list.some(e => e.questionUrl === 1 || e.answerUrl === 1 || e.solutionUrl === 1)) return;
  urlsLoaded.add(tab);
  try {
    const res = await fetch(`data/archive/${encodeURIComponent(tab)}.urls.json?v=${DATA_VERSION}`);
    if (!res.ok) return;
    const map = await res.json();
    const byId = new Map();
    for (const e of list) {
      const row = map[e.id];
      if (!row) continue;
      URL_FIELDS.forEach((k, i) => { if (row[i]) e[k] = row[i]; });
      DL_FIELDS.forEach((k, i) => { if (row[URL_FIELDS.length + i]) e[k] = row[URL_FIELDS.length + i]; });
      byId.set(String(e.id), e);
    }
    if (state.exams !== list) return;
    // 이미 그려진 버튼의 주소·내려받기 이름만 제자리에서 교체 — DOM 을 새로 만들지 않아 첫 화면 표시에 영향이 없다
    const DL_OF = { questionUrl: 'questionDownload', answerUrl: 'answerDownload', solutionUrl: 'solutionDownload', listenUrl: 'listenDownload' };
    document.querySelectorAll('a[data-f]').forEach(a => {
      const e = byId.get(a.dataset.eid), key = a.dataset.f;
      const url = e && typeof e[key] === 'string' ? safeUrl(e[key]) : '';
      if (!url) return;
      a.href = url;
      const name = e[DL_OF[key]];
      a.setAttribute('download', name || '');
      a.removeAttribute('data-f');
      if (key === 'solutionUrl' && e.questionUrl === e.solutionUrl) a.remove();              // 문제지와 해설이 한 파일이면 해설 버튼은 없앤다
      if (key === 'questionUrl' && e.questionUrl === e.solutionUrl) a.textContent = '문제·해설';
    });
  } catch { /* 주소를 못 받아도 상세 페이지 링크로 쓸 수 있다 */ }
}

// deferSkeleton: 탭 전환처럼 옛 목록을 잠깐 두는 게 나은 경우 — 0.35초 안에 오면 스켈레톤 없이 바로 바꾸고,
// 늦으면 그때 스켈레톤(lastLoadSlow = true → 호출한 쪽은 옆으로 미는 전환을 생략)
let lastLoadSlow = false;
async function replaceExamsForTab(tab, { deferSkeleton = false } = {}) {
  const requestId = ++dataRequestId;
  state.loading = true;
  lastLoadSlow = false;
  let slowTimer = 0;
  if (deferSkeleton && !tabDataCache.has(tab)) slowTimer = setTimeout(() => { if (requestId === dataRequestId) { lastLoadSlow = true; showSkeleton(true); } }, 350);
  else if (!deferSkeleton) showSkeleton(true);
  let data;
  try {
    data = await fetchTabData(tab);
  } catch (splitError) {
    console.warn('archive split load failed; loading full dataset:', splitError);
    showDataFallbackNotice();
    try {
      data = await fetchFullData();
    } catch {
      clearTimeout(slowTimer);
      if (requestId === dataRequestId) {
        state.exams = [];
        state.loading = false;
        showSkeleton(false);
        showDataError('시험 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      }
      return false;
    }
  }
  clearTimeout(slowTimer);
  if (requestId !== dataRequestId) return false;
  state.exams = data;
  state.loading = false;
  prerenderShown = false;
  showSkeleton(false);
  // 첫 그리기를 막지 않게 주소 파일은 한 박자 뒤에 받는다
  (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => loadTabUrls(tab, data), { timeout: 2000 });
  return true;
}

async function loadArchiveMeta() {
  const totalEl = $('archiveTotalCount');
  const updateEl = $('archiveUpdateDate');
  try {
    const res = await fetch(`data/site-summary.json?v=${DATA_VERSION}`);
    if (!res.ok) throw new Error(`site-summary HTTP ${res.status}`);
    const summary = await res.json();
    const count = summary.archiveCount ?? summary.count;
    if (totalEl && Number.isInteger(count)) totalEl.textContent = count.toLocaleString('ko-KR');
    if (updateEl && summary.updatedAt) updateEl.textContent = summary.updatedAt;
  } catch {
    const realExams = state.exams.filter(e => e.typeGroup !== 'reference');
    if (totalEl) totalEl.textContent = realExams.length.toLocaleString('ko-KR');
    if (updateEl) updateEl.textContent = '확인 불가';
  }
}

async function loadExams() {
  const initialTab = tabFromLocation();
  state.tab = initialTab;
  // 데이터 도착 전에 기본 필터 칩·배지를 먼저 그려 늦게 튀어나오는 흔들림을 없앤다
  if (tabIsSingleType()) state.typeGroup = tabAvailableTypeGroups()[0];
  else if (tabConf()?.defaultTypeGroup) state.typeGroup = tabConf().defaultTypeGroup;
  renderActiveTags();
  updateFilterBadge();
  const prerendered = $('cardsGrid')?.dataset.prerendered === '1' && !urlHasStateParams();
  if (!await replaceExamsForTab(initialTab)) return;
  await cutsReadyForFirstRender();
  // 미리 그린 표(등급컷 포함)가 보이는 중이면 등급컷이 반영된 뒤 첫 그리기 — 같은 내용이라 DOM 을 갈아끼우지 않는다
  if (prerendered) await loadCuts(); else loadCuts();

  applyUrlTab();   // URL ?tab=... 가 있으면 해당 탭으로 진입
  renderFilterPanel();
  render();
  firstRenderDone = true;
  persistArchiveState();
  loadArchiveMeta();
  // 헤더 검색창(/?q=…)으로 들어와도 입력창에 친 것과 똑같이 스마트 검색을 건다
  if (state.query) maybeSmartSearch(state.query);
}

// ── 렌더링 조율 ────────────────────────────────────────────
// 선택 모드 — 체크 칸 자리만큼 줄이 오른쪽으로 비켜서고 체크 칸이 옅게 나타난다(끝내면 반대로)
function selectionMotion(on) {
  if (reduceMotion.matches) return;
  const label = document.querySelector('#selectToggle .select-toggle__label');
  label?.animate([{ opacity: 0, transform: `translateY(${on ? 8 : -8}px)` }, { opacity: 1, transform: 'none' }], { duration: 200, easing: M.out });
  const rows = [...$('cardsGrid').querySelectorAll('.rrow:not(.rrow--head)')].filter(r => { const b = r.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; });
  rows.forEach(row => {
    const pad = parseFloat(getComputedStyle(row).paddingLeft);
    row.animate([{ paddingLeft: `${on ? pad - 26 : pad + 26}px` }, { paddingLeft: `${pad}px` }], { duration: 220, easing: M.out });
    row.querySelector('.sel-box')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 60, easing: M.out, fill: 'backwards' });
  });
  $('cardsGrid').querySelectorAll('.card .sel-box').forEach(b => b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: M.out }));
}

function render(skipSubjectFilter = false, still = false) {
  // 필터로 목록이 바뀔 때는 효과 없이 바로 — 줄마다 나타나게 하면 끊겨 보이고, 전체 교차는 번쩍였다
  renderCards();
  // 탭 전환(still) 때는 칩·'최근 본 시험'도 제자리에서 바로 — 목록 창만 움직이고 위 줄이 같이 밀리면 어지러웠다
  if (still) { renderActiveTags(); updateFilterBadge(); if (!skipSubjectFilter) renderSubjectFilter(); renderSmartNote(); return; }
  // 칩이 늘고 줄면 같은 줄의 '최근 본 시험'이 툭 당겨지지 않고 한 번에 미끄러진다
  const recent = $('recentRow'), rx0 = recent && !recent.hidden ? recent.getBoundingClientRect().left : null;
  flipChips($('activeTags'), { item: '.tag', key: el => el.querySelector('[data-clear]')?.dataset.clear }, renderActiveTags);
  if (rx0 != null && !recent.hidden && !reduceMotion.matches) {
    const dx = rx0 - recent.getBoundingClientRect().left;
    if (Math.abs(dx) > .5) recent.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 260, easing: M.move });
  }
  updateFilterBadge();
  if (!skipSubjectFilter) renderSubjectFilter();
  renderSmartNote();
}

// ── 교육과정 탭 ─────────────────────────────────────────────

// 묶인 탭(고1·2, 검정고시)은 nav 버튼 하나 — 활성 표시는 대표 탭 키로 비교
function markActiveNavTab() {
  const key = navTabKey(state.tab);
  document.querySelectorAll('.nav-tab').forEach(b => {
    const on = b.dataset.tab === key;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });  placeTabInk?.(true);
}
// 탭 밑줄 하나가 옆 탭으로 옮겨 간다
requestAnimationFrame(() => { placeTabInk = underline(document.querySelector('.curriculum-nav__inner'), '.nav-tab.is-active'); });
const navOrder = () => [...document.querySelectorAll('.curriculum-nav .nav-tab')].map(b => b.dataset.tab);
// 폰: 결과 위에서 옆으로 밀면 옆 시험 종류로
onSwipe(document.querySelector('.content'), d => {
  const order = navOrder(), next = order[order.indexOf(navTabKey(state.tab)) + d];
  if (next) document.querySelector(`.nav-tab[data-tab="${next}"]`)?.click();
});

$('categorySelect').innerHTML = TAB_CONFIG.filter(tab => tab.key !== 'all' && typeof tab.navGroup !== 'string').map(tab => {
  const nav = tab.navGroup ?? tab;
  return `<option value="${escAttr(tab.key)}">${escHtml(nav.label)} · ${escHtml(nav.sub)}</option>`;
}).join('');
$('categorySelect').addEventListener('change', e => {
  const button = document.querySelector(`.nav-tab[data-tab="${e.target.value}"]`);
  button.click();
});

// 탭에 마우스를 올리거나 손가락을 대면 그 탭 목록을 미리 받는다 — 누를 때 기다림(과 스켈레톤)을 줄임
for (const ev of ['pointerenter', 'pointerdown']) {
  $('curriculumTabs').addEventListener(ev, e => {
    const btn = e.target.closest?.('.nav-tab');
    if (btn) fetchTabData(btn.dataset.tab).catch(() => {});
  }, { capture: true, passive: true });
}
$('curriculumTabs').addEventListener('click', e => {
  const btn = e.target.closest('.nav-tab');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

async function switchTab(tab) {
  clearTimeout(searchTimer);
  // 방향 = 탭이 놓인 순서(같은 탭 묶음 안 학년 전환은 학년 버튼 순서)
  const order = navOrder(), from = order.indexOf(navTabKey(state.tab)), to = order.indexOf(navTabKey(tab));
  const sibs = navSiblings(tab).map(t => t.key);
  const same = tab === state.tab;   // 지금 탭을 다시 누름 — 필터만 초기화, 밀리는 움직임 없음
  const dir = to !== from ? Math.sign(to - from) : Math.sign(sibs.indexOf(tab) - sibs.indexOf(state.tab)) || 1;
  state.tab = tab;
  markActiveNavTab();
  resetFilters();
  state.yearExpanded = false;
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  } else if (tabConf()?.defaultTypeGroup) {
    state.typeGroup = tabConf().defaultTypeGroup;
  }

  pushUrl();   // 탭 전환은 history 쌓아 진정한 뒤로가기 가능
  if (!await replaceExamsForTab(state.tab, { deferSkeleton: true })) return;
  const doRender = () => { renderFilterPanel(); render(false, true); };
  // 본문(필터+결과)이 통째로 옆으로 밀린다 — 오른쪽 탭이면 왼쪽으로 밀려나고 새 내용이 오른쪽에서 들어옴
  // 시험 목록(표·카드)만 밀린다 — 사이드바·검색창·필터 줄까지 움직이면 어지러웠다
  const body = () => $('cardsGrid');
  // 늦게 와서 스켈레톤이 떴으면 스켈레톤을 밀지 않고 바로 바꾼다
  if (same || lastLoadSlow) doRender();
  else vt(dir > 0 ? 'tab-next' : 'tab-prev', doRender, [[body, body, 'archive-body']]);
  // 탭 줄을 활성 탭 쪽으로 미끄러지듯 스크롤하던 것은 뺌 — 탭이 한 줄에 다 들어가고, 좁은 화면에서 줄이 옆으로 움직이면 어지러웠다
}

// 주소의 탭이 정해진 직후 활성 탭을 모바일 가로 스크롤 가운데로 — 탭 줄만 옮기고 페이지 세로 위치는 그대로
function centerActiveTab() {
  const row = document.querySelector('.curriculum-nav__inner');
  const active = row?.querySelector('.nav-tab.is-active');
  if (!active || row.scrollWidth <= row.clientWidth) return;
  const a = active.getBoundingClientRect(), r = row.getBoundingClientRect();
  row.scrollLeft += (a.left + a.width / 2) - (r.left + r.width / 2);
}

// ── 필터 패널 전체 재구성 ──────────────────────────────────
function renderFilterPanel() {
  $('categorySelect').value = navTabKey(state.tab);
  renderLevelChips();
  renderTypeGroupChips();
  renderSubtypeChips();
  // '시험' 섹션은 typeGroup 칩 또는 세부유형(월) 칩이 하나라도 있을 때만 노출.
  // 종전에는 educationOnly 탭(고1/고2)에서 블록째 숨겨 월 필터까지 사라졌음.
  const hasGroupChips = !tabIsSingleType();
  const hasTypeChips  = $('subtypeRow').classList.contains('is-open');
  $('typeGroupBlock').style.display = (hasGroupChips || hasTypeChips) ? '' : 'none';

  renderYearChips();
  renderSubjectFilter();
  renderTierChips();
  $('filterPanel')?.classList.add('is-ready');   // 칩이 다 그려진 뒤에 보인다(style.css — 첫 화면 흔들림 방지)
}

// ── 난이도 (역대 1등급컷 대비 5단계) ────────────────────────
function renderTierChips() {
  const el = $('tierFilter');
  if (!el) return;
  const active = v => state.tier === 'all' ? v === 'all'
    : (Array.isArray(state.tier) ? state.tier.includes(v) : state.tier === v);
  el.innerHTML = [pill('all', '전체', active('all')),
    ...Object.entries(TIER_LABEL).map(([k, lbl]) => pill(k, lbl, active(k), `pill--tier pill--t${k}`))].join('');
}
$('tierFilter')?.addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  if (btn.dataset.value === 'all') state.tier = 'all';
  else { toggleMulti('tier', btn.dataset.value); loadCuts(); }
  state.page = 1;
  renderTierChips();
  render();
  syncUrl();
});

// ── 학년·학력 (묶인 탭 안에서 하나만 고름 — 과목셋이 달라 섞지 않는다) ──
function renderLevelChips() {
  const sibs = navSiblings(state.tab);
  $('levelBlock').hidden = !sibs.length;
  if (!sibs.length) { $('levelFilter').innerHTML = ''; return; }
  $('levelTitle').textContent = getTabConf(navTabKey(state.tab)).navGroup.title;
  $('levelFilter').innerHTML = sibs.map(t => pill(t.key, t.levelLabel, t.key === state.tab)).join('');
}
$('levelFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn || btn.dataset.value === state.tab) return;
  switchTab(btn.dataset.value);
});

// ── 시험 주최 (그룹 pill) ──────────────────────────────────
function renderTypeGroupChips() {
  const container = $('typeGroupFilter');
  if (tabIsSingleType()) { container.innerHTML = ''; return; }

  const allowed = tabAvailableTypeGroups();
  const groups = EXAM_TYPE_CONFIG.filter(g => allowed.includes(g.groupKey));
  const html = [
    pill('all', '전체', state.typeGroup === 'all', 'is-group'),
    ...groups.map(g =>
      pill(g.groupKey, g.groupLabel, state.typeGroup === g.groupKey, 'is-group',
           `style="--pill-color:${g.groupColor};"`)
    ),
  ].join('');
  container.innerHTML = html;
}

$('typeGroupFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  state.typeGroup  = btn.dataset.value;
  state.type       = 'all';
  state.gradeYear  = 'all';
  state.subSubject = 'all';
  state.page       = 1;
  // 필터는 차분하게 — 버튼은 색만 바뀌고, 세부 시험 줄이 열리고 닫힐 때 아래 칸이 툭 밀리지 않게 높이만 부드럽게
  resize($('typeGroupBlock'), () => { renderTypeGroupChips(); renderSubtypeChips(); });
  renderYearChips();
  render();
  syncUrl();
});

// ── 세부 유형 ──────────────────────────────────────────────
function renderSubtypeChips() {
  const row       = $('subtypeRow');
  const container = $('typeFilter');
  const g         = getGroupConf(state.typeGroup);
  // type 이 1개뿐인 그룹 (사관/경찰 1차시험, LEET/MEET 본시험) 은 칩 자체를 숨김 — 의미 없는 '전체/본시험' 두 칸 회피
  // educationOnly 탭(고1/고2)은 typeGroup 칩만 숨기고 월 chip 은 그대로 보여야 함 → tabIsSingleType() 조건 제외
  const skip = state.typeGroup === 'all' || (g?.types?.length ?? 0) <= 1;
  if (skip) {
    row.classList.remove('is-open');
    container.innerHTML = '';
    return;
  }
  const isTypeActive = (val) => {
    if (val === 'all') {
      return state.type === 'all' || (Array.isArray(state.type) && state.type.length === 0);
    }
    if (state.type === 'all') return false;
    if (Array.isArray(state.type)) return state.type.includes(val);
    return state.type === val;
  };
  // 학년 탭별 학평 시행월 필터 — education 그룹은 type.studentGrades 와 탭의 educationGrades 교집합만 표시
  const tabConf = getTabConf(state.tab);
  let visibleTypes = g.types;
  if (state.typeGroup === 'education' && tabConf?.educationGrades) {
    const tabGrades = new Set(tabConf.educationGrades);
    visibleTypes = g.types.filter(t =>
      !t.studentGrades || t.studentGrades.some(sg => tabGrades.has(sg))
    );
  }
  container.innerHTML = [
    pill('all', '전체', isTypeActive('all')),
    ...visibleTypes.map(t => pill(t.key, t.shortLabel ?? t.label, isTypeActive(t.key))),
  ].join('');
  const label = $('subtypeLabel');
  if (label) label.textContent = `${g.groupLabel} 세부`;   // 위 줄(기관)의 하위 선택임을 표시
  row.classList.add('is-open');
}

$('typeFilter').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  const val = btn.dataset.value;
  if (val === 'all') {
    state.type = 'all';
  } else {
    toggleMulti('type', val);
  }
  state.page = 1;
  renderSubtypeChips();
  render();
  syncUrl();
});

// ── 학년도 ─────────────────────────────────────────────────
// 학년도 라벨: 일반은 "2027학년도" / 교육청은 "2026년" / 28예비처럼 예비 curriculum 은 "28예비".
// LEET 의 'preliminary' sentinel (mock 데이터) 은 "예비".
function yearChipLabel(y, isEdu, short = false) {
  if (y === 'preliminary') return '예비';
  const conf = curriculumOfGradeYear(y);
  if (conf?.id === '예비' && typeof y === 'number') {
    return `${String(y).slice(-2)}예비`;
  }
  const disp = isEdu ? (getTabConf(state.tab)?.key === 'senior' ? y - 1 : y) : y;
  if (short) return String(disp);   // 칩은 숫자만 — 섹션 제목이 '학년도/시행연도'를 알려줌
  return `${disp}${isEdu ? '년' : '학년도'}`;
}
// 탭의 curriculum 들이 학년도 범위에서 겹치는지 — 겹치면 header 그룹화가 잘못됨
// (예: 사관·경찰대는 둘 다 2007~2026 → 모두 첫 conf로 매핑되어 "사관"만 표시).
function curriculumsOverlap() {
  const confs = tabCurriculumConfs();
  for (let i = 0; i < confs.length; i++) {
    for (let j = i + 1; j < confs.length; j++) {
      const [aMin, aMax] = confs[i].gradeYearRange;
      const [bMin, bMax] = confs[j].gradeYearRange;
      if (aMin <= bMax && bMin <= aMax) return true;
    }
  }
  return false;
}

function renderYearChips() {
  const container = $('yearFilter');
  const label     = $('yearLabel');
  const note      = $('yearNote');
  const isEdu     = state.typeGroup === 'education';

  label.textContent = isEdu ? '시행연도' : '학년도';
  note.textContent  = isEdu ? '교육청 기준' : '';

  const years = availableGradeYears();

  // 탭이 여러 curriculum 합치는 경우 학년도 영역에 "── 2015 개정 ──" 식 헤더 삽입.
  // 단, curriculum 들이 학년도 범위에서 겹치면 헤더가 잘못 그룹화하므로 숨김
  // (사관·경찰대 mp 탭, LEET·MEET gradschool 탭).
  const showHeaders = tabCurriculums().length > 1 && !curriculumsOverlap();

  const isYearActive = (val) => {
    if (val === 'all') {
      return state.gradeYear === 'all' || (Array.isArray(state.gradeYear) && state.gradeYear.length === 0);
    }
    if (state.gradeYear === 'all') return false;
    if (Array.isArray(state.gradeYear)) return state.gradeYear.includes(val);
    return state.gradeYear === val;
  };

  const out = [pill('all', '전체', isYearActive('all'), '', 'data-year="all"')];
  let lastCurrId = null;
  // 학년도 너무 많을 때 (현재 1994~2026 = 33년) — 데스크톱·모바일 모두 "최근 N + 더보기"
  // 데스크톱 8개 / 모바일 5개
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
  const SHOW_INITIAL = isMobile ? 5 : 8;
  const COLLAPSE_THRESHOLD = SHOW_INITIAL + 2;
  const collapseEnabled = years.length > COLLAPSE_THRESHOLD;
  const expanded = state.yearExpanded;
  let visibleCount = 0;
  for (const y of years) {
    const value = y === 'preliminary' ? 'preliminary' : String(y);
    const hidden = collapseEnabled && !expanded && visibleCount >= SHOW_INITIAL ? ' year-pill--collapsed' : '';
    if (showHeaders) {
      const conf = curriculumOfGradeYear(y);
      const currId = conf?.id ?? null;
      if (currId && currId !== lastCurrId) {
        // 접힌 학년도만 있는 교육과정 제목도 함께 접는다 (빈 제목 방지)
        out.push(`<div class="year-row__header${hidden}" role="presentation">${escHtml(conf.label)}</div>`);
        lastCurrId = currId;
      }
    }
    out.push(pill(value, yearChipLabel(y, isEdu, true), isYearActive(value),
                  hidden, `data-year="${value}"`));
    visibleCount++;
  }
  if (collapseEnabled) {
    out.push(`<button type="button" class="pill pill--more" id="yearMoreBtn" data-expanded="${expanded}">${expanded ? '접기' : '더보기'}</button>`);
  }
  container.innerHTML = out.join('');
}

$('yearFilter').addEventListener('click', e => {
  // 더보기 버튼 토글 — 상태에 저장하여 다른 필터 재렌더 시에도 유지
  if (e.target.id === 'yearMoreBtn') {
    state.yearExpanded = !state.yearExpanded;
    // 펼치면 칸이 아래로 늘어나며 새 학년도가 차례로, 접으면 칸이 줄어든다
    resize($('yearFilter'), renderYearChips, 280);   // 펼치면 칸이 늘어나며 아래가 따라 내려감
    return;
  }
  const btn = e.target.closest('.pill:not(.pill--more)');
  if (!btn) return;
  const val = btn.dataset.year;
  if (val === 'all') {
    state.gradeYear = 'all';
  } else {
    toggleMulti('gradeYear', val);
  }
  // 예비 curriculum 학년도(현재 2028) 선택 시 시험 종류도 자동 연동.
  // 과거의 'preliminary' sentinel이 아니라 실제 exams.json 학년도 값을 기준으로 판별한다.
  const selectedPrelimYear = val !== 'all' && curriculumOfGradeYear(Number(val))?.id === '예비';
  const hasSelectedPrelimYear = state.gradeYear !== 'all' &&
    (Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear])
      .some(y => curriculumOfGradeYear(Number(y))?.id === '예비');
  if (selectedPrelimYear && hasSelectedPrelimYear) {
    state.type = ['prelim'];
  } else if (!hasSelectedPrelimYear && Array.isArray(state.type) &&
             state.type.length === 1 && state.type[0] === 'prelim') {
    state.type = 'all';
  }
  state.page = 1;
  renderYearChips();
  render();
  syncUrl();
});

// ── 영역 (subject list) ────────────────────────────────────
function renderSubjectFilter() {
  const container = $('subjectFilter');
  const subjects  = tabSubjects();   // 탭의 모든 curriculum 영역 union
  const counts    = subjectCounts();

  const inner = Object.entries(subjects)
    .filter(([key]) => state.tab !== 'all' || !state.query || counts[key] > 0 || state.subject === key)
    .map(([key, conf]) => {
    const hasSubs  = conf.subs.length > 0;
    const isActive = state.subject === key;
    const isOpen   = isActive && hasSubs;
    const cnt      = counts[key] ?? 0;

    const subList = conf.subs.map(s => `
      <button class="sub-row${state.subSubject === s ? ' is-active' : ''}" data-sub="${escAttr(s)}">${escHtml(prettySub(s))}</button>
    `).join('');

    return `<div class="subject-item"><button class="subject-row${hasSubs ? ' has-subs' : ''}${isActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}" data-subject="${escAttr(key)}" style="--subject-color:${conf.color};"><span class="subject-row__dot"></span><span class="subject-row__name">${escHtml(key)}</span><span class="subject-row__count">${cnt > 0 ? cnt : ''}</span><span class="subject-row__caret">›</span></button>${(hasSubs && isOpen) ? `<div class="subject-subs is-open"><div class="subject-subs__inner">${subList}</div></div>` : ''}</div>`;
  }).join('');

  container.innerHTML = `<div class="subject-list">${inner}</div>`;
}

$('subjectFilter').addEventListener('click', e => {
  const subRow = e.target.closest('.sub-row');
  const subjBtn = e.target.closest('.subject-row');

  if (subRow) {
    const sub = subRow.dataset.sub;
    state.subSubject = state.subSubject === sub ? 'all' : sub;
    state.page = 1;
    renderSubjectFilter();
    render(true);
    syncUrl();
    return;
  }
  if (subjBtn) {
    state.subjects = [];   // 옆 목록에서 영역을 고르면 스마트 검색의 여러 영역 선택을 대체
    const key     = subjBtn.dataset.subject;
    const hasSubs = (tabSubjects()[key]?.subs.length ?? 0) > 0;
    if (state.subject === key) {
      state.subject = state.subSubject = 'all';
    } else {
      state.subject    = key;
      state.subSubject = 'all';
    }
    if (!hasSubs) state.subSubject = 'all';
    state.page = 1;
    resize($('subjectFilter'), renderSubjectFilter);   // 세부 과목이 펼쳐지며 아래가 따라 내려감
    render(true);
    syncUrl();
  }
});

// ── 검색 ──────────────────────────────────────────────────
let searchTimer;
$('searchInput').addEventListener('input', e => {
  const val = e.target.value;
  $('clearSearch').style.display = val ? 'flex' : 'none';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if ($('searchInput').value !== val) return;
    state.query = val.trim();
    state.page = 1;
    render();
    syncUrl();
    maybeSmartSearch(state.query);
  }, 180);
});
$('clearSearch').addEventListener('click', () => {
  clearTimeout(searchTimer);
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';
  state.query = '';
  state.page  = 1;
  render();
  syncUrl();
});

$('resetBtn').addEventListener('click', resetAll);
$('emptyResetBtn').addEventListener('click', resetAll);
$('paginationWrap').addEventListener('click', e => {
  const btn = e.target.closest('.pg-btn[data-pg]');
  if (!btn || btn.disabled) return;
  const next = Number(btn.dataset.pg), dir = Math.sign(next - state.page) || 1;
  state.page = next;
  const grid = () => $('cardsGrid');
  vt(dir > 0 ? 'page-next' : 'page-prev', () => {
    renderCards();
    grid().scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [[grid, grid, 'results']]);
  syncUrl();
});

// ── 모바일 필터 바텀시트 ────────────────────────────────────
// 데스크톱에서는 sticky 사이드바 유지, 모바일(≤960px)에서만 시트로 동작
let sheetReturnFocus = null;
function setSheetOpen(open, trigger = null) {
  const panel = $('filterPanel');
  // 닫기 — 넓은 화면 서랍은 왼쪽으로, 폰 시트는 아래로 들어가며 사라진 뒤 닫는다
  if (!open && panel.classList.contains('is-open') && !reduceMotion.matches && !panel.dataset.closing) {
    const wide = matchMedia('(min-width: 961px)').matches;
    panel.dataset.closing = '1';
    $('filterBackdrop')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    panel.animate([{ translate: '0 0' }, { translate: wide ? '-100% 0' : '0 100%' }], { duration: 220, easing: M.in, fill: 'forwards' })
      .finished.catch(() => {}).finally(() => {
        delete panel.dataset.closing;
        applySheet(false, trigger);
        panel.getAnimations().forEach(a => a.cancel());
        $('filterBackdrop')?.getAnimations().forEach(a => a.cancel());
      });
    return;
  }
  applySheet(open, trigger);
}
function applySheet(open, trigger = null) {
  const panel    = $('filterPanel');
  const backdrop = $('filterBackdrop');
  panel.classList.toggle('is-open', open);
  if (backdrop) {
    backdrop.classList.toggle('is-open', open);
    if (open) backdrop.removeAttribute('hidden');
    else      backdrop.setAttribute('hidden', '');
  }
  document.body.classList.toggle('is-sheet-open', open);

  if (open) {
    sheetReturnFocus = trigger || document.activeElement;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
  } else {
    panel.setAttribute('role', 'region');
    panel.removeAttribute('aria-modal');
  }
  for (const el of [document.querySelector('.site-header'), document.querySelector('.curriculum-nav'), document.querySelector('.content')]) {
    if (el) el.inert = open;
  }

  [$('filterToggle'), $('filterToggleInline')].forEach(btn => {
    if (!btn) return;
    if (btn.id === 'filterToggleInline') btn.removeAttribute('aria-label');
    else btn.setAttribute('aria-label', open ? '필터 닫기' : '필터 열기');
    btn.setAttribute('aria-expanded', String(open));
  });
  if (open) requestAnimationFrame(() => $('filterSheetClose')?.focus());
  else if (sheetReturnFocus?.isConnected) sheetReturnFocus.focus();
}
function isSheetOpen() {
  return $('filterPanel').classList.contains('is-open');
}
function toggleFilter(e) { setSheetOpen(!isSheetOpen(), e?.currentTarget); }

$('filterToggle')?.addEventListener('click', toggleFilter);
$('filterToggleInline')?.addEventListener('click', toggleFilter);
$('filterSheetClose')?.addEventListener('click', () => setSheetOpen(false));
$('filterBackdrop')?.addEventListener('click',  () => setSheetOpen(false));
$('filterSheetApply')?.addEventListener('click', () => setSheetOpen(false));
$('filterSheetReset')?.addEventListener('click', () => {
  $('resetBtn')?.click();
});

// ESC 로 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isSheetOpen()) {
    setSheetOpen(false);
    return;
  }
  if (e.key === 'Tab' && isSheetOpen()) {
    const focusable = [...$('filterPanel').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// 데스크톱으로 리사이즈 시 시트/스크롤락 자동 해제
const mqlSheet = window.matchMedia('(min-width: 961px)');
const onMqlSheet = e => { if (e.matches) setSheetOpen(false); };
mqlSheet.addEventListener
  ? mqlSheet.addEventListener('change', onMqlSheet)
  : mqlSheet.addListener(onMqlSheet);

// 모바일/데스크톱 경계 통과 시 학년도 칩 SHOW_INITIAL 재계산 — 회전·리사이즈 대응
const mqlMobile = window.matchMedia('(max-width: 600px)');
const onMqlMobile = () => { renderYearChips(); };
mqlMobile.addEventListener
  ? mqlMobile.addEventListener('change', onMqlMobile)
  : mqlMobile.addListener(onMqlMobile);

function updateFilterBadge() {
  const count = document.querySelectorAll('#activeTags .tag').length;
  [$('filterToggle'), $('filterToggleInline')].forEach(btn => {
    if (!btn) return;
    let badge = btn.querySelector('.filter-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'filter-badge'; btn.appendChild(badge); }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

// ── 카드 렌더 ──────────────────────────────────────────────
function renderCards() {
  const data     = filtered();
  const grid     = $('cardsGrid');
  const empty    = $('emptyState');
  const moreWrap = $('paginationWrap');
  const countEl  = $('resultCount');
  const isPlaceholder = Boolean(tabConf()?.placeholder);

  countEl.textContent = isPlaceholder ? '' : `${data.length.toLocaleString()}건`;
  // 모바일 필터 시트 "결과 N건 보기" 버튼 카운트 동기화
  const sheetCountEl = $('filterSheetCount');
  if (sheetCountEl) sheetCountEl.textContent = isPlaceholder ? '0' : data.length.toLocaleString();
  updateExamSetLink(data);

  if (isPlaceholder || data.length === 0) {
    const allLink = $('searchAllLink');
    allLink.hidden = state.tab === 'all' || !state.query;
    allLink.style.display = allLink.hidden ? 'none' : '';
    allLink.href = `/?tab=all&q=${encodeURIComponent(state.query)}`;
    grid.style.display     = 'none';
    moreWrap.style.display = 'none';
    empty.style.display    = 'flex';
    const setLink = $('examSetLink');
    if (setLink) setLink.hidden = true;
    updateEmptyState(isPlaceholder);
    return;
  }
  empty.style.display = 'none';
  grid.style.display  = '';

  loadCuts();   // 표·카드 어느 보기로 시작해도 1등급컷·난이도를 받는다
  if (viewMode === 'table') {
    // 표 보기는 회차 단위로 페이지를 나눈다 — 한 회차가 두 페이지에 걸쳐 제목이 겹치지 않게
    const pages = paginateGroups(groupBySet(data), PAGE_SIZE);
    state.page = Math.min(Math.max(1, state.page), pages.length);
    grid.className = 'results results--table';
    const html = tableHTML(pages[state.page - 1]);
    const sig = htmlSig(html);
    // 지금 화면(미리 그린 표 포함)과 같은 내용이면 DOM 을 갈아끼우지 않는다 — 첫 표시(LCP)가 늦게 다시 잡히지 않고,
    // 제자리에서 바꿔 둔 다운로드 주소(loadTabUrls)도 그대로 남는다
    if (grid.dataset.sig !== sig || !grid.firstElementChild) grid.innerHTML = html;
    grid.dataset.sig = sig;
    delete grid.dataset.prerendered;
    const inline = grid.querySelector('[data-ad-position]');
    if (inline) renderAdSlot(inline, inline.dataset.adPosition);
    renderPagination(state.page, pages.length, data.length);
  } else {
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const shown = data.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    grid.className = 'grid';
    delete grid.dataset.sig;
    grid.innerHTML = shown.map((e, i) => { try { return cardHTML(e, i); } catch(_) { return ''; } }).join('');
    renderPagination(state.page, totalPages, data.length);
  }
}

function renderPagination(current, total, totalItems) {
  const wrap = $('paginationWrap');
  if (total <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';

  const WIN      = 5;
  const winIdx   = Math.floor((current - 1) / WIN);
  const winStart = winIdx * WIN + 1;
  const winEnd   = Math.min(winStart + WIN - 1, total);

  const nums = [];
  for (let p = winStart; p <= winEnd; p++) {
    nums.push(`<button class="pg-btn${p === current ? ' is-active' : ''}" data-pg="${p}"${p === current ? ' aria-current="page"' : ''} aria-label="${p}페이지">${p}</button>`);
  }

  wrap.innerHTML = `
    <div class="pagination">
      <button class="pg-btn pg-arrow" data-pg="${winStart - 1}" aria-label="이전 페이지 묶음" ${winStart <= 1 ? 'disabled' : ''}>‹</button>
      ${nums.join('')}
      <button class="pg-btn pg-arrow" data-pg="${winEnd + 1}" aria-label="다음 페이지 묶음" ${winEnd >= total ? 'disabled' : ''}>›</button>
    </div>
    <span class="pg-info">${totalItems.toLocaleString()}건 · ${current} / ${total}페이지</span>
  `;
}

// ── 회차별 표 ────────────────────────────────────────────
// 같은 회차(교육과정·학년도·시험·학년, 논술은 대학까지)끼리 묶고, 탐구·제2외국어처럼
// 과목이 많은 영역은 한 줄로 접는다 (해당 영역을 필터로 고른 경우는 펼친 채 표시).
const FOLD_SUBJECTS = new Set(['사회탐구', '과학탐구', '직업탐구', '제2외국어']);
const SUNEUNG_TITLE = { csat: '대학수학능력시험', june: '6월 모의평가', sept: '9월 모의평가', prelim: '예비시험' };

function setKey(e) {
  return [e.curriculum, e.gradeYear, e.type, e.typeGroup === 'education' ? (e.studentGrade ?? '') : '',
          e.typeGroup === 'essay' ? e.subject : ''].join('|');
}

function setTitle(e) {
  const tc = getTypeConf(e.type);
  switch (e.typeGroup) {
    case 'suneung':   return e.gradeYear === 'preliminary' ? '예비시험' : `${e.gradeYear}학년도 ${SUNEUNG_TITLE[e.type] ?? tc?.label ?? ''}`;
    case 'education': return `${e.examYear}년 ${e.month}월 고${e.studentGrade ?? ''} 학력평가`;
    case 'military':  return `${e.gradeYear}학년도 사관학교 1차 시험`;
    case 'police':    return `${e.gradeYear}학년도 경찰대학 1차 시험`;
    case 'leet':      return `${e.gradeYear}학년도 LEET${e.type === 'prelim' ? ' 예비시험' : ''}`;
    case 'meet':      return `${e.gradeYear}학년도 MEET${e.type === 'prelim' ? ' 예비시험' : ''}`;
    case 'essay':     return `${e.gradeYear}학년도 ${String(e.subject).replace('학교', '')} ${e.type === 'essay_mock' ? '모의논술' : '논술'}`;
    case 'ged':       return `${e.examYear ?? e.gradeYear}년 제${e.type === 'ged_2' ? 2 : 1}회 ${e.curriculum} 검정고시`;
    default:          return `${e.gradeYear}학년도 ${e.subject}`;
  }
}

function badgeLabel(e) {
  const tc = getTypeConf(e.type);
  if (e.gradeYear === 'preliminary') return '예비시험';
  if (e.typeGroup === 'military') return '사관학교';
  if (e.typeGroup === 'police') return '경찰대';
  if (e.typeGroup === 'leet') return 'LEET';
  if (e.typeGroup === 'meet') return 'MEET';
  if (e.typeGroup === 'ged') return '검정고시';
  return tc?.label ?? e.type;
}

function rowLabel(e) {
  if (e.typeGroup === 'essay') return { main: e.subSubject ? prettySub(e.subSubject) : '논술', sub: '' };
  const legacy = e.subSubject && LEGACY_SUB_FORMS.has(e.subSubject);
  if (legacy) return { main: e.subject, sub: prettySub(e.subSubject) };
  return { main: e.subject, sub: e.subSubject ? prettySub(e.subSubject) : '' };
}

// 1등급컷·난이도 셀 — 값은 .spoil-val (스포일러 방지 시 흐림)
function scoreCells(e) {
  const c = cutsIndex?.[e.id];
  const loading = !cutsIndex && cutsRequested;
  if (!c) {
    const na = loading ? '' : '—';
    return { has: false, cut: `<span class="rrow__na">${na}</span>`, tier: '', cutInline: '' };
  }
  const [raw, top, tier, abs, ratio] = c;
  // 영어(절대평가)는 90점 기준은 공개 정보, 1등급 비율과 그에 따른 난이도만 스포일러
  const cut = abs
    ? `<span class="rrow__cut">${raw}점${ratio != null ? `<small class="rrow__ratio spoil-val">(${ratio}%)</small>` : ''}</span>`   // 예: 90점(15.54%) — 비율은 1등급 비율
    : `<span class="rrow__cut spoil-val">${raw}${top != null ? `<small>최고표점 ${top}</small>` : ''}</span>`;
  const tierHtml = tier
    ? `<span class="tier tier--${tier} spoil-val">${TIER_LABEL[tier]}</span>`
    : (abs ? '<span class="tier tier--na">절대평가</span>' : '');
  return { has: true, cut, tier: tierHtml, cutInline: `<span class="card__sub spoil-val">1컷 ${raw}</span>` };
}

// 목록 데이터에는 파일 주소 대신 "있음(1)" 표시만 들어 있다 — 실제 주소(.urls.json)가 도착하기 전에는 상세 페이지로 연결한다.
const fileUrl = (exam, key) => exam[key] === 1 ? `exam-${exam.id}.html` : safeUrl(exam[key]);
const dlAttr = (exam, key, name) => exam[key] === 1
  ? `data-f="${key}" data-eid="${exam.id}"`   // 주소가 도착하면 loadTabUrls 가 이 링크만 제자리에서 바꾼다(다시 그리지 않음)
  : (name ? `download="${escAttr(name)}"` : 'download');

// 데스크톱 자료 칸: 회차 묶음 안에 있는 버튼 종류만 고정 폭 칸으로(13px 글자 기준 실측) — actionsHTML 의 act-* 와 짝
function actsColumns(items) {
  const has = { q: false, a: false, s: false, l: false }, wide = { q: false, a: false };
  for (const e of items) {
    if (e.searchOnly) { has.q = has.a = true; continue; }
    const sameQS = typeof e.questionUrl === 'string' && e.questionUrl === e.solutionUrl;
    if (fileUrl(e, 'questionUrl')) { has.q = true; if (sameQS) wide.q = true; }
    if (fileUrl(e, 'answerUrl')) { has.a = true; if (e.answerIncludesSolution) wide.a = true; }
    if (fileUrl(e, 'solutionUrl') && !sameQS) has.s = true;
    if (fileUrl(e, 'listenUrl')) has.l = true;
  }
  const w = { q: wide.q ? 73 : 58, a: wide.a ? 73 : 58, s: 58, l: 58 };   // 버튼 폭 통일 — 글자 수가 달라도 같은 크기
  return ['q', 'a', 's', 'l'].filter(k => has[k]).map(k => `[${k}] ${w[k]}px`).join(' ') || 'auto';
}

function actionsHTML(exam) {
  if (exam.searchOnly) return `<a class="btn btn--primary act-all" href="exam-${exam.id}.html">자료 보기</a>`;
  const out = [];
  const q = fileUrl(exam, 'questionUrl'), a = fileUrl(exam, 'answerUrl'), s = fileUrl(exam, 'solutionUrl'), l = fileUrl(exam, 'listenUrl');
  const sameQS = typeof exam.questionUrl === 'string' && exam.questionUrl === exam.solutionUrl;
  if (q) out.push(`<a class="btn btn--primary act-q" href="${escAttr(q)}" ${dlAttr(exam, 'questionUrl', exam.questionDownload)}>${sameQS ? '문제·해설' : '문제지'}</a>`);
  if (a) out.push(`<a class="btn act-a" href="${escAttr(a)}" ${dlAttr(exam, 'answerUrl', exam.answerDownload)}>${exam.answerIncludesSolution ? '정답·해설' : '정답'}</a>`);
  if (s && !sameQS) out.push(`<a class="btn act-s" href="${escAttr(s)}" ${dlAttr(exam, 'solutionUrl', exam.solutionDownload)}>해설</a>`);
  if (l) out.push(`<a class="btn act-l" href="${escAttr(l)}" ${dlAttr(exam, 'listenUrl', exam.listenDownload)}>듣기</a>`);
  return out.join('');
}

// 같은 회차끼리 묶는다 — 정렬상 떨어져 있어도(예: 같은 해 사관·경찰 과목이 번갈아 나옴)
// 처음 나온 순서를 유지한 채 한 묶음으로 모은다.
function groupBySet(list) {
  const map = new Map();
  for (const e of list) {
    const k = setKey(e);
    if (!map.has(k)) map.set(k, { key: k, items: [] });
    map.get(k).items.push(e);
  }
  return [...map.values()];
}

// 화면에 보이는 줄 수 — 탐구 등 3과목 이상 영역은 한 줄로 접히므로 1줄로 센다 (tableHTML 과 같은 규칙)
function visibleRows(g) {
  if (rgroupFolded.has(setTitle(g.items[0]))) return 1;   // 접은 회차는 머리줄 한 줄 — 뒤 회차가 앞 페이지로 당겨진다
  const folds = new Map();
  let n = 0;
  for (const e of g.items) {
    if (FOLD_SUBJECTS.has(e.subject) && state.subject !== e.subject && e.subSubject) folds.set(e.subject, (folds.get(e.subject) || 0) + 1);
    else n++;
  }
  for (const c of folds.values()) n += c >= 3 ? 1 : c;
  return n;
}

// 회차 묶음 단위 페이지 — 보이는 줄이 대략 size 가 되도록, 회차를 쪼개지 않는다
function paginateGroups(groups, size) {
  const pages = [];
  let cur = [], n = 0;
  for (const g of groups) {
    const rows = visibleRows(g);
    if (cur.length && n + rows > size) { pages.push(cur); cur = []; n = 0; }
    cur.push(g); n += rows;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

// 접은 회차(제목 기준) — 필터를 바꿔 다시 그려도 접힌 채로 둔다(새로고침하면 다 펼침).
// 페이지는 보이는 줄 수로 나누므로(paginateGroups) 접고 펴면 다시 그려 뒤 회차를 당기거나 민다.
const rgroupFolded = new Set();
document.addEventListener('click', e => {
  const btn = e.target.closest('.rgroup__fold');
  if (!btn) return;
  const sec = btn.closest('.rgroup'), title = sec.dataset.group;
  const folding = !rgroupFolded.has(title);
  if (folding) rgroupFolded.add(title); else rgroupFolded.delete(title);
  const top = btn.getBoundingClientRect().top, from = sec.offsetHeight;
  renderCards();
  // 누른 회차 머리줄이 화면에서 같은 자리에 머물게
  const ns = [...document.querySelectorAll('.rgroup')].find(x => x.dataset.group === title);
  const again = ns?.querySelector('.rgroup__fold');
  if (again) { scrollBy(0, again.getBoundingClientRect().top - top); again.focus({ preventScroll: true }); }
  if (!ns || reduceMotion.matches) return;
  const to = ns.offsetHeight;
  // 긴 회차일수록 천천히 — 600px 넘게 펼치면 약 0.5초
  const duration = Math.min(560, 280 + Math.abs(to - from) * .35);
  const spin = ns.querySelector('.rgroup__fold-chev')?.animate(
    [{ transform: `rotate(${folding ? 0 : 180}deg)` }, { transform: `rotate(${folding ? 180 : 0}deg)` }],
    { duration, easing: EASE_FOLD, fill: 'forwards' });
  if (folding) ns.classList.remove('is-folded');   // 접히는 동안은 줄을 보여 주고 높이만 줄인다 — 끝나면 되돌림
  slideHeight(ns, from, to, duration).then(() => {
    if (folding && rgroupFolded.has(title)) ns.classList.add('is-folded');
    spin?.cancel();
  });
});

function tableHTML(groups) {
  // 회차 접기 — 회차 페이지는 제목 링크로 간다. 접힌 상태는 다시 그려도 유지(rgroupFolded, 아래 클릭 처리)
  const foldChev = '<svg class="rgroup__fold-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
  const chev = '<svg class="rfold__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  return groups.map((g, gi) => {
    const first = g.items[0];
    const title = setTitle(first);
    const sg = first.typeGroup === 'education' ? (first.studentGrade ?? null) : null;
    const setHref = first.typeGroup === 'essay' ? '' : setFriendlyURL(first.curriculum, String(first.gradeYear), first.type, sg);
    const rows = [];
    const folds = new Map();
    for (const e of g.items) {
      if (FOLD_SUBJECTS.has(e.subject) && state.subject !== e.subject && e.subSubject) {
        if (!folds.has(e.subject)) { folds.set(e.subject, []); rows.push({ fold: e.subject }); }
        folds.get(e.subject).push(e);
      } else rows.push({ exam: e });
    }
    const body = rows.map(r => {
      if (r.fold) {
        const list = folds.get(r.fold);
        if (list.length < 3) return list.map(rowHTML).join('');
        // 접힌 줄에 난이도 분포 막대(스포일러 대상) — 펼치면 국어·수학과 같은 행(컷·난이도·다운로드)
        const tiers = list.map(e => cutsIndex?.[e.id]?.[2]).filter(Boolean);
        const dist = tiers.length
          ? `<span class="rfold__dist spoil-val" aria-label="난이도 분포">${[1, 2, 3, 4, 5].map(t => {
              const n = tiers.filter(x => x === t).length;
              return n ? `<i class="rfold__seg rfold__seg--${t}" style="flex:${n}" title="${TIER_LABEL[t]} ${n}과목"></i>` : '';
            }).join('')}</span>` : '';
        const open = openFolds.has(r.fold) ? ' open' : '';
        return `<details class="rfold" data-fold="${escAttr(r.fold)}"${open}><summary><span class="rfold__name">${escHtml(r.fold)}</span><span class="rfold__count">${list.length}과목</span>${dist}${chev}</summary>
          <div class="rfold__rows">${list.map(e => rowHTML(e, true)).join('')}</div></details>`;
      }
      return rowHTML(r.exam);
    }).join('');
    const ad = gi === 1 && groups.length > 2 ? '<div class="ad-slot ad-slot--banner" data-ad-position="archiveGrid"></div>' : '';
    const folded = rgroupFolded.has(title);
    return `<section class="rgroup${folded ? ' is-folded' : ''}" data-group="${escAttr(title)}" aria-label="${escAttr(title)}" style="--acts: ${actsColumns(g.items)}">
      <header class="rgroup__head">
        <span class="type-badge type-badge--lg tg-${escAttr(first.typeGroup)}${first.type === 'csat' ? ' tg-csat' : ''}">${escHtml(badgeLabel(first))}</span>
        <h2 class="rgroup__title">${setHref ? `<a href="${escAttr(setHref)}">${escHtml(title)}</a>` : escHtml(title)}</h2>
        <button type="button" class="rgroup__all rgroup__fold" aria-expanded="${!folded}" aria-label="${escAttr(title)} ${folded ? '펼치기' : '접기'}">${foldChev}</button>
      </header>
      <div class="rrow rrow--head" aria-hidden="true"><span>과목</span><span>1등급컷</span><span>난이도</span><span>자료</span></div>
      ${body}
    </section>${ad}`;
  }).join('');
}

function rowHTML(e, inFold = false) {
  const { main, sub } = inFold && e.subSubject ? { main: prettySub(e.subSubject), sub: '' } : rowLabel(e);
  const sc = scoreCells(e);
  const name = `${setTitle(e)} ${main}${sub ? ' ' + sub : ''}`;
  const pick = isSelecting() && !e.searchOnly;
  return `<div class="rrow${pick ? ' rrow--pick' : ''}">
    ${pick ? checkboxHTML(e.id, name, 'rrow__link') : `<a class="rrow__link" href="exam-${e.id}.html" aria-label="${escAttr(name + ' 상세 보기')}"></a>`}
    <span class="rrow__subj">${escHtml(main)}${sub ? `<small>${escHtml(sub)}</small>` : ''}</span>
    <span class="rrow__meta">${sc.cut}<span class="rrow__tier">${sc.tier}</span></span>
    <span class="rrow__acts">${actionsHTML(e)}</span>
  </div>`;
}

// 영역명이 아니라 시험 형식·계열·자료유형을 나타내는 subSubject 들 — 카드 title 에 단독 노출하면
// 어느 영역인지 모름. "수학 (인문계)" / "영어 (듣기대본)" 처럼 영역과 합쳐 표시.
const LEGACY_SUB_FORMS = new Set(['인문계', '자연계', '예체능계', '1차', '2차', '듣기대본']);

function cardHTML(exam, idx = 0) {
  const conf    = tabSubjects()[exam.subject] ?? { color: '#9ca3af' };
  const tc      = getTypeConf(exam.type);
  const dy      = getDisplayYear(exam);
  const hasFile = Boolean(exam.questionUrl || exam.answerUrl || exam.solutionUrl || exam.hasFiles);
  const isPrelim = exam.gradeYear === 'preliminary';

  const isLegacySub = exam.subSubject && LEGACY_SUB_FORMS.has(exam.subSubject);
  const title = isLegacySub
    ? `${exam.subject} (${prettySub(exam.subSubject)})`
    : (exam.subSubject ? prettySub(exam.subSubject) : exam.subject);
  // examYear 모드(학평): dy.label에 "N월"이 들어가므로 typeLabel 에서 month prefix 제거
  // → "2026년 3월 학력평가" (중복 X)
  const rawTypeLabel = tc?.label ?? '';
  const typeLabel = isPrelim
    ? '예비시험'
    : (tc?.displayMode === 'examYear' ? rawTypeLabel.replace(/^\d+월\s*/, '') : rawTypeLabel);
  const yearPart = isPrelim
    ? '예비시험'
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${typeLabel}`
        : `${dy.label}학년도 ${typeLabel}`);
  // legacy 계열 표기는 title 에 이미 영역명 합쳐졌으므로 subtitle 중복 회피
  const subtitle = (exam.subSubject && !isLegacySub) ? `${exam.subject} · ${yearPart}` : yearPart;

  const yearChip = `<span class="chiplet chiplet--ink">${dy.label}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  const typeChip = tc
    ? `<span class="type-badge tg-${escAttr(exam.typeGroup)}${exam.type === 'csat' ? ' tg-csat' : ''}">${escHtml(typeLabel)}</span>`
    : '';
  const score = scoreCells(exam);

  const qUrl = fileUrl(exam, 'questionUrl');
  const aUrl = fileUrl(exam, 'answerUrl');
  const sUrl = fileUrl(exam, 'solutionUrl');
  const qBtn = qUrl
    ? `<a class="btn btn--primary" href="${escAttr(qUrl)}" ${dlAttr(exam, 'questionUrl', exam.questionDownload)}>문제지</a>`
    : '';
  const aBtn = aUrl
    ? `<a class="btn" href="${escAttr(aUrl)}" ${dlAttr(exam, 'answerUrl', exam.answerDownload)}>${exam.answerIncludesSolution ? '정답·해설' : '정답'}</a>`
    : '';
  // 제공되지 않는 자료는 비활성 버튼 대신 숨긴다.
  const sBtn = sUrl
    ? `<a class="btn" href="${escAttr(sUrl)}" ${dlAttr(exam, 'solutionUrl', exam.solutionDownload)}>해설</a>`
    : '';

  const delay = `${Math.min(idx * 28, 220)}ms`;
  const ariaLabel = `${yearPart} ${title} 상세 보기`;
  return `
    <div class="card${hasFile ? ' has-files' : ''}" style="animation-delay:${delay};">
      ${isSelecting() && !exam.searchOnly ? checkboxHTML(exam.id, `${yearPart} ${title}`, 'card__link') : `<a class="card__link" href="exam-${exam.id}.html" aria-label="${escAttr(ariaLabel)}"></a>`}
      <div class="card__meta">${yearChip}${typeChip}</div>
      <h4 class="card__title" title="${escAttr(title)}">${escHtml(title)}</h4>
      <p class="card__sub">${escHtml(subtitle)}</p>
      ${score.has ? `<div class="card__meta">${score.tier}${score.cutInline}</div>` : ''}
      <div class="card__divider"></div>
      <div class="card__actions">${exam.searchOnly ? `<a class="btn btn--primary" href="exam-${exam.id}.html">자료 보기</a>` : `${qBtn}${aBtn}${sBtn}`}</div>
    </div>
  `;
}

// ── 활성 태그 ──────────────────────────────────────────────
function renderActiveTags() {
  const container = $('activeTags');
  const tags = [];
  const isEdu = state.typeGroup === 'education';
  const isSingle = tabIsSingleType();

  // singleType 탭에서는 타입그룹/타입이 자동 선택이므로 태그 노출 생략
  if (state.typeGroup !== 'all' && !isSingle) {
    const g = getGroupConf(state.typeGroup);
    tags.push({ label: g?.groupLabel ?? state.typeGroup, key: 'typeGroup' });
  }
  if (state.type !== 'all' && !isSingle) {
    const types = Array.isArray(state.type) ? state.type : [state.type];
    const labels = types.map(t => getTypeConf(t)?.label ?? t);
    tags.push({ label: labels.join('·'), key: 'type' });
  }
  if (state.gradeYear !== 'all') {
    const years = Array.isArray(state.gradeYear) ? state.gradeYear : [state.gradeYear];
    // 여러 해는 칩이 길어지지 않게 범위로 줄인다 (2022~2027학년도, 1994~2026 짝수 학년도)
    const nums = years.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const step = nums.length >= 3 && nums.length === years.length
      ? nums.slice(1).map((y, i) => y - nums[i]).reduce((s, d) => (s === d ? s : 0)) : 0;
    const unit = isEdu ? '년' : '학년도';
    const label = step === 1 ? `${nums[0]}~${nums.at(-1)}${unit}`
      : step === 2 ? `${nums[0]}~${nums.at(-1)} ${nums[0] % 2 ? '홀수' : '짝수'} ${unit}`
      : years.map(y => yearChipLabel(y === 'preliminary' ? 'preliminary' : Number(y), isEdu)).join('·');
    tags.push({ label, key: 'gradeYear' });
  }
  if (state.subject    !== 'all') tags.push({ label: state.subject,    key: 'subject' });
  if (state.subjects.length) tags.push({ label: state.subjects.join('·'), key: 'subjects' });
  if (state.has.length) tags.push({ label: state.has.map(k => HAS_LABEL[k]).join('·'), key: 'has' });
  if (state.subSubjects.length) tags.push({ label: [...new Set(state.subSubjects.map(prettySub))].slice(0, 3).join('·'), key: 'subSubjects' });
  if (state.cut) tags.push({ label: `1등급컷 ${state.cut.min != null ? state.cut.min + '점 이상' : ''}${state.cut.min != null && state.cut.max != null ? ' ' : ''}${state.cut.max != null ? state.cut.max + '점 이하' : ''}`, key: 'cut' });
  if (state.sort) tags.push({ label: SORT_LABEL[state.sort], key: 'sort' });
  if (state.subSubject !== 'all') tags.push({ label: prettySub(state.subSubject), key: 'subSubject' });
  if (state.tier !== 'all') {
    const tiers = Array.isArray(state.tier) ? state.tier : [state.tier];
    if (tiers.length) tags.push({ label: tiers.map(t => TIER_LABEL[t]).join('·'), key: 'tier' });
  }
  // '전체' 탭 버튼은 없앴지만 홈 검색은 모든 시험에서 찾는다 — 칩을 지우면 고3 탭으로
  if (state.tab === 'all') tags.unshift({ label: '모든 시험', key: 'tab' });
  if (state.query) tags.push({ label: `"${state.query}"`, key: 'query' });

  container.innerHTML = tags.map(t => `
    <span class="tag"><span class="tag__t">${escHtml(t.label)}</span><button data-clear="${t.key}" aria-label="${escAttr(t.label)} 조건 빼기"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>
  `).join('');
}

$('activeTags').addEventListener('click', e => {
  const btn = e.target.closest('button[data-clear]');
  if (!btn) return;
  clearTimeout(searchTimer);
  const key = btn.dataset.clear;

  if (key === 'tab') {
    document.querySelector('.nav-tab[data-tab="senior"]')?.click();
    return;
  }
  if (key === 'query') {
    state.query = '';
    $('searchInput').value = '';
    $('clearSearch').style.display = 'none';
  } else if (key === 'typeGroup') {
    state.typeGroup = state.type = 'all';
    renderTypeGroupChips();
    renderSubtypeChips();
    renderYearChips();
  } else if (key === 'type') {
    state.type = 'all';
    renderSubtypeChips();
  } else if (key === 'gradeYear') {
    state.gradeYear = 'all';
    // 예비시험 타입도 함께 해제 (학년도가 예비가 아니게 되므로)
    if (Array.isArray(state.type) && state.type.length === 1 && state.type[0] === 'prelim') state.type = 'all';
    renderYearChips();
    renderSubtypeChips();
  } else if (key === 'subject') {
    state.subject = state.subSubject = 'all';
    renderSubjectFilter();
  } else if (key === 'subjects') {
    state.subjects = [];
  } else if (key === 'has') {
    state.has = [];
  } else if (key === 'subSubjects') {
    state.subSubjects = [];
  } else if (key === 'cut') {
    state.cut = null;
  } else if (key === 'sort') {
    state.sort = '';
  } else if (key === 'subSubject') {
    state.subSubject = 'all';
    renderSubjectFilter();
  } else if (key === 'tier') {
    state.tier = 'all';
    renderTierChips();
  }

  state.page = 1;
  render();
  syncUrl();
});

// ── 초기화 ─────────────────────────────────────────────────
function resetAll() {
  clearTimeout(searchTimer);
  resetFilters();
  state.yearExpanded = false;
  $('searchInput').value = '';
  $('clearSearch').style.display = 'none';

  if (tabIsSingleType()) {
    state.typeGroup = tabAvailableTypeGroups()[0];
    state.type      = 'all';
  }
  renderFilterPanel();
  render();
  syncUrl();
}

// ── 스켈레톤 ───────────────────────────────────────────────
// 화면 상태를 바꾸는 주소 키 — 이게 있으면 미리 그린 기본 목록은 쓰지 않는다(lib/site-prefs.js 에도 같은 목록).
// (?NaPm=·?utm_source= 같은 유입 꼬리표나 ?focus= 는 화면을 안 바꾸므로 미리 그린 표를 그대로 쓴다)
const STATE_PARAMS = ['tab', 'q', 'search', 'typeGroup', 'type', 'gradeYear', 'subject', 'subjects', 'subSubject', 'subSubjects', 'has', 'cut', 'sort', 'tier', 'page'];
function urlHasStateParams() {
  const p = new URLSearchParams(location.search);
  return STATE_PARAMS.some(k => p.has(k));
}
// 빌드 때 미리 그린 첫 화면(scripts/prerender-home.py)이 있으면, 기본 화면으로 들어온 첫 로딩에선 스켈레톤으로 가리지 않는다.
// 검색어·필터가 붙은 주소로 들어오면 미리 그린 기본 목록은 바로 가린다.
let prerenderShown = null;
function showSkeleton(show) {
  if (prerenderShown === null) prerenderShown = $('cardsGrid')?.dataset.prerendered === '1' && !urlHasStateParams();
  if (show && prerenderShown) return;
  $('skeleton').style.display      = show ? '' : 'none';
  $('cardsGrid').style.display     = show ? 'none' : '';
  $('emptyState').style.display    = 'none';
  $('paginationWrap').style.display  = 'none';
}

// ── 회차 단위 진입 링크 ────────────────────────────────────
// 사용자가 학년도(gradeYear) + 시험종류(type) 둘 다 명시적으로 선택했을 때만 노출.
// 회차 친화 URL 매핑 (build-data.py 의 set_friendly_filename 와 동일 규약)
const SET_CURR_SLUG = {
  '2015': 'kice', '2009': 'kice', '예비': 'kice',
  // 7차 이전 분리 키는 모두 기존 exam-set-pre2009-*.html 정적 페이지로 매핑 (SEO·링크 호환)
  '2007개정': 'pre2009', '7차': 'pre2009', '6차': 'pre2009', 'pre2009': 'pre2009',
  '사관': 'mil', '경찰대': 'police', 'LEET': 'leet', 'MEET': 'meet',
  '논술': 'essay', '초졸': 'gedelem', '중졸': 'gedmid', '고졸': 'gedhigh',
};
function setFriendlyURL(curr, year, type, grade) {
  const slug = SET_CURR_SLUG[curr] || String(curr).toLowerCase();
  return `exam-set-${slug}-${year}-${type}${grade ? `-g${grade}` : ''}.html`;
}

function updateExamSetLink(data) {
  const link = $('examSetLink');
  if (!link) return;
  // 학년도와 시험종류가 모두 단일 값으로 선택된 경우에만 (다중 선택 시 회차 모호)
  const ySingle = state.gradeYear !== 'all' && (!Array.isArray(state.gradeYear) || state.gradeYear.length === 1);
  const tSingle = state.type !== 'all' && (!Array.isArray(state.type) || state.type.length === 1);
  if (!ySingle || !tSingle) { link.hidden = true; return; }
  if (!data?.length) { link.hidden = true; return; }
  const first = data[0];
  // 학평은 학년(studentGrade)도 분리 — 결과가 단일 학년이면 grade 추가
  const sg = first.studentGrade ?? null;
  const sameGrade = data.every(e => (e.studentGrade ?? null) === sg);
  link.href = setFriendlyURL(first.curriculum, String(first.gradeYear), first.type,
                              (sg != null && sameGrade) ? sg : null);
  link.hidden = false;
}

// ── 빈 상태 라벨 — placeholder 탭 (검정고시/논술/입시자료) 와
//                  실제 "결과 없음" 을 분리. 고1/고2는 이제 활성화됨 ──
function updateEmptyState(isPlaceholder) {
  const empty = $('emptyState');
  const title = empty.querySelector('.empty__title');
  const sub   = empty.querySelector('.empty__sub');
  const btn   = $('emptyResetBtn');
  if (isPlaceholder) {
    const t = tabConf();
    if (title) title.textContent = `${t?.label ?? ''} 자료는 아직 정리 중이에요`;
    if (sub)   sub.textContent   = '자료가 올라오면 이 페이지에서 바로 볼 수 있어요.';
    if (btn)   { btn.style.display = 'none'; btn.setAttribute('aria-hidden', 'true'); }
    empty.classList.add('is-placeholder');
  } else {
    if (title) title.textContent = '검색 결과가 없어요';
    if (sub)   sub.textContent   = '필터를 줄이거나 다른 검색어로 찾아보세요.';
    if (btn)   { btn.style.display = ''; btn.removeAttribute('aria-hidden'); }
    empty.classList.remove('is-placeholder');
  }
}

// ── helpers ───────────────────────────────────────────────
function pill(value, label, active, extra = '', attrs = '') {
  return `<button class="pill${extra ? ' ' + extra : ''}${active ? ' is-active' : ''}"
            data-value="${escAttr(value)}" aria-pressed="${active}" ${attrs}>${escHtml(label)}</button>`;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(str) { return escHtml(str); }
function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? publicFileUrl(String(value)) : '';
  } catch { return ''; }
}

// ── 뒤로가기/앞으로가기: URL 변경 시 상태 재적용 ────────────
window.addEventListener('popstate', async () => {
  const nextTab = tabFromLocation();
  const order = navOrder(), from = order.indexOf(navTabKey(state.tab)), to = order.indexOf(navTabKey(nextTab));
  if (!await replaceExamsForTab(nextTab, { deferSkeleton: from !== to })) return;
  const update = () => { applyUrlState(); renderFilterPanel(); render(false, from !== to); renderSmartNote(); };
  // 뒤로·앞으로 가기로 시험 종류가 바뀌어도 탭이 놓인 방향으로 밀린다
  if (from !== to && from >= 0 && to >= 0 && !lastLoadSlow) { const body = () => $('cardsGrid'); vt(to > from ? 'tab-next' : 'tab-prev', update, [[body, body, 'archive-body']]); }
  else update();
});

// ── 스마트 검색 ─────────────────────────────────────────────
// "15개정 이후 고난도 수학이랑 국어" 같은 말을 필터로 바꾼다 (kicegg.com/api/search — 규칙 + JEV).
// 목록 검색을 먼저 보여 주고, 자연어처럼 보이거나 결과가 없을 때만 묻는다.
const NATURAL = /이후|이전|부터|까지|최근|작년|올해|재작년|어려|쉬운|쉬웠|쉽게|고난도|킬러|불\s*수능|물\s*수능|개정|이랑|하고|그리고|위주|역대|평이|변별|[가-힣]랑\s/;
let smartTimer = 0, smartCtl = null, smartFrom = null;
function maybeSmartSearch(q) {
  clearTimeout(smartTimer);
  smartCtl?.abort();
  if (q.length < 3 || q.length > 80) return;
  if (!NATURAL.test(q) && filtered().length) return;
  smartTimer = setTimeout(() => runSmartSearch(q), 350);
}
async function runSmartSearch(q) {
  smartCtl = new AbortController();
  let f;
  try {
    const r = await fetch(`api/search?q=${encodeURIComponent(q)}`, { signal: smartCtl.signal });
    if (!r.ok) return;
    f = (await r.json()).filters;
  } catch { return; }
  if (!f || state.query !== q) return;                       // 그새 검색어가 바뀜
  const keys = ['tab', 'typeGroup', 'type', 'tier', 'subjects', 'subSubjects', 'subSubject', 'years', 'parity', 'has', 'cut', 'sort'].filter(k => f[k]);
  if (!keys.length) return;

  const tab = f.tab && getTabConf(f.tab) ? f.tab : state.tab;
  const url = new URL(location.href);
  for (const k of URL_KEYS) url.searchParams.delete(k);
  url.searchParams.set('tab', tab);
  if (f.typeGroup) url.searchParams.set('typeGroup', f.typeGroup);
  if (f.type) url.searchParams.set('type', f.type.join(','));
  if (f.tier) url.searchParams.set('tier', f.tier.join(','));
  if (f.subjects) {
    if (f.subjects.length === 1) url.searchParams.set('subject', f.subjects[0]);
    else url.searchParams.set('subjects', f.subjects.join(','));
  }
  if (f.has) url.searchParams.set('has', f.has.join(','));
  if (f.subSubjects) url.searchParams.set('subSubjects', f.subSubjects.join(','));
  if (f.subSubject) url.searchParams.set('subSubject', f.subSubject);
  if (f.cut) url.searchParams.set('cut', `${f.cut.min ?? ''}-${f.cut.max ?? ''}`);
  if (f.sort) url.searchParams.set('sort', f.sort);
  if (f.text) url.searchParams.set('q', f.text);
  smartFrom = { q, href: location.href };
  history.pushState({ smart: q }, '', url);
  if (!await replaceExamsForTab(tab)) return;
  applyUrlState();
  if (f.years || f.parity) {                                  // 학년도 범위·짝홀 → 이 탭에 있는 학년도만
    const from = f.years?.from ?? 0, to = f.years?.to ?? 9999;
    const ys = availableGradeYears().filter(y => typeof y === 'number' && y >= from && y <= to
      && (!f.parity || (y % 2 === (f.parity === 'even' ? 0 : 1) && curriculumOfGradeYear(y)?.id !== '예비'))).map(String);
    // 이 탭에 없는 학년도(예: 2030학년도)면 조건을 버리지 말고 '해당 없음'으로 — 전부 보여 주면 오해
    state.gradeYear = ys.length === 1 ? ys[0] : ys.length ? ys : [String(from)];
  }
  markActiveNavTab();
  renderFilterPanel();
  render();
  history.replaceState({ smart: q }, '', buildUrlFromState());
  persistArchiveState();
  renderSmartNote();
}
function renderSmartNote() {
  const el = $('smartNote');
  if (!el) return;
  const on = history.state?.smart && smartFrom && history.state.smart === smartFrom.q;
  el.hidden = !on;
  if (on) el.querySelector('b').textContent = `“${smartFrom.q}”`;
}
$('smartNote')?.addEventListener('click', e => {
  if (e.target.closest('[data-smart-undo]')) history.back();
});

// ── 보기 방식 전환 ────────────────────────────────────────
function syncViewToggle() {
  document.querySelectorAll('.view-toggle [data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === viewMode)));
  document.documentElement.dataset.view = viewMode;   // 표 보기면 탭 전환 중에도 흰 카드 판을 남긴다(style.css)
}
document.querySelector('.view-toggle')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn || btn.dataset.view === viewMode) return;
  viewMode = btn.dataset.view;
  try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  // 검정 칸이 옆 버튼으로 옮겨 가고, 목록은 표 ↔ 카드로 갈아입는다
  const ink = () => document.querySelector('.view-toggle [aria-pressed="true"]'), grid = () => $('cardsGrid');
  vt('view', () => { syncViewToggle(); renderCards(); }, [[ink, ink, 'ink-view'], [grid, grid, 'results']]);
});
syncViewToggle();

// 아주 좁은 화면(360px 미만)에선 검색 안내 문구가 잘리므로 짧게
{
  const mq = matchMedia('(max-width: 359px)'), full = $('searchInput').placeholder;
  const apply = () => { $('searchInput').placeholder = mq.matches ? '검색' : full; };
  mq.addEventListener?.('change', apply); apply();
}

// ── 최근 본 시험 (이 기기에 저장된 것만) ─────────────────────
function renderRecent() {
  const row = $('recentRow');
  if (!row) return;
  const list = recentItems().slice(0, 8);
  row.hidden = !list.length;
  $('recentList').innerHTML = list.map(e =>
    `<a class="recent-chip" href="exam-${e.id}.html"><span>${escHtml(e.sub || '')}</span> ${escHtml(e.title || '시험')}</a>`).join('');
}
$('recentClear')?.addEventListener('click', () => { clearRecent(); renderRecent(); });
renderRecent();

// ── 시작 ──────────────────────────────────────────────────
loadExams();
// 헤더 돋보기로 들어온 경우(?focus=search) 검색창에 바로 커서
if (new URLSearchParams(location.search).get('focus') === 'search') {
  $('searchInput').focus();
  const u = new URL(location.href); u.searchParams.delete('focus'); history.replaceState(history.state, '', u);
}

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
