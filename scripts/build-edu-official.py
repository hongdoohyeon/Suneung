#!/usr/bin/env python3
"""시·도교육청 공식 학평 통계(2022~) CSV → data/edu-official.json.

입력: data/raw/education-office/metrics/*.csv (build-education-office-metrics.py 산출물, 로컬 전용)
출력: data/edu-official.json — CI 렌더가 쓰는 커밋용 요약. 구조:
  { "2022_10_g3": { "src": "<자료실 주소>",
                    "e": { "국어|": {"n":응시자, "m":원점수평균, "s":표준편차, "c":[[등급,점수,'s'|'r',인원,비율],...9개],
                                       "f":{"표준점수":인원,...}}, "국어|화법과작문": {...}, ... } } }
키는 `영역|선택과목` (공백 제거, I→Ⅰ). 국어·수학의 등급컷·분포는 영역 전체(선택과목 빈칸) 기준으로만 공개된다.
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = ROOT / "data/raw/education-office/metrics"
OUT = ROOT / "data/edu-official.json"

ALIAS = {"사회문화": "사회·문화", "수산해운산업기초": "수산·해운산업기초", "정치와법": "정치와법"}
SOCIAL = {"생활과윤리", "윤리와사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와법", "사회·문화", "통합사회", "사회"}
SCIENCE = {"물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ", "통합과학", "과학"}
VOCATION = {"공업일반", "농업기초기술", "상업경제", "성공적인직업생활", "수산·해운산업기초", "인간발달"}
SECOND = {"독일어Ⅰ", "러시아어Ⅰ", "스페인어Ⅰ", "일본어Ⅰ", "중국어Ⅰ", "프랑스어Ⅰ", "한문Ⅰ", "아랍어Ⅰ", "베트남어Ⅰ"}


def nrm(s: str) -> str:
    s = re.sub(r"\s+", "", s or "")
    s = s.replace("II", "Ⅱ").replace("I", "Ⅰ")
    return ALIAS.get(s, s)


def group(area: str, elective: str) -> tuple[str, str]:
    """(영역, 선택과목) → 사이트 subject 이름과 선택과목 키."""
    a, e = nrm(area), nrm(elective)
    if a in ("탐구", "탐구(사회·과학)"):
        if e in SOCIAL:
            return "사회탐구", e
        if e in SCIENCE:
            return "과학탐구", e
        if e in VOCATION:
            return "직업탐구", e
        return "탐구", e
    if a.startswith("탐구(직업)") or a == "직업탐구":
        return "직업탐구", e
    if a.startswith("제2외국어"):
        return "제2외국어", e
    return a, e


def num(v, cast=float):
    try:
        return cast(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def rows(name):
    with (M / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> int:
    exams: dict = defaultdict(lambda: {"e": defaultdict(dict)})

    def ent(r, subj, el):
        ex = exams[r["examKey"]]
        ex.setdefault("src", r["sourcePage"])
        return ex["e"][f"{subj}|{el}"]

    for r in rows("applicants.csv"):
        subj, el = group(r["area"], "")
        if subj in ("전체",):
            continue
        n = num(r["applicantCount"], int)
        if n is not None:
            ent(r, subj, el)["n"] = n
    for r in rows("raw-score-summary.csv"):
        subj, el = group(r["area"], r["elective"])
        e = ent(r, subj, el)
        n, m, s = num(r["applicantCount"], int), num(r["rawMean"]), num(r["rawStddev"])
        if n is not None:
            e["n"] = n
        if m is not None:
            e["m"] = m
        if s is not None:
            e["s"] = s
    for r in rows("grade-boundaries.csv"):
        subj, el = group(r["area"], r["elective"])
        sc = num(r["score"])
        if sc is None:
            continue
        e = ent(r, subj, el)
        e.setdefault("c", []).append([int(r["grade"]), sc, "s" if r["scoreType"] == "standard" else "r",
                                     num(r["gradeCount"], int), num(r["gradeRatio"])])
    for r in rows("standard-score-frequency.csv"):
        subj, el = group(r["subject"] if r["subject"] in ("국어", "수학") else "탐구", "" if r["subject"] in ("국어", "수학") else r["subject"])
        sc, n = num(r["standardScore"]), num(r["count"], int)
        if sc is None or n is None:
            continue
        ent(r, subj, el).setdefault("f", {})[str(int(sc))] = n

    out = {}
    for k in sorted(exams):
        d = exams[k]
        for e in d["e"].values():
            if "c" in e:
                e["c"] = sorted({c[0]: c for c in e["c"]}.values())
        out[k] = {"src": d["src"], "e": dict(sorted(d["e"].items()))}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    n_e = sum(len(v["e"]) for v in out.values())
    print(f"{len(out)}개 회차 · {n_e}개 항목 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f}MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
