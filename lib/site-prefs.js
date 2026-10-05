'use strict';
// 사이트 공통 환경설정 — <head> 에서 동기 로드 (CSP상 인라인 스크립트 불가).
//  · 테마: 시스템 설정 기본, 헤더 버튼으로 전환 → localStorage 'kicegg:theme'
//  · 스포일러 방지: 기본 켜짐 → html[data-spoiler="on"] 이면 등급컷·난이도 블러
//  · 헤더 스크롤 경계선, 모바일 메뉴, 가로 스크롤 탭 가장자리 흐림
(function () {
  var root = document.documentElement;

  // 글꼴 CSS(Pretendard)는 첫 화면을 막지 않게 비동기로 붙인다.
  // 처음 방문: 페이지 로드 뒤에 받는다(첫 표시가 1~2초 빨라짐). 한 번 받은 적 있으면 바로 붙여 글꼴 깜빡임을 줄인다.
  try {
    var self = document.currentScript && document.currentScript.src;
    if (self) {
      var fontHref = new URL('vendor/pretendard/pretendardvariable-dynamic-subset.css?v=8d17b4b78d2104b290c5', self).href;
      var addFont = function () {
        if (document.getElementById('kicegg-font')) return;
        var l = document.createElement('link');
        l.id = 'kicegg-font'; l.rel = 'stylesheet'; l.href = fontHref;
        document.head.appendChild(l);
        try { localStorage.setItem('kicegg:font', '1'); } catch (e) {}
      };
      var seen = false;
      try { seen = localStorage.getItem('kicegg:font') === '1'; } catch (e) {}
      if (seen || document.readyState === 'complete') addFont(); else addEventListener('load', addFont);
    }
  } catch (e) {}

  // 기출검색: 목록 데이터를 스크립트 모듈 로딩을 기다리지 않고 바로 요청 (app.js 가 이 요청을 이어받음)
  try {
    if (/\/(archive\.html|index\.html)?$/.test(location.pathname)) {   // 첫 화면(/)도 기출검색
      var me = document.currentScript && document.currentScript.src;
      var ver = me ? (me.split('v=')[1] || '') : '';
      var tab = new URLSearchParams(location.search).get('tab') || 'senior';
      if (/^[a-z]+$/.test(tab)) {
        window.__kiceggArchive = { tab: tab, data: fetch('data/archive/' + tab + '.json?v=' + ver).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) };
        // 1등급컷·난이도 표도 같이 요청 — 첫 그리기가 이 값을 기다려 한 번에 그리게 한다(두 번 그리면 LCP 가 늦어짐)
        window.__kiceggCuts = fetch('data/archive/cuts.json?v=' + ver).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      }
    }
  } catch (e) {}
  var THEME_KEY = 'kicegg:theme';
  var SPOILER_KEY = 'kicegg:spoiler';

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function currentTheme() {
    var saved = read(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0d0f' : '#f4f4f5');
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    }
  }
  applyTheme(currentTheme());
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (!read(THEME_KEY)) applyTheme(currentTheme()); });
  }

  function spoilerOn() { return read(SPOILER_KEY) !== 'off'; }
  function applySpoiler(on) {
    root.setAttribute('data-spoiler', on ? 'on' : 'off');
    var sw = document.querySelectorAll('[data-spoiler-toggle]');
    for (var i = 0; i < sw.length; i++) sw[i].setAttribute('aria-checked', on ? 'true' : 'false');
  }
  applySpoiler(spoilerOn());

  function setSpoiler(on) {
    write(SPOILER_KEY, on ? 'on' : 'off');
    applySpoiler(on);
    document.dispatchEvent(new CustomEvent('kicegg:spoiler', { detail: { on: on } }));
  }
  window.kiceggPrefs = { setSpoiler: setSpoiler, spoilerOn: spoilerOn };

  // 좌우로 넘기는 영역 — 가장자리 흐림(.hscroll) + 넘길 쪽에만 ‹ › 버튼
  var SCROLLERS = '.hscroll, .latest-rail';
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  function fade(el) {
    // 조금만 밀린 상태(첫 항목이 거의 다 보임)에서는 화살표를 띄우지 않는다 — 화살표가 첫 항목을 덮어 누르기 어려움
    var l = el.scrollLeft > 24, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 24;
    if (el.classList.contains('hscroll')) { el.classList.toggle('more-l', l); el.classList.toggle('more-r', r); }
    var w = el.parentNode;
    if (w && w.classList && w.classList.contains('hscroll-wrap')) { w.classList.toggle('can-l', l); w.classList.toggle('can-r', r); }
  }
  function addArrows(el) {
    var wrap = document.createElement('div');
    wrap.className = 'hscroll-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    [['prev', '이전 항목 보기', -1], ['next', '다음 항목 보기', 1]].forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hscroll-btn hscroll-btn--' + d[0];
      b.setAttribute('aria-label', d[1]);
      b.tabIndex = -1;   // 키보드는 탭 이동으로 충분 — 버튼은 마우스·터치 보조
      b.innerHTML = d[2] < 0 ? ARROW : ARROW.replace('M15 6l-6 6 6 6', 'M9 6l6 6-6 6');
      b.addEventListener('click', function () { el.scrollBy({ left: d[2] * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' }); });
      wrap.appendChild(b);
    });
  }
  function initScrollers() {
    var els = document.querySelectorAll(SCROLLERS);
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        if (el.dataset.fadeBound) { fade(el); return; }
        el.dataset.fadeBound = '1';
        addArrows(el);
        // 현재 항목이 화면 밖일 때만, 화살표 자리를 비워 두고 보이게 민다
        var cur = el.querySelector('[aria-current="page"], [aria-current="true"], .is-active');
        if (cur) {
          var er = el.getBoundingClientRect(), cr = cur.getBoundingClientRect();
          if (cr.right > er.right - 44) el.scrollLeft += cr.left - er.left - 52;
        }
        el.addEventListener('scroll', function () { fade(el); }, { passive: true });
        if (window.ResizeObserver) new ResizeObserver(function () { fade(el); }).observe(el);
        if (window.MutationObserver) new MutationObserver(function () { fade(el); }).observe(el, { childList: true, subtree: true });
        fade(el);
      })(els[i]);
    }
  }
  window.kiceggInitScrollers = initScrollers;

  function init() {
    applyTheme(currentTheme());
    applySpoiler(spoilerOn());

    var header = document.querySelector('.site-header');
    if (header) {
      var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 4); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var themeBtn = t.closest('.theme-toggle');
      if (themeBtn) {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        write(THEME_KEY, next);
        applyTheme(next);
        return;
      }
      var sw = t.closest('[data-spoiler-toggle]');
      if (sw) { setSpoiler(!spoilerOn()); return; }
      var off = t.closest('[data-spoiler-off]');
      if (off) { setSpoiler(false); return; }
      var menuBtn = t.closest('.menu-toggle');
      if (menuBtn) {
        var nav = document.getElementById(menuBtn.getAttribute('aria-controls'));
        if (!nav) return;
        var open = nav.hidden;
        nav.hidden = !open;
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });
    // 헤더 검색 — 검색어가 있으면 기출검색으로, 비어 있거나(좁은 화면은 돋보기만) 기출검색 화면이면 본문 검색창으로
    function focusSearch() {
      var input = document.getElementById('searchInput');
      if (!input) return false;
      input.scrollIntoView({ block: 'center' }); input.focus();
      return true;
    }
    document.addEventListener('submit', function (e) {
      var form = e.target.closest && e.target.closest('.header-search');
      if (!form) return;
      var q = (form.querySelector('input[name="q"]') || {}).value || '';
      var shown = form.querySelector('input[name="q"]') && form.querySelector('input[name="q"]').offsetParent;
      if (q.trim() && shown) {
        var body = document.getElementById('searchInput');
        if (!body) return;   // 일반 제출(?q=…)
        e.preventDefault();   // 기출검색 화면: 새로고침 없이 본문 검색창에 넣어 바로 검색
        body.value = q.trim();
        body.dispatchEvent(new Event('input', { bubbles: true }));
        form.querySelector('input[name="q"]').value = '';
        focusSearch();
        return;
      }
      e.preventDefault();
      if (!focusSearch()) location.href = form.getAttribute('action') + '?focus=search';
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.header-search--icon');
      if (a && focusSearch()) e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var btn = document.querySelector('.menu-toggle[aria-expanded="true"]');
      if (!btn) return;
      var nav = document.getElementById(btn.getAttribute('aria-controls'));
      if (nav) nav.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    });

    // 현재 페이지 메뉴 표시
    var path = location.pathname.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.header-nav a, .mobile-nav a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href === path || ((path.indexOf('exam') === 0 || path === 'index.html' || path === 'archive.html') && href === '/')) links[i].setAttribute('aria-current', 'page');
    }
    initScrollers();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
