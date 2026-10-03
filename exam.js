'use strict';
import { CURRICULUM_CONFIG, getTypeConf, prettySub } from './config.js?v=9829f76576fc8a09a4e1';
import { escHtml as _escHtml, escAttr, safeUrl as _safeUrl, $ as _$ } from './lib/dom.js?v=9829f76576fc8a09a4e1';
import { setMeta, setMetaProp, setCanonical, injectJsonLd as _injectJsonLd, STATIC_PAGE, applySeo } from './lib/seo.js?v=9829f76576fc8a09a4e1';
import { renderAllAdSlots } from './lib/ads.js?v=9829f76576fc8a09a4e1';
import { renderPdf, renderPreviewCover, renderUnsupported, renderEmpty, urlExtension } from './lib/exam-pdf.js?v=9829f76576fc8a09a4e1';
import { LOADING_PREVIEWS } from './lib/loading-previews.js?v=9829f76576fc8a09a4e1';
import { renderGradeDist } from './lib/exam-gradedist.js?v=9829f76576fc8a09a4e1';
import { pushRecent } from './lib/recent.js?v=9829f76576fc8a09a4e1';
import './lib/report.js?v=9829f76576fc8a09a4e1';
import { shareLink } from './lib/share.js?v=9829f76576fc8a09a4e1';
import { enableForcedDownloads } from './lib/download.js?v=9829f76576fc8a09a4e1';

enableForcedDownloads();

// 공통 헬퍼는 lib/dom.js, lib/seo.js 에서 import. 로컬 별칭만 유지 (호환성).
const $ = _$;
const escHtml = _escHtml;
const safeUrl = _safeUrl;
const injectJsonLd = (payload) => _injectJsonLd('jsonld-exam', payload);

// ── 메타 표시 문자열 ───────────────────────────────────────
function displayYear(item) {
  if (item.gradeYear === 'preliminary') return { label: '예비시험', suffix: '' };
  const tc = getTypeConf(item.type);
  if (tc?.displayMode === 'examYear') {
    return { label: `${item.examYear}년 ${item.month}월`, suffix: '' };
  }
  return { label: String(item.gradeYear), suffix: '학년도' };
}

function buildTitle(exam) {
  const tc = getTypeConf(exam.type);
  const dy = displayYear(exam);
  const subj = exam.subSubject ? `${exam.subject}(${prettySub(exam.subSubject)})` : exam.subject;
  // examYear 모드(학평): dy.label에 "N월" 포함 → tc.label에서 month prefix 제거.
  const typeLbl = tc?.displayMode === 'examYear'
    ? (tc?.label ?? '').replace(/^\d+월\s*/, '')
    : (tc?.label ?? '');
  const head = exam.gradeYear === 'preliminary'
    ? `예비시험`
    : (tc?.displayMode === 'examYear'
        ? `${dy.label} ${typeLbl}`
        : `${dy.label}${dy.suffix} ${typeLbl}`);
  return `${head} · ${subj}`;
}

function buildSubtitle(exam) {
  const conf = CURRICULUM_CONFIG[exam.curriculum];
  const tc   = getTypeConf(exam.type);
  return [...new Set([conf?.label, tc?.groupLabel].filter(Boolean))].join(' · ');
}

// 자료 MIME — 잔존 HWP(사관 2018 수학 등)는 application/x-hwp 로 정확히 표기
function docMime(url, name) {
  return (/\.hwp(?:[?#]|$)/i.test(url || '') || /\.hwp$/i.test(name || ''))
    ? 'application/x-hwp' : 'application/pdf';
}

function answerLabel(exam) {
  if (exam.answerIncludesSolution) return '정답·해설';
  return exam.answerStatus === 'official_objection_period' ? '정답 (이의신청 중)' : '정답';
}

// ── 헤드 렌더 ──────────────────────────────────────────────
function renderHead(exam) {
  const title = buildTitle(exam);
  if (!STATIC_PAGE) document.title = `${title} — 기출해체분석기`;
  // ── SEO: 동적 meta description / OG title / canonical ──
  const sub = buildSubtitle(exam);
  const availableDocs = [
    exam.questionUrl && '문제지',
    exam.answerUrl && answerLabel(exam),
    exam.solutionUrl && '해설지',
  ].filter(Boolean);
  const desc = `${title}${availableDocs.length ? ` ${availableDocs.join('·')} PDF.` : '.'} ${sub}.`;
  // canonical: 동적 ?id 페이지든 SSG /exam-N.html이든 항상 SSG URL을 표준으로 지정
  const canonicalUrl = `https://kicegg.com/exam-${exam.id}.html`;
  setMeta('description', desc);
  setCanonical(canonicalUrl);
  setMetaProp('og:title', `${title} — 기출해체분석기`);
  setMetaProp('og:description', desc);
  setMetaProp('og:url', canonicalUrl);
  // JSON-LD LearningResource — search engine 구조화 데이터
  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: title,
    description: desc,
    url: canonicalUrl,
    inLanguage: 'ko',
    learningResourceType: '기출문제',
    educationalLevel: '고등학교',
    isPartOf: { '@type': 'WebSite', name: '기출해체분석기',
                url: 'https://kicegg.com/' },
    ...(exam.questionUrl ? { hasPart: [
      { '@type': 'DigitalDocument', name: exam.questionUrl === exam.solutionUrl ? '문제·해설' : '문제지', url: exam.questionUrl, encodingFormat: docMime(exam.questionUrl, exam.questionDownload) },
      ...(exam.answerUrl ? [{ '@type': 'DigitalDocument', name: exam.answerIncludesSolution ? '정답·해설' : '정답', url: exam.answerUrl, encodingFormat: docMime(exam.answerUrl, exam.answerDownload) }] : []),
      ...(exam.listenUrl ? [{ '@type': 'AudioObject', name: '영어 듣기 mp3', contentUrl: exam.listenUrl, encodingFormat: 'audio/mpeg' }] : []),
      ...(exam.scriptUrl ? [{ '@type': 'DigitalDocument', name: '듣기 스크립트', url: exam.scriptUrl, encodingFormat: docMime(exam.scriptUrl, exam.scriptDownload) }] : []),
      ...(exam.solutionUrl && exam.solutionUrl !== exam.questionUrl ? [{ '@type': 'DigitalDocument', name: '해설지', url: exam.solutionUrl, encodingFormat: docMime(exam.solutionUrl, exam.solutionDownload) }] : []),
    ] } : {}),
  });
  // 회차 진입 link (사이드바) — 친화 URL 사용 (build-data.py set_friendly_filename 와 동일 규약)
  const setLink = document.getElementById('examSetSideLink');
  if (setLink && exam.curriculum && exam.gradeYear && exam.type) {
    const SET_CURR_SLUG = {
      '2015': 'kice', '2009': 'kice', '예비': 'kice',
      '2007개정': 'pre2009', '7차': 'pre2009', '6차': 'pre2009', 'pre2009': 'pre2009',
      '사관': 'mil', '경찰대': 'police', 'LEET': 'leet', 'MEET': 'meet', '논술': 'essay',
    };
    const slug = SET_CURR_SLUG[exam.curriculum] || String(exam.curriculum).toLowerCase();
    // build-data.py build_static_set_pages 와 동일: 학평(education)만 -g{학년} 접미사
    const sg = exam.typeGroup === 'education' ? exam.studentGrade : null;
    const grade = sg ? `-g${sg}` : '';
    setLink.href = `exam-set-${slug}-${exam.gradeYear}-${exam.type}${grade}.html`;
    setLink.hidden = false;
  }

  // SSG 가 칩·제목·부제를 채웠으면 그대로 둔다 (동적 exam.html?id= 폴백에서만 채움)
  const tc = getTypeConf(exam.type);
  const dy = displayYear(exam);
  if (!$('examChips').children.length) {
    const typeLbl = tc?.displayMode === 'examYear'
      ? (tc?.label ?? '').replace(/^\d+월\s*/, '')
      : (tc?.label ?? '');
    $('examChips').innerHTML =
      (tc ? `<span class="type-badge type-badge--lg tg-${escAttr(exam.typeGroup)}">${escHtml(typeLbl)}</span>` : '') +
      `<span class="chiplet chiplet--ink">${escHtml(dy.label)}${dy.suffix ? ' ' + dy.suffix : ''}</span>`;
  }
  if ($('examTitle').textContent.trim() === '자료 불러오는 중…') $('examTitle').textContent = buildTitle(exam);
  if (!$('examSub').textContent.trim()) $('examSub').textContent = buildSubtitle(exam);
  if (!$('examFacts')?.children.length) $('examInfo')?.setAttribute('hidden', '');

  // 다운로드 액션
  const dl = name => name ? `download="${escHtml(name)}"` : 'download';
  const buttons = [];
  const questionUrl     = safeUrl(exam.questionUrl);
  const questionUrlEven = safeUrl(exam.questionUrlEven);
  const answerUrl       = safeUrl(exam.answerUrl);
  const answerUrlEven   = safeUrl(exam.answerUrlEven);
  const solutionUrl     = safeUrl(exam.solutionUrl);
  const listenUrl       = safeUrl(exam.listenUrl);
  const scriptUrl       = safeUrl(exam.scriptUrl);
  // 자료 타입을 라벨에 명시 (PDF/HWP/MP3) — 카드별 어떤 자료인지 직관적으로
  // 짝수형 분리 자료가 있으면 기본 라벨에 '홀수형' 명시 (구분 명확화)
  const fileTag = (url, name) =>
    (/\.hwp(?:[?#]|$)/i.test(url || '') || /\.hwp$/i.test(name || '')) ? 'HWP' : 'PDF';
  const qTag = fileTag(questionUrl, exam.questionDownload);
  const combinedDocument = questionUrl && questionUrl === solutionUrl;
  const qLabel = combinedDocument ? `문제·해설 ${qTag}` : (questionUrlEven ? `문제지 ${qTag} (홀수형)` : `문제지 ${qTag}`);
  const aTag = fileTag(answerUrl, exam.answerDownload);
  const answerDocLabel = answerLabel(exam);
  const aLabel = answerUrlEven ? `${answerDocLabel} ${aTag} (홀수형)` : `${answerDocLabel} ${aTag}`;
  if (questionUrl) buttons.push(
    `<a class="btn btn--primary" href="${escHtml(questionUrl)}" ${dl(exam.questionDownload)}>${qLabel}</a>`
  );
  if (questionUrlEven) buttons.push(
    `<a class="btn" href="${escHtml(questionUrlEven)}" ${dl(exam.questionDownloadEven)}>문제지 PDF (짝수형)</a>`
  );
  if (answerUrl) buttons.push(
    `<a class="btn" href="${escHtml(answerUrl)}" ${dl(exam.answerDownload)}>${aLabel}</a>`
  );
  if (answerUrlEven) buttons.push(
    `<a class="btn" href="${escHtml(answerUrlEven)}" ${dl(exam.answerDownloadEven)}>정답 PDF (짝수형)</a>`
  );
  if (solutionUrl && !combinedDocument) buttons.push(
    `<a class="btn" href="${escHtml(solutionUrl)}" ${dl(exam.solutionDownload)}>해설지 PDF</a>`
  );
  if (listenUrl) buttons.push(
    `<a class="btn" href="${escHtml(listenUrl)}" ${dl(exam.listenDownload)}>듣기 MP3</a>`
  );
  if (scriptUrl) buttons.push(
    `<a class="btn" href="${escHtml(scriptUrl)}" ${dl(exam.scriptDownload)}>듣기 대본 PDF</a>`
  );
  // 공유 버튼 — 모바일 카톡·문자, 데스크톱 클립보드
  buttons.push(
    `<button type="button" class="btn" id="examShareBtn" aria-label="공유하기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg><span class="btn__label">공유</span></button>`
  );

  // SSG 가 이미 다운로드 버튼을 채웠으면 (정적 진입 = 1단계 작동) — 공유 버튼만 추가, 깜빡임 방지
  const _actionsEl = $('examActions');
  const _alreadySSG = _actionsEl && _actionsEl.querySelector('a.btn');
  if (_alreadySSG) {
    // SSG 출력 보존 + 공유 버튼만 append
    const shareBtnHtml = buttons[buttons.length - 1];
    if (shareBtnHtml && !_actionsEl.querySelector('#examShareBtn')) {
      _actionsEl.insertAdjacentHTML('beforeend', shareBtnHtml);
    }
  } else {
    _actionsEl.innerHTML = buttons.join('');
  }

  // 공유 버튼 동작
  const shareBtn = document.getElementById('examShareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareLink({
        title: buildTitle(exam) + ' — 기출해체분석기',
        text: buildSubtitle(exam),
        url: location.href,
      });
    });
  }

  // 영어 듣기 mp3: 사이드바 actions 아래에 inline audio player 삽입.
  // 영어 시험인데 듣기가 없는 평가원/학평 회차는 "자료 없음" 표시.
  // 사관·경찰은 원본 시험에 듣기 자체가 없으므로 안내 생략.
  const actionsEl = $('examListenMount') || $('examActions');
  const hasListening = exam.subject === '영어' &&
                       exam.typeGroup !== 'military' && exam.typeGroup !== 'police';
  if (actionsEl && hasListening) {
    const audioBlock = document.createElement('div');
    audioBlock.className = 'exam__listen';
    if (listenUrl) {
      audioBlock.innerHTML = `
        <div class="exam__listen-head">
          <span class="exam__listen-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z"/>
              <path d="M3 19a2 2 0 0 0 2 2h1v-7H3z"/>
            </svg>
          </span>
          <span>영어 듣기 음원</span>
        </div>
        <audio controls preload="metadata" src="${escHtml(listenUrl)}" class="exam__listen-audio"></audio>
        <a class="exam__listen-dl" href="${escHtml(listenUrl)}" ${dl(exam.listenDownload)}>mp3 다운로드</a>
      `;
    } else {
      audioBlock.classList.add('exam__listen--empty');
      audioBlock.innerHTML = `
        <div class="exam__listen-head">
          <span>영어 듣기 음원</span>
        </div>
        <p class="exam__listen-empty">
          이 회차는 듣기 음원 자료가 공개되지 않았어요.
        </p>
      `;
    }
    actionsEl.appendChild(audioBlock);
  }

  // archive 탭 복귀 링크에 curriculum 유지
  // archive 에서 진입했으면 sessionStorage 의 마지막 필터 상태를 복원 (typeGroup·gradeYear·subject·q 등 모두 유지)
  let backHref = `/?tab=${encodeURIComponent(exam.curriculum)}`;
  try {
    const stored = sessionStorage.getItem('lastArchiveUrl');
    if (stored && /^\/(\?|archive\.html|index\.html|$)/.test(stored)) backHref = stored;
  } catch {}
  $('backLink').href = backHref;
}

// ── 등급컷 표 ──
// URL → 시험 ID 추출.
// 정적 SSG 페이지(/exam-123.html)는 pathname에서, 레거시 동적(?id=N)은 query에서.
function readExamId() {
  const m = location.pathname.match(/exam-(\d+)\.html$/);
  if (m) return Number(m[1]);
  return Number(new URLSearchParams(location.search).get('id'));
}

// ── 본 진입점 ──────────────────────────────────────────────
async function main() {
  const id = readExamId();

  if (!Number.isFinite(id) || id <= 0) {
    showError();
    return;
  }

  // 시험/등급컷 split은 서로 독립이므로 병렬 요청한다.
  let exam = null, gradecuts = [];
  const isStaticExam = /\/exam-\d+\.html$/.test(location.pathname);
  const shouldFetchGradecut = !isStaticExam || document.body.classList.contains('has-gradecut');
  const [examResult, cutResult] = await Promise.allSettled([
    fetch(`data/exam/${id}.json?v=20260801a`).then(async res => res.ok ? res.json() : null),
    shouldFetchGradecut
      ? fetch(`data/gradecut/${id}.json?v=20260801a`).then(async res => res.ok ? res.json() : null)
      : Promise.resolve(null),
  ]);
  if (examResult.status === 'fulfilled') exam = examResult.value;
  if (cutResult.status === 'fulfilled' && cutResult.value) gradecuts = [cutResult.value];

  // 단건 split 미배포 환경 폴백: 통합 exams.json
  if (!exam) {
    try {
      const res = await fetch('data/exams.json?v=9829f76576fc8a09a4e1');
      if (res.ok) {
        const exams = await res.json();
        exam = exams.find(e => e.id === id) ?? null;
      }
    } catch { /* fall-through */ }
  }

  if (!exam) {
    const staticTitle = $('examTitle')?.textContent?.trim();
    if (staticTitle && staticTitle !== '자료 불러오는 중…') {
      document.body.classList.add('is-hydrated');
      return; // SSG 본문·다운로드 링크는 네트워크 실패와 무관하게 유지
    }
    showError();
    return;
  }

  renderHead(exam);
  if (renderGradeDist(exam, gradecuts)) $('gradeDist')?.removeAttribute('hidden');
  pushRecent(exam);  // localStorage 최근 본 시험 기록 (메인 페이지 chip 용)

  // PDF는 사용자가 미리보기를 요청할 때만 내려받는다.
  // 큰 시험지는 수 MB라 진입 즉시 로드하면 본문 표시와 모바일 데이터 사용을 크게 악화시킨다.
  const qViewer = $('previewQViewer'), qMeta = $('previewQMeta');
  if (!exam.questionUrl) {
    renderEmpty(qViewer);
    qMeta.textContent = '없음';
  } else {
    const ext = urlExtension(exam.questionUrl);
    if (ext === 'pdf') {
      let detail = '';
      if (exam.typeGroup === 'education') detail = exam.studentGrade || '';
      else if (exam.typeGroup === 'ged') detail = exam.curriculum;
      else if (exam.typeGroup === 'essay') {
        const subject = exam.subSubject || '';
        const natural = /자연|수학|공학|의약|의예|약학|과학|물리|화학|생명/.test(subject);
        const human = /인문|사회|상경|경영|경제|국어|언어|체육/.test(subject);
        detail = natural && human ? '통합' : natural ? '자연' : human ? '인문' : '기타';
      }
      const key = `${exam.typeGroup}|${detail}|${exam.subject}`;
      // 이 시험지의 실제 1쪽(흐리게) — 빌드가 data-preview 로 넣어 둔 것, 없으면 영역 대표 이미지
      const button = renderPreviewCover(qViewer, qViewer.dataset.preview || LOADING_PREVIEWS[key]?.image);
      button.addEventListener('click', () => {
        button.disabled = true;
        button.textContent = '불러오는 중…';
        qViewer.querySelector('.preview__loading')?.classList.add('is-loading');
        renderPdf(exam.questionUrl, qViewer, qMeta, { inkKey: `exam-${exam.id}` });
      }, { once: true });
    } else {
      renderUnsupported(qViewer, ext ?? '파일', exam.questionUrl, exam.questionDownload);
    }
  }
  document.body.classList.add('is-hydrated');
}

// 최근 회차 비교 — 지표(1등급컷·표점 최고·1등급 표점) 전환
document.addEventListener('click', e => {
  const btn = e.target.closest('#examCompare [data-metric]');
  if (!btn || btn.tagName !== 'BUTTON') return;
  const section = document.getElementById('examCompare');
  section.dataset.metric = btn.dataset.metric;
  section.querySelectorAll('button[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
});

function showError() {
  $('examSide').hidden = true;
  $('examMain').hidden = true;
  $('examSubjects')?.setAttribute('hidden', '');
  $('examError').hidden = false;
  document.title = '자료를 찾지 못했어요 — 기출해체분석기';
}

main();

// 광고 슬롯 자동 렌더 (lib/ads.js — Publisher ID 미설정 시 no-op)
if (document.readyState !== 'loading') renderAllAdSlots();
else document.addEventListener('DOMContentLoaded', renderAllAdSlots);
