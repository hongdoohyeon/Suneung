#!/usr/bin/env python3
"""공식 교체가 안 된 미러 파일의 검증 상태를 CSV 로 만든다(로컬 전용). 입력: identity.json·quality-mirror.json·verify-pairs.json·match-official.json"""
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
T = ROOT / "tmp/source-audit"
it = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
ident = {(r["id"], r["field"]): r for r in json.loads((T / "identity.json").read_text(encoding="utf-8"))}
qual = {(r["id"], r["field"]): r for r in json.loads((T / "quality-mirror.json").read_text(encoding="utf-8"))}
pairs = {(r["id"], r["field"]): r for r in json.loads((T / "verify-pairs.json").read_text(encoding="utf-8"))}
match = {(r["id"], r["field"]): r for r in json.loads((T / "match-official.json").read_text(encoding="utf-8"))}
OLD = {tuple(x) for x in json.loads((T / "old-csat-verified.json").read_text(encoding="utf-8"))}
rows = []
for i in it:
    for f in ("questionUrl", "answerUrl", "solutionUrl", "scriptUrl"):
        u = i.get(f)
        m = re.match(r"https://suneung-files\.hdh061224\.workers\.dev/([^/]+)/", u or "")
        if not m or not m.group(1).startswith(("daum-mirror", "legacy")):
            continue
        k = (i["id"], f)
        q, idn, pr, mt = qual.get(k, {}), ident.get(k, {}), pairs.get(k), match.get(k, {})
        if (i["id"], f) in OLD:
            st = "검증됨: 평가원 게시판 원본 스캔과 쪽 이미지 일치(원본에서 잘라낸 분리본)"
        elif any(x.startswith(("OPEN_FAIL", "NO_PAGES")) for x in q.get("flags", [])):
            st = "문제: 열리지 않음/빈 파일"
        elif pr and pr["ext"] == "hwp":
            c = pr.get("offInMirror") or 0
            st = (f"검증됨: 공식 HWP 본문이 미러에 포함(일치율 {c * 100:.0f}%)" if pr["verdict"] == "SAME" or c >= 0.75 else
                  "검증불가: 공식 HWP 3.0·읽기 실패" if pr["verdict"] == "ERROR" else
                  "검증불가: 공식 HWP에 본문 글자 없음(답안표 등)" if pr["verdict"] == "NO_TEXT" else
                  f"확인필요: 공식 HWP와 일치율 낮음({c * 100:.0f}%)")
        elif idn.get("status") == "OK":
            st = "검증됨: 첫 쪽 글자로 학년도·영역 확인"
        elif idn.get("status") == "SKIP_NO_TEXT":
            st = "검증불가: 글자층 없는 스캔본(쪽수·형태만 확인)"
        elif idn.get("status") == "CHECK":
            st = "부분검증: 머리글에 과목명 없음(본문 글자는 정상)"
        else:
            st = "점검 누락(대본·해설 등)"
        why = mt.get("reason") or ("공식 파일이 HWP뿐" if mt.get("official") else "")
        rows.append([i["id"], i["typeGroup"], i["gradeYear"], i.get("month"), i["subject"], i.get("subSubject") or "", f, st, why, u.split("?")[0]])
with open(ROOT / "docs/비공식-잔여-파일-검증-20261001.csv", "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["id", "구분", "학년도", "월", "과목", "세부과목", "파일종류", "검증상태", "공식 교체 불가 사유", "URL"])
    w.writerows(rows)
print(len(rows), Counter(r[7].split("(")[0] for r in rows).most_common())
