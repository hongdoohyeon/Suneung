'use strict';
// 모션 — 사용자가 한 행동의 '방향·원인'을 따라 움직인다 (2026-10 시안)
//  · 가로 = 같은 층위 이동(시험 종류 탭·페이지 넘김·상세 탭) — 실제 놓인 순서 방향으로 밀린다
//  · 세로 = 펼침·접힘 / 목록 갱신은 남는 것은 그대로, 새 것만 옅게
//  · 결과는 원인 자리에서 나온다(필터 칩이 생기고 빠짐) — 화려한 효과·넓은 면적의 움직임은 쓰지 않는다
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

// 목록 갱신 — 남는 회차·줄은 움직이지 않고(위아래로 미끄러지면 어지러움) 새로 생긴 것만 짧게 옅게 나타난다.
// enter: 새로 나타나면 옅게 보일 항목
export function flipList(container, { enter, key }, mutate) {
  if (off() || !container) { mutate(); return; }
  const had = new Set();
  for (const el of container.querySelectorAll(enter)) { const k = key(el); if (k != null) had.add(k); }
  mutate();
  for (const el of container.querySelectorAll(enter)) {
    const k = key(el);
    if (k == null || had.has(k) || !inView(el.getBoundingClientRect())) continue;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: EASE.out });
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
