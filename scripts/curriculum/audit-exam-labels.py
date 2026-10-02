#!/usr/bin/env python3
"""exams.json 의 curriculum 라벨을 영역·학년도별 교육과정(data/curriculum/csat-subject-eras.json)과 비교한다. 수능·모의평가(평가원)만 대상."""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEG = json.loads((ROOT / "data/curriculum/csat-subject-eras.json").read_text(encoding="utf-8"))["areas"]
LABEL = {"6차": "5th6th", "7차": "7th", "2007개정": "2007", "2009": "2009", "2015": "2015", "예비": "2022"}
items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))


def expected(subject, year):
    for s in SEG.get(subject, []):
        lo, hi = s["years"]
        if lo <= year and (hi is None or year <= hi):
            return s["era"]
    return None


bad = collections.defaultdict(list)
total = ok = skipped = 0
for x in items:
    if x["typeGroup"] != "suneung" or x["type"] not in ("csat", "june", "sept") or x["subject"] not in SEG:
        continue
    exp = expected(x["subject"], x["gradeYear"])
    if exp in (None, "-"):
        skipped += 1
        continue
    total += 1
    got = LABEL.get(x["curriculum"], x["curriculum"])
    if got == exp or (exp == "7th→2007" and got in ("7th", "2007")):
        ok += 1
    else:
        bad[(x["subject"], x["gradeYear"], x["curriculum"], exp)].append(x["id"])
print(f"대상 {total}건(일치 {ok}, 불일치 {total - ok}), 비교 불가 {skipped}건")
for (sub, y, got, exp), ids in sorted(bad.items(), key=lambda t: (t[0][0], t[0][1])):
    print(f"{sub} {y}학년도: 라벨 '{got}' ↔ 기준 '{exp}' ({len(ids)}건)")
