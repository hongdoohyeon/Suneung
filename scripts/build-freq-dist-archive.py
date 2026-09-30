#!/usr/bin/env python3
"""교육부 채점 결과 보도자료의 '표준점수 도수분포' 표(2018~2027학년도 수능·6월·9월 모평) → data/score-distribution-archive.json.

입력: data/raw/kice/scoring-archive-normalized/{csat,june_mock,september_mock}_YYYY/table-*.csv
      (normalize-moe-scoring-archive.py 산출물, 로컬 전용)
출력: 항목 하나 = 한 영역/과목 분포.
  {"gradeYear":2018,"examYear":2017,"month":11,"type":"csat","subject":"수학","subSubject":"가형",
   "distribution":{"134":{"male":148,"female":17},...}}
score-distribution.json(2026학년도 수능·9월, build-freq-dist.mjs)과 겹치는 (학년도, 종류)는 만들지 않는다.
"""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NORM = ROOT / "data/raw/kice/scoring-archive-normalized"
OUT = ROOT / "data/score-distribution-archive.json"

SOCIAL = {"생활과윤리", "윤리와사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와법", "법과정치", "사회·문화", "사회문화"}
SCIENCE = {"물리Ⅰ", "물리Ⅱ", "물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ"}
TYPES = {"csat": "csat", "june_mock": "june", "september_mock": "sept"}
SKIP = {("csat", 2026), ("sept", 2026)}   # build-freq-dist.mjs 가 이미 만든 분포


def nrm(s: str) -> str:
    s = re.sub(r"\s+", "", s or "")
    return s.replace("II", "Ⅱ").replace("I", "Ⅰ")


def num(v):
    try:
        return int(str(v).replace(",", "").strip())
    except ValueError:
        return None


def classify(name: str, section: str):
    n = nrm(name)
    if n == "국어":
        return "국어", None
    if n.startswith("수학"):
        return "수학", (n[2:] or None)
    if n in SOCIAL:
        return "사회탐구", ("사회·문화" if n == "사회문화" else n)
    if n in SCIENCE:
        return "과학탐구", n
    if "직업" in section:
        return "직업탐구", n
    return None


def parse_table(path: Path):
    """한 표 안에서 페이지가 나뉘어 머리행이 반복되면(과목명 행 없이) 직전 과목명을 이어 쓴다."""
    rows = list(csv.reader(path.open(encoding="utf-8-sig", newline="")))
    section, names = "", []
    acc: dict = {}
    for i, r in enumerate(rows):
        first = next((c for c in r if c.strip()), "")
        if re.match(r"^\d\.\s", first):
            section = first
        if not r or r[0].strip() != "표준점수":
            continue
        j = i - 1
        while j >= 0 and not any(c.strip() for c in rows[j]):
            j -= 1
        if j >= 0 and num(rows[j][0]) is None and rows[j][0].strip() != "표준점수":
            names = rows[j]                  # 새 과목 묶음
        blocks = [c for c in range(0, len(r), 5) if r[c].strip() == "표준점수"]
        k = i + 1
        data = {c: {} for c in blocks}
        while k < len(rows) and rows[k] and num(rows[k][0]) is not None:
            for c in blocks:
                if c + 3 >= len(rows[k]):
                    continue
                sc, m, f = num(rows[k][c]), num(rows[k][c + 1]), num(rows[k][c + 2])
                if sc is None or m is None or f is None:
                    continue
                data[c][str(sc)] = {"male": m, "female": f}
            k += 1
        for c in blocks:
            name = names[c] if c < len(names) else ""
            cls = classify(name, section)
            if cls and data[c]:
                acc.setdefault(cls, {}).update(data[c])
    yield from acc.items()


def month_of(grade_year: int, typ: str, cuts) -> int:
    ms = {r["month"] for r in cuts if r["typeGroup"] == "suneung" and r["gradeYear"] == grade_year and r["type"] == typ}
    return sorted(ms)[0] if ms else {"csat": 11, "june": 6, "sept": 9}[typ]


def main() -> int:
    cuts = json.loads((ROOT / "data/gradecuts.json").read_text(encoding="utf-8"))
    out = []
    for d in sorted(NORM.iterdir()):
        m = re.match(r"(csat|june_mock|september_mock)_(\d{4})$", d.name)
        if not m:
            continue
        typ, gy = TYPES[m.group(1)], int(m.group(2))
        if (typ, gy) in SKIP:
            continue
        seen = set()
        for t in sorted(d.glob("table-*.csv")):
            if "누적" not in t.read_text(encoding="utf-8-sig"):
                continue
            for (subject, sub), dist in parse_table(t):
                if (subject, sub) in seen:
                    continue
                seen.add((subject, sub))
                mon = month_of(gy, typ, cuts)
                out.append({"gradeYear": gy, "examYear": gy - 1,
                            "month": mon, "type": typ, "subject": subject, "subSubject": sub, "distribution": dist})
        print(f"{d.name}: {len(seen)}개 영역/과목")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(out)}건 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f}MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
