#!/usr/bin/env python3
"""대성마이맥 ALL-CHECK '확정 등급컷' 수집 (2023년 시행~, 고1·2·3).

페이지: /hmockTest/HmockAnalysisExamPointCut.ds?groupNo=N&examRelm=123|41|42  (EUC-KR)
  examRelm 123=국수영한, 41=사회탐구, 42=과학탐구.  groupNo 는 회차마다 하나 (362~).
  .grade_cut_table 안 표: 등급|원점수|표준점수|백분위, 행 = 최고점·1~8등급.
회차: h1.main_title 의 학년, 연도 선택상자의 selected, 날짜 탭(ul.date_list a.on: '6.4' / '수능').
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request

from lxml import html

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import record, save, to_int  # noqa: E402

BASE = "https://www.mimacstudy.com/hmockTest/HmockAnalysisExamPointCut.ds"
AREA = {"123": None, "41": "사회탐구", "42": "과학탐구"}


def fetch(group: int, relm: str) -> html.HtmlElement | None:
    req = urllib.request.Request(f"{BASE}?groupNo={group}&grade=&examRelm={relm}", headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=30).read().decode("cp949", "replace")
    return html.fromstring(raw) if raw.strip() else None


def exam_of(t) -> tuple[int, int, int] | None:
    grade = "".join(t.xpath('//h1[@class="main_title"]//em[@class="grade"]/text()')).strip()
    year = t.xpath('//select[@id="groupNo"]/option[@selected]/@id')
    label = "".join(t.xpath('//ul[@class="date_list"]//a[@class="on"]/text()')).strip()
    if not grade or not year or not label:
        return None
    g = int(grade[1])
    month = 11 if label == "수능" else int(label.split(".")[0])
    return int(year[0]), month, g


def area_of(name: str) -> str:
    if name.startswith("국어"):
        return "국어"
    if name.startswith("수학"):
        return "수학"
    return {"영어": "영어", "한국사": "한국사", "통합사회": "통합사회", "통합과학": "통합과학"}.get(name, "")


def parse(t, relm: str, url: str):
    ex = exam_of(t)
    if not ex:
        return []
    out = []
    for box in t.xpath('//*[contains(@class,"grade_cut_table")]'):
        for tb in box.xpath(".//table"):
            title = " ".join(tb.xpath("preceding::*[self::h3 or self::h4 or self::strong][1]//text()")).strip()
            rows = [[c.text_content().strip() for c in tr.xpath("./th|./td")] for tr in tb.xpath(".//tr")]
            if not rows or rows[0][:2] != ["등급", "원점수"]:
                continue
            by = {r[0].replace("등급", ""): r for r in rows[1:]}
            raw = [to_int(by.get(str(g), [None] * 4)[1]) for g in range(1, 9)]
            std = [to_int(by.get(str(g), [None] * 4)[2]) for g in range(1, 9)]
            pct = [to_int(by.get(str(g), [None] * 4)[3]) if "백분위" in rows[0][3] else None for g in range(1, 9)]
            top = by.get("최고점")
            area = AREA[relm]
            if area:
                subj, sub = area, title
            elif " - " in title:
                subj, sub = title.split(" - ", 1)
            else:
                subj, sub = area_of(title) or title, None
            if subj.strip() in ("국어", "수학") and sub and top and to_int(top[1]) is not None and raw[0] == to_int(top[1]):
                # 선택과목 표의 원점수 칸은 등급 구간의 위쪽 끝(1등급=만점, 2등급=1등급 컷 …) → 한 칸 당긴다
                raw = raw[1:] + [None]
            out.append(record("daesung", ex[0], ex[1], ex[2], subj.strip(), sub and sub.strip(), raw, std, pct,
                              top={"raw": to_int(top[1]), "std": to_int(top[2]), "pct": to_int(top[3])} if top else None,
                              url=url))
    return out


def main(first=355, last=460):
    recs = []
    for g in range(first, last + 1):
        for relm in AREA:
            try:
                t = fetch(g, relm)
            except Exception as e:  # 없는 번호·일시 오류
                print("skip", g, relm, e)
                continue
            if t is not None:
                recs += parse(t, relm, f"{BASE}?groupNo={g}&examRelm={relm}")
            time.sleep(0.2)
    save("daesung", recs)


if __name__ == "__main__":
    main()
