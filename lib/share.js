'use strict';
// 공유 버튼 — Web Share API (모바일 네이티브 시트) + 클립보드 fallback.

export async function shareLink({ title, text, url }) {
  const u = url || location.href;
  // 모바일 네이티브 공유 시트 (카톡·문자·메일·Drive 등)
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: u });
      return 'shared';
    } catch (err) {
      // 사용자가 cancel 또는 권한 거부
      if (err && err.name === 'AbortError') return 'cancelled';
      // fallback to clipboard
    }
  }
  // 클립보드 fallback
  try {
    await navigator.clipboard.writeText(u);
    showToast('링크가 복사되었어요');
    return 'copied';
  } catch {
    // 마지막 fallback — prompt
    window.prompt('이 링크를 복사하세요', u);
    return 'prompt';
  }
}

let _toastEl = null;
function showToast(msg) {
  if (_toastEl) _toastEl.remove();
  _toastEl = document.createElement('div');
  _toastEl.className = 'share-toast';
  _toastEl.textContent = msg;
  _toastEl.setAttribute('role', 'status');
  document.body.appendChild(_toastEl);
  // 다음 frame에서 visible 클래스 (transition 동작)
  requestAnimationFrame(() => _toastEl.classList.add('share-toast--visible'));
  setTimeout(() => {
    _toastEl?.classList.remove('share-toast--visible');
    setTimeout(() => { _toastEl?.remove(); _toastEl = null; }, 200);
  }, 1800);
}
