# 이의신청 기록 (data/objections.json)

평가원 수능·모평의 문제 및 정답 이의신청 기록. 평가원 수능·모평 상세 페이지의 2차 탭 '이의신청 및 보도'(build-data.py `objection_html`/`objection_panel_html`, 탭 전환 `lib/exam-tabs.js`)가 읽는다. 탭은 **보고 있는 과목만** 보여 준다(다른 과목 문항·기사·요약은 숨김).

- **공식**: suneung.re.kr 공지사항(1500229)·보도자료(1500230) 게시판에서 '이의' 검색 → 심사 결과 글과 첨부(보도자료·답변자료)를 받아 `parse.py` 로 접수 건수·심사 대상·문항별 결과·상세 답변 요지를 추출. 숫자가 텍스트층에 없는 PDF(2022~2025 일부)는 `ocr.py`(tesseract kor). 스캔본 답변 본문은 `ocr2.py`(400dpi·kor 전용)로 다시 읽어 더 깨끗한 쪽을 쓴다(상세 답변은 원문 문단 그대로 `answer` 에 보관, 스캔본이면 `ocr: true`). 원문은 릴리스 `objection-v1` 에 보관.
- **언론**: `data/sources/objections-news.json` — `naver_news.py`(평가원 발표일 앞뒤 기간 네이버 뉴스 검색) + 직접 고른 기사 → `news_clean.py`(제목 정리·중복 제거·세부과목 태그 `subjects`). 과목 태그가 없는 기사는 시험 전체 기사, 과목명 없이 출제 오류를 다룬 기사는 정답이 바뀐 과목 페이지에만 표시.
- **관련 공식 발표**: `data/sources/objections-official-extra.json` — 평가원 발표를 옮겨 실은 교육부·정책브리핑·교육정책네트워크 게시물.
- `build.py` 가 이들을 합쳐 `data/objections.json` 생성. 정답이 바뀐 문항은 `build.py` 의 `CHANGES`(원문 근거), 추출 누락 보정은 `OVR`.

새 회차 추가: 결과 글이 올라오면 목록·첨부 수집(kice_list/kice_posts) → parse → build. 스크립트의 작업 폴더(O)는 수집물 위치로 맞춰 쓴다.
