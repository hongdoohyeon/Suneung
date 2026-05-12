// 화면 너비에 따라 input placeholder 를 데스크톱/모바일 버전으로 교체.
// 대상: `[data-placeholder-mobile]` 가 붙은 input. 첫 placeholder 를 desktop 으로 기억해두고
// 600px 이하면 mobile, 그 외 desktop. resize 시에도 재적용.

const MOBILE_MQ = '(max-width: 600px)';

function apply(inp) {
  const desktop = inp.dataset.placeholderDesktop ?? inp.placeholder;
  const mobile  = inp.dataset.placeholderMobile  ?? desktop;
  const isMobile = window.matchMedia(MOBILE_MQ).matches;
  inp.placeholder = isMobile ? mobile : desktop;
}

const inputs = document.querySelectorAll('input[data-placeholder-mobile]');
for (const inp of inputs) {
  // 최초 placeholder 를 desktop 기본값으로 기억 (HTML 의 placeholder 가 desktop 텍스트)
  if (!inp.dataset.placeholderDesktop) {
    inp.dataset.placeholderDesktop = inp.placeholder;
  }
  apply(inp);
}

if (inputs.length > 0) {
  const onResize = () => inputs.forEach(apply);
  window.addEventListener('resize', onResize, { passive: true });
}
