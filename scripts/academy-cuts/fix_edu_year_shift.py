#!/usr/bin/env python3
"""학평 등급컷 연도·학년 어긋남 정리 (일회성, 로컬 전용).

배경: gradecuts.json 학평 레코드 일부가 다른 회차 값을 들고 있다 (고2 를 학년도+1 로 저장해 1년씩 밀린 연쇄,
고3 직탐·정치와법 표준점수만 1년 밀림, 고3 값이 고1·2 에 붙음 등).

슬롯 = (gradeYear, type, studentGrade, 영역, 선택과목키). 슬롯 진실값 = 시·도교육청 공식 등급 구분 표준점수
(data/edu-official.json) > 입시기관 수집본 표준점수 컷 다수값.
 1. 레코드 표준점수 8개가 자기 슬롯 진실값과 다르고, 다른 슬롯 하나(같은 달 우선)의 진실값과 정확히 같으면 '이동 후보'.
    단 원점수가 합의값이 아닌 원래 값이고 그게 자기 슬롯 기관 원점수와 같으면 표준점수만 틀린 것 → 제자리 교정.
    원점수가 제3의 회차와 맞는 뒤섞인 레코드, 후보 슬롯이 여럿이거나 대상 시험이 없는 경우는 손대지 않는다.
 2. 관련 슬롯마다 진실값과 같은 레코드 하나만 남긴다(거주 레코드 우선). 나머지는 중복·오값으로 삭제.
 3. 빈 슬롯은 진실값과 표준점수가 같은 기관 행(EBSi 우선)으로 채운다 — 공식값이 있거나, 기관 2곳 이상 일치하거나,
    EBSi·메가스터디 단독일 때만 (apply_consensus.py 의 단독 출처 기준과 같음).
 4. 옮긴 레코드의 원점수가 이전 슬롯 합의값이었다면 떼어낸다 → 이후 consensus.py·apply_consensus.py 재실행으로 채움.
 5. 그 밖에 자기 회차 공식값과 다른 레코드는 공식값으로, 시험에 안 붙는 이름의 보류 중복은 삭제,
    시험에 붙는 레코드의 examYear 표기는 그 시험 값으로 맞춘다.
출력: data/gradecuts.json 갱신, data/raw/academy-cuts/edu-year-fix-log.json (처리 내역·보류 목록).
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import OUT_DIR, ROOT  # noqa: E402
from consensus import SOURCES, area_of, sub_key  # noqa: E402

MONTH = {"mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "sep": 9, "oct": 10, "nov": 11}
TYPE = {v: k for k, v in MONTH.items()}
TRUSTED_SINGLE = {"ebsi", "megastudy"}  # apply_consensus.py 와 같은 기준: 단독 출처로 믿는 기관
RAW_FIELDS = ("rawCutBasis", "rawCutSources", "rawCutAgreement", "rawCutSourceUrl")


def skey(r):
    a = area_of(r["subject"], r.get("subSubject"))
    return (a, sub_key(a, r.get("subSubject"))) if a else None


def slot(r):
    return (r["gradeYear"], r["type"], r.get("studentGrade")) + skey(r)


def has(v):
    return isinstance(v, list) and any(x is not None for x in v)


def same(a, b):
    """두 컷 배열이 둘 다 값이 있는 자리(5곳 이상)에서 모두 같은가."""
    p = [(x, y) for x, y in zip(a or [], b or []) if x is not None and y is not None]
    return len(p) >= 5 and all(x == y for x, y in p)


def near(a, b):
    """원점수 비교용 — 기관마다 1점씩 다르게 적는 일이 흔해 1점 차까지 같은 회차로 본다."""
    p = [(x, y) for x, y in zip(a or [], b or []) if x is not None and y is not None]
    return len(p) >= 5 and all(abs(x - y) <= 1 for x, y in p)


def load_official():
    out = {}
    for key, e in json.loads((ROOT / "data/edu-official.json").read_text()).items():
        ey, mm, gg = key.split("_")
        sg = int(gg[1:])
        gy = int(ey) + 1 if sg == 3 else int(ey)
        for kk, v in e["e"].items():
            c = [x for x in v.get("c") or [] if x[0] <= 8]  # 인원 0인 등급은 행이 없다 → 등급 번호로 맞춘다
            if not c or any(x[2] != "s" for x in c):
                continue
            subj, sub = kk.split("|")
            k = skey({"subject": subj, "subSubject": sub or None})
            if k:
                cut = [None] * 8
                for x in c:
                    cut[x[0] - 1] = int(x[1])
                if sum(v is not None for v in cut) >= 6:  # 1등급만 공개된 회차(2022 11월 고2 탐구 등)는 쓰지 않는다
                    out[(gy, TYPE[int(mm)], sg) + k] = cut
    return out


def main():
    cuts = json.loads((ROOT / "data/gradecuts.json").read_text())
    exams = json.loads((ROOT / "data/exams.json").read_text())
    official = load_official()
    acad = defaultdict(list)
    for s in SOURCES:
        for r in json.loads((OUT_DIR / f"{s}.json").read_text()):
            if r["typeGroup"] == "education" and skey(r) and has(r["standardCuts"]):
                acad[slot(r)].append(r)
    by_subject = defaultdict(set)
    for s in list(acad) + list(official):
        by_subject[s[3:]].add(s)

    def truth(s):
        if s in official:
            return official[s], "official"
        c = Counter(tuple(r["standardCuts"]) for r in acad.get(s, []))
        if not c:
            return None, None
        top = c.most_common()
        if len(top) > 1 and top[0][1] == top[1][1]:
            return None, None
        return list(top[0][0]), f"academy {top[0][1]}/{sum(c.values())}"

    def acad_raw_match(raw, s):
        return has(raw) and any(near(raw, r["rawCuts"]) for r in acad.get(s, []) if has(r["rawCuts"]))

    exam_at = {}
    for x in exams:
        if x.get("typeGroup") == "education" and x.get("studentGrade") and skey(x):
            exam_at.setdefault(slot(x), x)

    # 사이트 build_cut_matcher 조인키 — 슬롯이 같아도 이 이름이 시험과 맞아야 화면에 붙는다
    exam_names = {(x.get("curriculum"), x["gradeYear"], x["type"], x.get("studentGrade"), x["subject"], x.get("subSubject"))
                  for x in exams if x.get("typeGroup") == "education"}
    name = lambda c: (c.get("curriculum"), c["gradeYear"], c["type"], c.get("studentGrade"), c["subject"], c.get("subSubject"))
    edu = [c for c in cuts if c["typeGroup"] == "education" and c.get("studentGrade") and skey(c) and has(c.get("standardCuts"))]
    byid = {c["id"]: c for c in cuts}
    resident = defaultdict(list)
    for c in edu:
        resident[slot(c)].append(c["id"])

    # 1. 분류
    movers, fixstd, held = {}, {}, {}
    for c in edu:
        own = slot(c)
        t_own, _ = truth(own)
        if t_own is None or same(c["standardCuts"], t_own):
            continue
        hits = [s for s in by_subject[own[3:]] if s != own and truth(s)[0] and same(c["standardCuts"], truth(s)[0])]
        if not hits:
            continue
        hits = [s for s in hits if s[1] == c["type"]] or hits
        orig_raw = has(c.get("rawCuts")) and c.get("rawCutBasis") != "academy_consensus"
        if orig_raw and acad_raw_match(c["rawCuts"], own) and not any(acad_raw_match(c["rawCuts"], s) for s in hits):
            fixstd[c["id"]] = own
            continue
        if orig_raw:
            fit = [s for s in hits if acad_raw_match(c["rawCuts"], s) or not any(has(r["rawCuts"]) for r in acad.get(s, []))]
            if not fit:
                held[c["id"]] = f"표준점수는 {[list(s[:3]) for s in hits]} 와 같으나 원점수는 그 회차와 다름(뒤섞인 레코드)"
                continue
            hits = fit
        if len(hits) != 1:
            held[c["id"]] = f"후보 회차 여러 개 {[list(s[:3]) for s in hits]}"
            continue
        if hits[0] not in exam_at:
            held[c["id"]] = f"대상 회차 {list(hits[0][:3])} 시험이 사이트에 없음"
            continue
        movers[c["id"]] = hits[0]

    # 2. 슬롯 해석 — 진실값을 가진 후보가 없는 슬롯으로 가는 이동은 되돌린다
    while True:
        touched = defaultdict(lambda: {"res": [], "in": []})
        for i, t in movers.items():
            touched[slot(byid[i])]
            touched[t]["in"].append(i)
        for i, s in fixstd.items():
            touched[s]
        for s, v in touched.items():
            v["res"] = [i for i in resident.get(s, []) if i not in movers]
        plan, revert = {}, []
        for s, v in touched.items():
            cands = v["res"] + v["in"]
            tr, basis = truth(s)
            if not cands:
                plan[s] = ("vacant", None, [], tr, basis)
                continue
            ok = [i for i in cands if tr and (i in fixstd or same(byid[i]["standardCuts"], tr))]
            if not ok:
                revert += v["in"]
                plan[s] = ("unresolved", None, cands, tr, basis)
                continue
            # 시험에 붙어 있는 거주 레코드 > 옮겨 올 레코드(시험 이름으로 다시 단다) > 시험에 안 붙는 거주 레코드
            rank = lambda i: 1 if i not in v["res"] else 0 if name(byid[i]) in exam_names else 2
            ok.sort(key=lambda i: (rank(i), i in fixstd, "rawCutBasis" not in byid[i]))
            plan[s] = ("keep", ok[0], [i for i in cands if i != ok[0]], tr, basis)
        if not revert:
            break
        for i in revert:
            held[i] = "옮길 회차에 이미 다른 값이 있고 진실값과 맞는 후보가 없음"
            movers.pop(i)

    # 3. 적용
    log = defaultdict(list)
    drop, new = set(), []
    next_id = max(c["id"] for c in cuts) + 1
    for s, (action, keep, others, tr, basis) in plan.items():
        if action == "unresolved":
            log["unresolved"].append({"slot": list(s), "ids": others})
            continue
        if action == "keep":
            for i in others:
                drop.add(i)
                log["deleted"].append({"id": i, "slot": list(s), "kept": keep, "standardCuts": byid[i]["standardCuts"]})
            c = byid[keep]
            if keep in movers:
                x = exam_at[s]
                before = {k: c.get(k) for k in ("gradeYear", "examYear", "type", "studentGrade", "subSubject")}
                c.update(curriculum=x["curriculum"], gradeYear=s[0], examYear=s[0] - 1 if s[2] == 3 else s[0],
                         month=MONTH[s[1]], type=s[1], studentGrade=s[2], subject=x["subject"], subSubject=x.get("subSubject"))
                if c.get("rawCutBasis") == "academy_consensus":  # 이전 회차 합의 원점수 — 새 회차 합의로 다시 채운다
                    for k in RAW_FIELDS:
                        c.pop(k, None)
                    c.pop("rawCuts", None)
                    c["source"] = "+".join(t for t in c["source"].split("+") if t != "academy-consensus")
                log["moved"].append({"id": keep, "from": before, "to": list(s), "basis": basis})
            if keep in fixstd:
                log["std-fixed"].append({"id": keep, "slot": list(s), "before": c["standardCuts"], "after": tr, "basis": basis})
                c["standardCuts"] = tr
                for k in ("standardPercentile", "highestStandardScore"):
                    c.pop(k, None)
                c["source"] += "+edu-official" if basis == "official" else "+academy-std"
            elif basis == "official" and c["standardCuts"] != tr:
                c["standardCuts"] = tr
        if action == "vacant":
            rows = sorted((r for r in acad.get(s, []) if tr and same(r["standardCuts"], tr)),
                          key=lambda r: (r["source"] != "ebsi", not has(r["percentiles"])))
            x = exam_at.get(s)
            srcs = {r["source"] for r in rows}
            if not x or not tr or (basis != "official" and len(srcs) < 2 and not srcs & TRUSTED_SINGLE):
                log["left-empty"].append({"slot": list(s), "basis": basis, "exam": x and x.get("id")})
                continue
            row = rows[0] if rows else None
            rec = {"curriculum": x["curriculum"], "gradeYear": s[0], "examYear": s[0] - 1 if s[2] == 3 else s[0],
                   "month": MONTH[s[1]], "typeGroup": "education", "type": s[1], "subject": x["subject"],
                   "subSubject": x.get("subSubject"), "standardCuts": tr}
            tags = []
            if row:
                if has(row["percentiles"]):
                    rec["standardPercentile"] = row["percentiles"]
                if (row.get("top") or {}).get("std"):
                    rec["highestStandardScore"] = row["top"]["std"]
                tags.append({"ebsi": "ebsi-grdcut"}.get(row["source"], row["source"]))
            if basis == "official":
                tags.append("edu-official")
            full = next((c.get("fullScore") for c in edu if c["subject"] == x["subject"] and c.get("fullScore")), None)
            if full:
                rec["fullScore"] = full
            rec.update(source="+".join(tags), id=next_id, studentGrade=s[2])
            next_id += 1
            new.append(rec)
            log["filled"].append({"id": rec["id"], "slot": list(s), "basis": basis, "source": rec["source"]})
    # 4. 남은 레코드도 자기 회차 공식 등급 구분 점수와 다르면 공식값으로 (원점수가 그 회차 기관 값과 안 맞으면 떼어냄)
    for c in edu:
        if c["id"] in drop:
            continue
        s = slot(c)
        if s in official and not same(c["standardCuts"], official[s]):
            log["official-override"].append({"id": c["id"], "slot": list(s), "before": c["standardCuts"], "after": official[s]})
            c["standardCuts"] = official[s]
            for k in ("standardPercentile", "highestStandardScore"):
                c.pop(k, None)
            if has(c.get("rawCuts")) and not acad_raw_match(c["rawCuts"], s):
                for k in RAW_FIELDS + ("rawCuts",):
                    c.pop(k, None)
            c["source"] += "+edu-official"
            held.pop(c["id"], None)
    # 5. 보류 레코드 중 어느 시험에도 안 붙는 이름(예: 2009 고3 '정치와법' — 시험은 '법과정치')이고
    #    같은 슬롯에 시험에 붙는 레코드가 따로 있으면 표시되지 않는 중복이므로 지운다
    for i in list(held):
        c = byid[i]
        if c["typeGroup"] == "education" and name(c) not in exam_names and any(
                j != i and j not in drop and name(byid[j]) in exam_names for j in resident.get(slot(c), [])):
            drop.add(i)
            log["deleted"].append({"id": i, "slot": list(slot(c)), "kept": None, "standardCuts": c["standardCuts"],
                                   "reason": "시험에 안 붙는 이름의 중복(뒤섞인 값)"})
            held.pop(i)
    done = drop | {x["id"] for x in log["moved"]} | {x["id"] for x in log["std-fixed"]} | {x["id"] for x in log["official-override"]}
    for a in json.loads((OUT_DIR / "audit-std-mismatch.json").read_text()):
        if a["id"] not in done and a["id"] not in held:
            held[a["id"]] = ("학평 아님(수능·모평)" if byid[a["id"]]["typeGroup"] != "education"
                             else "기관 수집본·공식 통계 어느 회차와도 표준점수 컷 정확 일치 없음")
    for i, why in held.items():
        c = byid[i]
        log["held"].append({"id": i, "slot": [c["gradeYear"], c["type"], c.get("studentGrade"), c["subject"], c.get("subSubject")],
                            "standardCuts": c["standardCuts"], "reason": why})
    cuts = [c for c in cuts if c["id"] not in drop] + new
    # 6. 시험에 붙는 학평 레코드의 examYear 를 그 시험 값으로 (영어·한국사 절대평가 등 표기만 1년 틀린 것)
    exam_by_name = {(x.get("curriculum"), x["gradeYear"], x["type"], x.get("studentGrade"), x["subject"], x.get("subSubject")): x
                    for x in exams if x.get("typeGroup") == "education"}
    for c in cuts:
        x = c["typeGroup"] == "education" and exam_by_name.get(name(c))
        if x and x.get("examYear") and c.get("examYear") != x["examYear"]:
            log["examYear-label"].append({"id": c["id"], "before": c.get("examYear"), "after": x["examYear"]})
            c["examYear"] = x["examYear"]
    (ROOT / "data/gradecuts.json").write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n")
    (OUT_DIR / "edu-year-fix-log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1) + "\n")
    print({k: len(v) for k, v in log.items()})


if __name__ == "__main__":
    main()
