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
export const ADSENSE_CLIENT = 'ca-pub-8873636777236181';

// 광고 단위 ID 매핑.
// AdSense — 가입 후 슬롯별로 발급되는 'data-ad-slot' 값. 형식: '1234567890'
// AdFit   — 가입 후 광고단위별 'DAN-xxxxxxxxx' 키 (단위마다 다름).
// 1차 적용 범위: 시험 상세 4곳 + 홈 2곳. 맨 위·목록 사이·안내 페이지는 정책 경고가 없는지 보고 넓힌다.
// 단위 하나('kicegg', 반응형)를 여러 자리에 같이 쓴다 — 자리별 수익이 필요하면 단위를 나눠 ID 만 바꾸면 된다.
const UNIT = '7539404541';
// full-width-responsive=true 는 폰에서 폭=높이 사각형(실측 487×487)을 만들어 false 로 둔다. 얇은 띠만 받도록 본문은 horizontal, 시험 상세 사이드는 rectangle (단위 기본값 auto 는 모바일에서 300×250 이 나온다).
const ADSENSE_FORMAT = { examSidebar: 'rectangle', examRail1: 'rectangle' };
export const ADSENSE_SLOTS = {
  homeMid: UNIT,        // 홈 — 최근 시험 아래
  homeEnd: '',          // 홈 — 과목별 기출 아래
  pageTop: '',          // 안내·허브·블로그·학사 일정 페이지 위
  pageBottom: '',       // 같은 페이지들 아래
  itemsTop: '',         // 문항검색 위
  itemsBottom: '',      // 문항검색 결과 아래
  archiveTop: '',       // archive 첫 화면 맨 위(검색 결과 위)
  archiveGrid: '',      // archive 결과 목록 사이 inline (두 번째 회차 뒤)
  archiveBottom: UNIT,  // archive 하단 가로 배너
  examAfterPreview: UNIT, // exam — 시험지 미리보기 아래
  examSidebar: UNIT,    // exam — 시험 정보 옆(사이드, 예전 단일 칸)
  examRail1: UNIT,      // exam — 오른쪽 기둥 첫 칸: 직광고가 없을 때만 애드센스(나머지 두 칸은 직광고 전용)
  examAfterScores: UNIT, // exam — 등급컷 아래
  examsetBottom: '',    // exam-set 페이지 하단
  examsetEnd: '',       // exam-set 해설 글 아래(맨 끝)
  examBottom: UNIT,     // exam 상세 해설 아래(맨 끝)
};

// AdFit 광고 단위 매핑. 위치별로 다른 단위 키 + 크기.
// 광고 단위 등록 시 권장 크기:
//   가로배너 (728x90 PC / 320x100 모바일): banner 위치들
//   사각형 (250x250):                       사이드바
export const ADFIT_SLOTS = {
  homeMid:          { key: '', w: 728, h: 90  },
  homeEnd:          { key: '', w: 728, h: 90  },
  archiveTop:       { key: '', w: 728, h: 90  },
  pageTop:          { key: '', w: 728, h: 90  },
  pageBottom:       { key: '', w: 728, h: 90  },
  itemsTop:         { key: '', w: 728, h: 90  },
  itemsBottom:      { key: '', w: 728, h: 90  },
  archiveGrid:      { key: '', w: 728, h: 90  },
  examAfterPreview: { key: '', w: 728, h: 90  },
  examAfterScores:  { key: '', w: 728, h: 90  },
  archiveBottom:    { key: '', w: 728, h: 90  },
  examSidebar:      { key: '', w: 250, h: 250 },
  examsetBottom:    { key: '', w: 728, h: 90  },
  examsetEnd:       { key: '', w: 728, h: 90  },
  examBottom:       { key: '', w: 728, h: 90  },
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

// ── 4. 직광고 (data/banners.json) ───────────────────────────
// 광고주와 직접 계약한 배너. 이 파일 하나만 고치면 되고(빌드 불필요) 기간이 지나면 저절로 내려간다.
// 항목: { id, href, alt, start:'YYYY-MM-DD', end:'YYYY-MM-DD', slots:['examAfterPreview',…] 또는 '*',
//         img:{ m:'banners/x-m.png', t:'…', d:'…', s:'…' } }
//   기기별 시안(2배 해상도, 칸 폭을 가득 채워 보인다) — m 모바일 640×100(≤700px, 화면 최대 480폭 — 얇은 띠)
//   · t 태블릿 1456×200(701~1179px, 최대 900폭) · d PC 1456×180(≥1180px, 728폭)
//   · s PC 사이드 600×500(examSidebar 전용, 기둥이 있는 ≥961px, 300폭). 없는 크기는 가까운 시안으로 대신한다.
// 직광고가 있으면 그 자리에 직광고, 없을 때만 AdSense·AdFit 으로 채운다(한 자리에 둘이 뜨지 않음).
// 확인용: 주소 뒤에 ?adpreview=1 → 모든 슬롯에 샘플 시안이 뜬다(기간·data-no-ads 무시, 집계 안 함).
const PREVIEW = /[?&]adpreview=1(&|$)/.test(location.search);
const ADTEST = /[?&]adtest=1(&|$)/.test(location.search);   // 애드센스 테스트 광고(수익·정책 무관) 확인용
const BP_TABLET = 701, BP_SIDE = 961, BP_DESKTOP = 1180;  // style.css 의 레이아웃 경계와 같다(BP_SIDE = 시험 상세 오른쪽 기둥이 생기는 폭)
const SIZE = { m: [640, 100], t: [1456, 200], d: [1456, 180], s: [600, 500], r: [600, 240] };   // 2배 해상도 시안 — 화면에선 칸 폭에 맞춰 줄어든다(style.css .ad-direct__wrap)
const SAMPLE = [['', 'a'], ['-b', 'b'], ['-c', 'c']].map(([suf, id]) => ({ id: 'sample-' + id, href: '#', alt: '샘플 광고 ' + id.toUpperCase(), slots: '*',
  img: Object.fromEntries(['m', 't', 'd', 's', 'r'].map(k => [k, `banners/sample${suf}-${k}.svg`])) }));

// 노출 그룹: banners.json 의 slots 에 그룹 이름(main·detail)을 쓰면 그 그룹의 모든 자리에 순환 게재된다.
//   main = 기출검색(홈)·문항검색·학사 일정, detail = 개별 시험 상세·회차·허브 등 기출 페이지
const GROUP_OF = {
  archiveTop: 'main', archiveGrid: 'main', archiveBottom: 'main', homeMid: 'main', homeEnd: 'main',
  homeRail1: 'main', homeRail2: 'main', homeRail3: 'main', itemsTop: 'main', itemsBottom: 'main', calendarTop: 'main',
};   // 나머지(시험 상세·회차·허브·블로그)는 detail

let _bannersP;
function loadBanners() {
  if (PREVIEW) return Promise.resolve(SAMPLE);
  _bannersP = _bannersP || fetch('data/banners' + '.json', { credentials: 'omit' })   // 확장자를 쪼갠 이유: version-assets.py 가 ?v= 토큰을 붙이면 CDN 이 1년 캐시해 배너 교체가 안 보인다
    .then(r => (r.ok ? r.json() : {}))
    .then(j => (Array.isArray(j.banners) ? j.banners : []))
    .catch(() => []);
  return _bannersP;
}

const groupOf = position => GROUP_OF[position] || 'detail';

// 방문자별 순번: 페이지를 열 때마다 1씩 올라가(localStorage) 광고주 A→B→C 순으로 돈다.
// 같은 페이지의 여러 자리는 이 순번에서 한 칸씩 건너뛰며 서로 다른 광고주를 받는다.
let _seq;
function visitSeq() {
  if (_seq != null) return _seq;
  try { _seq = (parseInt(localStorage.getItem('kg-ad-seq'), 10) || 0) + 1; localStorage.setItem('kg-ad-seq', String(_seq)); }
  catch { _seq = Math.floor(Math.random() * 1000); }
  return _seq;
}
const _cursor = {};   // 그룹별로 이 페이지에서 이미 나눠 준 자리 수
function chooseBanner(list, position, unique) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // KST
  const g = groupOf(position);
  const live = list.filter(b => b && b.img && /^https?:|^#$/.test(String(b.href || '')) &&
    (b.slots === '*' || (Array.isArray(b.slots) && (b.slots.includes('*') || b.slots.includes(g) || b.slots.includes(position)))) &&
    (PREVIEW || ((!b.start || b.start <= today) && (!b.end || today <= b.end))))
    .sort((x, y) => String(x.id).localeCompare(String(y.id)));
  if (!live.length) return null;
  const idx = _cursor[g] || 0;
  if (unique && idx >= live.length) return null;   // 동시 노출 칸은 광고주 수보다 많으면 남는 칸을 비운다(같은 광고 반복 금지)
  _cursor[g] = idx + 1;
  return live[(visitSeq() + idx) % live.length];
}

function pick(img, keys) {   // 첫 번째로 있는 시안과 그 크기
  for (const k of keys) if (img[k]) return { url: img[k], w: SIZE[k][0], h: SIZE[k][1] };
  return null;
}

function renderDirect(container, b, position) {
  const rail = /Rail\d$/.test(position);   // 오른쪽 기둥·가로 나열 칸: 시안 하나(r)만 쓴다
  const side = position === 'examSidebar';
  const m = pick(b.img, ['m', 't', 'd']);
  const t = pick(b.img, ['t', 'd', 'm']);
  const d = pick(b.img, side ? ['s', 'd', 't', 'm'] : ['d', 't', 'm']);
  const wrap = document.createElement('div');
  wrap.className = 'ad-direct__wrap';
  const label = document.createElement('span');
  label.className = 'ad-direct__label';
  label.textContent = '광고';
  const a = document.createElement('a');
  a.className = 'ad-direct';
  a.href = b.href;
  a.rel = 'sponsored noopener noreferrer';
  if (b.href !== '#') a.target = '_blank'; else a.addEventListener('click', e => e.preventDefault());
  const pic = document.createElement('picture');
  for (const [min, c] of rail ? [] : (side ? [[BP_SIDE, d], [BP_TABLET, t]] : [[BP_DESKTOP, d], [BP_TABLET, t]])) {
    const src = document.createElement('source');
    src.media = `(min-width:${min}px)`;
    src.srcset = c.url; src.width = c.w; src.height = c.h;
    pic.appendChild(src);
  }
  const img = document.createElement('img');
  const own = rail ? pick(b.img, ['r', 's', 'd', 't', 'm']) : m;
  img.src = own.url; img.width = own.w; img.height = own.h;
  img.alt = b.alt || '광고'; img.loading = 'lazy'; img.decoding = 'async';
  pic.appendChild(img);
  a.appendChild(pic);
  wrap.append(label, a);
  container.replaceChildren(wrap);
  container.style.display = '';
  container.classList.add('ad-slot--filled', 'ad-slot--direct');
  if (PREVIEW) return;
  const params = { ad_id: b.id, ad_slot: position };
  a.addEventListener('click', () => window.kgTrack && window.kgTrack('ad_click', params));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); window.kgTrack && window.kgTrack('ad_impression', params); }
    }, { threshold: 0.5 });
    io.observe(a);
  }
}

// ── 5. 슬롯 렌더 ────────────────────────────────────────────
// container: 빈 div. position: ADSENSE_SLOTS / ADFIT_SLOTS / banners.json slots 의 key.
// 순서: 직광고 → AdSense → AdFit. 채울 게 없으면 자리를 차지하지 않도록 숨긴다.
export function renderAdSlot(container, position, opts = {}) {
  if (!container) return;
  // 등급컷 같은 고유 정보가 없는 얇은 페이지(<body data-no-ads>)에는 광고를 내지 않는다 — 콘텐츠가 부족한 화면 광고 정책 대응.
  if (!PREVIEW && document.body && document.body.hasAttribute('data-no-ads')) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'none';   // 직광고 목록을 받는 동안 빈 칸이 보이지 않게
  // 이 화면 폭에서 쓰지 않는 자리(data-ad-media="(min-width:701px)" 등)는 광고를 나눠 주지도 요청하지도 않는다.
  const mq = container.dataset.adMedia;
  if (mq && window.matchMedia && !window.matchMedia(mq).matches) return;
  const unique = container.hasAttribute('data-ad-unique');
  loadBanners().then(list => {
    const b = chooseBanner(list, position, unique);
    if (b) renderDirect(container, b, position);
    else renderBackfill(container, position, opts);
  });
}

function renderBackfill(container, position, opts) {
  const adsenseSlot = ADSENSE_SLOTS[position];
  const adfitSlot   = ADFIT_SLOTS[position];

  if (ADSENSE_CLIENT && adsenseSlot) {
    bootstrapAdSense();
    container.style.display = '';
    container.classList.add('ad-slot--filled', 'ad-slot--adsense');
    // 이 화면 폭에서 숨겨진 자리(예: 폰의 시험 상세 사이드)는 폭 0 이라 요청이 오류만 낸다 — 요청하지 않는다.
    if (!container.offsetWidth) { container.classList.remove('ad-slot--filled', 'ad-slot--adsense'); container.style.display = 'none'; return; }
    container.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${ADSENSE_CLIENT}"
           data-ad-slot="${adsenseSlot}"
           data-ad-format="${opts.format || ADSENSE_FORMAT[position] || 'horizontal'}"${ADTEST ? ' data-adtest="on"' : ''}
           data-full-width-responsive="false"></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    return;
  }

  if (adfitSlot && adfitSlot.key) {
    bootstrapAdFit();
    const w = opts.adfitWidth  || adfitSlot.w || 320;
    const h = opts.adfitHeight || adfitSlot.h || 100;
    container.style.display = '';
    container.classList.add('ad-slot--filled');
    container.innerHTML = `
      <ins class="kakao_ad_area" style="display:none;"
           data-ad-unit="${adfitSlot.key}"
           data-ad-width="${w}"
           data-ad-height="${h}"></ins>`;
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
