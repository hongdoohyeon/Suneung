'use strict';
// 사이트 공통 환경설정 — <head> 에서 동기 로드 (CSP상 인라인 스크립트 불가).
//  · 테마: 시스템 설정 기본, 헤더 버튼으로 전환 → localStorage 'kicegg:theme'
//  · 스포일러 방지: 기본 켜짐 → html[data-spoiler="on"] 이면 등급컷·난이도 블러
//  · 헤더 스크롤 경계선, 모바일 메뉴, 가로 스크롤 탭 가장자리 흐림
(function () {
  var root = document.documentElement;

  // 기출검색: 목록 데이터를 스크립트 모듈 로딩을 기다리지 않고 바로 요청 (app.js 가 이 요청을 이어받음)
  try {
    if (/\/(archive\.html|index\.html)?$/.test(location.pathname)) {   // 첫 화면(/)도 기출검색
      var me = document.currentScript && document.currentScript.src;
      var ver = me ? (me.split('v=')[1] || '') : '';
      var tab = new URLSearchParams(location.search).get('tab') || 'senior';
      if (/^[a-z]+$/.test(tab)) {
        window.__kiceggArchive = { tab: tab, data: fetch('data/archive/' + tab + '.json?v=' + ver).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) };
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
  var SCROLLERS = '.hscroll, .latest-rail, .subbar';
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  function fade(el) {
    var l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
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
        var cur = el.querySelector('[aria-current="page"], .is-active');
        if (cur && cur.offsetLeft + cur.offsetWidth > el.clientWidth) el.scrollLeft = cur.offsetLeft - 40;
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
      if (href === path || ((path.indexOf('exam') === 0 || path === 'index.html') && href === 'archive.html')) links[i].setAttribute('aria-current', 'page');
    }
    initScrollers();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
