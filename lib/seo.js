'use strict';
// SEO 메타 동적 갱신 + JSON-LD 구조화 데이터 헬퍼.
// SPA에서 페이지 로드 후 검색 엔진 친화적 메타 부여.

export function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setMetaProp(prop, content) {
  let el = document.querySelector(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', prop);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setCanonical(href) {
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
