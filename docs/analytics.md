# GA4 측정 (kicegg.com)

측정 코드는 `lib/measure.js` 하나. 다른 스크립트는 `window.kgTrack?.(이름, 매개변수)` 만 부른다.

## 보내는 이벤트

| 이벤트 | 언제 | 매개변수 |
|---|---|---|
| `page_view` | 모든 페이지 | `content_group` = home · exam · exam_set · hub · blog · calendar · info · 404 |
| `exam_view` | 과목 상세가 시험 정보를 받았을 때 | exam_id · exam_group · exam_type · grade_year · subject |
| `material_download` | 자료 다운로드 클릭 | file_kind(question·answer·solution·listening·script·other) · file_ext · file_name · click_area · subject |
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

다운로드의 `subject`는 클릭한 자료의 `data-ga-subject`를 우선하고, 없으면 상세 페이지의 시험 정보를 사용한다. 선택과목(`subSubject`)이 있으면 그 값을, 없으면 영역(`subject`)을 보낸다. 검색 목록(주소 지연 로딩 포함)·회차 카드·정적 상세/회차에도 같은 속성을 넣는다. 과목이 없던 기존 다운로드 통계는 소급 복구되지 않는다.

사용자 속성: theme_pref · spoiler · in_app · standalone.

## GA 관리 화면에서 할 일 (코드로 못 하는 것)

1. ~~맞춤 정의 등록~~ — 2026-10-11 완료(측정기준 26 · 측정항목 5). 이벤트 범위 측정기준은 매개변수 이름 그대로 등록했고,
   예외만 이름이 다르다: kind→`report_kind`, field→`report_field`, message→`error_message`, source→`error_source`.
   사용자 범위: theme_pref · spoiler · in_app · standalone. 측정항목: result_count · position · engaged_sec · exam_count · file_count.
   **새 매개변수를 추가하면 여기에도 등록**해야 보고서에 나온다(등록 전 데이터는 소급 안 됨).
2. ~~데이터 보존 기간 14개월~~ — 이미 14개월(2026-10-11 확인).
3. **향상된 측정**: '파일 다운로드'는 꺼야 한다(material_download 가 대신) — **2026-10-17 기준 아직 켜져 있음**(읽기 전용 토큰이라 API 로 끄지 못했다. 관리 › 데이터 스트림 › kicegg.com › 향상된 측정 톱니에서 직접 끌 것). 그동안 `file_download` 가 `material_download` 와 중복 집계됐다(7일 45,663 vs 33,487). '브라우저 기록 이벤트 기반 페이지 변경'은 끄기 권장 — 기출검색은 필터를 바꿀 때마다 주소를 바꿔서 페이지뷰가 부풀려진다(filter_apply 로 따로 잡음).
4. **내부 트래픽 제외**: 규칙 '운영자 집'(125.185.120.186/32) 만듦(2026-10-11). 데이터 필터 'Internal Traffic' 활성(2026-10-11). 집 IP 가 바뀌면 규칙도 고칠 것.
5. **주요 이벤트(전환)**: material_download, bulk_download — GA 이벤트 목록에 뜬 뒤(수집 후 ~24시간) 관리 › 이벤트에서 별표.
6. ~~Search Console 연결~~ — 2026-10-11 kicegg.com(도메인) ↔ 웹 스트림 연결.
7. ~~CSP~~ — 2026-10-11 Cloudflare 응답 헤더 규칙 `security-headers` + 페이지 meta 둘 다 추가 완료. GA 태그 진단이 connect-src 에 `https://www.googletagmanager.com` 이 없어 일부 요청이 막힌다고 보고(2026-10-11). 고치려면 Cloudflare 응답 헤더 규칙 + 페이지 meta CSP 둘 다에 추가.

## 주소 정규화·태그 로딩 (2026-10-17)

- 첫 화면이 `/` · `/archive.html` · `/index.html` 세 주소로 열려 GA '페이지' 보고서가 쪼개져 있었다(7일 페이지뷰의 37%가 이 세 주소). `lib/site-prefs.js` 가 http(s) 에서 `/archive.html`·`/index.html` 을 `/?쿼리` 로 즉시 `location.replace` 한다 — 검색어·필터 쿼리는 그대로 넘긴다. `127.0.0.1`·`localhost`(빌드 미리 그리기)와 `file://` 은 건드리지 않는다.
- gtag 본체를 `load` 대신 본문 파싱 직후(`requestIdleCallback`, 최대 1.5초)에 받는다. load 가 늦는 회선에서는 첫 전송이 6초까지 밀려 그 전에 나가는 방문이 0건으로 남았다. load 를 4초 지연시킨 A/B 실측: gtag 요청 4,040ms → 30ms.
