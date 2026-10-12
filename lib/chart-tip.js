// 그래프 수치 툴팁 — 인라인 SVG 그래프에 마우스를 올리거나(데스크톱) 누르고 끌면(휴대폰) 정확한 수치를 띄운다.
// Chart.js 의 interaction mode 'index'(intersect:false)처럼 포인터의 x 위치에서 가장 가까운 항목을 고르고,
// 세로 안내선·표시점·수치 카드를 그린다. 키보드: 그래프에 초점 → ←/→ 로 이동, Esc 로 닫기.
//
// 데이터 계약(SSG 가 만든다 — build-data.py dist_svg·bin_svg, build-blog-posts.py):
//   <svg data-chart data-tips='[[x, y|null, "제목", [["이름","값"], ...], 막대번호|null], ...]'>
//   x·y 는 viewBox 좌표. 막대번호가 있으면 같은 data-i 를 가진 요소에 .is-active 를 붙인다.
//   data-chart="hit" 이면 x 대신 포인터 아래 요소의 data-tip-i(항목 번호)로 고른다(가로 누적 막대처럼 x 가 겹치는 그래프).
(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const charts = new WeakMap();

  function setup(svg) {
    let tips;
    try { tips = JSON.parse(svg.getAttribute('data-tips') || '[]'); } catch { return null; }
    if (!tips.length) return null;
    const host = svg.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const card = document.createElement('div');
    card.className = 'chart-tip';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.hidden = true;
    host.appendChild(card);
    const vb = svg.viewBox.baseVal;
    const guide = document.createElementNS(SVGNS, 'line');
    guide.setAttribute('class', 'chart-guide');
    guide.setAttribute('y1', vb.y + 4);
    guide.setAttribute('y2', vb.y + vb.height - 4);
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', 'chart-dot');
    dot.setAttribute('r', '4.5');
    guide.style.display = dot.style.display = 'none';
    svg.append(guide, dot);
    if (!svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '0');
    const order = tips.map((t, i) => i).sort((a, b) => tips[a][0] - tips[b][0]);
    const st = { svg, tips, order, card, guide, dot, idx: -1, pinned: false, hit: svg.getAttribute('data-chart') === 'hit' };
    charts.set(svg, st);
    return st;
  }

  // 스포일러 방지로 가려진 그래프에선 수치를 띄우지 않는다
  const hidden = svg => document.documentElement.dataset.spoiler === 'on' && svg.closest('.spoil-val');

  function nearest(st, clientX, clientY) {
    const m = st.svg.getScreenCTM();
    if (!m) return -1;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    let best = -1, bd = Infinity;
    for (const i of st.order) {
      const d = Math.abs(st.tips[i][0] - p.x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function show(st, i) {
    if (i < 0 || hidden(st.svg)) return hide(st);
    const [x, y, title, rows, bar] = st.tips[i];
    if (st.idx !== i) {
      st.svg.querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
      if (bar != null) st.svg.querySelectorAll(`[data-i="${bar}"]`).forEach(el => el.classList.add('is-active'));
      st.card.innerHTML = '';
      const h = document.createElement('div');
      h.className = 'chart-tip__title';
      h.textContent = title;
      st.card.appendChild(h);
      for (const [k, v] of rows || []) {
        const r = document.createElement('div');
        r.className = 'chart-tip__row';
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b'); b.textContent = v;
        r.append(a, b);
        st.card.appendChild(r);
      }
      st.idx = i;
    }
    if (!st.hit) {
      st.guide.setAttribute('x1', x); st.guide.setAttribute('x2', x);
      st.guide.style.display = '';
    }
    if (y != null && !st.hit) {   // 가로 누적 막대(hit)는 칸 자체가 강조되므로 점을 찍지 않는다
      st.dot.setAttribute('cx', x); st.dot.setAttribute('cy', y);
      st.dot.style.display = '';
    } else st.dot.style.display = 'none';
    st.card.hidden = false;
    place(st, x, y);
  }

  // 카드는 표시점 위(공간이 없으면 아래), 좌우는 그래프 안에 들어오게
  function place(st, x, y) {
    const m = st.svg.getScreenCTM();
    const host = st.card.parentElement.getBoundingClientRect();
    const vb = st.svg.viewBox.baseVal;
    const p = new DOMPoint(x, y ?? vb.y + vb.height * 0.3).matrixTransform(m);
    const w = st.card.offsetWidth, h = st.card.offsetHeight, gap = 12;
    let left = p.x - host.left - w / 2;
    left = Math.max(4, Math.min(left, host.width - w - 4));
    let top = p.y - host.top - h - gap;
    if (top < 0) top = p.y - host.top + gap;
    st.card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function hide(st) {
    st.card.hidden = true;
    st.guide.style.display = st.dot.style.display = 'none';
    st.svg.querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
    st.idx = -1;
    st.pinned = false;
  }

  const get = svg => charts.get(svg) || setup(svg);

  function pick(st, e) {
    if (st.hit) {
      const el = e.target.closest?.('[data-tip-i]');
      return el ? Number(el.getAttribute('data-tip-i')) : -1;
    }
    return nearest(st, e.clientX, e.clientY);
  }

  document.addEventListener('pointermove', e => {
    const svg = e.target.closest?.('svg[data-chart]');
    if (!svg) return;
    const st = get(svg);
    if (!st) return;
    if (e.pointerType === 'mouse' || e.buttons) show(st, pick(st, e));   // 터치는 누른 채 끌 때만 따라간다
  }, { passive: true });

  document.addEventListener('pointerdown', e => {
    const svg = e.target.closest?.('svg[data-chart]');
    // 다른 곳을 누르면 열려 있던 카드를 닫는다
    document.querySelectorAll('svg[data-chart]').forEach(s => { const o = charts.get(s); if (o && s !== svg && !o.card.hidden) hide(o); });
    if (!svg) return;
    svg.classList.remove('is-kb');
    const st = get(svg);
    if (!st) return;
    st.pinned = true;
    show(st, pick(st, e));
  });

  document.addEventListener('pointerout', e => {
    const svg = e.target.closest?.('svg[data-chart]');
    if (!svg || svg.contains(e.relatedTarget)) return;
    const st = charts.get(svg);
    if (st && e.pointerType === 'mouse' && !st.pinned) hide(st);
  });

  document.addEventListener('keydown', e => {
    const svg = document.activeElement?.closest?.('svg[data-chart]');
    if (!svg) return;
    const st = get(svg);
    if (!st) return;
    svg.classList.add('is-kb');
    if (e.key === 'Escape') return hide(st);
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const pos = st.order.indexOf(st.idx);
    const next = pos < 0 ? (e.key === 'ArrowLeft' ? st.order.length - 1 : 0)
      : Math.max(0, Math.min(st.order.length - 1, pos + (e.key === 'ArrowLeft' ? -1 : 1)));
    st.pinned = true;
    show(st, st.order[next]);
  });

  document.addEventListener('focusout', e => {
    const svg = e.target.closest?.('svg[data-chart]');
    const st = svg && charts.get(svg);
    if (st && !svg.contains(e.relatedTarget)) hide(st);
  });

  // 키보드로도 닿게 처음부터 준비(tabindex·카드). defer 로 실리므로 DOM 은 이미 있다
  document.querySelectorAll('svg[data-chart]').forEach(get);

  // 창 크기가 바뀌면 열린 카드 위치를 다시 맞춘다
  addEventListener('resize', () => document.querySelectorAll('svg[data-chart]').forEach(s => {
    const st = charts.get(s);
    if (st && !st.card.hidden) place(st, st.tips[st.idx][0], st.tips[st.idx][1]);
  }));
})();
