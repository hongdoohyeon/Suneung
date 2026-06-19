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
- OG 폰트: `fonts/Pretendard-Regular.ttf`(OFL 동봉). build-data.py `_BUNDLED_OG_FONT`(번들 우선·시스템 폴백).
- IndexNow: `scripts/indexnow-submit.py`(인자 없으면 직전 커밋 변경분, `--all`이면 사이트맵 전수 백필). 키 = repo의 `.indexnow-key`/`{key}.txt`. 엔드포인트 `https://searchadvisor.naver.com/indexnow`.
- 데이터 재현: 검정고시 = `data/sources/ged_*.json`(`_add_ged.py`가 repo 우선 읽음). 수능/학평 bulk = `~/Workspace/kice_archive/*.db`(from-scratch 재빌드 때만, **평소 불필요** — exams.json이 커밋된 원본).

## 캐시 토큰 함정
- `archive.html`·`app.js`·`state.js`가 `config.js`·`state.js`·`data/exams.json`을 `?v=YYYYMMDDx` 토큰으로 로드(JS import도 토큰 달고 감). **데이터/탭 추가 후 토큰을 안 올리면 아카이브에 안 보인다**(CDN이 옛 버전 캐시). 세 파일의 토큰을 새 날짜로 범프.
- 아카이브 탭은 `config.js` TAB_CONFIG가 아니라 **archive.html 정적 버튼**으로 하드코딩 → 새 탭은 양쪽 다 추가.
