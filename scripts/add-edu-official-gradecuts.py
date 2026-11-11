#!/usr/bin/env python3
"""data/edu-official.json(시·도교육청 공식 통계) → data/gradecuts.json 에 해당 학평 회차 등급컷 추가 (멱등).

사용: python3 scripts/add-edu-official-gradecuts.py 2026 10
- 대상 = exams.json 에 있는 그 회차의 국어·수학·영어·한국사·사회탐구·과학탐구 (제2외국어·직업탐구는 기존 관행대로 제외)
- 표준점수 컷(1~8등급)·표점 최고점·누적 비율은 공식값. 원점수 컷은 영어·한국사(절대평가)만 공식값,
  나머지는 입시기관 자료(EBSi·메가·대성 등)가 나오면 academy-cuts 파이프라인이 채운다(rawCuts 없음).
- 같은 회차의 source='edu-official' 항목만 지우고 다시 만든다. 다른 출처 항목은 건드리지 않는다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUBJECTS = {"국어": 100, "수학": 100, "영어": 100, "한국사": 50, "사회탐구": 50, "과학탐구": 50}
ABSOLUTE = {"영어", "한국사"}


def main(year: int, month: int):
    exams = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    cuts = json.loads((ROOT / "data/gradecuts.json").read_text(encoding="utf-8"))
    official = json.loads((ROOT / "data/edu-official.json").read_text(encoding="utf-8"))

    cuts = [c for c in cuts if not (c["typeGroup"] == "education" and c["examYear"] == year
                                    and c["month"] == month and c.get("source") == "edu-official")]
    have = {(c["examYear"], c["month"], c["typeGroup"], c.get("studentGrade"), c["subject"], c.get("subSubject"))
            for c in cuts}
    next_id = max(c["id"] for c in cuts) + 1
    added = 0
    for ex in exams:
        if not (ex["examYear"] == year and ex["month"] == month and ex["typeGroup"] == "education"):
            continue
        subj = ex["subject"]
        if subj not in SUBJECTS:
            continue
        sub = ex.get("subSubject")
        key = (year, month, "education", ex["studentGrade"], subj, sub)
        if key in have:
            continue
        exam = official.get(f"{year}_{month:02d}_g{ex['studentGrade']}")
        if not exam:
            continue
        e = exam["e"]
        row = e.get(f"{subj}|{sub or ''}")
        if not row or not row.get("c"):
            row = e.get(f"{subj}|")
        if not row or not row.get("c"):
            continue
        # 국어·수학 선택과목은 영역 전체 컷만 공개 → 영역 행(선택과목 빈칸)을 쓴다
        by_grade = {g: (score, kind, ratio) for g, score, kind, _n, ratio in row["c"]}
        want_kind = "r" if subj in ABSOLUTE else "s"
        if any(by_grade.get(g, (0, want_kind))[1] != want_kind for g in range(1, 9) if g in by_grade):
            continue
        vals = [by_grade[g][0] if g in by_grade else None for g in range(1, 9)]
        if all(v is None for v in vals):
            continue
        vals = [None if v is None else int(v) if float(v).is_integer() else v for v in vals]
        rec = {
            "curriculum": ex["curriculum"], "gradeYear": ex["gradeYear"], "examYear": year, "month": month,
            "typeGroup": "education", "type": ex["type"], "subject": subj, "subSubject": sub,
            "fullScore": SUBJECTS[subj], "source": "edu-official", "id": next_id,
            "studentGrade": ex["studentGrade"],
        }
        if subj in ABSOLUTE:
            rec["rawCuts"] = vals
            rec["absolute"] = True
        else:
            rec["standardCuts"] = vals
            cum, run = [], 0.0
            for g in range(1, 9):
                if g in by_grade:
                    run += by_grade[g][2]
                    cum.append(round(run, 2))
                else:
                    cum.append(None)
            rec["cumulativePercent"] = cum
            f = (row.get("f") or e.get(f"{subj}|", {}).get("f") or {})
            if f:
                rec["highestStandardScore"] = int(max(float(k) for k in f))
        cuts.append(rec)
        have.add(key)
        next_id += 1
        added += 1
    (ROOT / "data/gradecuts.json").write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{year}-{month:02d} 등급컷 {added}건 추가")


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
