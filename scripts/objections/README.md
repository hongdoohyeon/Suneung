# 이의신청 기록 (data/objections.json)

평가원 수능·모평의 문제 및 정답 이의신청 기록. 상세 페이지 '이의신청 기록' 섹션(build-data.py `objection_html`)이 읽는다.

- **공식**: suneung.re.kr 공지사항(1500229)·보도자료(1500230) 게시판에서 '이의' 검색 → 심사 결과 글과 첨부(보도자료·답변자료)를 받아 `parse.py` 로 접수 건수·심사 대상·문항별 결과·상세 답변 요지를 추출. 숫자가 텍스트층에 없는 PDF(2022~2025 일부)는 `ocr.py`(tesseract kor). 원문은 릴리스 `objection-v1` 에 보관.
- **언론**: `data/sources/objections-news.json` — 회차별 기사 목록과 요약(직접 작성).
- **커뮤니티(비공식)**: `data/sources/objections-community.json` — 오르비 원글·위키 요약(직접 작성).
- `build.py` 가 셋을 합쳐 `data/objections.json` 생성. 정답이 바뀐 문항은 `build.py` 의 `CHANGES`(원문 근거), 추출 누락 보정은 `OVR`.

새 회차 추가: 결과 글이 올라오면 목록·첨부 수집(kice_list/kice_posts) → parse → build. 스크립트의 작업 폴더(O)는 수집물 위치로 맞춰 쓴다.
