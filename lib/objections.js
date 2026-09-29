// 이의신청 기록 페이지 — 주소의 #y2026-csat 회차를 펼치고 그 위치로 이동
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (el && el.tagName === 'DETAILS') {
    el.open = true;
    el.scrollIntoView({ block: 'start' });
  }
}
openFromHash();
window.addEventListener('hashchange', openFromHash);
