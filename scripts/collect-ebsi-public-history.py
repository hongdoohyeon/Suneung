#!/usr/bin/env python3
"""EBSi 공개 '역대 등급컷/오답률 TOP15' 화면의 전체 공개 조합을 수집한다."""

from __future__ import annotations

import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "item-analytics"
BASE = "https://cloud.ebsi.co.kr"
PAGE = BASE + "/ebs/xip/xipa/retrievePastGrdCutWrongAnswerRate.ebs"
USER_AGENT = "kicegg-public-data-audit/1.0 (+https://kicegg.com)"
DELAY_SECONDS = 0.02
GRADE_PATH = OUT / "ebsi-public-gradecut-history.json"
WRONG_PATH = OUT / "ebsi-public-wrong-answer-history.json"


def clean(fragment: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", "", fragment, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", "", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())


def post(path: str, data: dict | None = None) -> tuple[bytes, str | None]:
    encoded = urllib.parse.urlencode(data or {}).encode()
    request = urllib.request.Request(
        BASE + path,
        data=encoded,
        headers={"User-Agent": USER_AGENT, "Referer": PAGE},
    )
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
                content_type = response.headers.get("Content-Type")
            time.sleep(DELAY_SECONDS)
            return body, content_type
        except Exception as error:
            last_error = error
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"공개 조회 실패: {path} {data}") from last_error


def post_json(path: str, data: dict | None = None) -> list[dict]:
    body, _ = post(path, data)
    payload = json.loads(body.decode("utf-8"))
    return payload.get("result") or []


def post_html(path: str, data: dict) -> str:
    body, _ = post(path, data)
    return body.decode("utf-8", "replace")


def parse_gradecut_tables(source: str) -> list[dict]:
    tables = []
    pattern = re.compile(r"<h3[^>]*>([\s\S]*?)</h3>([\s\S]*?)<table[^>]*>([\s\S]*?)</table>", re.I)
    for subject_html, between, table_html in pattern.findall(source):
        subject = clean(subject_html)
        stats = clean(between)
        mean_match = re.search(r"평균\s*:\s*([0-9.]+)", stats)
        std_match = re.search(r"표준편차\s*:\s*([0-9.]+)", stats)
        rows = []
        for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table_html, re.I):
            cells = [clean(cell) for cell in re.findall(r"<t[hd][^>]*>([\s\S]*?)</t[hd]>", row_html, re.I)]
            if cells:
                rows.append(cells)
        if rows:
            tables.append(
                {
                    "subject": subject,
                    "meanRawScore": float(mean_match.group(1)) if mean_match else None,
                    "stdDevRawScore": float(std_match.group(1)) if std_match else None,
                    "rows": rows,
                }
            )
    return tables


def parse_wrong_answer_rows(source: str, context: dict) -> list[dict]:
    records = []
    for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", source, re.I):
        cells = [clean(cell) for cell in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, re.I)]
        # 주관식 행은 ①~⑤ 선택률 칸이 colspan="5" 한 칸('주관식')이라 칸 수가 적다
        constructed = len(cells) > 5 and cells[5] == "주관식"
        if len(cells) < (6 if constructed else 10) or not cells[0].isdigit() or not cells[1].isdigit():
            continue
        item_match = re.search(r"itemView\((\d+)\)", row_html)
        vod_match = re.search(r"fnVodSelect\((\d+)\s*,\s*(\d+)\)", row_html)
        choice_rates = None
        if not constructed:
            choice_rates = []
            for value in cells[5:10]:
                match = re.search(r"-?[0-9.]+", value)
                choice_rates.append(float(match.group()) if match else None)
        answer = int(cells[4]) if re.fullmatch(r"\d+", cells[4]) else cells[4]
        records.append(
            {
                "source": "ebsi",
                "sourcePage": PAGE + "?tab=2",
                "sourceScope": "historical_wrong_answer_top15",
                "population": "EBSi 응답자",
                "sampleSize": None,
                **context,
                "rankByWrongRate": int(cells[0]),
                "questionNumber": int(cells[1]),
                "wrongRatePct": float(cells[2]),
                "pointValue": float(cells[3]),
                "correctAnswer": answer,
                "responseType": "constructed" if constructed else "multiple_choice",
                "choiceRatePct": choice_rates,
                "sourceItemId": int(item_match.group(1)) if item_match else None,
                "sourceVodId": int(vod_match.group(1)) if vod_match else None,
            }
        )
    return records


def collect_gradecuts() -> dict:
    datasets = []
    requests = 0
    years = post_json("/ebs/xip/xipa/retrievePastGrdCutYearList.ajax")
    for year_item in years:
        academic_year = int(year_item["code"])
        exam_year = academic_year - 1
        grades = post_json("/ebs/xip/xipa/retrievePastGrdCutStdnGrdList.ajax", {"year": academic_year})
        for grade_item in grades:
            grade = int(grade_item["code"])
            months = post_json(
                "/ebs/xip/xipa/retrievePastGrdCutMonthList.ajax",
                {"year": academic_year, "stdntGrd": grade},
            )
            for month_item in months:
                month_code = month_item["code"]
                display_month = "04" if academic_year == 2021 and month_item["value"] == "05" else month_item["value"]
                tabs = post_json(
                    "/ebs/xip/xipa/retrievePastGrdCutTabList.ajax",
                    {"year": academic_year, "stdntGrd": grade, "month": month_code},
                )
                for tab in tabs:
                    query = {
                        "year": academic_year,
                        "stdntGrd": grade,
                        "month": month_code,
                        "subjCd": tab["code"],
                    }
                    source = post_html("/ebs/xip/xipa/retrievePastGrdCutList.ajax", query)
                    requests += 1
                    datasets.append(
                        {
                            "academicYear": academic_year,
                            "examYear": exam_year,
                            "gradeYear": grade,
                            "month": int(display_month),
                            "monthCode": month_code,
                            "areaOrder": int(tab["ord"]),
                            "area": tab["value"],
                            "subjectCodes": tab["code"].split(","),
                            "query": query,
                            "responseSha256": hashlib.sha256(source.encode()).hexdigest(),
                            "tables": parse_gradecut_tables(source),
                        }
                    )
                    if requests % 100 == 0:
                        print(f"등급컷 공개표 {requests}개 수집", flush=True)
    return {
        "schemaVersion": 1,
        "provider": "ebsi",
        "sourcePage": PAGE + "?tab=1",
        "sourceScope": "historical_gradecuts",
        "collectedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "datasetCount": len(datasets),
        "datasets": datasets,
    }


def collect_wrong_answers() -> dict:
    if WRONG_PATH.exists():
        checkpoint = json.loads(WRONG_PATH.read_text(encoding="utf-8"))
        records = checkpoint.get("records", [])
        receipts = checkpoint.get("receipts", [])
    else:
        records = []
        receipts = []
    completed = {str(item["subjectSourceId"]) for item in receipts}
    years = post_json("/ebs/xip/xipa/retrieveWrongAnswerRateYearList.ajax")
    for year_item in years:
        year = int(year_item["code"])
        for grade, target in ((3, "D300"), (2, "D200"), (1, "D100")):
            months = post_json(
                "/ebs/xip/xipa/retrieveWrongAnswerRateMonthList.ajax",
                {"year": year, "targetCd": target},
            )
            for month_item in months:
                source_exam_id = month_item["code"]
                areas = post_json(
                    "/ebs/xip/xipa/retrieveWrongAnswerRateArList.ajax",
                    {"year": year, "targetCd": target, "irecord": source_exam_id},
                )
                for area_item in areas:
                    subjects = post_json(
                        "/ebs/xip/xipa/retrieveWrongAnswerRateSubjList.ajax",
                        {"year": year, "targetCd": target, "irecord": source_exam_id, "arOrd": area_item["code"]},
                    )
                    for subject_item in subjects:
                        if str(subject_item["code"]) in completed:
                            continue
                        html_source = post_html(
                            "/ebs/xip/xipa/retrieveWrongAnswerRateList.ajax",
                            {"paperId": subject_item["code"]},
                        )
                        context = {
                            "examYear": year,
                            "gradeYear": grade,
                            "month": int(month_item["value"]),
                            "examSourceId": source_exam_id,
                            "subjectSourceId": subject_item["code"],
                            "areaSourceId": area_item["code"],
                            "area": area_item["value"],
                            "subjectOrder": subject_item.get("subjOrd"),
                            "subject": subject_item["value"],
                            "subjectLabel": subject_item["value"],
                        }
                        rows = parse_wrong_answer_rows(html_source, context)
                        records.extend(rows)
                        receipts.append(
                            {
                                **context,
                                "recordCount": len(rows),
                                "responseSha256": hashlib.sha256(html_source.encode()).hexdigest(),
                            }
                        )
                        completed.add(str(subject_item["code"]))
                        if len(receipts) % 100 == 0:
                            print(f"오답률 공개 과목 {len(receipts)}개 · {len(records)}행 수집", flush=True)
                            WRONG_PATH.write_text(
                                json.dumps(
                                    {
                                        "schemaVersion": 1,
                                        "provider": "ebsi",
                                        "sourcePage": PAGE + "?tab=2",
                                        "sourceScope": "historical_wrong_answer_top15",
                                        "collectedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                        "complete": False,
                                        "recordCount": len(records),
                                        "receipts": receipts,
                                        "records": records,
                                    },
                                    ensure_ascii=False,
                                    indent=2,
                                ) + "\n",
                                encoding="utf-8",
                            )
    return {
        "schemaVersion": 1,
        "provider": "ebsi",
        "sourcePage": PAGE + "?tab=2",
        "sourceScope": "historical_wrong_answer_top15",
        "collectedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "complete": True,
        "recordCount": len(records),
        "receipts": receipts,
        "records": records,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if GRADE_PATH.exists():
        gradecuts = json.loads(GRADE_PATH.read_text(encoding="utf-8"))
    else:
        gradecuts = collect_gradecuts()
        GRADE_PATH.write_text(json.dumps(gradecuts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    wrong_answers = collect_wrong_answers()
    WRONG_PATH.write_text(json.dumps(wrong_answers, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    table_count = sum(len(dataset["tables"]) for dataset in gradecuts["datasets"])
    print(f"완료: 등급컷 {gradecuts['datasetCount']}개 응답/{table_count}개 표, 오답률 {wrong_answers['recordCount']}행")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
