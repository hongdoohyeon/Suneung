'use strict';
// 모션 — 사용자가 한 행동의 '방향·원인'을 따라 움직인다 (2026-10 시안)
//  · 가로 = 같은 층위 이동(시험 종류 탭·페이지 넘김·상세 탭) — 실제 놓인 순서 방향으로 밀린다
//  · 세로 = 펼침·접힘·목록 갱신 — 남는 것은 제자리로 미끄러지고, 새 것은 옅게 나타난다
//  · 선택 표시(검정 칠·밑줄)는 사라졌다 생기지 않고 옆 칸으로 '옮겨 간다'
//  · 결과는 원인 자리에서 나온다(필터 칩이 생기고 빠짐, 숫자가 굴러감) — 화려한 효과는 쓰지 않는다
// 움직임 줄이기 설정이면 전부 즉시.
export const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const EASE = {
  out: 'cubic-bezier(.2,.7,.2,1)',      // 들어오는 것 — 빨리 출발해 부드럽게 멈춤
  in: 'cubic-bezier(.4,0,1,1)',         // 나가는 것 — 짧게
  move: 'cubic-bezier(.65,0,.35,1)',    // 자리 옮김
};
const off = () => reduce.matches;
const inView = r => r.bottom > 0 && r.top < innerHeight;

// 같은 문서 화면 전환(View Transitions) — kind 는 html[data-vt] 로 CSS 에 넘겨 종류별 움직임을 고른다.
// names: [[바꾸기 전 요소 고르기, 바꾼 뒤 요소 고르기, 이름]] — 같은 이름끼리 옛 자리 → 새 자리로 옮겨 간다
export function vt(kind, update, names = []) {
  if (off() || !document.startViewTransition || document.visibilityState !== 'visible') { update(); return null; }
  const root = document.documentElement;
  const tag = (el, n) => { if (el) el.style.viewTransitionName = n; };
  for (const [before, , n] of names) tag(before(), n);
  root.dataset.vt = kind;
  const t = document.startViewTransition(() => {
    for (const [before] of names) tag(before(), '');
    update();
    for (const [, after, n] of names) tag(after(), n);
  });
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => {
    for (const [, after] of names) tag(after(), '');
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
  return t;
}

// 목록 갱신 — 남는 항목은 옛 자리에서 새 자리로 미끄러지고, 새 항목은 옅게 나타난다.
// move: 자리를 옮길 항목, enter: 새로 나타나면 옅게 보일 항목(move 안쪽 줄 포함)
export function flipList(container, { move, enter = move, key }, mutate) {
  if (off() || !container) { mutate(); return; }
  const before = new Map(), had = new Set();
  for (const el of container.querySelectorAll(move)) { const k = key(el); if (k != null) before.set(k, el.getBoundingClientRect()); }
  for (const el of container.querySelectorAll(enter)) { const k = key(el); if (k != null) had.add(k); }
  mutate();
  for (const el of container.querySelectorAll(move)) {
    const r0 = before.get(key(el));
    if (!r0) continue;
    const r = el.getBoundingClientRect(), dy = r0.top - r.top;
    if (Math.abs(dy) > .5 && (inView(r) || inView(r0))) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 300, easing: EASE.move });
  }
  // 새 항목은 차례 없이 한 번에 옅게 — 필터를 여러 번 눌러도 정신없지 않게
  for (const el of container.querySelectorAll(enter)) {
    const k = key(el);
    if (k == null || had.has(k) || !inView(el.getBoundingClientRect())) continue;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE.out });
  }
}

// 칩 줄(적용 필터) — 새 칩은 작게 튀어나오고, 빠진 칩은 그 자리에서 오므라들며, 옆 칩은 빈자리로 미끄러진다.
// 같은 칩인데 글자만 바뀌면(6모 → 6모·9모) 폭이 늘어난다
export function flipChips(container, { item, key }, mutate) {
  if (off() || !container) { mutate(); return; }
  const before = new Map();
  for (const el of container.querySelectorAll(item)) before.set(key(el), { r: el.getBoundingClientRect(), el: el.cloneNode(true) });
  mutate();
  const seen = new Set();
  for (const el of container.querySelectorAll(item)) {
    const k = key(el), b = before.get(k), r = el.getBoundingClientRect();
    seen.add(k);
    if (!b) {
      el.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE.out });
      continue;
    }
    const dx = b.r.left - r.left, dy = b.r.top - r.top;
    const kf = [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }];
    if (Math.abs(b.r.width - r.width) > 1) { kf[0].width = `${b.r.width}px`; kf[1].width = `${r.width}px`; }
    if (kf[0].width || Math.abs(dx) > .5 || Math.abs(dy) > .5) el.animate(kf, { duration: 260, easing: EASE.move });
  }
  // 빠진 칩 — 옛 자리에 복제본을 띄워 오므라뜨린다(실제 칩은 이미 없음)
  for (const [k, b] of before) {
    if (seen.has(k) || !b.r.width) continue;
    const g = b.el;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const c = container.getBoundingClientRect();
    Object.assign(g.style, { position: 'absolute', left: `${b.r.left - c.left}px`, top: `${b.r.top - c.top}px`, margin: 0, pointerEvents: 'none' });
    g.setAttribute('aria-hidden', 'true');
    container.appendChild(g);
    g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 140, easing: EASE.in, fill: 'forwards' })
      .finished.catch(() => {}).finally(() => g.remove());
  }
}

// 숫자 굴리기 — 결과 건수처럼 바뀐 양이 의미 있는 숫자는 옛 값에서 새 값으로 굴러간다
const lastCount = new WeakMap();
export function countTo(el, to, fmt) {
  const from = lastCount.get(el);
  lastCount.set(el, to);
  cancelAnimationFrame(el._countRaf);
  if (off() || from == null || from === to || !inView(el.getBoundingClientRect())) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), d = 280;
  const step = now => {
    const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (p < 1) el._countRaf = requestAnimationFrame(step);
  };
  el._countRaf = requestAnimationFrame(step);
}

// 높이가 바뀌는 묶음(세부 시험이 열림·학년도 더보기·영역 펼침) — 아래 내용이 툭 밀리지 않고 따라 내려간다
export function resize(el, mutate, duration = 260) {
  if (off() || !el) { mutate(); return; }
  const from = el.offsetHeight;
  mutate();
  const to = el.offsetHeight;
  if (Math.abs(from - to) < 1) return;
  el.style.overflow = 'clip';
  el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: EASE.out })
    .finished.catch(() => {}).finally(() => { el.style.overflow = ''; });
}

// 밑줄 하나 — 탭이 바뀌면 사라졌다 생기지 않고 옆 탭 밑으로 옮겨 간다(폭도 글자에 맞춰 늘고 줄어듦)
export function underline(row, activeSel, { inset = 0 } = {}) {
  let ink = row.querySelector(':scope > .ink-bar');
  if (!ink) {
    ink = document.createElement('span');
    ink.className = 'ink-bar';
    ink.setAttribute('aria-hidden', 'true');
    row.appendChild(ink);
  }
  const place = (animate) => {
    const a = row.querySelector(activeSel);
    if (!a) { ink.style.opacity = '0'; return; }
    const left = a.offsetLeft + inset, width = a.offsetWidth - inset;
    const was = { left: ink.offsetLeft, width: ink.offsetWidth };
    ink.style.opacity = '1';
    ink.style.left = `${left}px`;
    ink.style.width = `${width}px`;
    if (animate && !off() && was.width && (was.left !== left || was.width !== width)) {
      ink.animate([{ left: `${was.left}px`, width: `${was.width}px` }, { left: `${left}px`, width: `${width}px` }],
        { duration: 340, easing: EASE.move });
    }
  };
  place(false);
  addEventListener('resize', () => place(false), { passive: true });
  return place;
}

// 폰: 결과 위에서 옆으로 밀면 옆 탭으로 — 가로로 스크롤되는 줄(칩·과목 줄) 위에서는 무시
export function onSwipe(el, cb) {
  let x0 = 0, y0 = 0, t0 = 0, ok = false;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { ok = false; return; }
    const t = e.touches[0];
    ok = !e.target.closest('.hscroll, .active-tags, input, .selbar, [data-no-swipe]');
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!ok) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 < 600 && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.8) cb(dx < 0 ? 1 : -1);
  }, { passive: true });
}
