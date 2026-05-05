'use strict';
// 광고 통합 — Google AdSense + Kakao AdFit.
// 승인 받으면 아래 ID 만 채워넣으면 전 페이지 자동 활성.
//
// ⚠️ 광고 활성화 전에 6개 HTML의 CSP meta를 갱신해야 광고가 차단되지 않습니다.
//   AdSense 도메인 (script-src + frame-src + connect-src):
//     https://pagead2.googlesyndication.com https://*.googlesyndication.com
//     https://*.doubleclick.net https://*.googleads.g.doubleclick.net
//     https://*.google.com https://*.adtrafficquality.google
//   AdFit 도메인 (script-src + img-src + frame-src):
//     https://t1.daumcdn.net https://display.ad.daum.net
//     https://analytics.ad.daum.net

// ── 1. 설정 ─────────────────────────────────────────────────
// AdSense Publisher ID. 형식: 'ca-pub-1234567890123456'
// 승인 받기 전엔 빈 문자열 — 광고 미렌더, 검증 스크립트도 미주입.
export const ADSENSE_CLIENT = '';

// AdFit Publisher ID. 형식: 'DAN-xxxxxxxxx' (8자리)
export const ADFIT_KEY = '';

// 광고 슬롯 ID 매핑 — AdSense 가입 후 슬롯별로 발급되는 'data-ad-slot' 값.
// 각 위치별로 다른 슬롯 사용 (성과 추적 위해).
export const ADSENSE_SLOTS = {
  archiveGrid: '',   // archive 카드 그리드 사이 inline
  archiveBottom: '', // archive 하단 가로 배너
  examSidebar: '',   // exam 페이지 사이드바 하단
  examsetBottom: '', // exam-set 페이지 하단
  patchnotesBottom: '', // patchnotes 하단
};

// ── 2. AdSense 부트스트랩 ───────────────────────────────────
// <head> 한 번만 호출. ID 없으면 no-op.
let _adsenseLoaded = false;
export function bootstrapAdSense() {
  if (_adsenseLoaded || !ADSENSE_CLIENT) return;
  _adsenseLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);
}

// ── 3. AdFit 부트스트랩 ─────────────────────────────────────
let _adfitLoaded = false;
export function bootstrapAdFit() {
  if (_adfitLoaded || !ADFIT_KEY) return;
  _adfitLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = '//t1.daumcdn.net/kas/static/ba.min.js';
  document.head.appendChild(s);
}

// ── 4. 슬롯 렌더 ────────────────────────────────────────────
// container: 빈 div. position: ADSENSE_SLOTS 의 key.
// AdSense + AdFit 동시 노출 안 함 — AdSense 우선, 없으면 AdFit 폴백.
export function renderAdSlot(container, position, opts = {}) {
  if (!container) return;
  const adsenseSlot = ADSENSE_SLOTS[position];

  if (ADSENSE_CLIENT && adsenseSlot) {
    bootstrapAdSense();
    container.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${ADSENSE_CLIENT}"
           data-ad-slot="${adsenseSlot}"
           data-ad-format="${opts.format || 'auto'}"
           data-full-width-responsive="true"></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    container.classList.add('ad-slot--filled');
    return;
  }

  if (ADFIT_KEY) {
    bootstrapAdFit();
    // AdFit 단위코드 별로 width/height 다름. 옵션으로 받음.
    const w = opts.adfitWidth || 320;
    const h = opts.adfitHeight || 100;
    container.innerHTML = `
      <ins class="kakao_ad_area" style="display:none;"
           data-ad-unit="${ADFIT_KEY}"
           data-ad-width="${w}"
           data-ad-height="${h}"></ins>`;
    container.classList.add('ad-slot--filled');
    return;
  }

  // 둘 다 미설정 — 슬롯 자리 차지하지 않도록 hide.
  container.style.display = 'none';
}

// 페이지 로드 시 모든 [data-ad-position] 자동 렌더.
export function renderAllAdSlots() {
  document.querySelectorAll('[data-ad-position]').forEach(el => {
    renderAdSlot(el, el.dataset.adPosition, {
      format: el.dataset.adFormat,
      adfitWidth: el.dataset.adfitWidth,
      adfitHeight: el.dataset.adfitHeight,
    });
  });
}
