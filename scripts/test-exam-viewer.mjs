// No packages/browser required: exercise the real viewer with a small DOM/PDF fake.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const source = readFileSync(new URL('../lib/exam-viewer.js', import.meta.url), 'utf8');
class El {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.clientWidth = 600; this.clientHeight = 800; this.isConnected = true; this.classList = { add() {}, remove() {}, toggle() {} }; }
  set className(v) { this._class = v; } get className() { return this._class || ''; }
  set innerHTML(v) { this.children = []; this.html = v; } get innerHTML() { return this.html; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
  appendChild(e) { e.remove(); e.parentElement = this; this.children.push(e); return e; }
  prepend(e) { e.parentElement = this; this.children.unshift(e); }
  insertBefore(e, before) { if (!before) return this.appendChild(e); e.parentElement = this; this.children.splice(this.children.indexOf(before), 0, e); }
  insertAdjacentElement(_, e) { this.parentElement.appendChild(e); }
  before(e) { this.parentElement.insertBefore(e, this); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); this.parentElement = null; }
  replaceWith(e) { this.before(e); this.remove(); }
  replaceChildren(...es) { this.children = []; es.forEach(e => this.appendChild(e)); }
  querySelector(s) { return this.queries?.[s] || null; }
  querySelectorAll() { return []; }
  closest(s) { return s === '.preview' ? this.preview : null; }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  removeEventListener(k, f) { this.listeners[k] = (this.listeners[k] || []).filter(x => x !== f); }
  getBoundingClientRect() { const top = this.top ?? (Number(this.dataset.page || 1) - 1) * 850; return { top, bottom: top + 800, left: 0, right: 600, width: 600, height: 800 }; }
  getContext() { return { canvas: this }; }
  scrollIntoView() {}
}
async function setup({ stored = '{}', manual = false, failGetPage = 0 } = {}) {
  const preview = new El(), head = new El(), container = new El();
  preview.appendChild(head); preview.appendChild(container); container.preview = preview;
  preview.queries = { '.preview__head': head };
  let api, observer; const tasks = [], canvases = [], writes = [], warnings = [], requested = [];
  const document = new El(); document.body = new El();
  document.createElement = tag => {
    const e = new El(tag);
    if (tag === 'canvas') canvases.push(e);
    if (tag === 'div') e.queries = Object.fromEntries(['.pv-pct', '[data-act="undo"]', '[data-act="full"]', '[data-act="fold"]', '[data-act="invert"]'].map(s => [s, new El('button')]));
    return e;
  };
  document.createElementNS = (_, tag) => new El(tag);
  const window = new El(); Object.assign(window, { devicePixelRatio: 2, innerHeight: 950, scrollBy() {} });
  const ctx = vm.createContext({ document, window, console: { warn: (...a) => warnings.push(a) }, performance, AbortController, setTimeout, clearTimeout,
    cancelAnimationFrame() {}, requestAnimationFrame() { return 1; }, getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0' }),
    matchMedia: () => ({ matches: false }), history: { state: {}, pushState() {}, back() {} },
    localStorage: { getItem: k => k.includes('ink:v1') ? stored : null, setItem: (...a) => writes.push(a), removeItem: (...a) => writes.push(a) },
    IntersectionObserver: class { constructor(cb) { this.cb = cb; observer = this; } observe() {} disconnect() { this.disconnected = true; } },
    capture: a => { api = a; }
  });
  vm.runInContext(source.replace('export async function', 'async function').replace('  let first;', '  capture({ pages, addPage, expandAll, fold, renderPdfCanvas, renderDetail, pageFailure, dropDetail, enterFull, exitFull, applyCam, zoomTo, crispSoon, getMore: () => more, getInk: () => ink });\n  let first;'), ctx);
  const pdf = { numPages: 96, async getPage(n) {
    requested.push(n);
    if (n === failGetPage) { failGetPage = 0; throw new Error('getPage failure'); }
    return { getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }), render({ canvasContext }) {
    let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const task = { promise, resolve, reject, canvas: canvasContext.canvas, cancel() { this.cancelled = true; } }; tasks.push(task);
    if (!manual) resolve(); return task;
  } }; } };
  const mounting = ctx.mountViewer({ pdf, container, inkKey: 'test' });
  await new Promise(r => setImmediate(r));
  if (manual) tasks[0].resolve();
  const dispose = await mounting;
  return { api, observer, tasks, canvases, writes, warnings, requested, dispose, document, window, container };
}
test('96 page frames stay accessible; only nearby canvases survive, fold releases pages 2+', async () => {
  const h = await setup(); await h.api.expandAll();
  assert.equal(h.api.pages.length, 96);
  assert.ok(h.api.pages.filter(p => p.pdfCanvas).length <= 4, 'offscreen pages must not retain canvases');
  const p = h.api.pages[95]; p.wrap.top = 0;
  h.observer.cb([{ target: p.wrap, isIntersecting: true }]); await new Promise(r => setImmediate(r));
  assert.ok(p.pdfCanvas, 'page 96 renders on return'); const old = p.pdfCanvas, ink = p.ink;
  h.observer.cb([{ target: p.wrap, isIntersecting: false }]); await new Promise(r => setImmediate(r));
  assert.equal(p.pdfCanvas, null); assert.equal(old.width, 0); assert.equal(old.height, 0); assert.equal(p.ink, ink);
  h.observer.cb([{ target: p.wrap, isIntersecting: true }]); await new Promise(r => setImmediate(r));
  assert.ok(p.pdfCanvas); h.api.fold(); assert.equal(p.pdfCanvas, null);
  h.dispose?.();
});
test('same-scale render is deduplicated; cancellation/stale completion cannot attach canvas', async () => {
  const h = await setup({ manual: true }); const p = h.api.pages[0];
  p.renderedScale = 0;
  const a = h.api.renderPdfCanvas(p), b = h.api.renderPdfCanvas(p);
  assert.equal(h.tasks.length, 2, 'one initial + one in-flight task');
  h.observer.cb([{ target: p.wrap, isIntersecting: false }]);
  assert.ok(h.tasks[1].cancelled);
  h.tasks[1].resolve(); await Promise.all([a, b]);
  assert.equal(p.pdfCanvas, null); assert.equal(h.tasks[1].canvas.width, 0);
  h.dispose?.();
});
test('malformed saved ink is ignored in memory without changing storage', async () => {
  for (const stored of ['null', '[]', '{"1":{}}', '{"1":[null,{"c":"black","w":0.0032,"p":[0.1]}]}', '{"1":[{"c":"black","w":0.0032,"p":[0.1,0.2]}],"2":"bad"}']) {
    const h = await setup({ stored }); assert.equal(h.writes.length, 0); assert.ok(Array.isArray(h.api.getInk()[1] || [])); h.dispose?.();
  }
});
test('failed visible page has a retry and retry really renders again', async () => {
  const h = await setup({ manual: true }); const p = h.api.pages[0]; p.renderedScale = 0;
  const run = h.api.renderPdfCanvas(p); h.tasks[1].reject(new Error('PDF failure')); await run.catch(() => {});
  assert.ok(p.retry, 'render failure needs a page retry button');
  const click = p.retry.listeners.click[0]; const retry = click({ stopPropagation() {} });
  assert.equal(h.tasks.length, 3); h.tasks[2].resolve(); await retry;
  assert.ok(p.pdfCanvas); assert.equal(p.retry, null); h.dispose?.();
});
test('dispose cancels tasks, frees canvases and disconnects observer', async () => {
  const h = await setup(); assert.equal(typeof h.dispose, 'function');
  const canvas = h.api.pages[0].pdfCanvas; h.dispose(); h.dispose();
  assert.equal(canvas.width, 0); assert.ok(h.observer.disconnected);
  for (const target of [h.container, h.document, h.window]) assert.ok(Object.values(target.listeners).every(a => !a.length));
});

test('newer scale wins even if cancelled render resolves last', async () => {
  const h = await setup({ manual: true }); const p = h.api.pages[0];
  p.renderedScale = 0; const old = h.api.renderPdfCanvas(p);
  h.api.zoomTo(2); const next = h.api.renderPdfCanvas(p);
  assert.ok(h.tasks[1].cancelled);
  h.tasks[2].resolve(); await next; const fresh = p.pdfCanvas;
  h.tasks[1].resolve(); await old;
  assert.equal(p.pdfCanvas, fresh); assert.equal(h.tasks[1].canvas.width, 0);
  h.dispose();
});
test('detail-only failure retry does not skip an already cached base scale', async () => {
  const h = await setup(); const p = h.api.pages[0], count = h.tasks.length;
  h.api.pageFailure(p, new Error('detail failure'));
  await p.retry.listeners.click[0]({ stopPropagation() {} });
  assert.equal(h.tasks.length, count + 1); assert.equal(p.retry, null); assert.equal(h.warnings.length, 1);
  h.dispose();
});
test('getPage failure retries the same page in solving mode, with retry outside transformed sheet', async () => {
  const h = await setup({ failGetPage: 3 }); await h.api.expandAll();
  assert.equal(h.api.pages.length, 2); assert.equal(h.api.getMore().disabled, false);
  assert.match(h.api.getMore().textContent, /다시/);
  h.api.enterFull(); await h.api.expandAll();
  assert.equal(h.api.getMore().parentElement, h.container);
  assert.equal(h.api.pages.length, 96); assert.equal(h.requested.filter(n => n === 3).length, 2);
  h.dispose();
});
test('solving-mode camera refresh evicts distant pages and restores returning pages without scroll', async () => {
  const h = await setup(); await h.api.expandAll(); h.api.enterFull();
  const p = h.api.pages[0], old = p.pdfCanvas;
  p.wrap.top = 10000; h.api.applyCam(); assert.equal(p.pdfCanvas, null); assert.equal(old.width, 0);
  p.wrap.top = 0; h.api.applyCam(); await new Promise(r => setImmediate(r)); assert.ok(p.pdfCanvas);
  h.dispose();
});

test('returning to cached scale cancels an incompatible in-flight task', async () => {
  const h = await setup({ manual: true }); const p = h.api.pages[0], original = p.pdfCanvas;
  h.api.zoomTo(2); const pending = h.api.renderPdfCanvas(p);
  h.api.zoomTo(1); await h.api.renderPdfCanvas(p);
  assert.ok(h.tasks[1].cancelled); h.tasks[1].resolve(); await pending;
  assert.equal(p.pdfCanvas, original); assert.equal(h.tasks[1].canvas.width, 0); h.dispose();
});
test('dispose during rendering invalidates the task and late completion frees its bitmap', async () => {
  const h = await setup({ manual: true }); const p = h.api.pages[0];
  p.renderedScale = 0; const pending = h.api.renderPdfCanvas(p);
  h.dispose(); assert.ok(h.tasks[1].cancelled); h.tasks[1].resolve(); await pending;
  assert.equal(p.pdfCanvas, null); assert.equal(h.tasks[1].canvas.width, 0); assert.equal(h.tasks[1].canvas.height, 0);
});
test('solving mode keeps native touch activation available for retry buttons', async () => {
  const h = await setup(); h.api.enterFull(); let prevented = false;
  h.container.listeners.touchstart[0]({ target: { closest: s => s === 'button' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false); h.dispose();
});
