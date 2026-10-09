'use strict';
// 폰 상세 페이지 하단 고정 자료 바 — 맨 위 문제지·정답·해설 버튼이 화면 밖으로 올라가면
// 같은 링크를 아래에 붙여 둔다(스크롤 어디서든 바로 받기). #examActions 의 버튼을 그대로 복제.

const PICKS = [
  [/^문제/, '문제지'],
  [/^(정답|답안)(?!.*짝수)/, '정답'],
  [/^해설/, '해설'],
  [/^듣기 MP3/, '듣기'],
];

export function mountExamDock() {
  const actions = document.getElementById('examActions');
  if (!actions || document.querySelector('.exam-dock')) return;
  const dock = document.createElement('div');
  dock.className = 'exam-dock';
  dock.setAttribute('aria-label', '자료 바로 받기');
  const links = [...actions.querySelectorAll('a.btn[href]')];
  const used = new Set();
  PICKS.forEach(([re, label], i) => {
    const src = links.find(a => !used.has(a) && !/짝수형/.test(a.textContent) && re.test(a.textContent.trim()));
    if (!src) return;
    used.add(src);
    const a = src.cloneNode(false);
    a.textContent = label;
    a.classList.toggle('btn--primary', i === 0);
    dock.appendChild(a);
  });
  if (!dock.children.length) return;
  document.body.appendChild(dock);
  const update = () => {
    const past = actions.getBoundingClientRect().bottom < 0;
    dock.classList.toggle('is-on', past);
    document.body.classList.toggle('has-exam-dock', past);
  };
  addEventListener('scroll', update, { passive: true });
  update();
}
