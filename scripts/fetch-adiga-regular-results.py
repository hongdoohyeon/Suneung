#!/usr/bin/env python3
"""대입정보포털 어디가의 2026학년도 정시 70%컷을 공식 응답에서 수집한다.

기본 실행은 대학코드 매핑만 점검한다. ``--write``를 지정하면 어디가 일반대학
목록 220개 대학·캠퍼스를 전부 조회해 출처·미제출 사유를 기록하고, 기존
103개 반영비율 대상 대학의 2026학년도 자료를 ``manual-results.json``에 반영한다.
"""

from __future__ import annotations

import argparse
import copy
import html
import http.cookiejar
import json
import math
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
RATIOS_PATH = ROOT / "data/admissions/manual-ratios.json"
RESULTS_PATH = ROOT / "data/admissions/manual-results.json"
SOURCE_PATH = ROOT / "data/admissions/sources/adiga-regular-2026.json"
COVERAGE_PATH = ROOT / "data/admissions/adiga-coverage-2026.json"
RATIO_SOURCE_PATH = ROOT / "data/admissions/sources/adiga-regular-ratios-2027.json"

BASE_URL = "https://m.adiga.kr"
VIEW_URL = f"{BASE_URL}/mob/ucp/uvt/uni/univView.do?menuId=MOUVTINF1001"
LIST_URL = f"{BASE_URL}/mob/ucp/uvt/uni/univAjax.do"
RESULT_URL = f"{BASE_URL}/mob/uct/acd/ade/criteriaAndResultItemNewAjax.do"
SEARCH_SYR = 2027
RESULT_YEAR = 2026
PAGE_SIZE = 10
KST = timezone(timedelta(hours=9))

NAME_ALIASES = {
    "unist": "울산과학기술원",
    "gist": "광주과학기술원",
    "dgist": "대구경북과학기술원",
}

# 과학기술원 4곳은 어디가의 2027학년도 일반대학 목록 검색 결과가 0건이다.
# 이들은 누락시키지 않고 명시적인 상태로 남긴 뒤 각 대학 입학처 자료로 보강한다.
NOT_LISTED_IN_ADIGA = {
    "unist": "어디가 2027학년도 일반대학 목록에서 UNIST·울산과학기술원 검색 결과 0건",
    "gist": "어디가 2027학년도 일반대학 목록에서 GIST·광주과학기술원 검색 결과 0건",
    "dgist": "어디가 2027학년도 일반대학 목록에서 DGIST·대구경북과학기술원 검색 결과 0건",
    "kentech": "어디가 2027학년도 일반대학 목록에서 KENTECH·한국에너지공과대학교 검색 결과 0건",
}

# 어디가가 백분위 70% 평균을 제공하지 않거나 목록에 없는 대학 중, 대학
# 입학처에서 확인 가능한 별도 공개 상태를 함께 보존한다. 다른 척도의 값을
# pct70으로 변환하지 않는다.
DIRECT_SUPPLEMENTS = {
    "snue": {
        "status": "alternative_metric_available",
        "source": "서울교육대학교 입학처",
        "sourceUrl": "https://admission.snue.ac.kr/admission/cm/cntnts/cntntsView.do?cntntsId=3425&mi=3649",
        "metric": "서울교대 수능 영역별 환산점수 70%컷",
        "results": [
            {"unit": "초등교육과", "track": "수능위주(일반전형)", "cut": 630.0788},
            {"unit": "초등교육과", "track": "수능위주(기초생활수급자등전형)", "cut": 595.0744},
            {"unit": "초등교육과", "track": "수능위주(장애인등대상자전형)", "cut": 525.0656},
        ],
        "note": "공식 2026년 전형결과 페이지의 대학 자체 환산점수이며 백분위가 아니다. 표 caption에는 2025학년도가 남아 있어 페이지 제목과 불일치한다.",
    },
    "gachon": {
        "status": "regular_result_not_published",
        "source": "가천대학교 입학처",
        "sourceUrl": "https://admission.gachon.ac.kr/admission/html/regular/result.asp",
        "results": [],
        "note": "2026-07-18 확인 기준 정시 입시결과 게시판의 최신 성적 자료는 2025학년도이며, 2026학년도는 원서접수 결과만 공개됐다.",
    },
    "kentech": {
        "status": "official_result_notice_published",
        "source": "한국에너지공과대학교 입학안내",
        "sourceUrl": "https://admission.kentech.ac.kr/detail.do?board_seq=7469&categoryid=&lang=kor&menuurl=CMQ9%2FVd2MCqEcGDisnKXfA%3D%3D&pageNo=1&row_num=18&siteName=ipsi&userpwd=",
        "results": [],
        "note": "2026학년도 KENTECH 입시 결과 공지가 2026-03-05 게시됐으나 구조화된 백분위 70% 수치는 확인되지 않았다.",
    },
    "mokpo": {
        "status": "official_analysis_attachment_published",
        "source": "국립목포대학교 입학처",
        "sourceUrl": "https://ipsi.mokpo.ac.kr/ipsi/800/subview.do",
        "results": [],
        "note": "2026학년도 정시모집 입학전형 결과 분석 자료가 2026-03-13 첨부 1건으로 공개됐지만, 어디가 응답의 70% 백분위 칸은 0/1 대체값이다.",
    },
    "skuniv": {
        "status": "regular_result_not_published",
        "source": "서경대학교 입학처",
        "sourceUrl": "https://go.skuniv.ac.kr/?category=177&mid=previous_result",
        "results": [],
        "note": "2026-07-18 확인 기준 전년도 입시결과 게시판의 최신 정시 성적 자료는 2025학년도이며, 2026학년도 성적 자료는 게시되지 않았다.",
    },
    "jnue": {
        "status": "official_cut_not_confirmed",
        "source": "전주교육대학교 입학안내",
        "sourceUrl": "https://www.jnue.kr/portal/enter/bbs/list.do?menuId=M0008000300000000",
        "results": [],
        "note": "2026-07-18 확인 기준 공식 정시 입학자료실과 공개 검색에서 구조화된 2026학년도 백분위 70%컷을 확인하지 못했다.",
    },
    "unist": {
        "status": "official_cut_not_confirmed",
        "source": "UNIST 학부입학",
        "sourceUrl": "https://www.unist.ac.kr/admission/community/entire.do",
        "results": [],
        "note": "공식 학부입학 공지에는 2026학년도 신입생 모집 경쟁률과 선행학습 영향평가가 공개됐지만, 구조화된 합격점수 또는 백분위 70%컷은 확인되지 않았다.",
    },
    "gist": {
        "status": "official_cut_not_confirmed",
        "source": "GIST 대학입학",
        "sourceUrl": "https://www.gist.ac.kr/uadm/main.html",
        "results": [],
        "note": "2026-07-18 확인 기준 공식 대학입학 사이트와 공개 검색에서 구조화된 2026학년도 백분위 70%컷을 확인하지 못했다.",
    },
    "dgist": {
        "status": "official_cut_not_confirmed",
        "source": "DGIST 학부입학",
        "sourceUrl": "https://www.dgist.ac.kr/adm/",
        "results": [],
        "note": "2026-07-18 확인 기준 공식 학부입학 사이트와 공개 검색에서 구조화된 2026학년도 백분위 70%컷을 확인하지 못했다.",
    },
}

# 같은 대학명이 여러 캠퍼스로 나뉘고 저장소에도 별도 slug가 있는 경우만 고정한다.
CAMPUS_FILTERS = {
    "yonsei": ("본교", "서울캠퍼스"),
    "yonsei_mirae": ("분교",),
    "korea": ("본교", "서울캠퍼스"),
    "korea_sejong": ("분교",),
    "hanyang": ("본교", "서울캠퍼스"),
    "hanyang_erica": ("분교",),
    "dankook": ("죽전캠퍼스", "본교"),
    "dankook_cheonan": ("제2캠퍼스",),
    "dongguk": ("본교", "서울캠퍼스"),
    "dongguk_wise": ("분교",),
}


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def strip_tags(value: str) -> str:
    return compact_text(re.sub(r"<[^>]+>", " ", value))


def normalized_name(value: str) -> str:
    value = compact_text(value)
    value = re.sub(r"\s*\([^)]*\)\s*$", "", value)
    value = value.removeprefix("국립")
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).casefold()


def csrf_token(page: str) -> str:
    match = re.search(r'<meta\s+name="_csrf"\s+content="([^"]+)"', page)
    if not match:
        raise RuntimeError("어디가 페이지에서 CSRF 토큰을 찾지 못했습니다")
    return match.group(1)


class AdigaClient:
    def __init__(self) -> None:
        cookies = http.cookiejar.CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(cookies))
        self.token = ""

    def _request(self, request: Request) -> str:
        try:
            with self.opener.open(request, timeout=30) as response:
                body = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                return body.decode(charset, errors="strict")
        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(f"어디가 요청 실패: {request.full_url}: {exc}") from exc

    def open(self) -> str:
        request = Request(
            VIEW_URL,
            headers={"User-Agent": "kicegg-data-audit/1.0 (+https://kicegg.com)"},
        )
        page = self._request(request)
        self.token = csrf_token(page)
        return page

    def get(self, url: str) -> str:
        request = Request(
            url,
            headers={"User-Agent": "kicegg-data-audit/1.0 (+https://kicegg.com)"},
        )
        return self._request(request)

    def post(self, url: str, payload: dict[str, str | int]) -> str:
        if not self.token:
            raise RuntimeError("어디가 세션이 열리지 않았습니다")
        request = Request(
            url,
            data=urlencode(payload).encode("utf-8"),
            headers={
                "User-Agent": "kicegg-data-audit/1.0 (+https://kicegg.com)",
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-CSRF-TOKEN": self.token,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": VIEW_URL,
            },
        )
        return self._request(request)


def parse_university_page(fragment: str) -> tuple[int, list[dict[str, str]]]:
    total_match = re.search(r'id="totRecordCnt"\s+value="(\d+)"', fragment)
    total = int(total_match.group(1)) if total_match else 0
    pattern = re.compile(
        r'fnDetailPage\(&quot;(\d+)&quot;\);[\s\S]*?'
        r'<div\s+class="univName">([\s\S]*?)<span>([\s\S]*?)</span>',
    )
    rows = []
    for code, name, campus in pattern.findall(fragment):
        rows.append({"unvCd": code, "name": strip_tags(name), "campus": strip_tags(campus)})
    return total, rows


class ResultTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.track = ""
        self._in_h5 = False
        self._h5_text: list[str] = []
        self._in_tbody = False
        self._in_row = False
        self._in_cell = False
        self._cell_text: list[str] = []
        self._row: list[str] = []
        self.rows: list[tuple[str, list[str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        classes = set((attrs_dict.get("class") or "").split())
        if tag == "h5" and "tit" in classes:
            self._in_h5 = True
            self._h5_text = []
        elif tag == "tbody":
            self._in_tbody = True
        elif tag == "tr" and self._in_tbody:
            self._in_row = True
            self._row = []
        elif tag in {"td", "th"} and self._in_row:
            self._in_cell = True
            self._cell_text = []
        elif tag == "br" and self._in_cell:
            self._cell_text.append(" ")

    def handle_data(self, data: str) -> None:
        if self._in_h5:
            self._h5_text.append(data)
        if self._in_cell:
            self._cell_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "h5" and self._in_h5:
            self.track = compact_text("".join(self._h5_text))
            self._in_h5 = False
        elif tag in {"td", "th"} and self._in_cell:
            self._row.append(compact_text("".join(self._cell_text)))
            self._in_cell = False
        elif tag == "tr" and self._in_row:
            if self._row:
                self.rows.append((self.track, self._row))
            self._in_row = False
        elif tag == "tbody":
            self._in_tbody = False


class SelectionCriteriaParser(HTMLParser):
    """대학 상세의 숨김 수능위주 탭에서 공식 텍스트와 표 구조를 보존한다."""

    SKIP_TAGS = {"script", "style", "title"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._target_div_depth = 0
        self._skip_depth = 0
        self._text: list[str] = []
        self._table_stack: list[dict[str, object]] = []
        self._tables: list[dict[str, object]] = []
        self._table_order = 0

    @property
    def in_target(self) -> bool:
        return self._target_div_depth > 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "div":
            if self.in_target:
                self._target_div_depth += 1
            elif attrs_dict.get("id") == "tab_40":
                self._target_div_depth = 1
        if not self.in_target:
            return
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "table":
            if self._table_stack:
                self._table_stack[-1]["childTableCount"] += 1
            self._table_order += 1
            self._table_stack.append(
                {
                    "order": self._table_order,
                    "context": compact_text(" ".join(self._text[-80:])),
                    "rows": [],
                    "row": None,
                    "cell": None,
                    "childTableCount": 0,
                }
            )
        elif tag == "tr" and self._table_stack:
            self._table_stack[-1]["row"] = []
        elif tag in {"td", "th"} and self._table_stack:
            def span_value(name: str) -> int:
                value = attrs_dict.get(name) or "1"
                return int(value) if value.isdigit() and 1 <= int(value) <= 100 else 1

            self._table_stack[-1]["cell"] = {
                "textParts": [],
                "rowspan": span_value("rowspan"),
                "colspan": span_value("colspan"),
                "header": tag == "th",
            }
        elif tag == "br":
            self._append_text(" ")
        elif tag in {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self._text.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_data(self, data: str) -> None:
        if self.in_target and not self._skip_depth:
            self._append_text(data)

    def handle_endtag(self, tag: str) -> None:
        if not self.in_target:
            return
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif not self._skip_depth:
            if tag in {"td", "th"} and self._table_stack:
                table = self._table_stack[-1]
                cell = table.get("cell")
                row = table.get("row")
                if isinstance(cell, dict) and isinstance(row, list):
                    row.append(
                        {
                            "text": compact_text(" ".join(cell.pop("textParts"))),
                            "rowspan": cell["rowspan"],
                            "colspan": cell["colspan"],
                            "header": cell["header"],
                        }
                    )
                table["cell"] = None
            elif tag == "tr" and self._table_stack:
                table = self._table_stack[-1]
                row = table.get("row")
                if isinstance(row, list) and row:
                    table["rows"].append(row)
                table["row"] = None
            elif tag == "table" and self._table_stack:
                table = self._table_stack.pop()
                rows = table.pop("rows")
                table.pop("row", None)
                table.pop("cell", None)
                table_text = compact_text(
                    " ".join(cell["text"] for row in rows for cell in row)
                )
                table["text"] = table_text
                table["rows"] = rows
                self._tables.append(table)
            elif tag in {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6"}:
                self._text.append("\n")
        if tag == "div":
            self._target_div_depth -= 1

    def _append_text(self, data: str) -> None:
        self._text.append(data)
        for table in self._table_stack:
            cell = table.get("cell")
            if isinstance(cell, dict):
                cell["textParts"].append(data)

    @property
    def section_text(self) -> str:
        return compact_text(" ".join(self._text))

    @property
    def tables(self) -> list[dict[str, object]]:
        return sorted(self._tables, key=lambda table: table["order"])


def is_ratio_table(table: dict[str, object]) -> bool:
    text = compact_text(str(table.get("text", "")))
    normalized = re.sub(r"\s+", "", text)
    subject_count = sum(subject in text for subject in ("국어", "수학", "영어", "탐구"))
    has_percent = bool(re.search(r"\d+(?:\.\d+)?\s*%", text))
    has_ratio_term = bool(
        re.search(r"반영\s*비율|영역별|성적\s*산출|가산점|활용\s*지표", text)
    )
    has_grade_table = "영어등급" in normalized or "한국사등급" in normalized
    return has_grade_table or (has_ratio_term and (has_percent or subject_count >= 2)) or (
        subject_count >= 3 and has_percent
    )


def parse_selection_page(page: str, university: dict[str, str]) -> dict[str, object]:
    parser = SelectionCriteriaParser()
    parser.feed(page)
    section_text = parser.section_text
    ratio_tables = [
        {
            "context": table["context"][-500:],
            "rows": table["rows"],
        }
        for table in parser.tables
        if table["childTableCount"] == 0 and is_ratio_table(table)
    ]
    subject_count = sum(subject in section_text for subject in ("국어", "수학", "영어", "탐구"))
    has_ratio_text = subject_count >= 2 and bool(
        re.search(r"반영\s*비율|영역별|성적\s*산출|\d+(?:\.\d+)?\s*%", section_text)
    )
    meaningful_text = section_text
    for generic in (
        "2027학년도 전형평가기준 및 결과공개 자료입니다.",
        "2027학년도 전형별 주요사항",
        "2026학년도 전형 결과",
    ):
        meaningful_text = meaningful_text.replace(generic, " ")
    meaningful_text = compact_text(re.sub(r"\b[QA]\b", " ", meaningful_text))
    if ratio_tables:
        status = "structured_ratio_available"
    elif has_ratio_text:
        status = "ratio_text_available"
    elif len(meaningful_text) >= 30:
        status = "criteria_text_available"
    else:
        status = "no_selection_criteria"
    return {
        "unvCd": university["unvCd"],
        "officialName": university["name"],
        "campus": university["campus"],
        "status": status,
        "sectionText": section_text,
        "criteriaTextLength": len(meaningful_text),
        "ratioTableCount": len(ratio_tables),
        "ratioTables": ratio_tables,
        "sourceUrl": detail_url(university["unvCd"]),
    }


def fetch_universities(client: AdigaClient) -> list[dict[str, str]]:
    first = client.post(
        LIST_URL,
        {
            "pagination.currentPage": 1,
            "pagination.cntPerPage": PAGE_SIZE,
            "searchSyr": SEARCH_SYR,
            "unvCd": "",
            "unvSeCd": "10",
            "srchCndGroupSn": "",
            "searchTitle": "",
        },
    )
    total, rows = parse_university_page(first)
    if not total or not rows:
        raise RuntimeError("어디가 일반대학 목록을 읽지 못했습니다")
    pages = math.ceil(total / PAGE_SIZE)
    for page in range(2, pages + 1):
        fragment = client.post(
            LIST_URL,
            {
                "pagination.currentPage": page,
                "pagination.cntPerPage": PAGE_SIZE,
                "searchSyr": SEARCH_SYR,
                "unvCd": "",
                "unvSeCd": "10",
                "srchCndGroupSn": "",
                "searchTitle": "",
            },
        )
        _, page_rows = parse_university_page(fragment)
        if not page_rows:
            raise RuntimeError(f"어디가 대학 목록 {page}/{pages}페이지가 비었습니다")
        rows.extend(page_rows)
        time.sleep(0.05)
    unique = {row["unvCd"]: row for row in rows}
    if len(unique) != total:
        raise RuntimeError(f"어디가 대학 목록 수 불일치: 공시 {total}, 수집 {len(unique)}")
    return list(unique.values())


def target_name(slug: str, manual_name: str) -> str:
    return NAME_ALIASES.get(slug, re.sub(r"\s*\([^)]*\)\s*$", "", manual_name).strip())


def build_mapping(
    ratios: dict[str, object], universities: list[dict[str, str]]
) -> tuple[dict[str, list[dict[str, str]]], list[str]]:
    by_name: dict[str, list[dict[str, str]]] = {}
    for university in universities:
        by_name.setdefault(normalized_name(university["name"]), []).append(university)

    mapping: dict[str, list[dict[str, str]]] = {}
    errors: list[str] = []
    for slug, school in ratios.items():
        if slug == "_meta":
            continue
        if slug in NOT_LISTED_IN_ADIGA:
            continue
        manual_name = school.get("name", "") if isinstance(school, dict) else ""
        official_name = target_name(slug, manual_name)
        candidates = list(by_name.get(normalized_name(official_name), []))
        filters = CAMPUS_FILTERS.get(slug)
        if filters:
            filtered = [
                candidate
                for candidate in candidates
                if any(value.casefold() == candidate["campus"].casefold() for value in filters)
            ]
            if filtered:
                candidates = filtered
            else:
                errors.append(
                    f"{slug} {manual_name}: 캠퍼스 {', '.join(filters)} 미일치 "
                    f"(후보: {', '.join(c['campus'] for c in candidates) or '없음'})"
                )
                continue
        if not candidates:
            errors.append(f"{slug} {manual_name}: 어디가 대학코드 미매칭 ({official_name})")
            continue
        mapping[slug] = sorted(candidates, key=lambda item: (item["name"], item["campus"], item["unvCd"]))
    return mapping, errors


def numeric(value: str) -> float | None:
    cleaned = value.replace(",", "").replace("%", "").strip()
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", cleaned):
        return None
    number = float(cleaned)
    if not 0 < number <= 100:
        return None
    return number


def raw_numeric(value: str) -> float | None:
    cleaned = value.replace(",", "").replace("%", "").strip()
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", cleaned):
        return None
    return float(cleaned)


def missing_reason(cells: list[str]) -> str | None:
    joined = " ".join(cells)
    match = re.search(r"미제출\s*사유\s*:\s*(.+)", joined)
    if not match:
        return None
    reason = re.sub(r",?\s*추가\s*안내자료\s*참고.*$", "", match.group(1)).strip(" ,")
    return reason or "사유 미상"


def parse_result_fragment(fragment: str, university: dict[str, str]) -> dict[str, object]:
    parser = ResultTableParser()
    parser.feed(fragment)
    units: list[dict[str, object]] = []
    reasons: Counter[str] = Counter()
    unexpected = 0
    for track, cells in parser.rows:
        reason = missing_reason(cells)
        if reason:
            reasons[reason] += 1
            continue
        if len(cells) < 29:
            unexpected += 1
            continue
        pct70 = numeric(cells[26])
        percentile70_cells = [raw_numeric(value) for value in cells[18:26]]
        # 일부 대학은 70% 백분위를 제출하지 않았을 때 관련 칸 전체를 0/1로
        # 채운다. 약학·한의예를 포함한 다수 모집단위가 똑같이 1.0이므로
        # 실제 1백분위 컷으로 취급하지 않는다.
        is_one_sentinel = (
            pct70 == 1
            and any(value is not None for value in percentile70_cells)
            and all(value is None or 0 <= value <= 1 for value in percentile70_cells)
        )
        if is_one_sentinel:
            reasons["어디가 1.0 대체값(70% 세부 백분위 0/1)"] += 1
            continue
        if pct70 is None:
            reasons["백분위 70% 평균 미제출"] += 1
            continue
        units.append(
            {
                "unit": cells[1],
                "pct70": pct70,
                "track": track,
                "admissionGroup": cells[0],
                "recruited": cells[2],
                "competition": cells[3],
                "additionalAdmission": cells[4],
                "convertedScore70": cells[6],
                "unvCd": university["unvCd"],
                "campus": university["campus"],
            }
        )
    if units:
        status = "numeric_cut_available"
    elif parser.rows:
        status = "no_numeric_cut"
    else:
        status = "no_rows"
    return {
        "unvCd": university["unvCd"],
        "officialName": university["name"],
        "campus": university["campus"],
        "status": status,
        "rowCount": len(parser.rows),
        "numericCutCount": len(units),
        "missingReasons": dict(sorted(reasons.items())),
        "unexpectedRowCount": unexpected,
        "units": units,
    }


def detail_url(unv_cd: str) -> str:
    return (
        f"{BASE_URL}/mob/ucp/uvt/uni/univDetailSelection.do?"
        f"menuId=MOUVTINF1001&unvCd={unv_cd}&searchSyr={SEARCH_SYR}"
    )


def collect_official_results(
    client: AdigaClient,
    universities: list[dict[str, str]],
) -> tuple[dict[str, object], dict[str, object]]:
    results: dict[str, object] = {}
    selections: dict[str, object] = {}
    for index, university in enumerate(universities, start=1):
        print(
            f"[{index:03d}/{len(universities)}] {university['unvCd']} "
            f"{university['name']} {university['campus']}",
            file=sys.stderr,
        )
        fragment = client.post(
            RESULT_URL,
            {
                "searchSyr": SEARCH_SYR,
                "unvCd": university["unvCd"],
                "tsrdCmphSlcnArtclUpCd": "40",
                "compUnvCd": "",
            },
        )
        parsed = parse_result_fragment(fragment, university)
        parsed["sourceUrl"] = detail_url(university["unvCd"])
        parsed["targetSlugs"] = []
        results[university["unvCd"]] = parsed
        selection_page = client.get(detail_url(university["unvCd"]))
        selections[university["unvCd"]] = parse_selection_page(selection_page, university)
        time.sleep(0.1)
    return results, selections


def build_selection_source_payload(
    official_selections: dict[str, object],
) -> dict[str, object]:
    status_counts = Counter(
        selection["status"] for selection in official_selections.values()
    )
    table_count = sum(
        selection["ratioTableCount"] for selection in official_selections.values()
    )
    return {
        "_meta": {
            "description": "대입정보포털 어디가 2027학년도 수능위주전형 영역별 반영비율·가산점 공식 표 220개 대학·캠퍼스 전수 조회",
            "source": "대입정보포털 어디가",
            "sourceUrl": VIEW_URL,
            "searchSyr": SEARCH_SYR,
            "selectionYear": SEARCH_SYR,
            "collectedAt": datetime.now(KST).date().isoformat(),
            "officialUniversityCount": len(official_selections),
            "auditedOfficialUniversityCount": len(official_selections),
            "universitiesWithStructuredRatioTable": status_counts["structured_ratio_available"],
            "universitiesWithRatioText": status_counts["ratio_text_available"],
            "universitiesWithCriteriaTextOnly": status_counts["criteria_text_available"],
            "universitiesWithoutSelectionCriteria": status_counts["no_selection_criteria"],
            "structuredRatioTableCount": table_count,
            "note": "영역별 반영비율을 임의 정규화하지 않고 공식 표의 셀·행열 병합 구조와 텍스트를 보존한다. 표가 없으면 공식 페이지의 텍스트 공개 상태를 기록한다.",
        },
        "universities": official_selections,
    }


def build_target_results(
    ratios: dict[str, object],
    mapping: dict[str, list[dict[str, str]]],
    official_universities: dict[str, object],
) -> dict[str, object]:
    schools: dict[str, object] = {}
    target_slugs = [slug for slug in ratios if slug != "_meta"]
    for index, slug in enumerate(target_slugs, start=1):
        school = ratios[slug]
        print(f"[{index:03d}/{len(target_slugs)}] {slug} {school['name']}", file=sys.stderr)
        if slug in NOT_LISTED_IN_ADIGA:
            schools[slug] = {
                "name": school["name"],
                "status": "not_listed_in_adiga",
                "statusReason": NOT_LISTED_IN_ADIGA[slug],
                "campuses": [],
                "numericCutCount": 0,
                "units": [],
            }
            continue
        campuses = []
        all_units = []
        for university in mapping[slug]:
            parsed = copy.deepcopy(official_universities[university["unvCd"]])
            all_units.extend(parsed.pop("units"))
            parsed.pop("targetSlugs", None)
            campuses.append(parsed)
        unique_units = {}
        for unit in all_units:
            key = (
                unit["unvCd"],
                unit["track"],
                unit["admissionGroup"],
                unit["unit"],
                unit["pct70"],
            )
            unique_units[key] = unit
        units = sorted(
            unique_units.values(),
            key=lambda item: (
                item["campus"], item["track"], item["admissionGroup"], item["unit"]
            ),
        )
        status = "numeric_cut_available" if units else (
            "no_numeric_cut" if any(campus["rowCount"] for campus in campuses) else "no_rows"
        )
        schools[slug] = {
            "name": school["name"],
            "status": status,
            "campuses": campuses,
            "numericCutCount": len(units),
            "units": units,
        }
    return schools


def build_source_payload(
    schools: dict[str, object],
    target_count: int,
    official_universities: dict[str, object],
) -> dict[str, object]:
    numeric_schools = sum(
        school["status"] == "numeric_cut_available" for school in schools.values()
    )
    unlisted_schools = sum(
        school["status"] == "not_listed_in_adiga" for school in schools.values()
    )
    unit_count = sum(school["numericCutCount"] for school in schools.values())
    code_count = sum(len(school["campuses"]) for school in schools.values())
    official_numeric_count = sum(
        university["status"] == "numeric_cut_available"
        for university in official_universities.values()
    )
    official_unit_count = sum(
        university["numericCutCount"] for university in official_universities.values()
    )
    for slug, supplement in DIRECT_SUPPLEMENTS.items():
        if slug in schools:
            schools[slug]["directSupplement"] = copy.deepcopy(supplement)
    return {
        "_meta": {
            "description": "대입정보포털 어디가 2026학년도 수능위주전형 공식 입시결과 220개 대학·캠퍼스 전수 조회",
            "source": "대입정보포털 어디가",
            "sourceUrl": VIEW_URL,
            "sourceEndpoint": RESULT_URL,
            "searchSyr": SEARCH_SYR,
            "resultYear": RESULT_YEAR,
            "collectedAt": datetime.now(KST).date().isoformat(),
            "officialUniversityCount": len(official_universities),
            "auditedOfficialUniversityCount": len(official_universities),
            "officialUniversitiesWithNumericCut": official_numeric_count,
            "officialUniversitiesWithoutNumericCut": len(official_universities) - official_numeric_count,
            "officialNumericCutCount": official_unit_count,
            "targetSchoolCount": target_count,
            "auditedSchoolCount": len(schools),
            "mappedSchoolCount": target_count - unlisted_schools,
            "unlistedSchoolCount": unlisted_schools,
            "queriedCodeCount": code_count,
            "schoolsWithNumericCut": numeric_schools,
            "schoolsWithoutNumericCut": target_count - numeric_schools,
            "numericCutCount": unit_count,
            "note": "어디가 일반대학 220개 대학·캠퍼스를 모두 조회한다. 숫자가 없는 대학도 대학 미제출·통합모집·등록인원 3명 이하 등 공식 사유와 함께 기록한다.",
        },
        "universities": official_universities,
        "schools": schools,
    }


def build_coverage_payload(
    source_payload: dict[str, object], selection_payload: dict[str, object]
) -> dict[str, object]:
    schools = {
        slug: {key: value for key, value in school.items() if key != "units"}
        for slug, school in source_payload["schools"].items()
    }
    universities = {}
    for code, university in source_payload["universities"].items():
        selection = selection_payload["universities"][code]
        universities[code] = {
            **{key: value for key, value in university.items() if key != "units"},
            "ratioStatus": selection["status"],
            "ratioTableCount": selection["ratioTableCount"],
            "ratioSourceUrl": selection["sourceUrl"],
            "ratioTextLength": selection["criteriaTextLength"],
        }
    return {
        "_meta": copy.deepcopy(source_payload["_meta"]),
        "universities": universities,
        "schools": schools,
    }


def merge_manual_results(
    manual_results: dict[str, object], source_payload: dict[str, object]
) -> dict[str, object]:
    schools = source_payload["schools"]
    for slug, official in schools.items():
        units = official["units"]
        if not units:
            existing = manual_results.get(slug, {}).get(str(RESULT_YEAR), [])
            if existing and all(
                isinstance(unit, dict) and unit.get("source") == "대입정보포털 어디가"
                for unit in existing
            ):
                del manual_results[slug][str(RESULT_YEAR)]
            continue
        years = manual_results.setdefault(slug, {})
        years[str(RESULT_YEAR)] = [
            {
                "unit": unit["unit"],
                "pct70": unit["pct70"],
                "note": " · ".join(
                    value
                    for value in (
                        unit["track"], unit["admissionGroup"], unit["campus"], "어디가 공식"
                    )
                    if value
                ),
                "track": unit["track"],
                "admissionGroup": unit["admissionGroup"],
                "campus": unit["campus"],
                "source": "대입정보포털 어디가",
                "sourceUrl": detail_url(unit["unvCd"]),
            }
            for unit in units
        ]

    result_schools = [slug for slug in manual_results if slug != "_meta"]
    unit_count = 0
    year_school_counts: Counter[str] = Counter()
    for slug in result_schools:
        for year, units in manual_results[slug].items():
            if re.fullmatch(r"20\d{2}", year) and isinstance(units, list):
                year_school_counts[year] += 1
                unit_count += len(units)
    source_meta = source_payload["_meta"]
    meta = manual_results.setdefault("_meta", {})
    meta.update(
        {
            "description": "학교별 정시 학과별 70%컷 — 어디가 공식자료와 대학 발표자료를 수집·검수한 참고 데이터",
            "scoreYear": RESULT_YEAR,
            "lastUpdated": datetime.now(KST).date().isoformat(),
            "schoolCount": len(result_schools),
            "unitCount": unit_count,
            "official2026TargetSchoolCount": source_meta["targetSchoolCount"],
            "official2026MappedSchoolCount": source_meta["mappedSchoolCount"],
            "official2026UnlistedSchoolCount": source_meta["unlistedSchoolCount"],
            "official2026SchoolCount": source_meta["schoolsWithNumericCut"],
            "official2026UnitCount": source_meta["numericCutCount"],
            "official2026UniversityCount": source_meta["auditedOfficialUniversityCount"],
            "official2026UniversityNumericCount": source_meta["officialUniversitiesWithNumericCut"],
            "official2026UniversityUnitCount": source_meta["officialNumericCutCount"],
            "official2026StatusFile": "data/admissions/sources/adiga-regular-2026.json",
            "official2026CoverageFile": "data/admissions/adiga-coverage-2026.json",
            "note": (
                f"2021~2026학년도 {len(result_schools)}개교 {unit_count}개 모집단위. "
                f"2026학년도는 어디가 일반대학 {source_meta['auditedOfficialUniversityCount']}개 대학·캠퍼스를 전수 조회해 "
                f"{source_meta['officialUniversitiesWithNumericCut']}곳 {source_meta['officialNumericCutCount']}개 공개 수치를 보존했다. "
                f"이 중 반영비율 대상 103개교에는 {source_meta['schoolsWithNumericCut']}개교 "
                f"{source_meta['numericCutCount']}개 공개 수치를 반영했다. "
                f"목록에 없는 과학기술원 {source_meta['unlistedSchoolCount']}곳과 "
                "미제출·소수인원 비공개 상태는 별도 출처 파일에 보존한다. 대학별 산식이 달라 단순 비교하면 안 된다."
            ),
            "sources": [
                "대입정보포털 어디가 (2026학년도 수능위주전형 공식 입시결과)",
                "각 대학 입학처 발표자료",
                "기존 보조 분석자료 (2021~2025학년도 일부)",
            ],
            "source": "대입정보포털 어디가 + 각 대학 입학처 발표자료",
            "yearSchoolCounts": dict(sorted(year_school_counts.items())),
        }
    )
    return manual_results


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="어디가 220개 대학·캠퍼스의 2026 입결과 2027 반영비율을 수집해 출처·사이트 데이터를 갱신",
    )
    args = parser.parse_args()

    ratios = json.loads(RATIOS_PATH.read_text(encoding="utf-8"))
    client = AdigaClient()
    client.open()
    universities = fetch_universities(client)
    mapping, errors = build_mapping(ratios, universities)
    target_count = len([slug for slug in ratios if slug != "_meta"])
    print(f"어디가 일반대학: {len(universities)}개교")
    print(f"대상 대학코드 매핑: {len(mapping)}/{target_count}개 slug")
    for slug, candidates in mapping.items():
        joined = ", ".join(
            f"{candidate['unvCd']} {candidate['name']} {candidate['campus']}"
            for candidate in candidates
        )
        print(f"- {slug}: {joined}")
    for slug, reason in NOT_LISTED_IN_ADIGA.items():
        print(f"- {slug}: NOT_LISTED ({reason})")
    if errors:
        print(f"\n매핑 실패 {len(errors)}건", file=sys.stderr)
        for message in errors:
            print(f"- {message}", file=sys.stderr)
        return 1
    if not args.write:
        print("\n매핑 점검 완료. 실제 수집·반영은 --write를 지정하세요.")
        return 0

    official_universities, official_selections = collect_official_results(client, universities)
    for slug, candidates in mapping.items():
        for candidate in candidates:
            official_universities[candidate["unvCd"]]["targetSlugs"].append(slug)
    for university in official_universities.values():
        university["targetSlugs"].sort()
    schools = build_target_results(ratios, mapping, official_universities)
    selection_payload = build_selection_source_payload(official_selections)
    source_payload = build_source_payload(schools, target_count, official_universities)
    selection_meta = selection_payload["_meta"]
    source_payload["_meta"].update(
        {
            "official2027SelectionSourceFile": "data/admissions/sources/adiga-regular-ratios-2027.json",
            "official2027UniversitiesWithStructuredRatioTable": selection_meta["universitiesWithStructuredRatioTable"],
            "official2027UniversitiesWithRatioText": selection_meta["universitiesWithRatioText"],
            "official2027UniversitiesWithCriteriaTextOnly": selection_meta["universitiesWithCriteriaTextOnly"],
            "official2027UniversitiesWithoutSelectionCriteria": selection_meta["universitiesWithoutSelectionCriteria"],
            "official2027StructuredRatioTableCount": selection_meta["structuredRatioTableCount"],
        }
    )
    if source_payload["_meta"]["auditedOfficialUniversityCount"] != len(universities):
        raise RuntimeError("어디가 일반대학 전체가 수집되지 않아 파일을 쓰지 않습니다")
    if selection_payload["_meta"]["auditedOfficialUniversityCount"] != len(universities):
        raise RuntimeError("어디가 수능위주전형 전체가 수집되지 않아 파일을 쓰지 않습니다")
    if source_payload["_meta"]["auditedSchoolCount"] != target_count:
        raise RuntimeError("모든 대상 대학이 수집되지 않아 파일을 쓰지 않습니다")
    manual_results = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    merged = merge_manual_results(manual_results, source_payload)
    write_json(SOURCE_PATH, source_payload)
    write_json(RATIO_SOURCE_PATH, selection_payload)
    write_json(COVERAGE_PATH, build_coverage_payload(source_payload, selection_payload))
    write_json(RESULTS_PATH, merged)
    meta = source_payload["_meta"]
    print(
        f"\n정시 공식 전체 결과: {meta['officialUniversitiesWithNumericCut']}/"
        f"{meta['auditedOfficialUniversityCount']}개 대학·캠퍼스, "
        f"숫자 {meta['officialNumericCutCount']}건"
    )
    print(
        f"반영비율 대상 결과: {meta['schoolsWithNumericCut']}/{target_count}개교, "
        f"숫자 {meta['numericCutCount']}건, 미공개 상태 {meta['schoolsWithoutNumericCut']}개교"
    )
    print(
        f"2027 공식 반영비율: 구조화 표 {selection_meta['universitiesWithStructuredRatioTable']}곳 "
        f"{selection_meta['structuredRatioTableCount']}개, 텍스트만 {selection_meta['universitiesWithRatioText']}곳, "
        f"기타 기준 {selection_meta['universitiesWithCriteriaTextOnly']}곳, "
        f"미공개 {selection_meta['universitiesWithoutSelectionCriteria']}곳"
    )
    print(f"출처 저장: {SOURCE_PATH.relative_to(ROOT)}")
    print(f"반영비율 출처 저장: {RATIO_SOURCE_PATH.relative_to(ROOT)}")
    print(f"공개 상태 저장: {COVERAGE_PATH.relative_to(ROOT)}")
    print(f"사이트 데이터 갱신: {RESULTS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
