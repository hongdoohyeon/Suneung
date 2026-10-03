#!/usr/bin/env python3
"""consensus.json(입시기관 5곳 합의값)을 data/gradecuts.json 에 반영 (멱등, 로컬 전용).

반영 규칙
 - 보호: 절대평가 공식 컷, public_dist_verified(공개값→공식 분포 검증), academy_consensus_estimate·
   academy_reverse_calculated(공식 표점 기반 역산), calc-raw(표점 산출식), 공식 원점수 없음 상태 → 그대로 둔다.
 - 단일 과목: 기관 2곳 이상이면 합의값(과반 일치 또는 중앙값). 1곳이면 EBSi·메가스터디(합의 일치율 99%대)만.
 - 2022~ 국어·수학 선택과목: 기관 2곳 이상일 때 중앙값 — 표시에 '선택과목 조합에 따라 다름' 이 붙는다.
 - 평가원 2014~2019·2022~2026 회차는 공식 표준점수 도수분포(~/Workspace/kice_archive)와 모순되면 바꾸지 않는다.
 - 기관 표준점수가 전부 공식값과 어긋난 레코드는 손대지 않고 data/raw/academy-cuts/audit-std-mismatch.json 에 남긴다.
표시: rawCutBasis=academy_consensus, rawCutSources=[기관…], rawCutAgreement=[등급별 같은 값 낸 기관 수]
"""
from __future__ import annotations

import json
import sqlite3
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "official-dist-check"))
from common import OUT_DIR, ROOT  # noqa: E402

GRADECUTS = ROOT / "data/gradecuts.json"
KICE = Path.home() / "Workspace/kice_archive"
PROTECT_BASIS = {"public_dist_verified", "academy_consensus_estimate", "academy_reverse_calculated"}
TRUSTED_SINGLE = {"ebsi", "megastudy"}
ORDER = ["ebsi", "megastudy", "etoos", "jongro", "daesung"]
ET = {"csat": "csat", "june": "mock06", "sept": "mock09"}
SUBJ_CODE = {"국어": "korean", "수학": "math", "영어": "english", "한국사": "khistory",
             "사회탐구": "social", "과학탐구": "science", "직업탐구": "vocation", "제2외국어": "foreign"}


def has(v):
    return isinstance(v, list) and any(x is not None for x in v)


def elective(c):
    return c["subject"] in ("국어", "수학") and c["gradeYear"] >= 2022 and c.get("subSubject")


def protected(c):
    tags = set(str(c.get("source") or "").split("+"))
    return (c.get("absolute") or c.get("rawCutBasis") in PROTECT_BASIS or "calc-raw" in tags
            or c.get("rawCutStatus") == "official_raw_unavailable")


def official_dist(c):
    """평가원 회차의 공식 표준점수 도수분포 {표점: 인원} — 과목명 대응이 하나로 정해질 때만."""
    if c["typeGroup"] != "suneung" or c["type"] not in ET:
        return None
    db = KICE / ("kice_2009.db" if c["gradeYear"] <= 2021 else "kice_2015.db")
    if not db.exists():
        return None
    con = sqlite3.connect(db)
    code = SUBJ_CODE.get(c["subject"])
    rows = con.execute("select distinct subtype from std_distribution where year=? and exam_type=? and subject=?",
                       (c["gradeYear"], ET[c["type"]], code)).fetchall()
    cands = [r[0] for r in rows]
    if not cands:
        return None
    # 시험 키 한 회차 안에서 표준점수 컷이 같은 과목을 찾는다 (subtype 코드 대응표 대신 공식 컷으로 매칭)
    for st in cands:
        cuts = [x for (x,) in con.execute("select cut_score from grade_cuts where year=? and exam_type=? and subject=? and ifnull(subtype,'')=ifnull(?,'') and cut_type='std' and grade<=8 order by grade",
                                           (c["gradeYear"], ET[c["type"]], code, st))]
        if cuts == (c.get("standardCuts") or [])[:8]:
            d = {int(s): int(n) for s, n in con.execute("select std_score,sum(count_total) from std_distribution where year=? and exam_type=? and subject=? and ifnull(subtype,'')=ifnull(?,'') group by std_score",
                                                       (c["gradeYear"], ET[c["type"]], code, st)) if n}
            return d or None
    return None


def feasible_set(job):
    """공식 분포와 모순 없는 원점수 컷 8개 조합 전체 (판정 불가면 None)."""
    cid, c = job
    from lattice import solve
    dist = official_dist(c)
    if not dist or None in c["standardCuts"][:8]:
        return cid, None
    big = c["subject"] in ("국어", "수학", "영어")
    full, C, K = (100, 100, 20) if big else (50, 50, 10)
    sets = [list(range(full + 1))] if c["subject"] == "제2외국어" else \
        [[r for r in range(full + 1) if r not in (1, full - 1)], list(range(full + 1))]
    ok = set()
    for raws in sets:
        ok |= {s[2] for s in solve(dist, full, C, K, c["standardCuts"][:8], raws, ratio=False)}
    return cid, ok or None


def main():
    cons = {x["id"]: x for x in json.loads((OUT_DIR / "consensus.json").read_text())}
    cuts = json.loads(GRADECUTS.read_text())
    plan, audit = {}, []
    for c in cuts:
        x = cons.get(c["id"])
        if not x or protected(c):
            continue
        if not x["sources"]:
            audit.append({"id": c["id"], "gradeYear": c["gradeYear"], "type": c["type"], "studentGrade": c.get("studentGrade"),
                          "subject": c["subject"], "subSubject": c.get("subSubject"), "rejected": x["rejected"]})
            continue
        final = x["final"]
        if not final or any(v is None for v in final):
            continue
        srcs = [k for k in ORDER if k in x["sources"]]
        if len(srcs) == 1 and (elective(c) or srcs[0] not in TRUSTED_SINGLE):
            continue
        if (c.get("rawCuts") or [])[:8] == final and c.get("rawCutBasis") == "academy_consensus" and c.get("rawCutSources") == srcs:
            continue
        plan[c["id"]] = (final, srcs, x["agree"])
    # 공식 도수분포 대조 (평가원 회차, 값이 바뀌는 것만). 합의값이 모순이면 분포를 통과하는 기관 값으로 대체
    jobs = [(c["id"], c) for c in cuts if c["id"] in plan and (c.get("rawCuts") or [])[:8] != plan[c["id"]][0]
            and c["typeGroup"] == "suneung" and not elective(c)]
    with Pool(8) as p:
        fs = dict(p.map(feasible_set, jobs))
    blocked, replaced = [], 0
    for cid, ok in fs.items():
        if ok is None or tuple(plan[cid][0]) in ok:
            continue
        x = cons[cid]
        alt = [tuple(v) for s, v in sorted(x["sources"].items(), key=lambda kv: kv[0] not in TRUSTED_SINGLE) if tuple(v) in ok]
        if alt:
            final = list(alt[0])
            plan[cid] = (final, plan[cid][1], [sum(1 for v in x["sources"].values() if v[g] == final[g]) for g in range(8)])
            replaced += 1
        else:
            blocked.append(cid)
    applied = 0
    for c in cuts:
        if c["id"] not in plan or c["id"] in blocked:
            continue
        final, srcs, agree = plan[c["id"]]
        c["rawCuts"] = final
        c["rawCutBasis"] = "academy_consensus"
        c["rawCutSources"] = srcs
        c["rawCutAgreement"] = agree
        c.pop("rawCutSourceUrl", None)
        tags = [t for t in str(c.get("source") or "").split("+") if t]
        if "academy-consensus" not in tags:
            c["source"] = "+".join(tags + ["academy-consensus"])
        applied += 1
    GRADECUTS.write_text(json.dumps(cuts, ensure_ascii=False, indent=2) + "\n")
    (OUT_DIR / "audit-std-mismatch.json").write_text(json.dumps(audit, ensure_ascii=False, indent=1) + "\n")
    checked = sum(1 for v in fs.values() if v is not None)
    print(f"반영 {applied}건 · 공식 분포 대조 {checked}건 중 기관 값으로 대체 {replaced}건·보류 {len(blocked)}건 · 표점 불일치 점검목록 {len(audit)}건")
    if blocked:
        print("  보류:", blocked[:20])


if __name__ == "__main__":
    main()
