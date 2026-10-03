#!/usr/bin/env python3
"""이미 받아 둔 EBSi·메가스터디·이투스 수집본을 공통 형식(data/raw/academy-cuts/{source}.json)으로.

- ebsi:      data/raw/item-analytics/ebsi-public-gradecut-history.json  (EBSi '역대 등급컷', 2014학년도~ 고1·2·3)
             academicYear=학년도, examYear=시행연도, gradeYear=학년. 표 행 = [등급, 원점수(선택과목별 여러 칸), 표준점수, 백분위]
- megastudy: data/raw/megastudy/gradecuts-raw.json (메가스터디 역대 등급컷, 2016~)
- etoos:     data/raw/etoos/rawcuts-normalized.json (이투스 풀서비스 직접·웨이백, 고3)
"""
from __future__ import annotations

import json
import sys

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import ROOT, record, save, to_int  # noqa: E402

EBSI_AREA = {"사회": "사회탐구", "과학": "과학탐구", "직업": "직업탐구", "제2외/한문": "제2외국어"}
MEGA_TAB = {2: "사회탐구", 3: "과학탐구"}


def ebsi():
    data = json.loads((ROOT / "data/raw/item-analytics/ebsi-public-gradecut-history.json").read_text())["datasets"]
    url = "https://www.ebsi.co.kr/ebs/xip/xipa/retrievePastGrdCutWrongAnswerRate.ebs?tab=1"
    out = []
    for ds in data:
        y, m, g = ds["examYear"], int(ds["monthCode"]), ds["gradeYear"]
        for t in ds["tables"]:
            rows = t["rows"]
            electives = rows[1] if len(rows) > 1 and not rows[1][0].isdigit() and rows[1][0] != "최고점" else None
            k = len(electives) if electives else 1
            grade_rows = {r[0]: r for r in rows[1:] if r and (r[0].isdigit() or r[0] == "최고점")}
            names = electives or [None]
            for i, el in enumerate(names):
                def cell(r, j):
                    return to_int(r[j]) if r is not None and j < len(r) else None
                raw = [cell(grade_rows.get(str(gr)), 1 + i) for gr in range(1, 9)]
                std = [cell(grade_rows.get(str(gr)), 1 + k) for gr in range(1, 9)]
                pct = [cell(grade_rows.get(str(gr)), 2 + k) for gr in range(1, 9)]
                top = grade_rows.get("최고점")
                area = EBSI_AREA.get(ds["area"])
                if area:
                    subj, sub = area, t["subject"]
                else:  # '국어A형'·'수학가형'·'영어' → (국어, A형)
                    head = next((a for a in ("국어", "수학", "영어", "한국사") if t["subject"].startswith(a)), t["subject"])
                    subj, sub = head, el or (t["subject"][len(head):] or None)
                rec = record("ebsi", y, m, g, subj, sub, raw, std, pct,
                             top={"raw": cell(top, 1 + i), "std": cell(top, 1 + k), "pct": cell(top, 2 + k)} if top else None, url=url)
                if rec:
                    rec["meanRawScore"], rec["stdDevRawScore"] = t.get("meanRawScore"), t.get("stdDevRawScore")
                    out.append(rec)
    save("ebsi", out)


def megastudy():
    rows = json.loads((ROOT / "data/raw/megastudy/gradecuts-raw.json").read_text())
    url = "https://www.megastudy.net/Entinfo/total_rankCut/main.asp"
    out = []
    for r in rows:
        # 칸 수로 열 구성 판별: [등급,원점수,표점,백분위,누적] / [등급,표점,백분위,누적](선택과목 체제 국·수, 원점수 없음) / [등급,원점수,비율](절대평가)
        by = {x[0].replace("등급", ""): x for x in r["rows"]}
        width = max(len(x) for x in r["rows"])
        cols = {5: (1, 2, 3), 4: (None, 1, 2), 3: (1, None, None)}.get(width, (1, 2, 3))
        get = lambda gr, j: to_int(by[gr][j]) if j is not None and gr in by and j < len(by[gr]) else None
        name = r["subjectName"]
        area = MEGA_TAB.get(r["tabNo"])
        subj, sub = (area, name) if area else (name.split()[0], " ".join(name.split()[1:]) or None)
        top = by.get("만점") or by.get("최고점")
        tl = "만점" if "만점" in by else "최고점"
        out.append(record("megastudy", r["examYear"], r["month"], r["studentGrade"], subj, sub,
                          [get(str(g), cols[0]) for g in range(1, 9)], [get(str(g), cols[1]) for g in range(1, 9)],
                          [get(str(g), cols[2]) for g in range(1, 9)],
                          top={"raw": get(tl, cols[0]), "std": get(tl, cols[1]), "pct": get(tl, cols[2])} if top else None, url=url))
    save("megastudy", out)


def etoos():
    rows = json.loads((ROOT / "data/raw/etoos/rawcuts-normalized.json").read_text())
    out = []
    for r in rows:
        rec = record("etoos", r["examYear"], r["month"], 3, r["subject"], r.get("subSubject"),
                     r.get("rawCuts") or [], r.get("standardCuts") or [], r.get("standardPercentile") or [],
                     top={"raw": r.get("fullScore"), "std": r.get("highestStandardScore"), "pct": None},
                     url=f"https://web.archive.org/web/{r['snapshotTs']}/" if r.get("snapshotTs") else "https://www.etoos.com/report/")
        out.append(rec)
    save("etoos", out)


if __name__ == "__main__":
    ebsi(); megastudy(); etoos()
