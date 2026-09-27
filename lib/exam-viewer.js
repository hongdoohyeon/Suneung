'use strict';
// 시험지 뷰어 — PDF 페이지 + 필기 레이어(펜 3색·지우개·실행취소) + 확대/이동 + 전체화면.
//
// · 필기 좌표는 페이지 크기에 대한 비율(0~1)로 저장 → 확대·화면 크기와 무관하게 같은 자리.
// · 저장: localStorage 'kicegg:ink:v1:{key}' (이 기기에만).
// · 애플펜슬: 펜이 한 번 감지되면 손가락은 이동 전용(손바닥 오인 방지).
//   펜이 없는 기기(폰)는 펜 도구에서 손가락으로 필기, 두 손가락으로 이동·확대.
// · 확대 중에는 CSS 로 늘려 보여 주고, 손을 떼면 해상도에 맞춰 다시 그린다.

const COLORS = { black: '#1a1a1a', red: '#e5484d', blue: '#2563eb' };
const PEN_W = 2.2;            // 쪽 맞춤(100%) 기준 CSS px
const ERASER_R = 14;          // 지우개 반경 CSS px
const MIN_ZOOM = 0.6, MAX_ZOOM = 4;
const MAX_CANVAS_PX = 4096;   // PDF 캔버스 최대 폭(px) — 태블릿 메모리 보호

const ICON = {
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.9-2.6L3.2 15a1.6 1.6 0 0 1 2.5-2l1.3 1.4"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L12 20m-5 1h14M9 11l6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
};
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export async function mountViewer({ pdf, container, metaEl, inkKey }) {
  const preview = container.closest('.preview') || container.parentElement;
  const head = preview.querySelector('.preview__head');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const total = pdf.numPages;
  if (metaEl) metaEl.textContent = `${total}쪽`;

  // ── 상태 ──
  const storeKey = inkKey ? `kicegg:ink:v1:${inkKey}` : null;
  let ink = {};                      // { [pageNo]: [{c, w, p:[x,y,...]}] }
  try { if (storeKey) ink = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch { ink = {}; }
  const undoStack = [];
  let tool = 'hand', color = 'black';
  let zoom = 1, penSeen = false;
  const pages = [];
  let pinch = null;                  // 두 손가락 확대 중                  // { n, page, base:{w,h}, wrap, pdfCanvas, inkCanvas, renderedScale }

  // ── 도구 막대 ──
  const bar = document.createElement('div');
  bar.className = 'pv-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '시험지 도구');
  bar.innerHTML = `
    <div class="pv-bar__group" role="group" aria-label="도구">
      <button type="button" class="pv-btn" data-tool="hand" aria-pressed="true" title="이동">${svg(ICON.hand)}<span>이동</span></button>
      <button type="button" class="pv-btn pv-pen" data-tool="pen" data-color="black" aria-pressed="false" title="검정 펜"><i style="--pen:${COLORS.black}"></i><span class="sr-only">검정 펜</span></button>
      <button type="button" class="pv-btn pv-pen" data-tool="pen" data-color="red" aria-pressed="false" title="빨강 펜"><i style="--pen:${COLORS.red}"></i><span class="sr-only">빨강 펜</span></button>
      <button type="button" class="pv-btn pv-pen" data-tool="pen" data-color="blue" aria-pressed="false" title="파랑 펜"><i style="--pen:${COLORS.blue}"></i><span class="sr-only">파랑 펜</span></button>
      <button type="button" class="pv-btn" data-tool="eraser" aria-pressed="false" title="지우개">${svg(ICON.eraser)}<span>지우개</span></button>
    </div>
    <div class="pv-bar__group" role="group" aria-label="편집">
      <button type="button" class="pv-btn" data-act="undo" title="실행취소" disabled>${svg(ICON.undo)}<span class="sr-only">실행취소</span></button>
      <button type="button" class="pv-btn" data-act="clear" title="필기 모두 지우기">${svg(ICON.trash)}<span class="sr-only">필기 모두 지우기</span></button>
    </div>
    <div class="pv-bar__group pv-bar__zoom" role="group" aria-label="확대">
      <button type="button" class="pv-btn" data-act="out" aria-label="축소">−</button>
      <button type="button" class="pv-btn pv-pct" data-act="fit" aria-label="쪽 맞춤·폭 맞춤 전환">100%</button>
      <button type="button" class="pv-btn" data-act="in" aria-label="확대">+</button>
      <button type="button" class="pv-btn" data-act="full" aria-label="전체화면">${svg(ICON.full)}</button>
    </div>`;
  preview.querySelector('.pv-bar')?.remove();   // 다시 시도 시 중복 방지
  head.insertAdjacentElement('afterend', bar);
  const pctEl = bar.querySelector('.pv-pct');
  const undoBtn = bar.querySelector('[data-act="undo"]');
  const fullBtn = bar.querySelector('[data-act="full"]');

  container.innerHTML = '';
  container.classList.add('pv-viewer');
  const hint = document.createElement('p');
  hint.className = 'pv-hint';
  hint.hidden = true;
  preview.appendChild(hint);
  let hintTimer = 0;
  function showHint(text) {
    hint.textContent = text; hint.hidden = false;
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.hidden = true; }, 2600);
  }

  // ── 크기 계산 ──
  function viewportBox() {
    const cs = getComputedStyle(container);
    const w = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const full = preview.classList.contains('is-full');
    const h = full ? container.clientHeight - 24
      : Math.max(420, (window.visualViewport?.height || window.innerHeight) - 150);
    return { w: Math.max(200, w), h };
  }
  function fitScale(p, mode = 'page') {
    const vb = viewportBox();
    const vw = p.page.getViewport({ scale: 1 });
    return mode === 'width' ? Math.min(3, vb.w / vw.width) : Math.min(2, vb.w / vw.width, vb.h / vw.height);
  }
  let baseScale = 1;   // 1쪽 기준 쪽 맞춤 스케일 — 모든 쪽에 같게 적용(쪽 크기 동일 가정)

  function cssSize(p) { return { w: p.base.w * baseScale * zoom, h: p.base.h * baseScale * zoom }; }

  function layout(p) {
    const { w, h } = cssSize(p);
    p.wrap.style.width = `${w}px`;
    p.wrap.style.height = `${h}px`;
    p.inkCanvas.width = Math.round(w * dpr);
    p.inkCanvas.height = Math.round(h * dpr);
    drawInk(p);
  }

  async function renderPdfCanvas(p) {
    const { w } = cssSize(p);
    const scale = Math.min(w * dpr, MAX_CANVAS_PX) / p.base.w;
    if (p.renderedScale && Math.abs(p.renderedScale - scale) / scale < 0.08) return;
    const vp = p.page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.className = 'pv-pdf';
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await p.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (p.pdfCanvas) p.pdfCanvas.replaceWith(canvas); else p.wrap.prepend(canvas);
    p.pdfCanvas = canvas;
    p.renderedScale = scale;
  }

  async function addPage(n, before = null) {
    const page = await pdf.getPage(n);
    const vw = page.getViewport({ scale: 1 });
    const wrap = document.createElement('div');
    wrap.className = 'pv-page';
    wrap.dataset.page = n;
    const inkCanvas = document.createElement('canvas');
    inkCanvas.className = 'pv-ink';
    wrap.appendChild(inkCanvas);
    const p = { n, page, base: { w: vw.width, h: vw.height }, wrap, inkCanvas, pdfCanvas: null, renderedScale: 0 };
    if (!pages.length) baseScale = fitScale(p);
    pages.push(p);
    container.insertBefore(wrap, before);
    layout(p);
    await renderPdfCanvas(p);
    bindInk(p);
    return p;
  }

  // ── 필기 그리기 ──
  function drawStroke(ctx, s, w, h) {
    const pts = s.p;
    if (pts.length < 2) return;
    ctx.strokeStyle = COLORS[s.c] || s.c;
    ctx.lineWidth = Math.max(0.6, s.w * w);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0] * w, pts[1] * h);
    if (pts.length === 2) { ctx.lineTo(pts[0] * w + 0.01, pts[1] * h); }
    for (let i = 2; i < pts.length - 2; i += 2) {   // 중점 곡선으로 부드럽게
      const mx = (pts[i] + pts[i + 2]) / 2 * w, my = (pts[i + 1] + pts[i + 3]) / 2 * h;
      ctx.quadraticCurveTo(pts[i] * w, pts[i + 1] * h, mx, my);
    }
    ctx.lineTo(pts[pts.length - 2] * w, pts[pts.length - 1] * h);
    ctx.stroke();
  }
  function drawInk(p) {
    const ctx = p.inkCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = cssSize(p);
    ctx.clearRect(0, 0, w, h);
    for (const s of ink[p.n] || []) drawStroke(ctx, s, w, h);
  }

  let saveTimer = 0;
  function save() {
    if (!storeKey) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const has = Object.values(ink).some(a => a.length);
        if (has) localStorage.setItem(storeKey, JSON.stringify(ink)); else localStorage.removeItem(storeKey);
      } catch { showHint('저장 공간이 부족해 필기를 저장하지 못했어요'); }
    }, 300);
  }
  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > 200) undoStack.shift();
    undoBtn.disabled = false;
  }

  function hitErase(p, x, y) {
    const { w, h } = cssSize(p);
    const r = ERASER_R;
    const list = ink[p.n] || [];
    const removed = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const pts = list[i].p;
      for (let j = 0; j < pts.length; j += 2) {
        const dx = pts[j] * w - x, dy = pts[j + 1] * h - y;
        if (dx * dx + dy * dy <= r * r) { removed.push({ i, s: list[i] }); list.splice(i, 1); break; }
      }
    }
    if (removed.length) { pushUndo({ t: 'erase', n: p.n, items: removed.reverse() }); drawInk(p); save(); }
  }

  let cur = null;   // 그리는 중인 선 (한 번에 하나)
  function cancelStroke() {
    if (!cur) return;
    const p = cur.page;
    cur = null;
    drawInk(p);
  }
  function notePen() {
    if (penSeen) return;
    penSeen = true;
    container.classList.add('pen-seen');
  }

  function bindInk(p) {
    const c = p.inkCanvas;
    // iPad 사파리는 펜슬로도 화면을 스크롤한다 → 필기 도구일 때 펜슬 터치는 스크롤을 막는다
    c.addEventListener('touchstart', e => {
      if (tool === 'hand') return;
      const stylus = [...e.changedTouches].some(t => t.touchType === 'stylus');
      if (stylus) notePen();
      if ((stylus || !penSeen) && e.touches.length === 1) e.preventDefault();
    }, { passive: false });
    c.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') notePen();
      if (tool === 'hand' || pinch) return;
      if (e.pointerType === 'touch' && penSeen) return;          // 펜슬 사용 중엔 손가락 = 이동
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (cur) { cancelStroke(); return; }                         // 두 번째 손가락 → 제스처
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (tool === 'eraser') { cur = { page: p, id: e.pointerId, erase: true }; hitErase(p, x, y); return; }
      const { w, h } = cssSize(p);
      const pr = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cur = { page: p, id: e.pointerId, c: color, w: (PEN_W * (0.7 + pr * 0.6)) / (p.base.w * baseScale), p: [+(x / w).toFixed(4), +(y / h).toFixed(4)], ctx, lx: x, ly: y };
    });
    c.addEventListener('pointermove', e => {
      if (!cur || cur.page !== p || cur.id !== e.pointerId) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) {
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        if (cur.erase) { hitErase(p, x, y); continue; }
        const { w, h } = cssSize(p);
        const ctx = cur.ctx;
        ctx.strokeStyle = COLORS[cur.c];
        ctx.lineWidth = cur.w * w;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cur.lx, cur.ly); ctx.lineTo(x, y); ctx.stroke();
        cur.lx = x; cur.ly = y;
        cur.p.push(+(x / w).toFixed(4), +(y / h).toFixed(4));
      }
    });
    const end = e => {
      if (!cur || cur.page !== p || cur.id !== e.pointerId) return;
      if (!cur.erase && e.type === 'pointerup') {
        (ink[p.n] ||= []).push({ c: cur.c, w: +cur.w.toFixed(5), p: cur.p });
        pushUndo({ t: 'add', n: p.n });
        save();
      }
      cur = null;
      drawInk(p);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  function undo() {
    const u = undoStack.pop();
    if (!u) return;
    const list = (ink[u.n] ||= []);
    if (u.t === 'add') list.pop();
    else if (u.t === 'erase') for (const { i, s } of u.items) list.splice(i, 0, s);
    else if (u.t === 'clear') ink = u.prev;
    undoBtn.disabled = !undoStack.length;
    pages.forEach(drawInk);
    save();
  }

  // ── 도구 전환 ──
  function setTool(t, c) {
    tool = t; if (c) color = c;
    bar.querySelectorAll('[data-tool]').forEach(b => {
      const on = b.dataset.tool === t && (t !== 'pen' || b.dataset.color === color);
      b.setAttribute('aria-pressed', String(on));
    });
    container.dataset.tool = t;
    if (t !== 'hand' && !penSeen && matchMedia('(pointer: coarse)').matches) {
      showHint('손가락으로 필기해요 · 이동은 두 손가락으로');
    }
  }

  // 세로 이동 — 일반 모드는 문서가, 전체화면은 뷰어가 세로로 넘어간다
  function panBy(dx, dy) {
    container.scrollLeft += dx;
    if (container.scrollHeight > container.clientHeight + 1) container.scrollTop += dy;
    else window.scrollBy(0, dy);
  }

  // ── 확대 ──
  let crispTimer = 0;
  function setZoom(z, anchor) {
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    const old = zoom;
    if (Math.abs(z - old) < 0.001) return;
    const ax = anchor ? anchor.x : container.clientWidth / 2;
    const ay = anchor ? anchor.y : container.clientHeight / 2;
    const sx = container.scrollLeft + ax, sy = container.scrollTop + ay;
    const vScroll = container.scrollHeight > container.clientHeight + 1;
    zoom = z;
    pages.forEach(p => {
      layout(p);
      if (p.pdfCanvas) { p.pdfCanvas.style.width = '100%'; p.pdfCanvas.style.height = '100%'; }
    });
    const ratio = z / old;
    container.scrollLeft = sx * ratio - ax;
    if (vScroll || preview.classList.contains('is-full')) container.scrollTop = sy * ratio - ay;
    else window.scrollBy(0, ay * (ratio - 1));
    pctEl.textContent = `${Math.round(zoom * 100)}%`;
    clearTimeout(crispTimer);
    crispTimer = setTimeout(() => pages.forEach(p => renderPdfCanvas(p).catch(() => {})), 160);
  }
  function toggleFit() {
    const widthZoom = pages[0] ? fitScale(pages[0], 'width') / baseScale : 1;
    setZoom(Math.abs(zoom - 1) < 0.02 && widthZoom > 1.05 ? widthZoom : 1);
  }

  // 두 손가락 확대·이동 (터치) — 브라우저 확대는 CSS touch-action 으로 막고 직접 처리
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const mid = (a, b, r) => ({ x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top });
  container.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      cancelStroke();
      const r = container.getBoundingClientRect();
      pinch = { d: dist(e.touches[0], e.touches[1]), z: zoom, m: mid(e.touches[0], e.touches[1], r) };
    }
  }, { passive: true });
  container.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const r = container.getBoundingClientRect();
    const m = mid(e.touches[0], e.touches[1], r);
    panBy(pinch.m.x - m.x, pinch.m.y - m.y);
    pinch.m = m;
    setZoom(pinch.z * dist(e.touches[0], e.touches[1]) / pinch.d, m);
  }, { passive: false });
  container.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  // 손가락·마우스 끌어서 이동 (이동 도구, 또는 펜슬 사용 중 손가락)
  let drag = null, lastTap = 0, lastTapPos = null, lastType = 'mouse';
  container.addEventListener('pointerdown', e => {
    lastType = e.pointerType;
    const handPan = tool === 'hand' || (e.pointerType === 'touch' && penSeen);
    if (!handPan || pinch || e.target.closest('.preview__more')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 두 번 탭 → 2배 확대 / 원래대로
    const now = Date.now();
    const r = container.getBoundingClientRect();
    const pos = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (e.pointerType !== 'mouse' && now - lastTap < 300 && lastTapPos && Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y) < 30) {
      setZoom(zoom > 1.3 ? 1 : 2, pos); lastTap = 0; return;
    }
    lastTap = now; lastTapPos = pos;
    if (e.pointerType === 'mouse' && tool === 'hand') {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      container.classList.add('is-dragging');
    }
  });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    panBy(drag.x - e.clientX, drag.y - e.clientY);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; container.classList.remove('is-dragging'); };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  container.addEventListener('dblclick', e => {
    if (tool !== 'hand' || lastType !== 'mouse') return;
    const r = container.getBoundingClientRect();
    setZoom(zoom > 1.3 ? 1 : 2, { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  // 트랙패드 핀치·Ctrl+휠
  container.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = container.getBoundingClientRect();
    setZoom(zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  // ── 전체화면 (CSS 고정 — 아이폰 사파리도 동작) ──
  function setFull(on) {
    preview.classList.toggle('is-full', on);
    document.body.classList.toggle('pv-lock', on);
    fullBtn.innerHTML = svg(on ? ICON.exit : ICON.full);
    fullBtn.setAttribute('aria-label', on ? '전체화면 끝내기' : '전체화면');
    requestAnimationFrame(() => {
      if (pages[0]) baseScale = fitScale(pages[0]);
      zoom = 1.0001; setZoom(1);
    });
  }

  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) return setTool(b.dataset.tool, b.dataset.color);
    const a = b.dataset.act;
    if (a === 'undo') undo();
    else if (a === 'clear') {
      if (!Object.values(ink).some(v => v.length)) return;
      if (!confirm('이 시험지의 필기를 모두 지울까요?')) return;
      pushUndo({ t: 'clear', prev: JSON.parse(JSON.stringify(ink)) });
      ink = {}; pages.forEach(drawInk); save();
    }
    else if (a === 'in') setZoom(zoom * 1.25);
    else if (a === 'out') setZoom(zoom / 1.25);
    else if (a === 'fit') toggleFit();
    else if (a === 'full') setFull(!preview.classList.contains('is-full'));
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches?.('input, textarea, [contenteditable="true"]')) return;
    if (!container.isConnected || !container.offsetParent) return;
    if (e.key === 'Escape' && preview.classList.contains('is-full')) { setFull(false); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { setZoom(zoom * 1.25); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { setZoom(zoom / 1.25); e.preventDefault(); }
    else if (e.key === '0') { setZoom(1); e.preventDefault(); }
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (pages[0]) { baseScale = fitScale(pages[0]); zoom = 1.0001; setZoom(1); } }, 200);
  });

  // ── 첫 쪽 + 나머지 쪽 ──
  const first = await addPage(1);
  first.pdfCanvas?.classList.add('preview__page--ready');
  setTool('hand');
  if (Object.keys(ink).length) showHint('저장된 필기를 불러왔어요');
  if (total > 1) {
    const more = document.createElement('button');
    more.className = 'preview__more';
    more.type = 'button';
    more.textContent = `나머지 ${total - 1}쪽 펼치기`;
    more.addEventListener('click', async () => {
      more.disabled = true;
      more.textContent = '불러오는 중…';
      try {
        for (let i = pages.length + 1; i <= total; i++) await addPage(i, more);
        more.remove();
      } catch (err) {
        more.disabled = false;
        more.textContent = '나머지 페이지 다시 불러오기';
      }
    });
    container.appendChild(more);
    // 필기가 저장된 뒤쪽이 있으면 바로 펼쳐 둔다
    if (Object.keys(ink).some(n => Number(n) > 1 && ink[n].length)) more.click();
  }
}
