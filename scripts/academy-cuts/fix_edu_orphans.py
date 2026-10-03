#!/usr/bin/env python3
"""시험에 안 붙는 학평 등급컷(고아 레코드) 정리 (일회성, 로컬 전용).

사이트는 (curriculum, gradeYear, type, subject, subSubject, studentGrade) 가 시험과 똑같아야 등급컷을 붙인다.
이름·회차 표기가 달라 어디에도 안 붙는 학평 레코드를 아래 순서로 정리한다.
 1. 같은 회차(학년도·월·학년)·같은 과목인 시험이 하나 있으면 그 시험 이름으로 다시 단다
    (제2외국어 '독일어Ⅰ' → '독일어' 등). 2022~ 국어·수학 영역 단위 컷은 선택과목 시험마다 표준점수만 복사.
 2. 같은 회차 시험이 없으면 표준점수 8개가 정확히 같은 회차(공식 통계·입시기관 수집본, 같은 달 우선)를 찾아
    그 시험으로 옮긴다 (예: 2025~2027 고3 '4월' → 실제 시행 '5월').
 3. 붙일 시험에 이미 컷이 있으면 값이 같을 때 고아를 지우고, 다르면 진실값과 맞는 쪽을 남긴다
    (근거가 없으면 화면에 나가던 기존 값을 유지하고 고아를 지운다).
 4. 붙일 시험이 어디에도 없는 레코드는 지운다. 지운 레코드는 사유와 함께 data/raw/academy-cuts/edu-orphans-removed.json 에 보관.
출력: data/gradecuts.json 갱신, data/raw/academy-cuts/edu-orphans-log.json. 이후 consensus.py → apply_consensus.py.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import OUT_DIR, ROOT  # noqa: E402
from fix_edu_year_shift import MONTH, SOURCES, has, load_official, same, skey  # noqa: E402

ELECTIVE_AREAS = ("국어", "수학")


def rkey(r):
    """비교용 과목 키 — 제2외국어는 'Ⅰ' 표기 차이를 무시한다."""
    k = skey(r)
    if not k:
        return None
    a, s = k
    return (a, re.sub("Ⅰ$", "", s)) if a == "제2외국어" else k


def same_cut(a, b):
    """같은 등급컷인가 — 표준점수가 있으면 표준점수로, 없으면(제2외국어·절대평가) 원점수 고정 컷으로."""
    if has(a.get("standardCuts")) and has(b.get("standardCuts")):
        return same(a["standardCuts"], b["standardCuts"])
    if a.get("absolute") and b.get("absolute"):
        return True
    return same(a.get("rawCuts"), b.get("rawCuts"))  # 한쪽에 표준점수가 없으면 원점수 컷으로


def name(c):
    return (c.get("curriculum"), c["gradeYear"], c["type"], c.get("studentGrade"), c["subject"], c.get("subSubject"))


def main():
    cuts = json.loads((ROOT / "data/gradecuts.json").read_text())
    exams = [x for x in json.loads((ROOT / "data/exams.json").read_text()) if x.get("typeGroup") == "education"]
    names = {name(x) for x in exams}
    names5 = {n[:3] + n[4:] for n in names}
    attached = lambda c: name(c) in names or (c.get("studentGrade") is None and name(c)[:3] + name(c)[4:] in names5)

    truth = {}
    acad = defaultdict(list)
    for s in SOURCES:
        for r in json.loads((OUT_DIR / f"{s}.json").read_text()):
            if r["typeGroup"] == "education" and rkey(r) and has(r["standardCuts"]):
                acad[(r["gradeYear"], r["type"], r["studentGrade"]) + rkey(r)].append(r)
    for s, rows in acad.items():
        top = Counter(tuple(r["standardCuts"]) for r in rows).most_common()
        if len(top) == 1 or top[0][1] > top[1][1]:
            truth[s] = list(top[0][0])
    for s, v in load_official().items():  # 공식값 우선
        a, sub = s[3:]
        truth[s[:3] + ((a, re.sub("Ⅰ$", "", sub)) if a == "제2외국어" else (a, sub))] = v

    exam_at = defaultdict(list)
    for x in exams:
        if rkey(x):
            exam_at[(x["gradeYear"], x["type"], x.get("studentGrade")) + rkey(x)].append(x)
    cut_of = {}
    for c in cuts:
        if c["typeGroup"] == "education" and name(c) in names:
            cut_of.setdefault(name(c), c)

    def elective_exams(slot):
        gy, ty, sg, a, s = slot
        if a not in ELECTIVE_AREAS or s:
            return []
        return [x for x in exams if (x["gradeYear"], x["type"], x.get("studentGrade"), x["subject"]) == (gy, ty, sg, a) and x.get("subSubject")]

    def targets(slot):
        """슬롯 → 붙일 시험 목록 (하나 또는 선택과목 여러 개). 없으면 []."""
        xs = exam_at.get(slot, [])
        if len(xs) == 1:
            return xs
        return [] if xs else elective_exams(slot)

    log = defaultdict(list)
    drop, new = set(), []
    next_id = max(c["id"] for c in cuts) + 1
    orphans = [c for c in cuts if c["typeGroup"] == "education" and not attached(c)]
    for c in orphans:
        k = rkey(c)
        sgs = [c["studentGrade"]] if c.get("studentGrade") else [1, 2, 3]
        own = [(c["gradeYear"], c["type"], sg) + k for sg in sgs] if k else []
        how, tgt = None, []
        for s in own:
            if targets(s):
                how, tgt, slot = "rename", targets(s), s
                break
        if not tgt and k and has(c.get("standardCuts")):
            hits = [s for s, t in truth.items() if s[3:] == k and s not in own and same(c["standardCuts"], t) and targets(s)]
            hits = [s for s in hits if s[1] == c["type"]] or [s for s in hits if s[0] == c["gradeYear"]] or hits
            if len(hits) == 1:
                how, tgt, slot = "move", targets(hits[0]), hits[0]
            elif hits:
                log["held"].append({"id": c["id"], "name": list(name(c)), "reason": f"후보 회차 여러 개 {[list(h[:3]) for h in hits]}"})
                continue
        if not tgt:
            drop.add(c["id"])
            log["removed"].append({**c, "removedReason": "붙일 시험이 사이트에 없음"})
            continue
        tr = truth.get(slot)
        status = []
        for x in tgt:
            cur = cut_of.get(name(x))
            if not cur:
                status.append("attach")
            elif same_cut(cur, c):
                status.append("redundant")
            elif tr and same(c.get("standardCuts"), tr) and not same(cur.get("standardCuts"), tr):
                status.append("replace")
            else:
                status.append("held")
        if all(st == "held" for st in status):  # 화면의 기존 값을 유지하고, 근거 없는 고아 값은 보관 후 삭제
            drop.add(c["id"])
            log["removed"].append({**c, "removedReason": f"시험 {[x['id'] for x in tgt]} 에 이미 다른 값이 붙어 있고 고아 값을 뒷받침할 근거 없음"})
            continue
        before = list(name(c))
        for x, st in zip(tgt, status):
            cur = cut_of.get(name(x))
            if st == "redundant":
                log["redundant"].append({"id": c["id"], "exam": x["id"], "kept": cur["id"]})
                continue
            if st == "held":
                log["held"].append({"id": c["id"], "name": before, "exams": [x["id"]], "reason": f"선택과목 시험에 이미 다른 값(id {cur['id']})"})
                continue
            if st == "replace":
                drop.add(cur["id"])
                log["replaced"].append({"exam": x["id"], "old": cur["id"], "oldStd": cur.get("standardCuts"), "new": c["id"]})
            if len(tgt) == 1:
                rec = c
            else:  # 영역 단위 컷 → 선택과목 시험마다 표준점수만 복사 (원점수는 선택과목마다 달라 합의 단계에서 채움)
                rec = {k_: v for k_, v in c.items() if k_ not in ("rawCuts", "standardPercentile", "highestStandardScore",
                                                                  "rawCutBasis", "rawCutSources", "rawCutAgreement")}
                rec["id"] = next_id
                next_id += 1
                new.append(rec)
            rec.update(curriculum=x["curriculum"], gradeYear=x["gradeYear"], examYear=x["examYear"], type=x["type"],
                       month=MONTH[x["type"]], studentGrade=x["studentGrade"], subject=x["subject"], subSubject=x.get("subSubject"))
            cut_of[name(x)] = rec
            log[how].append({"id": rec["id"], "from": before, "to": list(name(rec)), "exam": x["id"]})
        if len(tgt) > 1 or status[0] == "redundant":
            drop.add(c["id"])  # 선택과목으로 복사했거나 이미 같은 값이 붙어 있으면 원본 고아는 지운다
    cuts = [c for c in cuts if c["id"] not in drop] + new
    removed = log.pop("removed", [])
    (ROOT / "data/gradecuts.json").write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n")
    (OUT_DIR / "edu-orphans-removed.json").write_text(json.dumps(removed, ensure_ascii=False, indent=1) + "\n")
    (OUT_DIR / "edu-orphans-log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1) + "\n")
    print({k: len(v) for k, v in log.items()}, "removed", len(drop))


if __name__ == "__main__":
    main()
