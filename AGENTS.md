# AGENTS.md — suneung-site (kicegg.com)

한국 기출(수능·평가원·학평·논술·검정고시) 아카이브 정적 사이트. **운영·빌드 모두 로컬 비종속**(2026-06-19 끊음). 운영=GitHub Pages(정적) + Cloudflare Worker(릴리즈 PDF 프록시) + GitHub Releases(PDF). 로컬 꺼도 사이트는 살아 있다.

## 빌드·갱신 (가장 중요)
- **`data/exams.json`이 단일 진실원본.** 사이트는 이걸로 렌더된다. 직접 편집하거나 `scripts/_add_*.py`로 추가.
- **로컬에서 `scripts/render-site.py`를 돌리지 마라.** OG 이미지 9,390장이 매 빌드 전수 재생성(build-data.py가 `og/` wipe)되는데, 맥/ubuntu의 libjpeg·freetype 차이로 바이트가 달라져 9,390장 churn이 난다. **렌더는 CI에 위임한다.**
- **갱신 플로**: source만 수정 → `git push origin main` → `.github/workflows/build.yml`이 ubuntu에서 `render-site.py` 실행 → 산출물(HTML·OG·sitemap·feed·split) 자동 커밋(`[skip ci]`) → `indexnow-submit.py`로 네이버 통보. Pages가 배포.
  - 트리거 source 경로: `data/exams.json`, `data/gradecuts.json`, `scripts/render-site.py`, `scripts/build-data.py`, `exam.html`, `exam-set.html`, `fonts/**`.
- **봇 커밋이 푸시되므로 다음 작업 전 반드시 `git pull`.**
- **`build.yml` 자체를 수정한** 커밋은 GitHub가 그 push에서 트리거하지 않는다 → `gh workflow run build --repo hongdoohyeon/Suneung --ref main`으로 1회 수동 디스패치(또는 API `POST /repos/.../actions/workflows/build.yml/dispatches {"ref":"main"}`).
- 데이터만 GitHub 웹 UI에서 고쳐도 CI가 갱신한다(맥 불필요).

## 검증
- CI `validate.yml`: `validate-exams.mjs`(schema·중복·외부호스트) + `regen-exam-splits.py --check`. **github.com 외부호스트 경고는 hwp 직링크라 정상**(차단 사유 아님).
- 로컬에서 검증만: `node scripts/validate-exams.mjs && python3 scripts/regen-exam-splits.py --check`.

## 새 파일 자료 추가
- PDF는 `gh release upload {tag} *.pdf`로 GitHub 릴리즈에 올린다. **자산명 ASCII만(한글 불가)**. 워커가 `discover_release_tags()`로 자동 인덱싱.
- **워커는 .hwp 거부** → hwp는 GitHub 릴리즈 직링크로 서빙(원본 그대로, 변환 금지 — 깨짐).
- 자산 URL = `{WORKER}/{tag}/{asset}?name={한글파일명}`. WORKER = `https://suneung-files.hdh061224.workers.dev`.
- 릴리즈당 1,000자산 한도.

## 구조·자산
- 산출물: `exam-{id}.html`(9,390 SSG)·`exam-set-*.html`·허브(`nonsul-*`/`suneung-*`/`hakpyeong-*`)·`essay.html`·`ged.html`·`sets.html`·`sitemap*.xml`·`feed.xml`·`data/exam/{id}.json`(split, exam.js가 우선 fetch).
- OG 폰트: `fonts/SUITE-Regular.ttf`(OFL 동봉 `fonts/OFL-SUITE.txt`). build-data.py `_BUNDLED_OG_FONT`(번들 우선·시스템 폴백).
- IndexNow: `scripts/indexnow-submit.py`(인자 없으면 직전 커밋 변경분, `--all`이면 사이트맵 전수 백필). 키 = repo의 `.indexnow-key`/`{key}.txt`. 엔드포인트 `https://searchadvisor.naver.com/indexnow`.
- 데이터 재현: 검정고시 = `data/sources/ged_*.json`(`_add_ged.py`가 repo 우선 읽음). 수능/학평 bulk = `~/Workspace/kice_archive/*.db`(from-scratch 재빌드 때만, **평소 불필요** — exams.json이 커밋된 원본).

## 캐시 토큰 함정
- `archive.html`·`app.js`·`state.js`가 `config.js`·`state.js`·`data/exams.json`을 `?v=YYYYMMDDx` 토큰으로 로드(JS import도 토큰 달고 감). **데이터/탭 추가 후 토큰을 안 올리면 아카이브에 안 보인다**(CDN이 옛 버전 캐시). 세 파일의 토큰을 새 날짜로 범프.
- 아카이브 탭은 `config.js` TAB_CONFIG가 아니라 **archive.html 정적 버튼**으로 하드코딩 → 새 탭은 양쪽 다 추가.

## 프론트엔드 구조 (2026-09 개편)
- **본문 글꼴 = SUITE**(2026-10, `lib/vendor/suite/`, `style.css` body 규칙 바로 위 @font-face). 가운뎃점(U+B7)만 Pretendard 글리프로 대체(SUITE 는 폭이 넓음). Pretendard CSS 는 폴백으로 계속 비동기 로드.
- **제목 굵기·자간은 `:root` 변수 4개**(`--h1-weight/--h1-track` 페이지 h1, `--h2-weight/--h2-track` 섹션·카드 제목, 2026-10 = 700/-.02em · 650/-.01em). 새 제목 규칙도 숫자 대신 이 변수로.
- **스타일은 `style.css` 하나**(라이트/다크 토큰 · 기관 배지 `tg-{typeGroup}` · 난이도 `tier--1~5`). 학사 일정만 `style-calendar.css` 추가. 색은 반드시 토큰(`var(--…)`)으로 — 다크 모드가 깨진다.
- **`lib/site-prefs.js`** 는 모든 페이지 `<head>` 에서 동기 로드(CSP상 인라인 불가): 테마(`kicegg:theme`), 스포일러 방지(`kicegg:spoiler`, 기본 켜짐 → `html[data-spoiler="on"]` 이면 `.spoil-val` 흑백 블러), 모바일 메뉴, `.hscroll` 가장자리 흐림.
- **헤더·푸터 마크업**은 원본 페이지(index/archive/exam/exam-set/calendar/about/privacy/terms/404)와 `render-site.py`(허브·sets) 두 곳에 있다. 메뉴를 바꾸면 양쪽 다.
- **난이도 5단계** = `build-data.py compute_exam_scores()`: 같은 기관·교육과정·과목·학년 묶음 안 백분위(표본 5회 미만은 없음). 기준은 묶음 단위로 하나 — 표준점수 최고점(`gradecuts.json highestStandardScore`, 묶음 회차 80% 이상에 있을 때) → 없으면 1등급 원점수 컷, 영어는 1등급 비율. 표점 최고점 출처 = kice_archive `score_stats.max_std`(EBSi 출처 국어·수학 선택과목 행은 백분위가 잘못 들어가 있어 1등급 표점보다 낮으면 버림). 상세 SSG 와 `data/archive/cuts.json`(기출검색 표) 이 같은 값을 쓴다.
- **첫 화면(/) = 기출검색.** `index.html` 은 빌드 산출물 — `render-site.py render_home()` 이 `archive.html` 을 복사해 index 의 검색엔진용 머리글(제목·설명·canonical·JSON-LD)을 유지하고, 결과 아래 '최근 시험'·'시험 종류' 정적 블록(`<!-- latest-sets:start -->` 등)을 채운다. **화면 수정은 archive.html 에서**(index.html 직접 수정 금지). archive.html canonical 도 `/`.
- **상세 본문(시험 총평)**: `data/exam-notes/{id}.html` 을 두면 SSG 가 '이 시험에 대해' 섹션에 넣는다(없으면 섹션 숨김).
- 등급계산기·정시반영은 2026-09 종료 — `gradecut.html`·`admissions.html` 은 기출검색 리다이렉트 스텁(`data/admissions/` 데이터는 보존).
- **스마트 검색**: 기출검색 입력이 자연어처럼 보이거나(“15개정 이후 고난도 수학이랑 국어”) 결과가 0건이면 `app.js maybeSmartSearch` 가 `kicegg.com/api/search?q=` 를 부른다 → `cloudflare/smart-search`(Worker, 라우트 `kicegg.com/api/*`). 규칙(`src/parse.js ruleParse`)이 먼저 풀고, 모르는 말이 남을 때만 TypeSafe JEV(`jev-latest`) 호출. 연도·학년도 계산은 규칙에서만(JEV는 숫자에 약함). 키는 Worker 비밀값 `TYPESAFE_API_KEY`(로컬은 macOS 키체인 `security find-generic-password -a kicegg -s typesafe-api-key -w`). JEV 판단 축(`JEV_QUESTIONS`): 대상·시험·영역·세부과목(`SUBSUB`, 옛 이름 묶음)·난이도·시대(`ERA`: 통합수능·A/B형·영어 절대평가·킬러 배제·코로나 등)·연대·짝홀/최근/옛날·교육과정·논술 계열·자료(듣기·대본·해설·짝수형)·정렬 — 새 축은 여기 + `toFilters` + app.js `runSmartSearch`/state.js `filtered` 에 추가. 숫자(1등급컷 N점 이하 등)는 규칙. 호출 상한 IP 12/분·전체 20/분, 결과 캐시 7일. 로컬 확인: `node cloudflare/smart-search/test.mjs "검색어"`. 배포: `cd cloudflare/smart-search && npx wrangler deploy`.
- **흐린 시험지 표지**: 상세 '시험지 펼치기' 뒤 흐린 이미지 = 그 시험지 1쪽(`previews/{sha1(쿼리 뺀 questionUrl)[:12]}.jpg`, 폭 120px). SSG(`build-data.py preview_image_path`)가 파일이 있을 때만 `#previewQViewer[data-preview]` 로 넣고, 없으면 영역 대표 이미지. 새 시험 추가 후 로컬에서 `cd scripts/material-audit && npm i && node extract.mjs` (이어받기) → previews/ 커밋.
- **자료 검수**: `scripts/material-audit/` — `extract.mjs`(PDF 1쪽 텍스트·미리보기, `--shard i/n` 병렬) → `judge.mjs`(코드: 깨진 링크·학년도·월 / JEV: 문서 종류·기관·영역·세부과목·학년) → `report.mjs`(tmp/material-audit/report.html). 로컬 전용, 산출물은 tmp/.
- **자료 오류 제보**: 상세 페이지 '자료 오류 제보' 버튼(`lib/report.js`) → `kicegg.com/api/report`(smart-search Worker `src/report.js`) → KV `REPORTS`(90일 보관, 이름·연락처·IP 저장 안 함, JEV 로 유형·스팸 점수). 읽기: `node cloudflare/smart-search/reports.mjs [--all]`. 접수 즉시 운영자 메일 알림(Cloudflare 이메일 라우팅 `send_email`, 받는 주소는 Worker 비밀값 `REPORT_TO`, 스팸 점수 0.8 초과·분당 10통 초과는 생략).
- **사이트맵 lastmod**: `render_sitemaps` 가 만들어진 상세 페이지 내용(날짜·`?v=` 제외) 해시를 `data/sitemap-lastmod.json` 에 기억해 실제로 바뀐 날만 갱신하고, 페이지 안 `article:modified_time`·`dateModified` 도 그 날짜로 맞춘다(내용이 같으면 파일도 그대로).
- **헤더 검색**은 실제 입력창(form, GET `./?q=`). 좁은 화면·빈 검색어·기출검색 화면에서는 본문 검색창으로 커서(`?focus=search`). 정적 상세·회차 페이지(`lib/seo.js STATIC_PAGE`)는 스크립트가 제목·설명·canonical 을 덮어쓰지 않는다.
- **상세 페이지 '이 시험 한눈에'**(`build-data.py exam_insight_html`): 등급컷 데이터로 만든 사실 문장(역대 순위·직전 대비·난이도·표점 최고). 숫자는 스포일러 방지 대상.
- **공식 채점 통계(2026-10 추가)**: 상세 '시·도교육청 공식 통계'(학평 2022~)는 `data/edu-official.json`, 수능·모평 '공개 점수 분포'는 `data/score-distribution.json`(2026 수능·9월) + `data/score-distribution-archive.json`(2018~2027, 14개 회차)에서 `build-data.py edu_official_html`/`suneung_dist_html` 이 만든다(광고 제외 판정도 이 섹션이 있으면 해제). 두 JSON 은 로컬 원본에서 만든 커밋용 요약 — `scripts/build-edu-official.py`(원본 `data/raw/education-office/metrics/`, `build-education-office-metrics.py` 산출물), `scripts/build-freq-dist-archive.py`(원본 `data/raw/kice/scoring-archive-normalized/`, `normalize-moe-scoring-archive.py` 산출물). 새 자료 수집: `/usr/bin/python3 scripts/collect-moe-scoring-statistics.py`(moe.go.kr 은 약한 DH 라 Homebrew Python 접속 불가), 응시원서 접수 결과는 `collect-moe-registration-results.py`. 공식 등급컷과 gradecuts 가 다르면 공식값이 우선(2026-10 학평 44건 정정).
- **블로그**: 목록은 `data/blog-posts.json`(최신순 단일 원본) — 홈 카드(최신 3)·`blog.html` 목록·사이트맵이 여기서 나온다(`render-site.py _blog_posts`). 데이터 분석 글 3편(`blog-csat-top-scores`·`blog-csat-takers`·`blog-hakpyeong-electives`)은 `scripts/build-blog-posts.py`(python3.14, 로컬 전용·CI 안 돌림)가 데이터에서 계산해 HTML 을 만든다 — 데이터가 바뀌면 다시 돌려 커밋. 새 글은 json 에 항목 추가. 홈(`index.html`)은 산출물이므로 직접 수정하지 말 것(2026-09 홈 블로그 카드가 렌더 때 지워진 적 있음).

- **교육과정 데이터(2026-10)**: `data/curriculum/`(README 참고) — 2022·2015·2009 개정 고시 원문 단원·성취기준, 영역별 수능 시기표(`csat-subject-eras.json`), 2028 범위(`csat-2028.json`), 구 단원→2022 단원 대응표(`crosswalk-to-2022.json`). 재생성·검증은 `scripts/curriculum/`(`extract-official.py` → `make-curated.py` → `validate-curriculum.py`). exams.json 의 `curriculum` 라벨은 영역별 시기와 다르다(2021 전 영역=2015개정, 2014~16 수학·국어·영어=2007개정) — 단원 태깅은 `csat-subject-eras.json` 기준.
