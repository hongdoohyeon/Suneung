// 상세 페이지 2차 탭 (자료 · 등급컷 | 이의신청) — body[data-exam-tab] 로 보이는 영역을 바꾼다.
// 주소 #objections 로 들어오면 이의신청 탭을 연다.
const tabs = document.querySelectorAll('[data-exam-tab]');
if (tabs.length) {
  const show = (name, push) => {
    document.body.dataset.examTab = name;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.examTab === name)));
    if (push) history.replaceState(null, '', name === 'obj' ? '#objections' : location.pathname + location.search);
  };
  tabs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    show(t.dataset.examTab, true);
    document.querySelector('.exam-tabs')?.scrollIntoView({ block: 'nearest' });
  }));
  const fromHash = () => show(location.hash === '#objections' ? 'obj' : 'main', false);
  fromHash();
  window.addEventListener('hashchange', fromHash);
}
