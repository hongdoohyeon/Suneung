'use strict';
// 자료 오류 제보 — 상세 페이지의 '자료 오류 제보' 버튼 → 작은 창 → kicegg.com/api/report
// 이름·연락처는 받지 않는다. 서버는 90일 뒤 자동 삭제.

const KINDS = [
  ['broken', '파일이 안 열려요'],
  ['wrong', '다른 시험·과목 파일이에요'],
  ['answer', '정답·해설이 틀려요'],
  ['cut', '등급컷·난이도가 이상해요'],
  ['other', '기타'],
];
const FIELDS = [['', '잘 모르겠어요'], ['questionUrl', '문제지'], ['answerUrl', '정답'], ['solutionUrl', '해설'], ['listenUrl', '듣기 파일'], ['scriptUrl', '듣기 대본']];

function examId() {
  const m = location.pathname.match(/exam-(\d+)\.html$/);
  return m ? Number(m[1]) : Number(new URLSearchParams(location.search).get('id'));
}

function build() {
  const d = document.createElement('dialog');
  d.className = 'report-dlg';
  d.setAttribute('aria-labelledby', 'reportTitle');
  d.innerHTML = `
    <form class="report-form" method="dialog">
      <h2 id="reportTitle">자료 오류 제보</h2>
      <p class="report-form__lead">무엇이 잘못됐나요? 확인해서 고칠게요.</p>
      <fieldset class="report-form__kinds"><legend class="sr-only">오류 종류</legend>
        ${KINDS.map(([v, l], i) => `<label class="report-opt"><input type="radio" name="kind" value="${v}"${i === 0 ? ' checked' : ''} /><span>${l}</span></label>`).join('')}
      </fieldset>
      <label class="report-form__row">어느 자료인가요?
        <select name="field">${FIELDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      </label>
      <label class="report-form__row">자세히 (선택)
        <textarea name="text" rows="3" maxlength="500" placeholder="예: 3쪽부터 다른 과목이에요"></textarea>
      </label>
      <p class="report-form__note">이름·연락처는 받지 않아요. 제보 내용은 자료 확인에만 쓰고 90일 뒤 지워요.</p>
      <p class="report-form__status" role="status" aria-live="polite"></p>
      <div class="report-form__actions">
        <button type="button" class="btn" value="cancel" data-close>닫기</button>
        <button type="submit" class="btn btn--primary" value="send">보내기</button>
      </div>
    </form>`;
  document.body.appendChild(d);
  const form = d.querySelector('form');
  const status = d.querySelector('.report-form__status');
  const send = d.querySelector('button[type="submit"]');
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    send.disabled = true; status.textContent = '보내는 중…';
    try {
      const r = await fetch('api/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ examId: examId(), kind: fd.get('kind'), field: fd.get('field'), text: fd.get('text'), page: location.pathname.split('/').pop(), screen: `${innerWidth}x${innerHeight}` }),
      });
      if (r.status === 429) throw new Error('잠시 뒤에 다시 보내 주세요.');
      if (!r.ok) throw new Error('제보를 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
      status.textContent = '제보해 주셔서 고마워요. 확인해서 고칠게요.';
      form.reset();
      setTimeout(() => d.close(), 1400);
    } catch (err) {
      status.textContent = err.message;
    } finally { send.disabled = false; }
  });
  return d;
}

let dlg = null;
document.addEventListener('click', e => {
  if (!e.target.closest('#reportBtn')) return;
  dlg ||= build();
  dlg.querySelector('.report-form__status').textContent = '';
  dlg.showModal();
});
