#!/usr/bin/env python3
"""종로학원 '등급컷' 수집 (2016년 시행~, 고1·2·3).

페이지: /service/examResult/ex{YYYYMMDD}/go{학년}_resultCut.asp  (EUC-KR)
  영역 탭 a[href=#tabConNN] img@alt, 과목 탭 a[href=#tabConNN_MM] img@alt,
  div#tabConNN_MM 안 표: 머리글 img@alt(등급|원점수|표준점수|백분위), 행 머리 img@alt '0등급'(=최고점)·'1등급'…
회차 날짜 후보: data/raw/megastudy/exams.json 의 examDate (+ 수능일).
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request

from lxml import html

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import ROOT, record, save, to_int  # noqa: E402

BASE = "https://www.jongro.co.kr/service/examResult"
CSAT_DATES = ["20151112", "20161117", "20171123", "20181115", "20191114", "20201203",
              "20211118", "20221117", "20231116", "20241114", "20251113"]


def fetch(date: str, grade: int):
    url = f"{BASE}/ex{date}/go{grade}_resultCut.asp"
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read()
    return url, html.fromstring(raw.decode("cp949", "replace"))


def alt_of(t, href):
    a = t.xpath(f'//a[@href="#{href}"]//img/@alt')
    return a[0].strip() if a else None


def parse(t, date: str, grade: int, url: str):
    out = []
    for div in t.xpath('//div[starts-with(@id,"tabCon")]'):
        did = div.get("id")
        tb = div.xpath("./table")
        if not tb:
            continue
        tb = tb[0]
        head = [(th.xpath(".//img/@alt") or [th.text_content()])[0].strip() for th in tb.xpath(".//thead//th")]
        if "원점수" not in head:
            continue
        col = {h: i for i, h in enumerate(head)}
        rows = {}
        for tr in tb.xpath(".//tbody/tr"):
            lab = (tr.xpath("./th//img/@alt") or [tr.xpath("./th")[0].text_content() if tr.xpath("./th") else ""])[0].strip()
            cells = [lab] + [td.text_content().strip() for td in tr.xpath("./td")]
            rows[lab.replace("등급", "")] = cells
        get = lambda g, h: to_int(rows.get(g, [None] * 9)[col[h]]) if h in col and g in rows and col[h] < len(rows[g]) else None
        area_id = did.split("_")[0]
        area = alt_of(t, area_id) or ""
        sub = alt_of(t, did) if "_" in did else None
        top = {"raw": get("0", "원점수"), "std": get("0", "표준점수"), "pct": get("0", "백분위")} if "0" in rows else None
        y, m = int(date[:4]), int(date[4:6])
        out.append(record("jongro", y, m, grade, area, sub,
                          [get(str(g), "원점수") for g in range(1, 9)],
                          [get(str(g), "표준점수") for g in range(1, 9)],
                          [get(str(g), "백분위") for g in range(1, 9)], top=top, url=url))
    return out


def dates():
    ex = json.loads((ROOT / "data/raw/megastudy/exams.json").read_text())
    ds = {(e["examDate"].replace("-", ""), e["studentGrade"]) for e in ex if e.get("examDate")}
    ds |= {(d, 3) for d in CSAT_DATES}
    return sorted(ds)


def main():
    recs = []
    for d, g in dates():
        try:
            url, t = fetch(d, g)
        except Exception as e:
            print("skip", d, g, e)
            continue
        rs = parse(t, d, g, url)
        print(d, g, len(rs))
        recs += rs
        time.sleep(0.3)
    save("jongro", recs)


if __name__ == "__main__":
    main()
