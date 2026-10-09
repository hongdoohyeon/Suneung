'use strict';
// 영어 듣기 플레이어 — 상세 페이지 사이드바(#examListenMount).
// 문항 바로가기(exam.listenChapters "초:라벨,…"), 10초 앞뒤, 배속, 한 문항 반복, 이어 듣기, 잠금화면 조작.
import { escHtml } from './dom.js?v=55e0d96306e53a034e27';

const SPEEDS = [0.8, 1, 1.2, 1.5, 2];
const POS_KEY = id => `kicegg:listen:${id}`;

function parseChapters(s) {
  if (!s || typeof s !== 'string') return [];
  return s.split(',').map(p => {
    const i = p.indexOf(':');
    return { t: parseFloat(p.slice(0, i)), label: p.slice(i + 1) };
  }).filter(c => Number.isFinite(c.t) && c.label);
}

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ICON = {
  play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  fwd: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  head: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z"/><path d="M3 19a2 2 0 0 0 2 2h1v-7H3z"/></svg>',
};

/**
 * @param {HTMLElement} mount
 * @param {{ id:number, src:string, title:string, chapters?:string, downloadName?:string, scriptUrl?:string, scriptName?:string }} o
 */
export function mountListenPlayer(mount, o) {
  const chapters = parseChapters(o.chapters);
  const dlAttr = n => n ? `download="${escHtml(n)}"` : 'download';
  const el = document.createElement('div');
  el.className = 'exam__listen lp';
  el.innerHTML = `
    <div class="exam__listen-head">
      <span class="exam__listen-icon">${ICON.head}</span><span>영어 듣기</span>
      <button type="button" class="lp__resume" hidden></button>
    </div>
    <audio preload="metadata" src="${escHtml(o.src)}"></audio>
    <div class="lp__bar">
      <button type="button" class="lp__play" aria-label="재생">${ICON.play}</button>
      <div class="lp__track">
        <input class="lp__seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="재생 위치">
        <div class="lp__time"><span class="lp__cur">0:00</span><span class="lp__now"></span><span class="lp__dur">--:--</span></div>
      </div>
    </div>
    <div class="lp__ctrl">
      <button type="button" class="lp__btn" data-skip="-10" aria-label="10초 뒤로">${ICON.back}<span>10</span></button>
      <button type="button" class="lp__btn" data-skip="10" aria-label="10초 앞으로">${ICON.fwd}<span>10</span></button>
      <button type="button" class="lp__btn lp__speed" aria-label="재생 속도">1×</button>
      ${chapters.length ? '<button type="button" class="lp__btn lp__loop" aria-pressed="false" title="지금 문항만 반복">한 문항 반복</button>' : ''}
    </div>
    ${chapters.length ? `
    <div class="lp__chapters" role="group" aria-label="문항 바로가기">
      ${chapters.map((c, i) => `<button type="button" class="lp__ch" data-i="${i}">${c.label === '안내' ? '안내' : escHtml(c.label)}</button>`).join('')}
    </div>
    <p class="lp__hint">번호를 누르면 그 문항부터 들려요.</p>` : ''}
    <div class="lp__links">
      <a class="exam__listen-dl" href="${escHtml(o.src)}" ${dlAttr(o.downloadName)}>mp3 다운로드</a>
      ${o.scriptUrl ? `<a class="exam__listen-dl" href="${escHtml(o.scriptUrl)}" ${dlAttr(o.scriptName)}>듣기 대본</a>` : ''}
    </div>`;
  mount.appendChild(el);

  const audio = el.querySelector('audio');
  const play = el.querySelector('.lp__play');
  const seek = el.querySelector('.lp__seek');
  const cur = el.querySelector('.lp__cur');
  const durEl = el.querySelector('.lp__dur');
  const nowEl = el.querySelector('.lp__now');
  const speedBtn = el.querySelector('.lp__speed');
  const loopBtn = el.querySelector('.lp__loop');
  const resumeBtn = el.querySelector('.lp__resume');
  const chBtns = [...el.querySelectorAll('.lp__ch')];
  let dragging = false, loop = false, active = -1;

  // 경계에 딱 맞춰 옮기면 디코더가 몇 ms 앞으로 잡는 경우가 있어 0.25초 여유
  const chapterAt = t => { let k = -1; for (let i = 0; i < chapters.length; i++) if (t + 0.25 >= chapters[i].t) k = i; return k; };
  const chapterEnd = i => (i + 1 < chapters.length ? chapters[i + 1].t : audio.duration || Infinity);

  function render() {
    const t = audio.currentTime;
    if (!dragging) seek.value = String(t);
    cur.textContent = fmt(t);
    seek.style.setProperty('--p', audio.duration ? `${(t / audio.duration) * 100}%` : '0%');
    const k = chapterAt(t);
    if (k !== active) {
      chBtns[active]?.classList.remove('is-on');
      chBtns[active]?.removeAttribute('aria-current');
      chBtns[k]?.classList.add('is-on');
      chBtns[k]?.setAttribute('aria-current', 'true');
      active = k;
      nowEl.textContent = k >= 0 ? (chapters[k].label === '안내' ? '안내 방송' : `${chapters[k].label}번`) : '';
    }
  }

  function savePos() {
    try {
      const t = audio.currentTime;
      if (t > 5 && audio.duration && t < audio.duration - 5) localStorage.setItem(POS_KEY(o.id), String(Math.floor(t)));
      else localStorage.removeItem(POS_KEY(o.id));
    } catch { /* 저장 불가 환경 */ }
  }

  play.addEventListener('click', () => { audio.paused ? audio.play() : audio.pause(); });
  audio.addEventListener('play', () => { play.innerHTML = ICON.pause; play.setAttribute('aria-label', '일시정지'); resumeBtn.hidden = true; });
  audio.addEventListener('pause', () => { play.innerHTML = ICON.play; play.setAttribute('aria-label', '재생'); savePos(); });
  audio.addEventListener('loadedmetadata', () => { seek.max = String(audio.duration); durEl.textContent = fmt(audio.duration); render(); });
  // 직접 옮겼을 때는 지금 문항을 바로 갱신 — 반복 판정이 옛 문항 기준으로 되돌리지 않게
  audio.addEventListener('seeking', render);
  audio.addEventListener('timeupdate', () => {
    // 반복: 재생하다 문항 끝을 막 넘었을 때만 그 문항 처음으로
    if (loop && active >= 0) {
      const end = chapterEnd(active), t = audio.currentTime;
      if (t >= end - 0.3 && t < end + 1.5) { audio.currentTime = chapters[active].t; return; }
    }
    render();
    if (Math.floor(audio.currentTime) % 5 === 0) savePos();
  });
  audio.addEventListener('ended', () => { try { localStorage.removeItem(POS_KEY(o.id)); } catch {} });

  seek.addEventListener('input', () => { dragging = true; cur.textContent = fmt(+seek.value); seek.style.setProperty('--p', `${(+seek.value / (audio.duration || 1)) * 100}%`); });
  seek.addEventListener('change', () => { audio.currentTime = +seek.value; dragging = false; });

  el.querySelectorAll('[data-skip]').forEach(b => b.addEventListener('click', () => {
    audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + +b.dataset.skip));
  }));

  let si = 1;
  speedBtn.addEventListener('click', () => {
    si = (si + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[si];
    speedBtn.textContent = `${SPEEDS[si]}×`;
  });

  loopBtn?.addEventListener('click', () => {
    loop = !loop;
    loopBtn.setAttribute('aria-pressed', String(loop));
  });

  chBtns.forEach(b => b.addEventListener('click', () => {
    audio.currentTime = chapters[+b.dataset.i].t;
    if (audio.paused) audio.play();
  }));

  // 이어 듣기
  try {
    const saved = +localStorage.getItem(POS_KEY(o.id));
    if (saved > 5) {
      resumeBtn.hidden = false;
      const k = chapterAt(saved);
      resumeBtn.textContent = `이어 듣기 ${k >= 0 && chapters[k].label !== '안내' ? chapters[k].label + '번 · ' : ''}${fmt(saved)}`;
      resumeBtn.addEventListener('click', () => { audio.currentTime = saved; audio.play(); });
    }
  } catch { /* 저장 불가 환경 */ }

  // 플레이어 안에 포커스가 있을 때만 단축키 (페이지 다른 입력과 충돌 방지)
  el.addEventListener('keydown', e => {
    if (e.target === seek && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
    else if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); }
    else if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); }
  });

  // 잠금화면·이어폰 버튼
  if ('mediaSession' in navigator) {
    audio.addEventListener('play', () => {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: o.title, artist: '기출해체분석기', album: '영어 듣기' });
        navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
        if (chapters.length) {
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            // 문항 시작 3초 안이면 이전 문항, 아니면 지금 문항 처음으로
            const k = chapterAt(audio.currentTime);
            const target = k > 0 && audio.currentTime - chapters[k].t < 3 ? k - 1 : Math.max(0, k);
            audio.currentTime = chapters[target]?.t ?? 0;
          });
          navigator.mediaSession.setActionHandler('nexttrack', () => { const k = chapterAt(audio.currentTime); if (k + 1 < chapters.length) audio.currentTime = chapters[k + 1].t; });
        }
      } catch { /* 미지원 브라우저 */ }
    }, { once: true });
  }
  window.addEventListener('pagehide', savePos);
  return el;
}
