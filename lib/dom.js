'use strict';
// 공통 DOM/HTML 유틸 — 4개 파일에 복제되던 코드 통합.

// HTML 이스케이프. 5종 (`&<>"'`) 모두 처리.
export function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// HTML 속성용 — escHtml과 동일 (별칭, 호환성 유지).
export const escAttr = escHtml;

// 문제지·정답·음원은 kicegg.com/files/ 로 서빙한다(Worker kicegg-files → suneung-files, 2026-10).
// 데이터(exams.json)엔 원래 workers.dev 주소가 그대로 있고, 화면에 내보낼 때만 바꾼다. build-data.py public_files 와 같은 규칙.
const FILES_WORKER = 'https://suneung-files.hdh061224.workers.dev/';
const FILES_PUBLIC = 'https://kicegg.com/files/';
export const publicFileUrl = url => (typeof url === 'string' && url.startsWith(FILES_WORKER)) ? FILES_PUBLIC + url.slice(FILES_WORKER.length) : url;

// 외부 URL 삽입 안전성 검증 (XSS 방지).
// http(s) 만 허용. javascript:, data:, // 등 차단. 상대 경로 허용.
export function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const u = new URL(raw);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? publicFileUrl(raw) : '';
    } catch {
      return '';
    }
  }
  if (raw.startsWith('//')) return '';
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  return /^[\w./%+\-~()[\]]+(?:\?[^\s<>"']*)?(?:#[^\s<>"']*)?$/u.test(raw) ? raw : '';
}

// id로 element. 짧게 쓰기용 별칭.
export const $ = id => document.getElementById(id);
