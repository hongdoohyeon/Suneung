'use strict';
// GA4 측정 부트스트랩 + 핵심 전환(자료 다운로드) 이벤트.
// ─ 활성화: 아래 GA_ID 에 GA4 측정 ID('G-XXXXXXXXXX')를 채우면 gtag 가 로드되고
//   페이지뷰 + file_download 이벤트가 수집된다.
// ─ 비활성(기본): GA_ID 가 '' 이면 어떤 스크립트도 로드하지 않고 네트워크 요청 0 (완전 no-op).
//   lib/ads.js 의 ADSENSE_CLIENT='' 와 동일한 안전 비활성 패턴.
// ※ 활성화 시 각 페이지 CSP 의 script-src 에 www.googletagmanager.com,
//   connect-src 에 *.google-analytics.com 이 이미 허용돼 있어야 한다(빌드 템플릿에 반영됨).
(function () {
  // Cloudflare Analytics가 운영 지표를 담당한다. 현재 HTTP CSP가 GA 보조 수집
  // 엔드포인트를 허용하지 않아 콘솔 오류가 나므로 GA4는 명시적으로 비활성화.
  var GA_ID = '';
  if (!GA_ID) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

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
