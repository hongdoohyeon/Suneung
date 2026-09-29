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

// 광고 단위 ID 매핑.
// AdSense — 가입 후 슬롯별로 발급되는 'data-ad-slot' 값. 형식: '1234567890'
// AdFit   — 가입 후 광고단위별 'DAN-xxxxxxxxx' 키 (단위마다 다름).
export const ADSENSE_SLOTS = {
  homeMid: '',          // 홈 — 최근 시험 아래
  archiveGrid: '',      // archive 결과 목록 사이 inline (두 번째 회차 뒤)
  archiveBottom: '',    // archive 하단 가로 배너
  examAfterPreview: '', // exam — 시험지 미리보기 아래
  examSidebar: '',      // exam — 시험 정보 옆(사이드)
  examAfterScores: '',  // exam — 등급컷 아래
  examsetBottom: '',    // exam-set 페이지 하단
};

// AdFit 광고 단위 매핑. 위치별로 다른 단위 키 + 크기.
// 광고 단위 등록 시 권장 크기:
//   가로배너 (728x90 PC / 320x100 모바일): banner 위치들
//   사각형 (250x250):                       사이드바
export const ADFIT_SLOTS = {
  homeMid:          { key: '', w: 728, h: 90  },
  archiveGrid:      { key: '', w: 728, h: 90  },
  examAfterPreview: { key: '', w: 728, h: 90  },
  examAfterScores:  { key: '', w: 728, h: 90  },
  archiveBottom:    { key: '', w: 728, h: 90  },
  examSidebar:      { key: '', w: 250, h: 250 },
  examsetBottom:    { key: '', w: 728, h: 90  },
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
function _adfitAnyKey() {
  return Object.values(ADFIT_SLOTS).some(s => s && s.key);
}
export function bootstrapAdFit() {
  if (_adfitLoaded || !_adfitAnyKey()) return;
  _adfitLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = '//t1.daumcdn.net/kas/static/ba.min.js';
  document.head.appendChild(s);
}

// ── 4. 슬롯 렌더 ────────────────────────────────────────────
// container: 빈 div. position: ADSENSE_SLOTS / ADFIT_SLOTS 의 key.
// AdSense + AdFit 동시 노출 안 함 — AdSense 우선, 없으면 AdFit 폴백.
export function renderAdSlot(container, position, opts = {}) {
  if (!container) return;
  // 등급컷 같은 고유 정보가 없는 얇은 페이지(<body data-no-ads>)에는 광고를 내지 않는다 — 콘텐츠가 부족한 화면 광고 정책 대응.
  if (document.body && document.body.hasAttribute('data-no-ads')) {
    container.style.display = 'none';
    return;
  }
  const adsenseSlot = ADSENSE_SLOTS[position];
  const adfitSlot   = ADFIT_SLOTS[position];

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

  if (adfitSlot && adfitSlot.key) {
    bootstrapAdFit();
    const w = opts.adfitWidth  || adfitSlot.w || 320;
    const h = opts.adfitHeight || adfitSlot.h || 100;
    container.innerHTML = `
      <ins class="kakao_ad_area" style="display:none;"
           data-ad-unit="${adfitSlot.key}"
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
