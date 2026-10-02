#!/usr/bin/env python3
"""data/curriculum/ 의 일관성을 검사한다: 단원 ID 중복, 대응표가 가리키는 단원, 2028 범위 과목이 2022 고시에 있는지, 대응 누락."""
import json
import sys
from pathlib import Path

D = Path(__file__).resolve().parents[2] / "data/curriculum"
errs, warns = [], []


def load(name):
    return json.loads((D / name).read_text(encoding="utf-8"))


cw = load("crosswalk-to-2022.json")
units = cw["units"]
c28 = load("csat-2028.json")
off22 = load("official/2022.json")
eras = {e["id"] for e in load("eras.json")["eras"]}

# 1. 2022 고시 과목과 2028 범위
courses22 = {c["course"] for c in off22["courses"]}
for name, st in c28["scope"].items():
    if name not in courses22:
        errs.append(f"2028 범위 과목이 2022 고시 데이터에 없음: {name}")
    if st not in ("core", "indirect", "out"):
        errs.append(f"scope 값 오류: {name}={st}")
for c in courses22 - set(c28["scope"]):
    warns.append(f"2022 과목에 2028 범위 표시 없음: {c}")

# 2. 성취기준 코드 중복
for era in ("2022", "2015"):
    seen = set()
    for c in load(f"official/{era}.json")["courses"]:
        for a in c["areas"]:
            for s in a.get("standards", []):
                if s["code"] in seen:
                    errs.append(f"{era} 성취기준 코드 중복: {s['code']}")
                seen.add(s["code"])
                if not s["text"].strip():
                    errs.append(f"{era} 빈 성취기준: {s['code']}")

# 3. 대응표
for m in cw["mappings"]:
    for r in [m["from"]] + m["to"]:
        if r not in units:
            errs.append(f"대응표 단원 없음: {r}")
    if m["csat2028"] not in ("in", "indirect", "partial", "out"):
        errs.append(f"csat2028 값 오류: {m['from']}")
    if units.get(m["from"], {}).get("era") not in eras | {"2022"} and units.get(m["from"]):
        errs.append(f"시대 ID 오류: {m['from']}")
    for r in m["to"]:
        if units.get(r, {}).get("era") != "2022":
            errs.append(f"대응 대상이 2022 단원이 아님: {r}")

# 4. 대응 누락(경고): 직접 출제 과목에 해당하는 구 단원이 대응표에 없는 경우
COVER = {"2015": {"수학Ⅰ", "수학Ⅱ", "확률과 통계", "미적분", "기하", "수학", "독서", "화법과 작문", "언어와 매체", "문학", "한국사", "통합사회", "통합과학"},
         "2009": {"수학Ⅰ", "수학Ⅱ", "확률과 통계", "미적분Ⅰ", "미적분Ⅱ", "기하와 벡터", "화법과 작문", "독서와 문법", "문학", "한국사"},
         "2007": {"수학Ⅰ", "수학Ⅱ", "미적분과 통계 기본", "적분과 통계", "기하와 벡터"},
         "7th": {"수학Ⅰ", "수학Ⅱ"}}
mapped = {m["from"] for m in cw["mappings"]}
for uid, u in units.items():
    if u["course"] in COVER.get(u["era"], ()) and uid not in mapped:
        warns.append(f"대응 누락: {uid} ({u['name']})")

print(f"단원 {len(units)}개, 대응 {len(cw['mappings'])}건")
for w in warns:
    print("경고:", w)
for e in errs:
    print("오류:", e)
sys.exit(1 if errs else 0)
