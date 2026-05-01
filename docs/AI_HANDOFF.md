# AI Handoff — 기출해체분석기 / Suneung

이 문서는 다음 AI/개발자가 `hongdoohyeon/Suneung` 저장소에서 작업할 때 빠르게 맥락을 잡고 실수하지 않도록 만든 핸드오프 문서다.

최종 확인 기준 커밋: `b2e91b7` (`fix: restore release-hosted LEET downloads`)  
배포 사이트: <https://hongdoohyeon.github.io/Suneung/>

---

## 1. 프로젝트 한 줄 요약

백엔드 없이 GitHub Pages에서 동작하는 정적 웹앱이다. 수능/평가원/교육청/사관학교/경찰대/LEET/MEET 기출 데이터를 `data/*.json`으로 제공하고, 클라이언트 JS가 검색·필터·상세 PDF 미리보기·등급컷 계산을 수행한다.

핵심 특징:

- 빌드 단계 없이 HTML/CSS/JS/JSON으로 배포된다.
- PDF/HWP 등 큰 기출 파일은 repo에 넣지 않고 GitHub Releases + Cloudflare Worker URL로 제공한다.
- `data/exams.json`이 사이트의 가장 중요한 데이터 원천이다.
- `npm run validate`가 데이터 무결성의 최소 기준이다.

---

## 2. 현재 데이터 규모

최근 확인 시점 기준:

```text
exams: 2045
gradecuts: 1982
answers: 1730
URL references: 3905
relative URL references: 0
asset host: suneung-files.hdh061224.workers.dev
```

커리큘럼 분포:

```text
예비: 4
2015: 763
사관: 82
경찰대: 63
LEET: 58
2009: 1066
MEET: 9
```

시험 그룹 분포:

```text
preliminary: 4
education: 982
suneung: 847
military: 82
police: 63
leet: 58
meet: 9
```

과목 분포:

```text
사회탐구 756
과학탐구 575
수학 257
국어 180
영어 126
한국사 82
언어이해 19
추리논증 19
논술 19
언어추론 9
통합과학 1
통합사회 1
도입 1
```

큰 파일:

```text
data/exams.json                                      ~1.58 MB
data/raw/megastudy/gradecuts-raw.json               ~1.55 MB
data/gradecuts.json                                  ~1.26 MB
data/raw/etoos/rawcuts-direct.json                  ~1.11 MB
data/raw/megastudy/gradecuts-normalized.json         ~1.09 MB
data/raw/kice/csat_scoring_yearly.hwpx              ~1.02 MB
data/raw/kice/csat_scoring_history.zip              ~0.70 MB
data/answers.json                                    ~0.19 MB
data/score-distribution.json                         ~0.15 MB
```

---

## 3. 주요 파일과 역할

### 페이지 엔트리

| 파일 | 역할 |
|---|---|
| `index.html` | 랜딩 페이지. 기출 검색/등급컷 계산기로 이동. |
| `archive.html` | 기출 자료 검색/필터 페이지. `app.js`, `state.js`, `config.js` 사용. |
| `exam.html` | 개별 시험 상세 페이지. PDF 미리보기, 다운로드, 빠른정답, 통계. `exam.js` 사용. |
| `gradecut.html` | 원점수 기반 등급/백분위 계산기. `gradecut.js` 사용. |

### 클라이언트 JS

| 파일 | 역할 |
|---|---|
| `config.js` | 교육과정, 시험 유형, 과목, 선택과목, 라벨, 검색 alias의 단일 설정 원천. |
| `state.js` | archive 페이지의 상태, 필터링, 정렬, mock data 생성. |
| `app.js` | archive 페이지 UI 렌더링/이벤트/페이지네이션. |
| `exam.js` | 상세 페이지 로딩, PDF.js 미리보기, 다운로드 버튼, 빠른정답, 통계. |
| `gradecut.js` | 등급컷 계산기 UI 및 계산 로직. |

### 데이터

| 파일 | 역할 |
|---|---|
| `data/exams.json` | 모든 시험 목록. 사이트 핵심 데이터. |
| `data/exams.schema.json` | `exams.json` 구조 검증용 schema. |
| `data/answers.json` | 빠른정답 데이터. key는 exam id 문자열. |
| `data/gradecuts.json` | 등급컷/원점수 경계 데이터. |
| `data/score-distribution.json` | 상세 페이지의 점수 분포/응답률 표시용 데이터. |
| `data/raw/**` | 원천/중간 데이터. 직접 UI가 읽는 파일은 아님. |

### 스크립트

| npm script | 명령 | 역할 |
|---|---|---|
| `validate` | `node scripts/validate-exams.mjs` | `exams.json` schema/비즈니스 룰/답안 길이 검증. 가장 중요. |
| `build-data` | `python3 scripts/build-data.py && npm run validate` | 시험 데이터 재생성 후 검증. |
| `extract-answers` | `node scripts/extract-answers.mjs` | 답지/PDF에서 빠른정답 추출. |
| `normalize-answers` | `node scripts/normalize-answers.mjs --write` | 빠른정답 길이 보정. |
| `audit-missing` | `node scripts/audit-missing.mjs` | 누락 답안 감사. |
| `fetch-megastudy` | `node scripts/fetch-megastudy-gradecuts.mjs` | 메가스터디 등급컷 원천 수집. |
| `normalize-megastudy` | `node scripts/normalize-megastudy.mjs` | 메가스터디 등급컷 정규화. |
| `build-gradecuts` | `node scripts/build-gradecuts.mjs` | 등급컷 최종 JSON 생성. |
| `build-freq-dist` | `node scripts/build-freq-dist.mjs` | 점수 분포 데이터 생성. |

---

## 4. 핵심 데이터 모델: `data/exams.json`

대표 필드:

```js
{
  id: 101,
  curriculum: 'LEET',
  gradeYear: 2026,
  examYear: 2025,
  month: 7,
  typeGroup: 'leet',
  type: 'leet_annual',
  subject: '언어이해',
  subSubject: null,
  solutionUrl: null,
  questionUrl: 'https://suneung-files.hdh061224.workers.dev/leet-v1/2026_main_verbal_q.pdf?...',
  answerUrl: 'https://suneung-files.hdh061224.workers.dev/leet-v1/2026_main_verbal_a.pdf?...',
  questionDownload: '2026학년도 LEET 언어이해 문제지.pdf',
  answerDownload: '2026학년도 LEET 언어이해 정답.pdf'
}
```

중요 규칙:

1. `id`는 전역 유니크해야 한다.
2. `(gradeYear, type, subject, subSubject)` 조합도 유니크해야 한다.
3. `gradeYear = examYear + 1`이 기본 규칙이다. 교육청은 화면 표시만 `examYear년 month월`로 다르다.
4. `typeGroup`과 `type`은 `scripts/validate-exams.mjs`의 매핑을 통과해야 한다.
5. URL은 현재 전부 `https://suneung-files.hdh061224.workers.dev/...` 형태다.
6. 상대 URL은 원칙적으로 피한다. 상대 URL을 넣으면 validator가 실제 파일 존재 여부를 검사한다.
7. PDF URL이면 `questionDownload`/`answerDownload`도 `.pdf`로 끝나야 한다.

---

## 5. 에셋 호스팅 구조

큰 기출 파일은 repo에 직접 두지 않는다. 과거에는 `pdfs_leet/...`, `pdfs_meet/...` 같은 로컬 경로가 있었지만 저장소 용량 때문에 제거됐다.

현재 구조:

```text
GitHub Releases assets
        ↓
Cloudflare Worker 프록시
        ↓
https://suneung-files.hdh061224.workers.dev/<release-tag>/<asset-name>?name=<download-name>
        ↓
GitHub Pages 정적 사이트에서 다운로드/PDF.js 미리보기
```

확인된 release tags:

```text
leet-v1      LEET PDF 96개
meet-v1      MEET PDF 18개
police-v1    경찰대학 에셋
military-v1  사관학교 에셋
kice-v1~v4   수능/평가원/교육청 에셋 분할
```

중요: PDF.js 미리보기를 위해 Worker가 CORS 헤더를 제공해야 한다. `exam.js`에도 이 전제가 주석으로 남아 있다.

```js
Access-Control-Allow-Origin
```

### 최근 해결한 문제

라이브 사이트에 LEET URL이 `pdfs_leet/...` 상대경로로 남아 다운로드가 깨질 수 있었음. `b2e91b7`에서 과거 커밋 `11ef89e55dfcddb26148202596fd37e26db3b116`의 Worker URL 구조를 참고해 복원했다.

현재 검증 결과:

```text
LEET URLs: 96, 모두 /leet-v1/ Worker URL
MEET URLs: 18, 모두 /meet-v1/ Worker URL
relative_url_count: 0
```

---

## 6. 프론트엔드 동작 흐름

### Archive 페이지 (`archive.html` + `app.js` + `state.js`)

1. `app.js`가 `data/exams.json`을 fetch한다.
2. 실패하면 `state.js`의 `buildMockData()`를 사용한다.
3. `state` 객체가 현재 필터 상태를 가진다.
4. `filtered()`가 curriculum/type/year/subject/subSubject/query 필터를 적용한다.
5. 카드 목록은 `renderCards()`에서 렌더링된다.
6. 페이지네이션은 `paginationWrap` + `.pagination` / `.pg-btn` 구조를 사용한다.
7. `archive.html?tab=LEET`처럼 `tab` query param으로 curriculum을 유지한다.

주의:

- 예전 `loadMore` 마크업은 제거되었고 현재는 pagination 명칭을 사용한다.
- 필터 상태를 바꿀 때는 보통 `state.page = 1`로 초기화해야 한다.
- 검색 alias는 `config.js`의 `SEARCH_ALIASES`를 통해 확장된다.

### 상세 페이지 (`exam.html` + `exam.js`)

1. URL query에서 시험 id를 읽는다. 일반적으로 `exam.html?id=<id>`.
2. `data/exams.json`, `data/answers.json`, `data/score-distribution.json` 등을 읽어 상세 정보를 구성한다.
3. 다운로드 버튼은 `renderHead()`에서 만든다.
4. URL은 `safeUrl()`을 통과한다. `javascript:` 등 위험 스킴은 빈 문자열 처리된다.
5. PDF는 PDF.js CDN을 동적 import해서 첫 페이지만 즉시 렌더하고, 나머지는 사용자가 버튼을 눌러 펼친다.
6. PDF가 아닌 HWP 등은 미리보기 대신 다운로드 안내를 보여준다.

주의:

- `PDFJS_VER`는 현재 `4.10.38`이고 `package.json`의 `pdfjs-dist`와 맞춰져 있다.
- PDF.js CDN과 Worker URL CORS 둘 중 하나가 깨지면 미리보기가 실패할 수 있다. 다운로드 자체는 별개로 정상일 수 있다.

### 등급컷 계산기 (`gradecut.html` + `gradecut.js`)

1. `data/gradecuts.json`을 fetch한다.
2. 지원 curriculum은 현재 `['2015', '2009', 'LEET']`이다.
3. 선택한 학년도/type/과목별 점수를 바탕으로 등급과 백분위 추정치를 계산한다.
4. 사탐/과탐은 슬롯 2개를 사용한다.

---

## 7. 설정 원천: `config.js`

`config.js`는 UI/필터/라벨의 단일 진실 소스에 가깝다.

주요 export:

```js
CURRICULUM_CONFIG
EXAM_TYPE_CONFIG
getTypeConf(typeKey)
getGroupConf(groupKey)
prettySub(key)
searchAliasOf(normalizedQ)
```

커리큘럼 키:

```text
2015
2009
예비
사관
경찰대
LEET
MEET
```

시험 그룹 키:

```text
suneung      평가원: csat, june, sept
education    교육청: mar, apr, jul, oct
military     사관학교: military_annual
police       경찰대학: police_annual
preliminary  평가원 예비: prelim
leet         LEET: leet_annual
meet         MEET: meet_annual
```

검색 alias 예:

```text
6모/육모 → 6월, 6월모의평가
9모/구모 → 9월, 9월모의평가
화작 → 화법과작문
언매 → 언어와매체
확통 → 확률과통계
미적 → 미적분
기벡 → 기하
리트/leet → LEET, 법학적성시험
사관 → 사관학교
경찰 → 경찰대
```

새 과목/시험 유형을 추가할 때는 `config.js`, `data/exams.json`, validator의 type mapping을 함께 확인해야 한다.

---

## 8. 검증 루틴

작업 후 최소한 아래를 실행한다.

```bash
npm install
npm run validate
node --check app.js
node --check state.js
node --check config.js
node --check exam.js
node --check gradecut.js
node --check scripts/validate-exams.mjs
```

로컬 static smoke test:

```bash
python3 -m http.server 8765
```

다른 터미널에서:

```bash
python3 - <<'PY'
import urllib.request
for path in ['index.html','archive.html','exam.html','gradecut.html','data/exams.json','data/gradecuts.json']:
    with urllib.request.urlopen('http://127.0.0.1:8765/' + path, timeout=10) as r:
        print(path, r.status, r.headers.get('content-type'))
PY
```

URL/asset 확인용 스니펫:

```bash
python3 - <<'PY'
import json, urllib.request
exams=json.load(open('data/exams.json'))
rel=[]
for e in exams:
    for k in ['questionUrl','answerUrl','solutionUrl']:
        v=e.get(k)
        if isinstance(v,str) and v and not v.startswith('http'):
            rel.append((e['id'], e['curriculum'], k, v))
print('relative_url_count', len(rel))

for cur in ['LEET','MEET']:
    sample = next(e for e in exams if e['curriculum'] == cur)
    for k in ['questionUrl','answerUrl']:
        u = sample.get(k)
        if not u: continue
        req=urllib.request.Request(u, method='HEAD', headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=20) as r:
            print(cur, sample['id'], k, r.status, r.headers.get('content-type'), r.headers.get('content-length'))
PY
```

배포 후 실제 GitHub Pages 데이터 확인:

```bash
python3 - <<'PY'
import json, urllib.request, time
url='https://hongdoohyeon.github.io/Suneung/data/exams.json'
req=urllib.request.Request(url + f'?t={int(time.time())}', headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
with urllib.request.urlopen(req, timeout=20) as r:
    data=json.load(r)
leet=[]
for e in data:
    if e.get('curriculum')=='LEET':
        for k in ['questionUrl','answerUrl']:
            if e.get(k): leet.append(e[k])
print('leet_urls', len(leet))
print('leet_worker', sum('suneung-files.hdh061224.workers.dev/leet-v1/' in u for u in leet))
print('leet_relative', sum(not u.startswith('http') for u in leet))
print('sample', leet[0] if leet else None)
PY
```

---

## 9. 배포/커밋 워크플로

현재 remote:

```text
origin git@github.com:hongdoohyeon/Suneung.git
branch main
```

보통 직접 `main`에 커밋/푸시하면 GitHub Pages가 자동 반영된다.

기본 절차:

```bash
git status --short
npm run validate
git add <changed-files>
git commit -m "fix: concise message"
git push origin main
```

푸시 후 GitHub Pages 반영은 몇 초~수십 초 걸릴 수 있다. 데이터 URL에 cache-busting query를 붙여 폴링하면 된다.

주의:

- 이 환경의 `gh` CLI는 없을 수 있다. GitHub API는 `curl`/Python `urllib`로 확인 가능하다.
- 이 임시 clone에 git author가 없으면 기존 repo 작성자 정보로 설정한다.

```bash
git config user.name "홍두현"
git config user.email "hongduhyeon@hongduhyeon-ui-MacStudio.local"
```

---

## 10. 알려진 위험 지점 / 작업 시 주의사항

### 10.1 상대경로 asset을 다시 넣지 말 것

`pdfs_leet/...`, `pdfs_meet/...` 같은 경로를 `data/exams.json`에 넣으면 GitHub Pages에서 404가 날 가능성이 크다. 현재 원칙은 Worker URL 사용이다.

잘못된 예:

```text
pdfs_leet/2026/main/2026_main_verbal_q.pdf
```

좋은 예:

```text
https://suneung-files.hdh061224.workers.dev/leet-v1/2026_main_verbal_q.pdf?name=...
```

### 10.2 GitHub Release 직접 URL vs Worker URL

GitHub Releases에는 실제 asset이 있다. 예:

```text
https://github.com/hongdoohyeon/Suneung/releases/download/leet-v1/2026_main_verbal_q.pdf
```

하지만 사이트 데이터에는 Worker URL을 쓰는 것이 좋다. 이유:

- PDF.js 미리보기 CORS 문제 회피
- `?name=`으로 다운로드 파일명 제어
- 모든 에셋 host를 하나로 통일

### 10.3 `download` 이름과 실제 URL 확장자 동기화

URL이 PDF인데 `questionDownload`가 `.hwp`로 끝나면 validator 경고가 난다. 최근 77건을 정리했으므로 재발시키지 말 것.

### 10.4 `safeUrl()` 우회 금지

`exam.js`에서 다운로드 버튼/PDF 렌더링 URL은 `safeUrl()`을 통과해야 한다. JSON 데이터가 현재 신뢰된다고 해도, 나중에 크롤러/자동 생성 데이터가 섞일 수 있다.

### 10.5 PDF.js 버전 통일

현재:

```text
package.json pdfjs-dist: ^4.10.38
exam.js PDFJS_VER: 4.10.38
```

둘 중 하나만 바꾸지 말 것.

### 10.6 `config.js` 변경 시 validator도 확인

새 `typeGroup`/`type` 추가 시 최소 확인 대상:

- `config.js`의 `CURRICULUM_CONFIG`
- `config.js`의 `EXAM_TYPE_CONFIG`
- `scripts/validate-exams.mjs`의 `tgTypeMap`
- `data/exams.schema.json` enum
- 실제 `data/exams.json`

### 10.7 `build-data.py`는 대량 재생성 가능

`npm run build-data`는 `data/exams.json`을 크게 바꿀 수 있다. 실행 전후 반드시 diff를 확인하고, 의도치 않게 Worker URL이 상대경로로 롤백되지 않았는지 검사한다.

### 10.8 JSON diff가 커질 수 있음

`data/exams.json`은 크고 정렬/포맷 차이만으로 대량 diff가 생긴다. 가능하면 기존 formatting을 유지하거나, 변경 범위를 id/URL 단위로 제한하라.

---

## 11. 자주 할 작업별 체크리스트

### 새 시험 추가

1. `data/exams.json`에 항목 추가 또는 생성 스크립트 수정.
2. URL은 Worker URL 사용.
3. download filename 확장자와 URL 확장자 일치.
4. `config.js`에 과목/시험 유형이 존재하는지 확인.
5. `data/answers.json`에 빠른정답이 있으면 id 매칭.
6. `npm run validate`.
7. 로컬 페이지에서 archive 검색 및 detail 페이지 확인.

### 새 에셋 release 추가

1. GitHub Release tag를 정한다. 예: `leet-v2`, `kice-v5`.
2. asset filename 규칙을 기존과 맞춘다.
3. Worker가 해당 tag/asset을 프록시하는지 확인한다.
4. `data/exams.json`에는 Worker URL을 넣는다.
5. 샘플 HEAD 확인: `200 application/pdf`.
6. PDF.js 미리보기 확인.

### 검색 UX 개선

1. `config.js`의 `SEARCH_ALIASES` 수정.
2. `state.js`의 `matchesQuery()`가 haystack에 원하는 문자열을 포함하는지 확인.
3. 축약어는 `normQ()` 기준으로 공백 제거/소문자 처리된다.
4. archive에서 실제 검색어로 확인.

### 상세 페이지 보안/렌더링 수정

1. `exam.js`의 `safeUrl`, `escHtml` 경로를 유지.
2. `innerHTML`로 넣는 값은 반드시 escape 또는 안전한 상수만 사용.
3. PDF 렌더 실패 시 사용자에게 다운로드 fallback이 남는지 확인.
4. `node --check exam.js`와 브라우저 smoke test.

### 등급컷 관련 수정

1. `data/gradecuts.json` 구조 확인.
2. `gradecut.js`의 `GC_CURRICULA` 지원 범위 확인.
3. 사탐/과탐 슬롯 2개 처리에 유의.
4. 원점수 boundary/백분위 계산 변경 시 몇 개 시험으로 수동 검산.

---

## 12. 현재 상태에서 다음 AI가 먼저 해야 할 것

작업을 시작하면 바로 아래를 실행하라.

```bash
git status --short
git pull --ff-only origin main
npm install
npm run validate
```

그 다음 현재 배포 데이터가 정상인지 확인:

```bash
python3 - <<'PY'
import json, urllib.request, time
url='https://hongdoohyeon.github.io/Suneung/data/exams.json'
with urllib.request.urlopen(url + f'?t={int(time.time())}', timeout=20) as r:
    data=json.load(r)
leet=[]
for e in data:
    if e.get('curriculum')=='LEET':
        for k in ['questionUrl','answerUrl']:
            if e.get(k): leet.append(e[k])
print(len(leet), sum('leet-v1' in u for u in leet), sum(not u.startswith('http') for u in leet))
PY
```

정상 기대값:

```text
96 96 0
```

---

## 13. 최근 완료된 변경 요약

최근 작업에서 완료한 것:

1. `data/exams.json`의 LEET/MEET 깨진 상대경로를 Worker URL로 복원.
2. GitHub Releases에 `leet-v1` 96개, `meet-v1` 18개 asset이 있음을 확인.
3. 라이브 GitHub Pages에서 LEET URL 96개가 모두 Worker URL로 반영됐음을 확인.
4. 다운로드 샘플 `HEAD 200 application/pdf` 확인.
5. `exam.js`에 URL sanitize 추가.
6. PDF.js 버전을 `4.10.38`로 통일.
7. archive pagination 마크업을 `paginationWrap` 명칭으로 정리.
8. 검색 alias 확장.
9. validator의 URL 검증 강화.
10. `npm run validate` 통과.

---

## 14. 빠른 문제 진단표

| 증상 | 먼저 볼 곳 | 가능 원인 | 해결 |
|---|---|---|---|
| 다운로드 404 | `data/exams.json` URL | 상대경로/잘못된 release tag | Worker URL로 교체, HEAD 확인 |
| PDF 미리보기 실패 | `exam.js`, Worker 응답 헤더 | CORS, PDF.js CDN, 잘못된 MIME | 다운로드 URL HEAD, 브라우저 콘솔 확인 |
| archive 검색 결과 없음 | `state.js`, `config.js` | alias 미등록, haystack 부족 | `SEARCH_ALIASES` 또는 `matchesQuery` 확장 |
| validator 실패: typeGroup/type | `validate-exams.mjs`, `config.js` | 새 type mapping 누락 | `tgTypeMap`, schema enum 업데이트 |
| validator 경고: download .pdf 아님 | `data/exams.json` | URL은 PDF인데 filename이 HWP | `?name=` 또는 확장자 기준으로 download field 수정 |
| 라이브는 아직 예전 데이터 | GitHub Pages cache/build | 푸시 직후 반영 지연 | cache-busting query로 10초 간격 폴링 |

---

## 15. 결론

이 저장소는 “정적 데이터 + 정적 UI” 구조라 단순하지만, 실제 안정성은 `data/exams.json`의 URL 무결성과 Worker/GitHub Releases 에셋 연결에 달려 있다. 다음 AI는 코드를 크게 바꾸기 전에 항상 다음 네 가지를 우선 확인해야 한다.

1. `npm run validate` 통과 여부
2. `relative_url_count == 0` 또는 상대경로 파일 실제 존재 여부
3. 주요 PDF URL `HEAD 200 application/pdf`
4. GitHub Pages 라이브 데이터가 최신 커밋을 반영했는지
