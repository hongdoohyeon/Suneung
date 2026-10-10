// 상세 페이지 2차 탭 (자료 · 등급컷 | 듣기 | 이의신청) — body[data-exam-tab] 로 보이는 영역을 바꾼다.
// 주소 #listening / #objections 로 들어오면 그 탭을 연다.
import { vt, underline } from './motion.js?v=2d4e8547ef588617b049';

const tabs = document.querySelectorAll('[data-exam-tab]');
const HASH = { obj: '#objections', listen: '#listening' };
if (tabs.length) {
  const order = [...tabs].map((t) => t.dataset.examTab);
  let placeInk = null;
  const apply = (name, push) => {
    document.body.dataset.examTab = name;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.examTab === name)));
    if (push) history.replaceState(null, '', HASH[name] || location.pathname + location.search);
    placeInk?.(true);
  };
  // 탭을 바꾸면 밑줄이 옆 탭으로 옮겨 가고, 아래 내용은 그 탭이 놓인 쪽에서 밀려 들어온다(머리·탭 줄은 제자리)
  const show = (name, push) => {
    const from = order.indexOf(document.body.dataset.examTab || 'main'), to = order.indexOf(name);
    if (from < 0 || from === to) { apply(name, push); return; }
    vt(to > from ? 'xtab-next' : 'xtab-prev', () => apply(name, push));
  };
  tabs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    show(t.dataset.examTab, true);
    document.querySelector('.exam-tabs')?.scrollIntoView({ block: 'nearest' });
  }));
  const hashTab = () => Object.keys(HASH).find((k) => HASH[k] === location.hash && document.querySelector(`[data-exam-tab="${k}"]`)) || 'main';
  const fromHash = () => show(hashTab(), false);
  apply(hashTab(), false);   // 첫 표시는 움직임 없이
  const row = document.querySelector('.exam-tabs');
  if (row) placeInk = underline(row, '[aria-selected="true"]');
  window.addEventListener('hashchange', fromHash);
}
