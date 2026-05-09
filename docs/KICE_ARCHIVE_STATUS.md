# KICE 아카이브 수집 현황 (2026-05-10)

## 보유 자료 (3,769 시험)

### 평가원·수능 (suneung 카테고리, 1,387건)
- **수능 (csat)**: 1994~2026 학년도 (33년 → 28+5년 보강)
  - 1994~1998: KICE csat_old 게시판 직접 fetch (1차/2차 분리)
  - 1999~2013: KICE csat_old + csat 게시판
  - 2014~2026: 기존 보유
- **6/9월 모평**: 2003~2026 학년도 (24년)
- **예비/예시**: 2003·2005·2014·2022·2028 (5학년도)

### 학평·LEET·MEET·사관·경찰: 2,382건 (변동 없음)

## GitHub Release

| 태그 | 자산 | 용량 | 내용 |
|---|---:|---:|---|
| `kice-archive-v1` | 994 | ~1.0GB | 1999~2013 PDF (1000 한도) |
| `kice-archive-v2` | 163 | ~150MB | 추가분 (1994~1998 + 통계 PDF) |
| 기타 (kice-v1~v4, edu-v1~v3 등) | — | — | 2014~2026 자료 |

## 수능통계 PDF (별도 자료)

KICE 수능통계 페이지 (m=0404)에서 다운:
1. `kice_yearly_application.pdf` — 연도별 응시원서 접수현황
2. `kice_yearly_attendance.pdf` — 연도별 응시현황
3. `kice_yearly_scoring.pdf` — 연도별 채점현황 (49쪽 — 등급/평균/계열별)

저장 위치: `kice-archive-v2/kice_yearly_*.pdf`

⚠️ **현재 archive 카드/검색에는 노출 안 됨** — 별도 페이지 또는 footer 링크 필요 (다음 세션)

## 메타 데이터 파일

- `data/kice-catalog.json` — KICE 자료마당 633 게시글 메타
- `data/kice-1994-1998-meta.json` — 1994~1998 학년도 영역·회차·파일 매핑
- `data/kice-archive-mapping-final.json` — 최종 ID 매핑 (영문 파일명)
- `data/kice-archive-new-items.json` — exams.json merge 입력 (553건)

## 미해결 / 다음 세션

1. **수능통계 PDF 3종 노출** (footer 또는 새 카테고리)
2. **EBSi 해설지 자동 수집** (해설지 0% 문제)
3. **검정고시·PEET·DEET** 등 새 카테고리 검토
4. **사이트 외 출처** (savetest 등) — 인증 필요해 자동 어려움

## 출처

모든 자료는 한국교육과정평가원 공식 (suneung.re.kr) — 공공저작물 (저작권 OK)
