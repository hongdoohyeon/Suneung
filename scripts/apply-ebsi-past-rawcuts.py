#!/usr/bin/env python3
"""EBSi 공개 '역대 등급컷' 수집본으로 평가원 모평·수능(고3 6·9·11월) 원점수 컷이 빈 등급컷을 채운다.

입력: data/raw/item-analytics/ebsi-public-gradecut-history.json (collect-ebsi-public-history.py)
출력: data/raw/ebsi/past-rawcuts-normalized.json (정규화본) + data/gradecuts.json 제자리 보강
      — 원점수 컷이 비어 있고, 표준점수 컷이 EBSi 표와 1점 이내로 같은 레코드만. 기존 원점수는 건드리지 않는다.

EBSi 표의 표준점수는 평가원 공식값, 원점수·평균·표준편차는 EBSi 자체 분석(추정)이다.
그래서 rawCutBasis=ebsi_estimate 로 공식 원점수와 구분한다. 선택과목 체제(2022~) 국어·수학은
원점수 칸이 '-' 라 자연히 빠진다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/raw/item-analytics/ebsi-public-gradecut-history.json"
OUT = ROOT / "data/raw/ebsi/past-rawcuts-normalized.json"
EXAMS = ROOT / "data/exams.json"
GRADECUTS = ROOT / "data/gradecuts.json"

TYPE_BY_MONTH = {"06": "june", "09": "sept", "11": "csat"}
SUBJECT_BY_AREA = {"사회": "사회탐구", "과학": "과학탐구", "직업": "직업탐구", "제2외/한문": "제2외국어"}


def norm(name: str | None) -> str:
    s = re.sub(r"[\s·]", "", name or "")
    s = s.replace("기초베트남어", "베트남어")
    s = re.sub(r"Ⅰ$", "", s) if s.endswith("어Ⅰ") else s   # 제2외국어 '독일어Ⅰ' = 사이트 '독일어'
    return s.replace("형", "")


def area_subject(area: str, name: str) -> tuple[str, str | None]:
    if area != "국수영한":
        return SUBJECT_BY_AREA[area], name
    m = re.match(r"(국어|수학|영어|한국사)(.*)$", name)
    return m.group(1), (m.group(2) or None)


def num(v: str):
    return int(v) if re.fullmatch(r"\d+", v or "") else None


def main() -> None:
    exams = json.loads(EXAMS.read_text())
    site = {}
    for e in exams:
        if e.get("typeGroup") == "suneung" and e.get("type") in TYPE_BY_MONTH.values():
            site.setdefault((e["gradeYear"], e["type"], e["subject"], norm(e.get("subSubject"))), e)

    datasets = json.loads(SRC.read_text())["datasets"]
    out, unmatched = [], []
    for ds in datasets:
        typ = TYPE_BY_MONTH.get(ds["monthCode"])
        if ds["gradeYear"] != 3 or typ is None:
            continue
        for t in ds["tables"]:
            subject, sub = area_subject(ds["area"], t["subject"])
            grades = {r[0]: r for r in t["rows"][1:] if len(r) == 4 and r[0].isdigit()}
            if not all(str(g) in grades for g in range(1, 9)):
                # 등급이 비는 표('-' 행)는 raw/std 를 끝까지 대조할 수 없어 쓰지 않는다
                continue
            raw = [num(grades[str(g)][1]) for g in range(1, 9)]
            std = [num(grades[str(g)][2]) for g in range(1, 9)]
            if any(v is None for v in raw + std):
                continue
            e = site.get((ds["academicYear"], typ, subject, norm(sub)))
            if e is None:
                unmatched.append(f'{ds["academicYear"]} {typ} {subject} {sub}')
                continue
            out.append({
                "curriculum": e["curriculum"], "gradeYear": e["gradeYear"], "examYear": e["examYear"],
                "month": e["month"], "typeGroup": "suneung", "type": typ,
                "subject": e["subject"], "subSubject": e.get("subSubject"),
                "standardCuts": std, "rawCuts": raw,
                "meanRawScore": t.get("meanRawScore"), "stdDevRawScore": t.get("stdDevRawScore"),
                "rawCutBasis": "ebsi_estimate", "source": "ebsi-past-grdcut",
                "sourceUrl": "https://www.ebsi.co.kr/ebs/xip/xipa/retrievePastGrdCutWrongAnswerRate.ebs?tab=1",
            })

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"EBSi 과거 원점수 컷: {len(out)}건 → {OUT.relative_to(ROOT)}")
    print(f"사이트 시험과 매칭 안 됨: {len(unmatched)}건", *sorted(set(unmatched))[:20], sep="\n  ")
    apply(out)


def key(c: dict) -> tuple:
    return (c["curriculum"], c["gradeYear"], c["type"], c["subject"], c.get("subSubject"))


def has(values) -> bool:
    return isinstance(values, list) and any(v is not None for v in values)


def apply(records: list[dict]) -> None:
    by_key = {key(r): r for r in records}
    cuts = json.loads(GRADECUTS.read_text())
    filled, skipped = 0, []
    for c in cuts:
        r = by_key.get(key(c)) if c.get("typeGroup") == "suneung" else None
        if r is None or has(c.get("rawCuts")) or not has(c.get("standardCuts")):
            continue
        diff = max(abs(a - b) for a, b in zip(c["standardCuts"], r["standardCuts"]) if a is not None and b is not None)
        if diff > 1:
            skipped.append(f"{key(c)} 표준점수 차이 {diff}")
            continue
        c["rawCuts"] = r["rawCuts"]
        c["rawCutBasis"] = r["rawCutBasis"]
        c["rawCutSourceUrl"] = r["sourceUrl"]
        tags = [t for t in str(c.get("source") or "").split("+") if t]
        c["source"] = "+".join(tags + [r["source"]] if r["source"] not in tags else tags)
        filled += 1
    GRADECUTS.write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n")
    print(f"gradecuts.json 원점수 컷 보강: {filled}건 (표준점수 불일치 건너뜀 {len(skipped)}건)", *skipped, sep="\n  ")


if __name__ == "__main__":
    main()
