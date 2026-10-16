import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/measure.js', import.meta.url), 'utf8');

function setup(pathname = '/exam-1.html') {
  const handlers = new Map();
  const document = {
    readyState: 'loading',
    body: { classList: { contains: () => false }, dataset: {} },
    documentElement: { getAttribute: () => null },
    addEventListener: (name, fn) => handlers.set(name, fn),
    querySelector: () => null,
  };
  const window = { dataLayer: [], addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({
    window, document,
    location: { pathname, origin: 'https://kicegg.com' },
    navigator: { userAgent: '' },
    localStorage: { getItem: () => null },
    matchMedia: window.matchMedia,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    URL, URLSearchParams, Date,
  });
  vm.runInContext(source, context);
  function click(subject, href = 'https://kicegg.com/files/test/question.pdf') {
    const attributes = { download: '2027학년도 수학 문제지.pdf' };
    if (subject !== undefined) attributes['data-ga-subject'] = subject;
    const link = {
      href,
      getAttribute: name => attributes[name] ?? null,
      closest: selector => selector === 'a[download]' ? link
        : selector === '[data-ga-subject]' ? (subject !== undefined ? link : null)
        : selector === '[id]' ? { id: 'cardsGrid' } : null,
    };
    handlers.get('click')({ target: link });
  }
  function events(name) {
    return window.dataLayer.filter(a => a[0] === 'event' && a[1] === name).map(a => a[2]);
  }
  return { track: window.kgTrack, click, events };
}

test('처리된 PDF 오류는 고정 코드만 기록하고 페이지당 3건으로 제한한다', () => {
  const page = setup();
  page.track.error('private user text or URL', 'download.js');
  page.track.error('pdf_download', 'https://private.invalid/name');
  assert.equal(page.events('js_error').length, 0);
  for (let i = 0; i < 5; i++) page.track.error('pdf_preview_document', 'exam-pdf.js');
  assert.equal(page.events('js_error').length, 3);
  assert.equal(page.events('js_error')[0].message, 'pdf_preview_document');
  assert.equal(page.events('js_error')[0].source, 'exam-pdf.js');
});

const exam = { id: 1, typeGroup: 'suneung', type: 'sept', gradeYear: 2027,
  subject: '수학', subSubject: '확률과통계' };

test('검색 카드와 회차 카드의 다운로드에 클릭한 과목을 명시한다', () => {
  for (const path of ['/', '/archive.html', '/exam-set-kice-2027-sept.html']) {
    const page = setup(path);
    page.click('확률과통계');
    page.click('사회·문화');
    assert.deepEqual(page.events('material_download').map(e => e.subject), ['확률과통계', '사회·문화']);
    assert.equal(page.events('material_download')[0].file_kind, 'question');
  }
});

test('상세 페이지는 gtag 전역 설정에만 의존하지 않고 과목을 이벤트에 직접 전달한다', () => {
  const page = setup();
  page.track.exam(exam);
  page.click();
  const event = page.events('material_download')[0];
  assert.equal(event.subject, '확률과통계');
  assert.equal(event.exam_id, '1');
  assert.equal(event.grade_year, '2027');
});

test('상세 페이지 설정이 있어도 클릭한 링크의 과목을 우선한다', () => {
  const page = setup();
  page.track.exam(exam);
  page.click('영어');
  assert.equal(page.events('material_download')[0].subject, '영어');
});

test('blob/data 저장용 링크는 중복 다운로드 이벤트를 만들지 않는다', () => {
  const page = setup();
  page.click('영어', 'blob:https://kicegg.com/test');
  page.click('영어', 'data:application/pdf;base64,AA');
  assert.equal(page.events('material_download').length, 0);
});

test('알 수 없는 과목을 만들어 넣지 않는다', () => {
  const page = setup('/');
  page.click();
  assert.equal(page.events('material_download')[0].subject, undefined);
});

test('동적 회차 카드의 모든 자료 버튼에 선택과목을 넣는다', () => {
  const set = readFileSync(new URL('../exam-set.js', import.meta.url), 'utf8');
  const block = set.slice(set.indexOf('function cardHTML('), set.indexOf('// ── 헤더 렌더'));
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const context = vm.createContext({ escAttr: escape, escHtml: escape, prettySub: x => x,
    safeUrl: x => x || '', answerLabel: () => '정답' });
  vm.runInContext(block, context);
  const html = context.cardHTML({ ...exam, questionUrl: 'https://example.com/q.pdf',
    answerUrl: 'https://example.com/a.pdf', solutionUrl: 'https://example.com/s.pdf' });
  assert.equal((html.match(/data-ga-subject="확률과통계"/g) || []).length, 3);
  const english = context.cardHTML({ ...exam, subSubject: null, subject: '영어',
    questionUrl: 'https://example.com/q.pdf' });
  assert.match(english, /data-ga-subject="영어"/);
});

test('검색 목록의 주소 지연 로딩 링크에도 과목 속성이 남는다', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('const dlAttr ='), app.indexOf('// 데스크톱 자료 칸:'));
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const context = vm.createContext({ escAttr: escape });
  vm.runInContext(block + '\nthis.dlAttr = dlAttr;', context);
  const ready = context.dlAttr(exam, 'questionUrl', '문제지.pdf');
  const pending = context.dlAttr({ ...exam, questionUrl: 1 }, 'questionUrl', '');
  assert.match(ready, /data-ga-subject="확률과통계"/);
  assert.match(pending, /data-ga-subject="확률과통계"/);
  assert.match(pending, /data-f="questionUrl" data-eid="1"/);
  assert.doesNotMatch(pending, /\bdownload\b/);
  const quoted = context.dlAttr({ subject: '국어 "A" <형>' }, 'questionUrl', '');
  assert.match(quoted, /국어 &quot;A&quot; &lt;형>/);
});
