#!/usr/bin/env python3
"""등급컷 원점수가 입시기관 확정표와 어긋난 채 남아 있지 않은지 검사 (CI validate.yml).

실패(exit 1)
 - 기관 2곳 이상이 모든 등급에서 같은 값을 냈는데(consensus.json agree == n) 사이트 rawCuts 가 다르다
   — apply_consensus.py 를 안 돌렸거나, 다른 스크립트가 합의값을 덮어쓴 경우.
   공식 근거로 보호된 행(절대평가·public_dist_verified·academy_reverse_calculated·calc-raw)은 제외.
경고
 - 공식 발표 전 추정 역산값(academy_consensus_estimate)이 시행 후 45일 넘게 남아 있다
   — 기관 확정표를 수집해 덮어야 한다(collect_*.py → consensus.py → apply_consensus.py).
2026-11 exam-12736 제보(9모 수학 1컷 84 ↔ 확정 88)에서 두 달간 아무도 몰랐던 일의 재발 방지.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTECT = {"public_dist_verified", "academy_reverse_calculated"}
PROVISIONAL = "academy_consensus_estimate"
STALE_DAYS = 45


def main() -> int:
    cuts = {c["id"]: c for c in json.loads((ROOT / "data/gradecuts.json").read_text())}
    cons = json.loads((ROOT / "data/raw/academy-cuts/consensus.json").read_text())
    errors, warns = [], []
    for x in cons:
        c = cuts.get(x["id"])
        final = x.get("final")
        if not c or not final or None in final or x.get("n", 0) < 2:
            continue
        tags = set(str(c.get("source") or "").split("+"))
        if c.get("absolute") or c.get("rawCutBasis") in PROTECT or "calc-raw" in tags:
            continue
        if not all(a == x["n"] for a in x["agree"]):
            continue
        if (c.get("rawCuts") or [])[:8] != final:
            errors.append(f"id {c['id']} {c['gradeYear']} {c['type']} {c['subject']} {c.get('subSubject') or ''}: "
                          f"사이트 {c.get('rawCuts')} ↔ 기관 {x['n']}곳 일치 {final}")
    today = date.today()
    for c in cuts.values():
        if c.get("rawCutBasis") != PROVISIONAL or not c.get("examYear") or not c.get("month"):
            continue
        age = (today - date(c["examYear"], c["month"], 1)).days
        if age > STALE_DAYS:
            warns.append(f"id {c['id']} {c['gradeYear']} {c['type']} {c['subject']} {c.get('subSubject') or ''}: 추정값 {age}일째")
    for w in warns:
        print(f"::warning::등급컷 추정값 방치 — {w}")
    for e in errors:
        print(f"::error::등급컷 합의값 미반영 — {e}")
    print(f"등급컷 합의 대조: 미반영 {len(errors)}건 · 오래된 추정값 {len(warns)}건")
    if errors:
        print("고치기: python3 scripts/academy-cuts/consensus.py && python3 scripts/academy-cuts/apply_consensus.py")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
