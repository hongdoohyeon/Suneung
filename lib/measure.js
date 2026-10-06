'use strict';
// (2026-10-06 버전 토큰 갱신 — CDN 이 새 토큰에 옛 style.css 를 붙박은 것 풀기)
// GA4 측정 부트스트랩 + 핵심 전환(자료 다운로드) 이벤트.
// ─ 활성화: 아래 GA_ID 에 GA4 측정 ID('G-XXXXXXXXXX')를 채우면 gtag 가 로드되고
//   페이지뷰 + file_download 이벤트가 수집된다.
// ─ 비활성(기본): GA_ID 가 '' 이면 어떤 스크립트도 로드하지 않고 네트워크 요청 0 (완전 no-op).
//   lib/ads.js 의 ADSENSE_CLIENT='' 와 동일한 안전 비활성 패턴.
// ※ 활성화 시 각 페이지 CSP 의 script-src 에 www.googletagmanager.com,
//   connect-src 에 *.google-analytics.com 이 이미 허용돼 있어야 한다(빌드 템플릿에 반영됨).
(function () {
  // 2026-07-13 운영 CSP 가 GA 수집 주소를 막아 꺼 뒀다가, 지금 CSP(헤더·meta 모두 connect-src 에
  // *.google-analytics.com · *.analytics.google.com 허용)에서 위반 0건을 확인하고 다시 켰다(2026-10-06).
  var GA_ID = 'G-3YG4PF9T7J';
  if (!GA_ID) return;

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

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  // 핵심 전환: 문제지/정답/해설/듣기 등 다운로드 클릭(이벤트 위임 — SSG/JS 렌더 무관)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (!a) return;
    gtag('event', 'file_download', {
      file_name: a.getAttribute('download') || a.href,
      link_url: a.href,
    });
  }, { passive: true });
})();
