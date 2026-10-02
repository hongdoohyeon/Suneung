# 교육과정 단원 데이터 (2026-10-02)

2028학년도 수능(2022 개정 교육과정) 범위에 맞는 옛 기출만 모으는 기능의 바탕 자료다. 문항 정규화에서 문항마다 단원을 붙일 때 이 표를 기준으로 쓴다.

## 파일

| 파일 | 내용 |
|---|---|
| `official/2022.json` | **2022 개정 고시 원문** 과목·영역(단원)·성취기준(코드+문장). 공통국어·공통수학·선택 국어·수학(미적분Ⅱ·기하 포함)·영어Ⅰ·Ⅱ·한국사1·2·통합사회·통합과학 20과목, 성취기준 321개 |
| `official/2015.json` | **2015 개정 고시 원문** 국어·수학·영어·한국사·사회·과학·도덕 34과목(사탐·과탐 선택과목 포함). 도덕 2과목은 성취기준 코드가 없어 대주제 제목만 수동 입력 |
| `official/2009.json` | **2009 개정 고시 원문** 영역(단원)과 내용 요소. 성취기준 코드가 없는 문서라 영역·세부 항목만. 73과목(영어는 단원 없음) |
| `legacy.json` | 7차·2007 개정 **수학** 단원(2차 자료, confidence 낮음) |
| `eras.json` | 교육과정 시대 구분과 수능 적용 학년도(근거 포함) |
| `csat-subject-eras.json` | **영역별** 학년도 구간 → 교육과정·출제 과목·형(A/B, 가/나)별 과목 |
| `csat-2028.json` | 2028학년도 수능 영역별 출제 범위(공식)와 2022 과목별 범위 상태(`core`/`indirect`/`out`) |
| `derived-groups-2022-korean.json` | 선택 국어 3과목은 고시 성취기준이 한 영역에 몰려 있어 수능 소재로 묶은 그룹(작성자 정의) |
| `korean-history-periods.json` | 한국사 시대 구분(P1~P7)과 2022 한국사1·2 영역 대응(작성자 정의) |
| `crosswalk-to-2022.json` | **구 단원 → 2022 단원 대응표**(`mappings`)와 전체 단원 목록(`units`) |

## 단원 ID

`{시대}:{과목}:{영역 번호}` — 예: `2015:수학Ⅱ:2`(2015 개정 수학Ⅱ의 미분), `2022:대수:1`(2022 개정 대수의 지수함수와 로그함수), `2022:독서와 작문:g4`(작성자 그룹 4).
시대 코드: `2022` `2015` `2009` `2007` `7th`(제7차). 영역 번호는 고시의 `(1)(2)…` 순서다.

## 대응표 읽는 법

`mappings[]` 항목: `from`(구 단원) → `to[]`(2022 단원), `relation`(`same`/`moved`/`partial`), **`csat2028`**:

- `in` — 2028 직접 출제 과목의 내용과 대응 → **현 범위 모음에 넣는다**
- `partial` — 일부만 범위 안(예: 삼각함수 덧셈정리는 밖). `note` 확인. 문항 단위 판정 필요
- `indirect` — 공통수학·공통국어에 대응 → 2028에서는 간접 범위(출제과목 밖). 정책에 따라 포함/제외
- `out` — 범위 밖(미적분Ⅱ·기하·심화 소재)

`basis`: `official`(고시 원문 대조) / `secondary`(2차 자료) / `judgment`(작성자 판단), `confidence`: high/medium/low.
**문항에 붙일 단원은 `from` 쪽(그 문항이 출제된 시기의 교육과정 단원)이고, 현 범위 여부는 `csat2028`로 본다.**

수능 문항의 시기별 후보 과목은 `csat-subject-eras.json`의 `formCourses`(예: 2017~2020학년도 수학 가형 → 미적분Ⅱ·확률과 통계·기하와 벡터)에서 찾는다.

## 원문 받는 법(재현)

1. 2022 개정 별책 5·7·8·9·14(HWP): 교육부 고시 제2022-33호 — https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&lev=0&statusYN=W&s=moe&m=0404&opType=N&boardSeq=93458 의 `(붙임2)` zip. `hwp5html`(pyhwp)로 변환(별책 9 과학은 pyhwp 가 이름 필드 디코딩에 실패해 `hwp5.dataio.decode_utf16le_with_hypua` 를 `errors='replace'` 로 바꿔야 한다) 후 태그를 지워 `b{번호}_full.txt`.
2. 2015 개정: 교육부 고시 제2015-74호 별책 1-15 zip — https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&lev=0&statusYN=C&s=moe&m=0404&opType=N&boardSeq=60747 → PyMuPDF 텍스트 `c15_{번호}.txt`.
3. 2009 개정: https://ceri.knue.ac.kr/pds/2009_01_language.pdf, `2009_02_english`, `2009_03_math`, `2009_04_society`, `2009_05_science`, `2009_07_ethics` (고시 제2011-361호 등) → 텍스트 `cur09/*.txt`.
4. `python3 scripts/curriculum/extract-official.py --work <디렉터리>` → `official/*.json`
5. `python3 scripts/curriculum/make-curated.py` → 나머지 JSON(손으로 정리한 표는 이 스크립트 안에 있다)
6. `python3 scripts/curriculum/validate-curriculum.py` — 대응표·범위 일관성 검사
7. `python3 scripts/curriculum/audit-exam-labels.py` — exams.json `curriculum` 라벨 점검

## 주의

- 2015·2009 원문은 PDF 변환이라 **수식 기호가 빠져 있다**(`math_symbols_lost`). 단원·성취기준 문장 이해에는 지장 없지만 수식은 비어 있다.
- 시기별 사실(시행기본계획)은 평가원 공지사항의 2011·2016~2027학년도 시행기본계획과 2014·2015학년도 6월 모의평가 계획에서 확인했다. 2012·2013·2005학년도와 5·6차는 원문을 구하지 못해 `confidence`를 낮췄다.
- **구 교육과정(7차·2007 개정)의 국어·사회·과학 단원은 아직 없다**(과목 구성만 `csat-subject-eras.json`에 있다). 수학만 단원이 있다. 사탐·과탐 선택과목은 2028 범위와 겹치는 소재가 적어 2015 개정 단원만 `partial` 대응을 넣었다.
- 2028 시행기본계획은 2027년 3월 공고 예정이라 `csat-2028.json`의 `pending` 항목은 그때 확정해야 한다.
- exams.json 의 `curriculum` 라벨은 영역별 시기와 다르다. 불일치 목록은 `docs/교육과정-조사-20261002.md`.
