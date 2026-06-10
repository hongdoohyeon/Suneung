# scripts/ 가이드

## 활성 (build·배포 파이프라인)

| 스크립트 | 용도 |
|---|---|
| `build-data.py` | ⚠️ **부분 빌더 — 단독 실행 금지** (아래 경고). sqlite + JSON 통합 → `data/exams.json`, SSG HTML, sitemap, OG |
| `regen-exam-splits.py` | `exams.json` 수정 후 `data/exam/{id}.json` 단건 split 동기화 (`--check` = CI 검증) |
| `coverage-report.py` | 자료 보유 현황 → `REPORT_KICE_COVERAGE.md` |
| `validate-sitemap.py` | sitemap URL 404 검증 |
| `validate-exams.mjs` | `data/exams.json` 스키마 검증 (CI) |
| `audit-answers.mjs` / `audit-missing.mjs` | 데이터 무결성 감사 |

## KICE 자료마당 수집 파이프라인 (1회성, 필요 시 재사용)

| 스크립트 | 용도 |
|---|---|
| `fetch-kice-catalog.py` | KICE 4개 게시판 메타 → `data/kice-catalog.json` |
| `fetch-kice-1994-1998.py` | 옛 1994~1998 csat 자료 별도 fetch |
| `download-kice-archive.py` | 학년도 범위 ZIP 다운 |
| `download-kice-lang2-voca.py` | 제2외국어·직업탐구 ZIP 다운 |
| `download-kice-area-fill.py` | 사탐·과탐·본영역 ZIP 다운 (영역 화이트리스트) |
| `download-kice-even.py` | 짝수형 PDF 별도 다운 |
| `extract-kice-zips.py` / `extract-kice-lang2-voca.py` / `extract-area-fill.py` | ZIP 풀기 + cp949 fix |
| `prepare-kice-archive.py` / `process-lang2-voca.py` / `process-area-fill.py` | 추출 PDF → 영역·과목 매핑 records |
| `rename-kice-archive.py` | 한글 파일명 → md5 hash 영문화 (GitHub release 호환) |
| `merge-kice-archive-final.py` / `merge-kice-archive.py` / `merge-kice-1994-1998.py` | records → `data/kice-archive-new-items.json` |
| `clean-pre2009-subs.py` | pre2009 subSubject 정제 (`200606사회탐구경제영역` → `경제`) |
| `expand-pre2009-by-area.py` | 1999~2004 인문/자연/예체능계 → 영역별 카드 |

## 짝수형 분리 작업

| 스크립트 | 용도 |
|---|---|
| `split-answer-even.py` | 정답표 PDF (2p 합본) 자동 분리 — 1p 홀수 / 2p 짝수 |
| `split-question-even.py` | 문제지 PDF 자동 분리 — 16p 합본 등 |
| `attach-even-to-exams.py` | 카탈로그 짝수 명시 PDF attach |
| `attach-csat-even.py` | csat 본영역 ZIP 안 짝수 PDF attach |
| `upload-even-answers.py` | 분리본 → release 업로드 준비 |

## 비활성·옛 작업 (정리 후보)

| 스크립트 | 상태 |
|---|---|
| `seed-batch-*.py` (1~62) | 옛 데이터 시드 일괄 import — 현재 build-data 가 통합 |
| `fetch-etoos-*` / `extract-extras-*` | 등급컷·정시 모의지원 데이터 (별도 파이프라인) |
| `build-dashboard.py` / `build-extras-merged.py` | 정시 모의지원 빌드 |
| `extract-english-grades.py` / `extract-ratios.py` / `extract-tables.py` | 별도 통계 추출 (수동 1회성) |

## ⚠️ build-data.py 단독 실행 금지

`data/exams.json` 은 build-data.py 산출분(~4,900건) 위에 **1회성 ingest
(ebsi-archive, savetest-* 등 ~2,700건)가 surgical append 로 누적된 머지 산출물**이다.
build-data.py 는 자기 소스만으로 처음부터 다시 쓰기 때문에 단독 실행하면
append 분이 통째로 사라지고 id 가 전부 재배열된다 (과거 사이트 2/3 삭제 사고).
지금은 스크립트 내 안전 가드가 건수 감소·source 소실을 감지하면 중단한다.

**새 시험 반영 표준 절차** (PR #3·#4 패턴):
1. 기존 `data/exams.json` 에 surgical append (`scripts/_add_*.py` 참고)
2. `python3 scripts/regen-exam-splits.py` 로 단건 split 동기화
3. 해당 `exam-{id}.html` 만 생성, sitemap 에 surgical 추가
4. `node scripts/validate-exams.mjs` 통과 확인

```bash
python3 scripts/coverage-report.py       # 보고서 갱신
python3 scripts/validate-sitemap.py      # sitemap 검증
```

---

## `_archive-1회성/` 폴더

1회성 데이터 수집 작업 후 더 이상 정기 실행되지 않는 스크립트들 (참고용 보관):
- `seed-batch-*.py` (61개): 옛 데이터 시드 import — 현재 build-data가 통합
- `fetch-kice-1994-1998.py` / `merge-kice-1994-1998.py`: 1994~1998 옛 자료 별도 fetch
- `prepare-kice-archive.py` / `rename-kice-archive.py` / `merge-kice-archive*.py`: KICE archive 매핑·rename·merge 작업
- `expand-pre2009-by-area.py`: 1999~2004 인문/자연/예체능계 영역별 expand (1회 적용)
- `clean-pre2009-subs.py`: pre2009 subSubject 정제
- `attach-csat-even.py` / `attach-even-to-exams.py` / `upload-even-answers.py`: 짝수형 attach 1회성
- `ocr-detect-even.py`: OCR 기반 합본 검증 1회성
- `diff-kice-vs-ours.py`: 카탈로그 vs 데이터 diff 비교
