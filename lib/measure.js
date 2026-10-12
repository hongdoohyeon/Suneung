'use strict';
// GA4 측정 — 페이지뷰 + 자료 다운로드·검색·필터·미리보기·듣기·해설 읽기 등 행동 이벤트.
// ─ 활성화: GA_ID 에 GA4 측정 ID('G-XXXXXXXXXX')를 채우면 gtag 가 로드된다.
// ─ 비활성: GA_ID 가 '' 이면 스크립트를 받지 않고 네트워크 요청 0. window.kgTrack 은 그래도 있어서
//   다른 스크립트는 켜짐/꺼짐을 신경 쓰지 않고 window.kgTrack?.(...) 을 부르면 된다.
// ─ 모든 페이지에 defer 로 들어가 본문(body)이 다 읽힌 뒤, 모듈 스크립트(app.js·exam.js)보다 먼저 돈다.
// ※ 이벤트 매개변수를 GA 보고서에서 보려면 GA 관리 › 맞춤 정의에 등록해야 한다(목록은 docs/analytics.md).
// ※ 활성화 시 각 페이지 CSP 의 script-src 에 www.googletagmanager.com,
//   connect-src 에 *.google-analytics.com 이 이미 허용돼 있어야 한다(빌드 템플릿에 반영됨).
(function () {
  // 2026-07-13 운영 CSP 가 GA 수집 주소를 막아 꺼 뒀다가, 지금 CSP(헤더·meta 모두 connect-src 에
  // *.google-analytics.com · *.analytics.google.com 허용)에서 위반 0건을 확인하고 다시 켰다(2026-10-06).
  var GA_ID = 'G-3YG4PF9T7J';

  window.dataLayer = window.dataLayer || [];
  function gtag() { if (GA_ID) window.dataLayer.push(arguments); }
  function track(name, params) { gtag('event', name, params || {}); }
  window.kgTrack = track;
  if (!GA_ID) { track.exam = track.archive = function () {}; return; }
  window.gtag = gtag;

  // gtag 본체(~150KB)는 첫 화면 데이터·글꼴과 대역폭을 다투지 않게 페이지 로드가 끝난 뒤 한가할 때 받는다.
  // 아래 gtag() 호출은 dataLayer 에 쌓였다가 본체가 오면 그대로 전송된다.
  function loadGtag() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }
  function whenIdle() { (window.requestIdleCallback || function (f) { setTimeout(f, 1200); })(loadGtag, { timeout: 4000 }); }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });

  function cut(s, n) { s = String(s == null ? '' : s); return s.length > (n || 100) ? s.slice(0, n || 100) : s; }
  function store(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // 페이지 묶음 — GA 기본 측정기준 '콘텐츠 그룹'(맞춤 정의 등록 없이 보고서에 바로 나온다)
  function contentGroup() {
    var b = document.body;
    if (b && b.classList.contains('page-404')) return '404';
    var p = location.pathname.split('/').pop().replace(/\.html$/, '');
    if (!p || p === 'index' || p === 'archive') return 'home';
    if (/^exam-\d+$/.test(p) || p === 'exam') return 'exam';
    if (/^exam-set/.test(p)) return 'exam_set';
    if (/^blog/.test(p)) return 'blog';
    if (/^(suneung|hakpyeong|nonsul)-/.test(p) || /^(essay|ged|sets)$/.test(p)) return 'hub';
    if (p === 'calendar') return 'calendar';
    return 'info';
  }
  var group = contentGroup();

  // 사용자 속성(맞춤 정의 › 사용자 범위로 등록): 화면 모드·스포일러 방지·앱 안 브라우저·홈 화면 앱
  var ua = navigator.userAgent;
  gtag('set', 'user_properties', {
    theme_pref: store('kicegg:theme') || 'system',
    spoiler: document.documentElement.getAttribute('data-spoiler') === 'on' ? 'on' : 'off',
    in_app: /; wv\)|KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|everytimeApp|DaumApps|whale\/.*inapp/i.test(ua) ? 'yes' : 'no',
    standalone: window.matchMedia && matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no',
  });

  // 회차 페이지는 본문 data-* 에 학년도·시험 종류가 있다 → 이 페이지의 모든 이벤트에 붙인다
  var bd = document.body ? document.body.dataset : {};
  if (group === 'exam_set' && bd.type) gtag('set', { exam_type: bd.type, grade_year: bd.year, curriculum: bd.curriculum });

  gtag('js', new Date());
  gtag('config', GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    content_group: group,
  });

  // 과목 상세: exam.js 가 시험 정보를 받은 뒤 부른다 → 이후 이벤트(다운로드·미리보기·듣기)에 과목·학년도가 붙는다
  track.exam = function (e) {
    if (!e) return;
    var ctx = {
      exam_id: String(e.id),
      exam_group: e.typeGroup || '',
      exam_type: e.type || '',
      grade_year: e.gradeYear != null ? String(e.gradeYear) : '',
      subject: cut(e.subSubject || e.subject || ''),
    };
    gtag('set', ctx);
    track('exam_view', ctx);
  };

  // 기출검색: 화면 상태(주소 쿼리)가 바뀔 때마다 app.js 가 부른다. 입력 중엔 보내지 않고 1.5초 멈추면 한 번.
  // 첫 호출(처음 열린 화면의 필터)은 페이지뷰 주소에 이미 있으니 기준만 잡는다. 검색어는 헤더 검색으로 온 것이라 센다.
  var lastQ = '', lastF = null, archTimer = 0;
  function archState(search) {
    // 필터 키만(app.js STATE_PARAMS 에서 검색어·쪽 번호 뺀 것) — utm 같은 바깥 매개변수는 섞지 않는다
    var p = new URLSearchParams(search), f = [];
    ['tab', 'typeGroup', 'type', 'gradeYear', 'subject', 'subjects', 'subSubject', 'subSubjects', 'has', 'cut', 'sort', 'tier'].forEach(function (k) {
      if (p.get(k)) f.push(k + '=' + p.get(k));
    });
    return { q: (p.get('q') || '').trim(), f: f.join('&') };
  }
  track.archive = function (search, count) {
    if (lastF === null) lastF = archState(search).f;
    clearTimeout(archTimer);
    archTimer = setTimeout(function () {
      var s = archState(search);
      if (s.q && s.q !== lastQ) {
        track('search', { search_term: cut(s.q), result_count: count });
        if (!count) track('search_no_results', { search_term: cut(s.q) });
      }
      if (s.f && s.f !== lastF) track('filter_apply', { filters: cut(s.f), result_count: count });
      lastQ = s.q; lastF = s.f;
    }, 1500);
  };

  // 자료 종류 — 다운로드 파일 이름(문제지/정답/해설/듣기/대본)으로 가른다
  function fileKind(name) {
    if (/대본|script/i.test(name)) return 'script';
    if (/듣기|\.mp3$/i.test(name)) return 'listening';
    if (/해설|풀이/.test(name)) return 'solution';
    if (/정답|답안|답지/.test(name)) return 'answer';
    if (/문제/.test(name)) return 'question';
    return 'other';
  }
  // 어디서 눌렀는지 — 가장 가까운 id 붙은 구역(사이드바·독·결과 목록 등)
  function area(el) {
    var a = el.closest('[id]');
    return a ? cut(a.id, 40) : '';
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var el;

    // 핵심 전환: 자료 다운로드. download.js 가 내부에서 만드는 blob: 링크 클릭은 같은 다운로드라 뺀다.
    // (GA 향상된 측정의 자동 file_download 와 겹치지 않게 이름을 따로 쓴다)
    if ((el = t.closest('a[download]'))) {
      if (/^(blob|data):/.test(el.href)) return;
      var name = el.getAttribute('download') || '';
      if (!name) try { name = new URL(el.href).searchParams.get('name') || el.href; } catch (x) { name = el.href; }
      track('material_download', {
        file_kind: fileKind(name),
        file_ext: (name.match(/\.(\w+)$/) || [, ''])[1].toLowerCase(),
        file_name: cut(name),
        click_area: area(el),
      });
      return;
    }
    if ((el = t.closest('.preview__loading-action'))) {
      track('preview_open', { viewer: el.closest('#previewQViewer') ? 'question' : 'script' });
      return;
    }
    if ((el = t.closest('.exam-tabs__tab[data-exam-tab]'))) { track('exam_tab', { tab: el.dataset.examTab }); return; }
    if ((el = t.closest('#examShareBtn'))) { track('share', { method: navigator.share ? 'native' : 'copy', content_type: group }); return; }
    if ((el = t.closest('.lp__ch'))) { track('listen_control', { control: 'chapter', chapter: cut(el.textContent.trim(), 20) }); return; }
    if ((el = t.closest('.lp__speed, .lp__loop'))) { track('listen_control', { control: el.classList.contains('lp__speed') ? 'speed' : 'loop' }); return; }
    if ((el = t.closest('#selectToggle'))) { track('select_mode', {}); return; }
    // 검색 결과에서 몇 번째 항목을 눌렀는지
    if ((el = t.closest('#cardsGrid a[href*="exam-"]'))) {
      var links = document.querySelectorAll('#cardsGrid a[href*="exam-"]');
      track('result_click', { position: Array.prototype.indexOf.call(links, el) + 1, search_term: cut(lastQ) });
    }
  }, { passive: true });

  // 영어 듣기 — 미디어 이벤트는 거품이 안 올라와 캡처 단계로 받는다. 같은 음원은 페이지당 한 번씩만.
  var heard = {};
  function once(key, name, params) { if (heard[key]) return; heard[key] = 1; track(name, params); }
  document.addEventListener('play', function (e) {
    if (e.target.tagName === 'AUDIO') once('s' + e.target.currentSrc, 'listen_start', {});
  }, true);
  document.addEventListener('timeupdate', function (e) {
    var a = e.target;
    if (a.tagName === 'AUDIO' && a.duration && a.currentTime / a.duration >= 0.5) once('h' + a.currentSrc, 'listen_progress', { percent: 50 });
  }, true);
  document.addEventListener('ended', function (e) {
    if (e.target.tagName === 'AUDIO') once('e' + e.target.currentSrc, 'listen_complete', {});
  }, true);

  // 해설 글을 끝까지 읽었는지 — 글의 마지막 문단이 화면에 들어오면 한 번(머문 시간 함께).
  // exam.js 가 본문을 나중에 다시 그리므로 요소를 붙잡아 두지 않고 스크롤할 때마다 다시 찾는다.
  var t0 = Date.now(), reads = [['#review', 'set_review'], ['#examBody', 'exam_note']], readTimer = 0;
  if (group === 'blog') reads.push(['main', 'blog']);
  function checkReads() {
    readTimer = 0;
    reads = reads.filter(function (x) {
      var box = document.querySelector(x[0]), last = box && !box.hidden && box.lastElementChild;
      if (!last) return true;
      var r = last.getBoundingClientRect();
      if (!r.height || r.top > innerHeight) return true;
      track('article_read', { article: x[1], engaged_sec: Math.round((Date.now() - t0) / 1000) });
      return false;
    });
    if (!reads.length) removeEventListener('scroll', onScroll);
  }
  function onScroll() { if (!readTimer) readTimer = setTimeout(checkReads, 400); }
  addEventListener('scroll', onScroll, { passive: true });

  // 사이트 스크립트 오류 — 사용자 화면에서만 나는 버그를 잡는다(페이지당 3건, 다른 출처 스크립트 제외)
  var errs = 0;
  function report(msg, src) {
    if (errs >= 3) return;
    errs++;
    track('js_error', { message: cut(msg), source: cut(src, 80) });
  }
  window.addEventListener('error', function (e) {
    // 우리 .js 파일만 — 인라인은 CSP 로 금지라 페이지 주소로 찍힌 오류는 앱 안 브라우저(웨일·웹뷰)가 끼워 넣은 코드다
    if (!e.filename || e.filename.indexOf(location.origin) !== 0 || !/\.js(\?|$)/.test(e.filename)) return;
    report(e.message, e.filename.split('/').pop().split('?')[0] + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    if (r && r.name === 'AbortError') return;
    report('promise: ' + (r && r.message || r), '');
  });
})();
