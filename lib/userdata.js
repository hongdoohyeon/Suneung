'use strict';
// localStorage 기반 사용자 데이터 — 즐겨찾기 / 최근 본 시험 / 풀이 시간.
// 백엔드 없이 한 브라우저 내 영속.

const NS = 'suneung:';
const FAV_KEY  = NS + 'favorites:v1';   // exam id 배열
const SEEN_KEY = NS + 'recent:v1';      // exam id 배열 (최대 10)
const TIME_KEY = NS + 'time:v1';        // { [examId]: { ms, count, lastAt } }

const MAX_RECENT = 10;
const MAX_FAV    = 50;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* private mode / quota — 무시 */ }
}

// ── 즐겨찾기 ──────────────────────────────────────
export function getFavorites() { return load(FAV_KEY, []); }
export function isFavorite(id) { return getFavorites().includes(id); }
export function toggleFavorite(id) {
  const cur = getFavorites();
  const idx = cur.indexOf(id);
  if (idx >= 0) cur.splice(idx, 1);
  else { cur.unshift(id); cur.length = Math.min(cur.length, MAX_FAV); }
  save(FAV_KEY, cur);
  return idx < 0;  // true=추가됨
}

// ── 최근 본 시험 ──────────────────────────────────
export function getRecent() { return load(SEEN_KEY, []); }
export function pushRecent(id) {
  const cur = getRecent().filter(x => x !== id);
  cur.unshift(id);
  cur.length = Math.min(cur.length, MAX_RECENT);
  save(SEEN_KEY, cur);
}

// ── 풀이 시간 누적 ────────────────────────────────
// 한 시험에 ms 단위로 누적. count = 풀이 시도 횟수.
export function getStudyTime(id) {
  const m = load(TIME_KEY, {});
  return m[id] || { ms: 0, count: 0, lastAt: null };
}
export function addStudyTime(id, ms) {
  const m = load(TIME_KEY, {});
  const cur = m[id] || { ms: 0, count: 0, lastAt: null };
  cur.ms += ms;
  cur.count += 1;
  cur.lastAt = Date.now();
  m[id] = cur;
  save(TIME_KEY, m);
}

// ── 포맷터 ────────────────────────────────────────
export function fmtDuration(ms) {
  if (!ms || ms < 1000) return '0초';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}분 ${sec}초`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
}
