#!/usr/bin/env python3
"""2027학년도 9월 모평(2026-09) 입시기관 확정 등급컷을 data/raw/academy-cuts/{ebsi,etoos}.json 에 합친다
(2026-11-23 일회성 수집 기록 — exam-12736 '9모 수학 1컷 88' 제보).

9/28 에 넣은 원점수 컷은 공식 발표 전 기관 추정 곡선을 역산한 값(academy_consensus_estimate)이라
확정표보다 1~4점 낮았다. 대성(groupNo 446)은 이미 수집돼 있고, 여기선 EBSi(irecord 202609023)·이투스(sub14)를 더한다.
수집 뒤: python3 scripts/academy-cuts/consensus.py && python3 scripts/academy-cuts/apply_consensus.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import collect_oct2026 as O  # noqa: E402

O.Y, O.M = 2026, 9
IRECORD = "202609023"
VOCATION = {"농업기초기술", "공업일반", "상업경제", "수산·해운산업기초", "인간발달", "성공적인직업생활"}
ETOOS_URL = "https://www.etoos.com/report/exam/20260902/sub14.asp?Grd=3"


def ebsi():
    out, tables = [], {}
    url = f"https://www.ebsi.co.kr/ebs/xip/xipa/retrieveGrdCut.ajax?irecord={IRECORD}&confYn=Y"
    for t in O.fetch_grade_cuts(IRECORD):
        rows = {r[0]: r for r in t["rows"] if r and (r[0].isdigit() or r[0] == "최고점")}
        single = t["headers_rows"][0][1] == "작년컷"
        els = [None] if single else t["headers_rows"][1]
        k = len(els)
        for i, el in enumerate(els):
            ri, si, pi = (2, 3, 4) if single else (1 + i, 1 + k, 2 + k)
            c = lambda gr, j: O.to_int(rows[str(gr)][j]) if str(gr) in rows and j < len(rows[str(gr)]) else None
            raw = [c(x, ri) for x in range(1, 9)]; std = [c(x, si) for x in range(1, 9)]; pct = [c(x, pi) for x in range(1, 9)]
            top = {k2: c("최고점", j) for k2, j in (("raw", ri), ("std", si), ("pct", pi))} if "최고점" in rows else None
            area, sub = O.area_sub(t["subject_name"])
            if not area and O.nm(t["subject_name"]) in VOCATION:
                area, sub = "직업탐구", t["subject_name"]  # EBSi 단독(9/28 추정값도 EBSi 단독이었다)
            if not area:
                continue  # 국어·수학은 EBSi 가 원점수를 내지 않는다(공식 표점만) — 이투스·대성으로
            rec = O.record("ebsi", O.Y, O.M, 3, area, sub, raw, std, pct, top=top, url=url)
            out.append(rec)
            tables[(tuple(std), (top or {}).get("std"))] = (area, sub)
    return out, tables


def etoos(tables):
    # collect_oct2026.etoos 와 같은 표 구조(화작·언매·확통·미적·기하·탐구…), 주소만 9월
    import urllib.request
    from lxml import html
    import re
    raw = urllib.request.urlopen(urllib.request.Request(ETOOS_URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("cp949", "replace")
    t = html.fromstring(raw); out = []
    order = [("국어", "화법과작문"), ("국어", "언어와매체"), ("수학", "확률과통계"), ("수학", "미적분"), ("수학", "기하")]; n = 0
    for tb in t.xpath('//table[contains(@class,"fullsr_table")]'):
        rows = [[c.text_content().strip() for c in tr.xpath("./th|./td")] for tr in tb.xpath(".//tr")]
        if len(rows) < 10 or rows[0][:2] != ["등급", "원점수"]:
            continue
        by = {r[0].replace("등급", ""): r for r in rows[1:]}
        top = rows[1]
        rawc = [O.to_int(re.split(r"~", by[str(g)][1])[0]) if str(g) in by else None for g in range(1, 9)]
        std = [O.to_int(by[str(g)][2]) if str(g) in by else None for g in range(1, 9)]
        pct = [O.to_int(by[str(g)][3]) if str(g) in by else None for g in range(1, 9)]
        if n < 5:
            subj, sb = order[n]
        else:
            key = (tuple(std), O.to_int(top[2]))
            hit = [tables[key]] if key in tables else [v for (sv, tp), v in tables.items() if tp == O.to_int(top[2])
                                                        and all(a == b for a, b in zip(sv, std) if a is not None and b is not None)]
            if len(hit) != 1:
                n += 1; continue
            subj, sb = hit[0]
        n += 1
        out.append(O.record("etoos", O.Y, O.M, 3, subj, sb, rawc, std, pct,
                            top={"raw": O.to_int(top[1]), "std": O.to_int(top[2]), "pct": O.to_int(top[3])}, url=ETOOS_URL))
    return out


def merge(source, recs):
    # collect_oct2026.merge 는 그 달 전 학년을 지운다 — 여기선 고3(모평)만 교체해 고1·2 9월 학평을 건드리지 않는다
    import json
    p = O.OUT_DIR / f"{source}.json"
    old = [r for r in json.loads(p.read_text()) if not (r["examYear"] == O.Y and r["month"] == O.M and r["studentGrade"] == 3)]
    recs = [r for r in recs if r]
    allr = old + recs
    allr.sort(key=lambda r: (r["examYear"], r["month"], r["studentGrade"], r["subject"], r["subSubject"] or ""))
    p.write_text(json.dumps(allr, ensure_ascii=False, indent=1) + "\n")
    print(source, len(recs), "건 합침")


if __name__ == "__main__":
    e, tables = ebsi(); merge("ebsi", e)
    merge("etoos", etoos(tables))
