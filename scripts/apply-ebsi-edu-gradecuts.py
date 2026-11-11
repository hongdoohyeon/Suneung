#!/usr/bin/env python3
"""EBSi 학평 등급컷(retrieveGrdCut)을 add-edu-official-gradecuts.py 로 만든 source='edu-official' 항목에 합친다 (멱등, 로컬 전용).

사용: python3 scripts/apply-ebsi-edu-gradecuts.py 2026 10 202610201 202610202 202610203
 - irecord = 시행일(YYYYMMDD)+학년 이 아니라 EBSi 회차 코드(YYYYMM + 02 + 학년). 고1=…1, 고2=…2, 고3=…3
 - 채우는 값: rawCuts(원점수 컷, EBSi 값이 있을 때만), standardPercentile(백분위), highestStandardScore(최고점 표점)
 - 공식 표점 컷(standardCuts)과 EBSi 표점이 다르면 공식값을 두고 불일치만 출력한다.
 - 열 구성: 단일 과목 [등급, 작년컷, 원점수, 표준점수, 백분위] / 고3 국·수 [등급, 원점수×선택수, 표준점수, 백분위]
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path.home() / "Workspace/kice_archive"))
from scraper_edu.score_ebsi import fetch_grade_cuts  # noqa: E402


def norm(s):
    return re.sub(r"\s+", "", s or "").replace("I", "Ⅰ").replace("Ⅱ", "Ⅱ")


def num(v):
    try:
        f = float(str(v).replace(",", ""))
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


def main(year, month, irecords):
    path = ROOT / "data/gradecuts.json"
    cuts = json.loads(path.read_text(encoding="utf-8"))
    idx = {}
    for c in cuts:
        if c["typeGroup"] == "education" and c["examYear"] == year and c["month"] == month and str(c.get("source", "")).startswith("edu-official"):
            idx[(c["studentGrade"], c["subject"], norm(c.get("subSubject")))] = c
    done = mismatch = 0
    for ir in irecords:
        grade = int(ir[-1])
        for t in fetch_grade_cuts(ir):
            rows = {r[0]: r for r in t["rows"] if r and (r[0].isdigit() or r[0] == "최고점")}
            hdr = t["headers_rows"][0]
            electives = t["headers_rows"][1] if len(t["headers_rows"]) > 1 else [None]
            single = len(hdr) > 1 and hdr[1] == "작년컷"
            k = 1 if single else len(electives)
            for i, el in enumerate(electives):
                if single:
                    ri, si, pi = 2, 3, 4
                else:
                    ri, si, pi = 1 + i, 1 + k, 2 + k
                name = t["subject_name"]
                cands = [(grade, name, norm(el) if not single else ""), (grade, name, ""), ]
                if single:  # 탐구: 과목명이 곧 선택과목
                    cands = [(grade, s, norm(name)) for s in ("사회탐구", "과학탐구")]
                    cands += [(grade, "사회탐구", norm(name)), (grade, "과학탐구", norm(name))]
                    if name in ("통합사회", "통합과학"):
                        cands = [(grade, "사회탐구" if name == "통합사회" else "과학탐구", norm(name))]
                else:
                    cands = [(grade, name, norm(el) if el else "")]
                rec = next((idx[c] for c in cands if c in idx), None)
                if not rec and name in ("국어", "수학", "영어", "한국사"):
                    rec = idx.get((grade, name, ""))
                if not rec or rec["subject"] in ("영어", "한국사"):
                    continue
                g = lambda gr, j: num(rows[str(gr)][j]) if str(gr) in rows and j < len(rows[str(gr)]) else None
                std = [g(gr, si) for gr in range(1, 9)]
                if rec.get("standardCuts") and any(a is not None and b is not None and a != b for a, b in zip(std, rec["standardCuts"])):
                    mismatch += 1
                    print("표점 불일치", ir, name, el, std, rec["standardCuts"])
                    continue
                raw = [g(gr, ri) for gr in range(1, 9)]
                pct = [g(gr, pi) for gr in range(1, 9)]
                if any(v is not None for v in raw):
                    rec["rawCuts"] = raw
                    rec.pop("rawCutBasis", None)
                    rec.pop("rawCutSources", None)
                if any(v is not None for v in pct):
                    rec["standardPercentile"] = pct
                top = num(rows["최고점"][si]) if "최고점" in rows and si < len(rows["최고점"]) else None
                if top is not None:
                    rec["highestStandardScore"] = top
                rec["source"] = "edu-official+ebsi-grdcut"
                done += 1
    path.write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"EBSi 반영 {done}건, 표점 불일치 건너뜀 {mismatch}건")


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:])
