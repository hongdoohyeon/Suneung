'use strict';
// 시험지 뷰어 — 화면 두 가지.
//
// · 미리보기(기본): 문서 스크롤 그대로 보고, 필기는 보이기만 한다.
// · 풀이 모드(전체화면): 펜을 고르거나 펜슬이 닿으면 들어간다. 브라우저 스크롤을 쓰지 않고
//   이동·확대를 직접 처리해 필기하는 동안 화면이 멋대로 움직이지 않는다.
//   - 애플펜슬 = 필기, 손가락 = 이동·확대. 펜슬로 쓰는 중·직후의 손바닥 터치는 무시.
//   - 펜슬 없는 기기(폰): 펜 도구에서 한 손가락 필기, 두 손가락 이동·확대.
//   - 확대는 제스처 중엔 CSS 로 늘려 보여 주고, 손을 떼면 한 번 선명하게 다시 그린다.
// · 필기 좌표는 쪽 크기 비율(0~1) → localStorage 'kicegg:ink:v1:{key}' (이 기기에만).

const COLORS = { black: '#1a1a1a', red: '#e5484d', blue: '#2563eb' };
const PEN_REL = 0.0032;       // 펜 굵기 — 쪽 폭 대비(A4 기준 약 2pt)
const ERASER_R = 14;          // 지우개 반경 CSS px
const MIN_ZOOM = 0.5, MAX_ZOOM = 6;
const MAX_AREA = 8e6;         // 캔버스 한 장 최대 픽셀 수 — 모바일 메모리 보호(사파리 한도 16.7M)
const PALM_MS = 500;          // 펜슬을 뗀 뒤 손바닥 터치를 무시하는 시간
const PEN_PREF = 'kicegg:ink-pen';

const ICON = {
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.9-2.6L3.2 15a1.6 1.6 0 0 1 2.5-2l1.3 1.4"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L12 20m-5 1h14M9 11l6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
};
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const clampZ = z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

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
  let tool = 'hand';
  let color = 'black';
  try { if (COLORS[localStorage.getItem(PEN_PREF)]) color = localStorage.getItem(PEN_PREF); } catch {}
  let zoom = 1;                      // 쪽 맞춤 대비 배율(확정값)
  let baseScale = 1;                 // 쪽 맞춤 스케일(PDF pt → CSS px)
  let full = false, penSeen = false;
  let g = 1;                         // 풀이 모드: 제스처 중 임시 배율(손 떼면 zoom 에 합침)
  const cam = { x: 0, y: 0 };        // 풀이 모드: 판 위치
  let padK = 0;                      // 풀이 모드: 여백 = padK × zoom (배율에 비례해야 확정 시 위치가 안 튄다)
  const pages = [];                  // { n, page, base:{w,h}, wrap, pdfCanvas, inkCanvas, ctx, renderedScale, visible }

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
      <button type="button" class="pv-btn" data-act="full" aria-label="풀이 모드">${svg(ICON.full)}</button>
    </div>`;
  preview.querySelector('.pv-bar')?.remove();   // 다시 시도 시 중복 방지
  head.insertAdjacentElement('afterend', bar);
  const pctEl = bar.querySelector('.pv-pct');
  const undoBtn = bar.querySelector('[data-act="undo"]');
  const fullBtn = bar.querySelector('[data-act="full"]');

  container.innerHTML = '';
  container.classList.add('pv-viewer');
  const sheet = document.createElement('div');
  sheet.className = 'pv-sheet';
  container.appendChild(sheet);
  const hint = document.createElement('p');
  hint.className = 'pv-hint';
  hint.hidden = true;
  preview.appendChild(hint);
  let hintTimer = 0;
  function showHint(text) {
    hint.textContent = text; hint.hidden = false;
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.hidden = true; }, 2600);
  }

  // ── 크기 ──
  function stageBox() {
    if (full) return { w: container.clientWidth, h: container.clientHeight };
    const cs = getComputedStyle(container);
    const w = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { w: Math.max(200, w), h: Math.max(420, (window.visualViewport?.height || window.innerHeight) - 150) };
  }
  function fitPage(p) {
    const b = stageBox(), m = full ? 32 : 0;
    return Math.min(2, (b.w - m) / p.base.w, (b.h - m) / p.base.h);
  }
  // 폭 맞춤 배율(쪽 맞춤 대비)
  function widthZoom() {
    const p = pages[0];
    if (!p) return 1;
    const b = stageBox(), m = full ? 32 : 0;
    return Math.min(3, (b.w - m) / p.base.w) / baseScale;
  }
  function cssSize(p) { return { w: p.base.w * baseScale * zoom, h: p.base.h * baseScale * zoom }; }
  function pxRatio(w, h) { return Math.min(dpr, Math.sqrt(MAX_AREA / (w * h))); }

  // 쪽 틀 크기는 항상 맞추고, 캔버스 메모리는 화면 근처 쪽에만 잡는다
  function layout(p) {
    const { w, h } = cssSize(p);
    p.wrap.style.width = `${w}px`;
    p.wrap.style.height = `${h}px`;
    if (!p.visible) { p.inkCanvas.width = p.inkCanvas.height = 0; return; }
    const s = pxRatio(w, h);
    p.inkCanvas.width = Math.round(w * s);
    p.inkCanvas.height = Math.round(h * s);
    drawInk(p);
  }
  function relayoutAll() {
    if (full) {
      const pad = padK * zoom;
      sheet.style.padding = `${pad}px`;
      sheet.style.gap = `${pad * 0.75}px`;
    } else {
      sheet.style.padding = sheet.style.gap = '';
    }
    pages.forEach(layout);
  }

  // 화면 밖 쪽은 쪽 맞춤 해상도로 낮춰 둔다(확대한 채 넘겨도 메모리가 쌓이지 않게)
  async function renderPdfCanvas(p) {
    const fit = { w: p.base.w * baseScale, h: p.base.h * baseScale };
    const { w, h } = p.visible ? cssSize(p) : fit;
    const scale = w * pxRatio(w, h) / p.base.w;
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
  let crispTimer = 0;
  function crispSoon() {
    clearTimeout(crispTimer);
    crispTimer = setTimeout(() => pages.forEach(p => { if (p.visible) renderPdfCanvas(p).catch(() => {}); }), 160);
  }

  // 화면(위아래 한 화면 여유) 근처에 들어온 쪽만 고해상도·필기 캔버스를 유지
  const seen = new IntersectionObserver(entries => {
    for (const en of entries) {
      const p = pages.find(x => x.wrap === en.target);
      if (!p || p.visible === en.isIntersecting) continue;
      p.visible = en.isIntersecting;
      if (!p.visible && stroke && stroke.page === p) cancelStroke();
      layout(p);
      renderPdfCanvas(p).catch(() => {});
    }
  }, { rootMargin: '100% 0px' });

  async function addPage(n) {
    const page = await pdf.getPage(n);
    const vw = page.getViewport({ scale: 1 });
    const wrap = document.createElement('div');
    wrap.className = 'pv-page';
    wrap.dataset.page = n;
    const inkCanvas = document.createElement('canvas');
    inkCanvas.className = 'pv-ink';
    wrap.appendChild(inkCanvas);
    const p = { n, page, base: { w: vw.width, h: vw.height }, wrap, inkCanvas, pdfCanvas: null, renderedScale: 0, visible: true };
    p.ctx = inkCanvas.getContext('2d', { desynchronized: true });   // 지원 브라우저에선 필기 지연 감소
    if (!pages.length) baseScale = fitPage(p);
    sheet.insertBefore(wrap, more && more.isConnected ? more : null);
    layout(p);
    try { await renderPdfCanvas(p); }
    catch (err) { wrap.remove(); throw err; }     // 실패한 쪽은 되돌려서 '다시 불러오기'가 이 쪽부터
    pages.push(p);
    seen.observe(wrap);
    return p;
  }

  // ── 필기 그리기 ──
  // 그리는 중과 손 뗀 뒤 다시 그릴 때 같은 곡선(중점 2차 곡선)을 써서 모양이 바뀌지 않게 한다.
  function drawStroke(ctx, s, W, H) {
    const q = s.p, n = q.length / 2;
    if (!n) return;
    ctx.strokeStyle = ctx.fillStyle = COLORS[s.c] || s.c;
    ctx.lineWidth = Math.max(0.8, s.w * W);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (n === 1) {
      ctx.beginPath(); ctx.arc(q[0] * W, q[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(q[0] * W, q[1] * H);
    ctx.lineTo((q[0] + q[2]) / 2 * W, (q[1] + q[3]) / 2 * H);
    for (let i = 1; i < n - 1; i++) {
      const x = q[i * 2], y = q[i * 2 + 1], nx = q[i * 2 + 2], ny = q[i * 2 + 3];
      ctx.quadraticCurveTo(x * W, y * H, (x + nx) / 2 * W, (y + ny) / 2 * H);
    }
    ctx.lineTo(q[n * 2 - 2] * W, q[n * 2 - 1] * H);
    ctx.stroke();
  }
  function drawInk(p) {
    const c = p.inkCanvas;
    if (!c.width) return;
    p.ctx.setTransform(1, 0, 0, 1, 0, 0);
    p.ctx.clearRect(0, 0, c.width, c.height);
    for (const s of ink[p.n] || []) drawStroke(p.ctx, s, c.width, c.height);
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

  function eraseAt(p, nx, ny, rectW) {
    const r = ERASER_R / rectW, aspect = p.base.h / p.base.w;
    const list = ink[p.n] || [];
    const removed = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i].p;
      for (let j = 0; j < q.length; j += 2) {
        const dx = q[j] - nx, dy = (q[j + 1] - ny) * aspect;
        if (dx * dx + dy * dy <= r * r) { removed.push({ i, s: list[i] }); list.splice(i, 1); break; }
      }
    }
    if (removed.length) { pushUndo({ t: 'erase', n: p.n, items: removed.reverse() }); drawInk(p); save(); }
  }

  // ── 필기 입력 ──
  let stroke = null;                 // 그리는 중인 선 (한 번에 하나)
  let lastPenUp = 0;
  function pageAt(x, y) {
    for (const p of pages) {
      const r = p.wrap.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { p, r };
    }
    return null;
  }
  function startStroke(e) {
    const hit = pageAt(e.clientX, e.clientY);
    if (!hit || !hit.p.visible) return false;
    const { p, r } = hit;
    const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    container.setPointerCapture?.(e.pointerId);
    if (tool === 'eraser') {
      stroke = { page: p, id: e.pointerId, ptype: e.pointerType, erase: true, x: e.clientX, y: e.clientY };
      eraseAt(p, nx, ny, r.width);
      return true;
    }
    stroke = { page: p, id: e.pointerId, ptype: e.pointerType, c: color, w: PEN_REL, p: [+nx.toFixed(4), +ny.toFixed(4)], x: e.clientX, y: e.clientY };
    return true;
  }
  function extendStroke(e) {
    const p = stroke.page;
    const r = p.wrap.getBoundingClientRect();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const c = p.inkCanvas, W = c.width, H = c.height;
    for (const ev of evs.length ? evs : [e]) {
      stroke.x = ev.clientX; stroke.y = ev.clientY;
      const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
      if (stroke.erase) { eraseAt(p, nx, ny, r.width); continue; }
      const q = stroke.p, n = q.length / 2;
      const lx = q[q.length - 2], ly = q[q.length - 1];
      if (Math.hypot((nx - lx) * r.width, (ny - ly) * r.height) < 0.75) continue;   // 떨림 무시
      q.push(+nx.toFixed(4), +ny.toFixed(4));
      // 방금 확정된 구간만 이어 그린다 — drawStroke 와 같은 곡선
      const ctx = p.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = COLORS[stroke.c];
      ctx.lineWidth = Math.max(0.8, stroke.w * W);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (n === 1) {
        ctx.moveTo(lx * W, ly * H);
        ctx.lineTo((lx + nx) / 2 * W, (ly + ny) / 2 * H);
      } else {
        const px = q[q.length - 6], py = q[q.length - 5];
        ctx.moveTo((px + lx) / 2 * W, (py + ly) / 2 * H);
        ctx.quadraticCurveTo(lx * W, ly * H, (lx + nx) / 2 * W, (ly + ny) / 2 * H);
      }
      ctx.stroke();
    }
  }
  function endStroke(commit) {
    const s = stroke;
    stroke = null;
    if (s.ptype === 'pen') lastPenUp = Date.now();
    if (!s.erase && commit) {
      (ink[s.page.n] ||= []).push({ c: s.c, w: s.w, p: s.p });
      pushUndo({ t: 'add', n: s.page.n });
      save();
    }
    drawInk(s.page);   // 마지막 구간 마무리(취소면 지움)
  }
  function cancelStroke() { if (stroke) endStroke(false); }

  function undo() {
    const u = undoStack.pop();
    if (!u) return;
    if (u.t === 'add') (ink[u.n] ||= []).pop();
    else if (u.t === 'erase') { const list = (ink[u.n] ||= []); for (const { i, s } of u.items) list.splice(i, 0, s); }
    else if (u.t === 'clear') ink = u.prev;
    undoBtn.disabled = !undoStack.length;
    pages.forEach(drawInk);
    save();
  }

  // ── 도구 ──
  function setTool(t, c) {
    tool = t;
    if (c) { color = c; try { localStorage.setItem(PEN_PREF, c); } catch {} }
    bar.querySelectorAll('[data-tool]').forEach(b => {
      const on = b.dataset.tool === t && (t !== 'pen' || b.dataset.color === color);
      b.setAttribute('aria-pressed', String(on));
    });
    container.dataset.tool = t;
  }
  function notePen() {
    if (penSeen) return;
    penSeen = true;
    container.classList.add('pen-seen');
  }

  // ── 풀이 모드: 판 이동·확대 ──
  function applyCam() { sheet.style.transform = full ? `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${g})` : ''; }
  function clampCam() {
    const { w, h } = stageBox();
    const sw = sheet.offsetWidth * g, sh = sheet.offsetHeight * g;
    cam.x = sw <= w ? (w - sw) / 2 : Math.min(0, Math.max(w - sw, cam.x));
    cam.y = sh <= h ? Math.max(0, Math.min((h - sh) / 2, cam.y)) : Math.min(0, Math.max(h - sh, cam.y));
  }
  function updatePct() { pctEl.textContent = `${Math.round(zoom * g * 100)}%`; }
  // 제스처 배율을 확정 — 여백까지 배율에 비례하므로 판 위치(cam)는 그대로 두면 된다
  function commitScale() {
    if (g === 1) return;
    zoom = clampZ(zoom * g);
    g = 1;
    relayoutAll();
    clampCam(); applyCam(); updatePct(); crispSoon();
  }
  // 한 점을 기준으로 배율 변경 (버튼·휠·두 번 탭)
  function zoomTo(z, anchor) {
    z = clampZ(z);
    if (Math.abs(z - zoom) < 0.001) return;
    if (full) {
      commitScale();
      const { w, h } = stageBox();
      const a = anchor || { x: w / 2, y: h / 2 };
      const r = z / zoom;
      cam.x = a.x - (a.x - cam.x) * r;
      cam.y = a.y - (a.y - cam.y) * r;
      zoom = z;
      relayoutAll(); clampCam(); applyCam();
    } else {
      const ax = anchor ? anchor.x : container.clientWidth / 2;
      const ay = anchor ? anchor.y : container.clientHeight / 2;
      const sx = container.scrollLeft + ax;
      const r = z / zoom;
      zoom = z;
      relayoutAll();
      container.scrollLeft = sx * r - ax;
      window.scrollBy(0, ay * (r - 1));
    }
    updatePct(); crispSoon();
  }
  function toggleFit() {
    const wz = widthZoom();
    zoomTo(Math.abs(zoom - wz) < 0.02 ? 1 : wz);
  }

  // 손 뗀 뒤 관성
  let inertia = 0;
  function stopInertia() { cancelAnimationFrame(inertia); inertia = 0; }
  function fling(vx, vy) {
    stopInertia();
    if (Math.hypot(vx, vy) < 0.25) return;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(32, now - last); last = now;
      const bx = cam.x, by = cam.y;
      cam.x += vx * dt; cam.y += vy * dt;
      clampCam(); applyCam();
      const k = Math.pow(0.94, dt / 16);
      vx = cam.x === bx + vx * dt ? vx * k : 0;
      vy = cam.y === by + vy * dt ? vy * k : 0;
      inertia = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    inertia = requestAnimationFrame(step);
  }

  const ptrs = new Map();            // 이동·확대에 쓰는 손가락/마우스 { id → {x, y} }
  let gest = null;
  let lastTap = null;
  const local = e => { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function beginGesture() {
    const pts = [...ptrs.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gest = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, g0: g, cx: (mid.x - cam.x) / g, cy: (mid.y - cam.y) / g, last: mid };
    } else if (pts.length === 1) {
      gest = { mode: 'pan', last: pts[0], start: pts[0], t0: performance.now(), t: performance.now(), vx: 0, vy: 0, moved: 0 };
    } else gest = null;
  }

  container.addEventListener('pointerdown', e => {
    if (!full) {
      if (e.pointerType === 'pen') { notePen(); enterFull(); setTool('pen', color); }
      else if (e.pointerType === 'mouse' && e.button === 0 && tool === 'hand' && container.scrollWidth > container.clientWidth) {
        gest = { mode: 'drag', x: e.clientX };
        container.setPointerCapture?.(e.pointerId);   // 밖에서 놓아도 끌기가 끝나게
      }
      return;
    }
    if (e.target.closest('button')) return;
    e.preventDefault();
    if (e.pointerType === 'pen') {
      notePen();
      if (tool === 'hand') setTool('pen', color);
      stopInertia();
      if (stroke) cancelStroke();
      startStroke(e);
      return;
    }
    if (e.pointerType === 'touch') {
      if ((stroke && stroke.ptype === 'pen') || Date.now() - lastPenUp < PALM_MS) return;   // 손바닥
      if (!penSeen && tool !== 'hand') {
        if (!stroke && !ptrs.size) { startStroke(e); return; }
        if (stroke) {                                   // 두 번째 손가락 → 그리던 선 취소하고 제스처로
          const first = { x: stroke.x, y: stroke.y }, id = stroke.id;
          cancelStroke();
          const r = container.getBoundingClientRect();
          ptrs.set(id, { x: first.x - r.left, y: first.y - r.top });
        }
      }
    } else if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      if (tool !== 'hand') { startStroke(e); return; }
    }
    stopInertia();
    ptrs.set(e.pointerId, local(e));
    container.setPointerCapture?.(e.pointerId);
    beginGesture();
  });

  container.addEventListener('pointermove', e => {
    if (!full) {
      if (gest?.mode === 'drag') { container.scrollLeft -= e.clientX - gest.x; gest.x = e.clientX; }
      return;
    }
    if (stroke && e.pointerId === stroke.id) { e.preventDefault(); extendStroke(e); return; }
    if (!ptrs.has(e.pointerId) || !gest) return;
    ptrs.set(e.pointerId, local(e));
    const pts = [...ptrs.values()];
    if (gest.mode === 'pan') {
      const p = pts[0], now = performance.now();
      const dx = p.x - gest.last.x, dy = p.y - gest.last.y, dt = Math.max(1, now - gest.t);
      cam.x += dx; cam.y += dy;
      gest.vx = 0.7 * (dx / dt) + 0.3 * gest.vx;
      gest.vy = 0.7 * (dy / dt) + 0.3 * gest.vy;
      gest.moved += Math.abs(dx) + Math.abs(dy);
      gest.last = p; gest.t = now;
      clampCam(); applyCam();
    } else if (gest.mode === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g = clampZ(zoom * gest.g0 * Math.hypot(a.x - b.x, a.y - b.y) / gest.d0) / zoom;
      cam.x = mid.x - gest.cx * g;
      cam.y = mid.y - gest.cy * g;
      applyCam(); updatePct();
    }
  });

  function onUp(e) {
    if (!full) { if (gest?.mode === 'drag') gest = null; return; }
    if (stroke && e.pointerId === stroke.id) { endStroke(e.type === 'pointerup'); return; }
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    const was = gest;
    if (ptrs.size) { beginGesture(); return; }          // 한 손가락 남음 → 이어서 이동
    gest = null;
    if (g !== 1) { commitScale(); return; }
    if (was?.mode !== 'pan') return;
    // 짧게 두 번 탭 → 폭 맞춤 ↔ 2배
    const now = performance.now();
    if (was.moved < 8 && now - was.t0 < 250) {
      const p = was.last;
      if (lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        const wz = widthZoom();
        zoomTo(zoom > wz * 1.3 ? wz : wz * 2, p);
        lastTap = null;
      } else lastTap = { t: now, x: p.x, y: p.y };
      return;
    }
    if (now - was.t < 80) fling(was.vx, was.vy);
  }
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  // 풀이 모드에선 브라우저 기본 동작(스크롤·확대·돋보기·길게 눌러 선택)을 모두 막는다
  container.addEventListener('touchstart', e => { if (full) e.preventDefault(); }, { passive: false });
  container.addEventListener('touchmove', e => { if (full) e.preventDefault(); }, { passive: false });
  container.addEventListener('gesturestart', e => { if (full) e.preventDefault(); });

  // 트랙패드·휠: 풀이 모드는 판 이동, Ctrl(핀치)은 확대
  container.addEventListener('wheel', e => {
    if (!full && !e.ctrlKey) return;
    e.preventDefault();
    if (e.ctrlKey) { zoomTo(zoom * Math.exp(-e.deltaY * 0.01), local(e)); return; }
    stopInertia();
    cam.x -= e.deltaX; cam.y -= e.deltaY;
    clampCam(); applyCam();
  }, { passive: false });

  // ── 풀이 모드 전환 ──
  function enterFull() {
    if (full || !pages.length) return;   // 첫 쪽이 뜨기 전엔 들어가지 않는다
    // 지금 보고 있던 쪽부터 이어서
    const top = pages.find(p => p.wrap.getBoundingClientRect().bottom > 120) || pages[0];
    full = true;
    preview.classList.add('is-full');
    document.body.classList.add('pv-lock');
    fullBtn.innerHTML = svg(ICON.exit);
    fullBtn.setAttribute('aria-label', '풀이 모드 끝내기');
    try { history.pushState({ ...(history.state || {}), pvFull: true }, ''); } catch {}
    baseScale = fitPage(pages[0]);
    zoom = 1;
    const wz = widthZoom();
    padK = 16 / wz;
    zoom = wz;
    g = 1;
    relayoutAll();
    cam.x = 0; cam.y = top ? -top.wrap.offsetTop * g + padK * zoom : 0;
    clampCam(); applyCam(); updatePct(); crispSoon();
    expandAll();
    if (matchMedia('(pointer: coarse)').matches) showHint(penSeen ? '펜슬로 쓰고, 손가락으로 움직여요' : '펜을 고르면 한 손가락으로 써요 · 이동은 두 손가락');
  }
  function exitFull(fromHistory = false) {
    if (!full) return;
    cancelStroke(); stopInertia(); ptrs.clear(); gest = null;
    full = false;
    preview.classList.remove('is-full');
    document.body.classList.remove('pv-lock');
    fullBtn.innerHTML = svg(ICON.full);
    fullBtn.setAttribute('aria-label', '풀이 모드');
    g = 1; applyCam();
    setTool('hand');
    baseScale = fitPage(pages[0]);
    zoom = 1;
    relayoutAll(); updatePct(); crispSoon();
    if (!fromHistory && history.state?.pvFull) history.back();
  }
  window.addEventListener('popstate', () => { if (full) exitFull(true); });

  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (!pages.length && (b.dataset.tool || b.dataset.act === 'full')) return;   // 첫 쪽 로딩 중
    if (b.dataset.tool) {
      if (b.dataset.tool !== 'hand' && !full) enterFull();
      setTool(b.dataset.tool, b.dataset.color);
      return;
    }
    const a = b.dataset.act;
    if (a === 'undo') undo();
    else if (a === 'clear') {
      if (!Object.values(ink).some(v => v.length)) return;
      if (!confirm('이 시험지의 필기를 모두 지울까요?')) return;
      pushUndo({ t: 'clear', prev: JSON.parse(JSON.stringify(ink)) });
      ink = {}; pages.forEach(drawInk); save();
    }
    else if (a === 'in') zoomTo(zoom * 1.25);
    else if (a === 'out') zoomTo(zoom / 1.25);
    else if (a === 'fit') toggleFit();
    else if (a === 'full') full ? exitFull() : enterFull();
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches?.('input, textarea, [contenteditable="true"]')) return;
    if (!container.isConnected || !container.offsetParent) return;
    if (e.key === 'Escape' && full) { exitFull(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { zoomTo(zoom * 1.25); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomTo(zoom / 1.25); e.preventDefault(); }
    else if (e.key === '0') { zoomTo(full ? widthZoom() : 1); e.preventDefault(); }
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!pages[0]) return;
      const ratio = zoom / (full ? widthZoom() : 1);   // 폭 맞춤 대비 배율 유지
      baseScale = fitPage(pages[0]);
      if (full) { const wz = widthZoom(); padK = 16 / wz; zoom = clampZ(wz * ratio); } else zoom = 1;
      relayoutAll();
      if (full) { clampCam(); applyCam(); }
      updatePct(); crispSoon();
    }, 200);
  });

  // ── 첫 쪽 + 나머지 쪽 ──
  let more = null;
  let expanding = null;
  function expandAll() {
    if (!more || !more.isConnected) return expanding;
    if (expanding) return expanding;
    more.disabled = true;
    more.textContent = '불러오는 중…';
    expanding = (async () => {
      try {
        for (let i = pages.length + 1; i <= total; i++) await addPage(i);
        more.remove();
        if (full) { clampCam(); applyCam(); }
      } catch {
        more.disabled = false;
        more.textContent = '나머지 페이지 다시 불러오기';
      } finally { expanding = null; }
    })();
    return expanding;
  }

  const first = await addPage(1);
  first.pdfCanvas?.classList.add('preview__page--ready');
  setTool('hand');
  updatePct();
  if (Object.keys(ink).length) showHint('저장된 필기를 불러왔어요');
  if (total > 1) {
    more = document.createElement('button');
    more.className = 'preview__more';
    more.type = 'button';
    more.textContent = `나머지 ${total - 1}쪽 펼치기`;
    more.addEventListener('click', expandAll);
    sheet.appendChild(more);
    // 필기가 저장된 뒤쪽이 있으면 바로 펼쳐 둔다
    if (Object.keys(ink).some(n => Number(n) > 1 && ink[n].length)) expandAll();
  }
}
