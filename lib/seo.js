'use strict';
// SEO 메타 동적 갱신 + JSON-LD 구조화 데이터 헬퍼.
// SPA에서 페이지 로드 후 검색 엔진 친화적 메타 부여.
// 빌드가 만든 정적 페이지(exam-123.html, exam-set-….html)는 제목·설명·canonical·JSON-LD 가 이미 맞게 들어 있다
// → 스크립트가 덮어쓰지 않는다 (JS 를 실행하는 검색엔진이 다른 값을 보게 되는 문제 방지).
export const STATIC_PAGE = /\/exam-(\d+|set-[\w-]+)\.html$/.test(location.pathname);

export function setMeta(name, content) {
  if (STATIC_PAGE) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setMetaProp(prop, content) {
  if (STATIC_PAGE) return;
  let el = document.querySelector(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', prop);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setCanonical(href) {
  if (STATIC_PAGE) return;
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// JSON-LD 구조화 데이터 주입. id 별로 단일 script 유지 (중복 방지).
export function injectJsonLd(scriptId, payload) {
  if (STATIC_PAGE) return;
  let s = document.getElementById(scriptId);
  if (!s) {
    s = document.createElement('script');
    s.id = scriptId;
    s.type = 'application/ld+json';
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify(payload);
}

// title + description + og:* + canonical 한 번에.
export function applySeo({ title, description, url, jsonLd, jsonLdId = 'jsonld-page' }) {
  if (title) {
    document.title = title;
    setMetaProp('og:title', title);
  }
  if (description) {
    setMeta('description', description);
    setMetaProp('og:description', description);
  }
  if (url) {
    setMetaProp('og:url', url);
    setCanonical(url);
  }
  if (jsonLd) injectJsonLd(jsonLdId, jsonLd);
}
