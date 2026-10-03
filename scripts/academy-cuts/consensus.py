#!/usr/bin/env python3
"""입시기관 원점수 등급컷 비교·합의.

입력: data/raw/academy-cuts/{ebsi,megastudy,etoos,jongro,daesung}.json + data/gradecuts.json(공식 표준점수 컷)
출력: data/raw/academy-cuts/consensus.json — 사이트 등급컷 레코드마다
      {id, sources:{기관: rawCuts}, rejected:{기관: 사유}, final[8], agree[8](최종값과 같은 기관 수), n, spread[8]}

규칙
 1. 기관 표준점수 컷이 공식 표준점수 컷과 어느 등급이든 2점 이상 다르면 제외(과목 매핑 오류·가채점 값).
 2. 등급별 최종값: 과반(> n/2) 기관이 같은 값이면 그 값, 아니면 중앙값(짝수면 아래쪽 중앙값).
 3. 최종 원점수 컷은 등급이 내려갈수록 줄어야 한다(단조) — 어기면 그 레코드는 보류.
절대평가 과목(영어·한국사·제2외국어 고정 컷)은 공식값이라 대상에서 뺀다.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import OUT_DIR, ROOT, subject_key  # noqa: E402

SOURCES = ["ebsi", "megastudy", "etoos", "jongro", "daesung"]
AREAS = ["국어", "수학", "영어", "한국사", "사회탐구", "과학탐구", "직업탐구", "제2외국어"]


def area_of(subject: str, sub: str | None) -> str | None:
    for a in AREAS:
        if subject.startswith(a) or subject == a.replace("탐구", ""):
            return a
    if subject in ("제2외국어/한문", "제2외"):
        return "제2외국어"
    return None


def sub_key(area: str, sub: str | None) -> str:
    s = sub or ""
    m = re.search(r"\(([^)]+)\)", s)
    if m:
        s = m.group(1)
    s = re.sub(rf"^{area}", "", s.strip())
    k = subject_key(s)
    return "" if k == subject_key(area) else k


def has(v):
    return isinstance(v, list) and any(x is not None for x in v)


def key_of(typeGroup, type_, gradeYear, studentGrade, area, sk):
    return (typeGroup, type_, gradeYear, studentGrade if typeGroup == "education" else 3, area, sk)


def load_sources():
    idx = defaultdict(lambda: defaultdict(list))
    for s in SOURCES:
        for r in json.loads((OUT_DIR / f"{s}.json").read_text()):
            area = area_of(r["subject"], r["subSubject"])
            if not area or not has(r["rawCuts"]):
                continue
            k = key_of(r["typeGroup"], r["type"], r["gradeYear"], r["studentGrade"], area, sub_key(area, r["subSubject"]))
            idx[k][s].append(r)
    return idx


def decide(vals: list):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None, 0
    c = Counter(vals).most_common()
    if c[0][1] * 2 > len(vals):
        return c[0][0], c[0][1]
    srt = sorted(vals)
    med = srt[(len(srt) - 1) // 2]
    return med, vals.count(med)


def main():
    idx = load_sources()
    cuts = json.loads((ROOT / "data/gradecuts.json").read_text())
    out, stats = [], Counter()
    for c in cuts:
        if c.get("absolute") or c["typeGroup"] not in ("suneung", "education"):
            continue
        area = area_of(c["subject"], c.get("subSubject"))
        if not area:
            continue
        k = key_of(c["typeGroup"], c["type"], c["gradeYear"], c.get("studentGrade"), area, sub_key(area, c.get("subSubject")))
        cand = idx.get(k)
        if not cand:
            stats["기관 자료 없음"] += 1
            continue
        official = c.get("standardCuts") if has(c.get("standardCuts")) else None
        sources, rejected = {}, {}
        for s, rs in cand.items():
            r = rs[0]
            if official and has(r["standardCuts"]):
                diff = max(abs(a - b) for a, b in zip(official, r["standardCuts"]) if a is not None and b is not None)
                if diff >= 2:
                    rejected[s] = f"표준점수 컷 {diff}점 차이"
                    continue
            sources[s] = r["rawCuts"]
        if not sources:
            stats["전부 표점 불일치로 제외"] += 1
            out.append({"id": c["id"], "sources": {}, "rejected": rejected, "final": None})
            continue
        final, agree, spread = [], [], []
        for g in range(8):
            vals = [v[g] for v in sources.values()]
            f, a = decide(vals)
            final.append(f)
            agree.append(a)
            nn = [v for v in vals if v is not None]
            spread.append((max(nn) - min(nn)) if nn else None)
        mono = all(final[i] is None or final[i + 1] is None or final[i] >= final[i + 1] for i in range(7))
        out.append({"id": c["id"], "key": list(k), "sources": sources, "rejected": rejected,
                    "final": final if mono else None, "agree": agree, "n": len(sources), "spread": spread,
                    "current": c.get("rawCuts"), "currentBasis": c.get("rawCutBasis")})
        stats[f"기관 {len(sources)}곳"] += 1
    (OUT_DIR / "consensus.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(stats)


if __name__ == "__main__":
    main()
