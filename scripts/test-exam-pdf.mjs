import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../lib/exam-pdf.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export ', '')
  .replaceAll('import.meta.url', "'https://kicegg.com/lib/exam-pdf.js'")
  .replace('await import(/* @vite-ignore */', 'await importMock(');
function setup() {
  const urls = []; let fail = true;
  const lib = { version: '4.10.38', GlobalWorkerOptions: {} };
  const context = vm.createContext({ URL, console: { error() {} }, window: {}, location: { reload() {} },
    safeUrl: x => x, escHtml: x => x, mountViewer: async () => {},
    importMock: async url => { urls.push(url); if (fail) throw new TypeError('Controlled failed import'); return lib; } });
  vm.runInContext(source + '\nthis.load = loadPdfjs; this.render = renderPdf;', context);
  return { context, lib, urls, restore: () => { fail = false; } };
}
test('failed PDF.js import can be retried with a fresh module URL', async () => {
  const s = setup(); await assert.rejects(s.context.load()); s.restore();
  assert.equal(await s.context.load(), s.lib);
  assert.equal(s.urls.length, 2); assert.notEqual(s.urls[0], s.urls[1]);
});
test('healthy library is shared and main/worker use the same pinned version', async () => {
  const s = setup(); s.restore();
  const [a,b] = await Promise.all([s.context.load(),s.context.load()]);
  assert.equal(a,b); assert.equal(s.urls.length, 1);
  assert.equal(new URL(s.urls[0]).searchParams.get('v'), '4.10.38');
  assert.equal(new URL(s.lib.GlobalWorkerOptions.workerSrc).searchParams.get('v'), '4.10.38');
});

test('failed document loading destroys its task and retry can initialise again', async () => {
  const s = setup(); s.restore(); let destroyed = 0;
  s.lib.getDocument = () => ({ promise: Promise.reject(new Error('controlled failure')), destroy: async () => { destroyed++; } });
  const container = { dataset: {}, innerHTML: '', querySelector: () => ({ addEventListener() {} }) };
  await s.context.render('https://kicegg.com/files/a.pdf', container, {});
  assert.equal(destroyed, 1); assert.equal(container.dataset.pdfLoading, undefined);
  assert.match(container.innerHTML, /preview__reload/);
  s.lib.getDocument = () => ({ promise: Promise.resolve({}), destroy: async () => {} });
  await s.context.render('https://kicegg.com/files/a.pdf', container, {});
  assert.equal(s.urls.length, 2);
});

test('duplicate preview clicks do not start overlapping loads', async () => {
  const s = setup(); s.restore(); let loads = 0, resolve;
  s.lib.getDocument = () => { loads++; return { promise: new Promise(r => { resolve = r; }), destroy: async () => {} }; };
  const container = { dataset: {} };
  const first = s.context.render('https://kicegg.com/files/a.pdf', container, {});
  await new Promise(r => setImmediate(r));
  await s.context.render('https://kicegg.com/files/a.pdf', container, {});
  assert.equal(loads, 1); resolve({}); await first;
  assert.equal(container.dataset.pdfLoading, undefined);
});
