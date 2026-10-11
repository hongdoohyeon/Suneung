# GA4 측정 (kicegg.com)

측정 코드는 `lib/measure.js` 하나. 다른 스크립트는 `window.kgTrack?.(이름, 매개변수)` 만 부른다.

## 보내는 이벤트

| 이벤트 | 언제 | 매개변수 |
|---|---|---|
| `page_view` | 모든 페이지 | `content_group` = home · exam · exam_set · hub · blog · calendar · info · 404 |
| `exam_view` | 과목 상세가 시험 정보를 받았을 때 | exam_id · exam_group · exam_type · grade_year · subject |
| `material_download` | 자료 다운로드 클릭 | file_kind(question·answer·solution·listening·script·other) · file_ext · file_name · click_area |
| `bulk_download` | 여러 시험 선택 → 받기 | mode(merge·zip·each) · exam_count · file_count · kinds |
| `search` / `search_no_results` | 기출검색 검색어(입력 멈추고 1.5초) | search_term · result_count |
| `filter_apply` | 필터 변경(처음 열린 상태는 제외) | filters · result_count |
| `smart_search` | 자연어 검색 API 응답 | search_term · matched(풀린 축, 없으면 none) |
| `result_click` | 검색 결과 클릭 | position · search_term |
| `preview_open` | '시험지 펼치기' | viewer(question·script) |
| `exam_tab` | 상세 탭 전환 | tab |
| `listen_start` · `listen_progress` · `listen_complete` | 듣기 재생·절반·끝 | percent |
| `listen_control` | 문항 바로가기·배속·한 문항 반복 | control · chapter |
| `article_read` | 해설·블로그 글 마지막 문단까지 스크롤 | article(set_review·exam_note·blog) · engaged_sec |
| `share` | 상세 공유 버튼 | method · content_type |
| `report_submit` | 자료 오류 제보 접수 | kind · field |
| `select_mode` | 기출검색 '선택' 버튼 | — |
| `js_error` | 사이트 스크립트 오류(페이지당 3건) | message · source |

회차 페이지의 이벤트에는 exam_type · grade_year · curriculum 이, 과목 상세에는 `exam_view` 이후 exam_* · subject 가 자동으로 붙는다.

사용자 속성: theme_pref · spoiler · in_app · standalone.

## GA 관리 화면에서 할 일 (코드로 못 하는 것)

1. ~~맞춤 정의 등록~~ — 2026-10-11 완료(측정기준 26 · 측정항목 5). 이벤트 범위 측정기준은 매개변수 이름 그대로 등록했고,
   예외만 이름이 다르다: kind→`report_kind`, field→`report_field`, message→`error_message`, source→`error_source`.
   사용자 범위: theme_pref · spoiler · in_app · standalone. 측정항목: result_count · position · engaged_sec · exam_count · file_count.
   **새 매개변수를 추가하면 여기에도 등록**해야 보고서에 나온다(등록 전 데이터는 소급 안 됨).
2. **데이터 보존 기간 14개월**(데이터 수집 및 수정 › 데이터 보존).
3. **향상된 측정**: '파일 다운로드'는 꺼도 된다(material_download 가 대신). '브라우저 기록 이벤트 기반 페이지 변경'은 끄기 권장 — 기출검색은 필터를 바꿀 때마다 주소를 바꿔서 페이지뷰가 부풀려진다(filter_apply 로 따로 잡음).
4. **내부 트래픽 제외**: 데이터 스트림 › 태그 설정 › 내부 트래픽 정의(내 IP) → 데이터 필터 활성화.
5. **주요 이벤트(전환)**: material_download, bulk_download.
6. **Search Console 연결**(제품 링크).
