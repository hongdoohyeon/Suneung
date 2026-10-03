#!/usr/bin/env python3
"""공개 원점수 등급컷(위키백과 '연도별 대학수학능력시험의 등급 구분 점수')을 평가원 공식 표준점수
도수분포로 검증해, 통과한 것만 data/gradecuts.json 의 빈 원점수 컷에 채운다 (로컬 전용, numpy 필요).

평가원은 2005학년도부터 원점수를 공개하지 않는다. 대신 공식 '영역/과목별 표준점수 도수분포'
(data/raw/kice/std-dist-2005-2013/, kice.re.kr 보도자료 첨부)를 쓴다.
검증: 표준점수 = round(C + K*(원점수-μ)/σ). 공식 분포에서 바로 확인되는 사실 제약(lattice.py)을 모두
만족하는 (μ,σ) 후보 가운데 그 원점수 컷 8개를 그대로 만들어 내는 후보가 있으면 통과.
(한 등급만 ±1 틀린 값은 약 85% 걸러진다 — 2007~2013 수능 실측)

입력: data/raw/wiki/rawcuts-2007-2014.json
출력: data/raw/wiki/rawcuts-verified.json (판정 기록) + data/gradecuts.json 제자리 보강(원점수 빈 레코드만, 멱등)
"""
from __future__ import annotations

import json
import re
from multiprocessing import Pool
from pathlib import Path

from lattice import solve

ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = ROOT / "data/raw/kice/std-dist-2005-2013"
EXT = ROOT / "data/raw/wiki/rawcuts-2007-2014.json"
OUT = ROOT / "data/raw/wiki/rawcuts-verified.json"
GRADECUTS = ROOT / "data/gradecuts.json"
SOURCE_URL = "https://ko.wikipedia.org/wiki/연도별_대학수학능력시험의_등급_구분_점수"


def norm(s):
    s = (s or "").replace(" ", "").replace("’", "").replace("‘", "").replace("'", "").replace("·", "")
    return s.replace("II", "Ⅱ").replace("I", "Ⅰ").replace("생물", "생명과학")


def area_key(name):
    n = norm(name)
    if n == "언어":
        return ("국어", None)
    if n in ("외국어", "외국어(영어)"):
        return ("영어", None)
    m = re.match(r"수(?:리)?(가|나)형?$", n)
    return ("수학", m.group(1) + "형") if m else (None, n)


def matches(name, want):
    k = area_key(name)
    return k == want if k[0] else k[1] == want[1]


def has(v):
    return isinstance(v, list) and any(x is not None for x in v)


def jobs():
    dist = {}
    for p in DIST_DIR.glob("*.json"):
        dist.update(json.loads(p.read_text()))
    ext = json.loads(EXT.read_text())
    for c in json.loads(GRADECUTS.read_text()):
        if c["typeGroup"] != "suneung" or c["type"] != "csat" or has(c.get("rawCuts")):
            continue
        y = str(c["gradeYear"])
        dd, ee = dist.get(f"{y}|csat"), ext.get(y)
        if not dd or not ee or not has(c.get("standardCuts")) or None in c["standardCuts"][:8]:
            continue
        want = (c["subject"], norm(c.get("subSubject")) if c.get("subSubject") else None)
        dn = [n for n in dd if matches(n, want)]
        en = [n for n in ee if matches(n, want)]
        if len(dn) == 1 and len(en) == 1:
            yield (c["id"], {int(k): v for k, v in dd[dn[0]].items()}, c["standardCuts"][:8], c["subject"], ee[en[0]])


def verify(job):
    gid, dist, cuts, subject, raw = job
    big = subject in ("국어", "수학", "영어")
    full, C, K = (100, 100, 20) if big else (50, 50, 10)
    any_sol = False
    for raws in ([r for r in range(full + 1) if r not in (1, full - 1)], list(range(full + 1))):
        sols = solve(dist, full, C, K, cuts, raws, ratio=False)
        if sols:
            any_sol = True
            if tuple(raw) in {s[2] for s in sols}:
                return gid, raw, "pass"
    return gid, raw, "fail" if any_sol else "unverifiable"


def main():
    with Pool(8) as pool:
        results = pool.map(verify, list(jobs()))
    log = {e["id"]: e for e in (json.loads(OUT.read_text()) if OUT.exists() else [])}
    log.update({g: {"id": g, "rawCuts": r, "result": v} for g, r, v in results})
    OUT.write_text(json.dumps(sorted(log.values(), key=lambda e: e["id"]), ensure_ascii=False, indent=1) + "\n")
    ok = {g: r for g, r, v in results if v == "pass"}
    cuts = json.loads(GRADECUTS.read_text())
    filled = 0
    for c in cuts:
        if c["id"] in ok and not has(c.get("rawCuts")):
            c["rawCuts"] = ok[c["id"]]
            c["rawCutBasis"] = "public_dist_verified"
            c["rawCutSourceUrl"] = SOURCE_URL
            tags = [t for t in str(c.get("source") or "").split("+") if t]
            if "wiki-dist-verified" not in tags:
                c["source"] = "+".join(tags + ["wiki-dist-verified"])
            filled += 1
    GRADECUTS.write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n")
    from collections import Counter
    print(len(results), Counter(v for _, _, v in results), f"→ gradecuts.json 보강 {filled}건")


if __name__ == "__main__":
    main()
