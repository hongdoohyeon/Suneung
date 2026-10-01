#!/usr/bin/env python3
"""남은 비공식(미러) 파일이 메타데이터의 시험이 맞는지 첫 쪽 글자로 대조한다(로컬 전용).

학년도(학평은 시행연도 또는 학년도), 월(6월·9월·10월 등), 영역·과목 이름이 첫 2쪽 글자에 보이는지 본다. 글자층이 없는 스캔본은 SKIP.
"""
import hashlib
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp/source-audit/cache"


def tag(u):
    m = re.match(r"https://suneung-files\.hdh061224\.workers\.dev/([^/]+)/", u or "")
    return m.group(1) if m else ""


def main():
    items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    out = []
    for it in items:
        for key in ("questionUrl", "answerUrl"):
            u = it.get(key)
            if not u or not tag(u).startswith(("daum-mirror", "legacy")):
                continue
            p = CACHE / (hashlib.sha1(u.split("?")[0].encode()).hexdigest()[:16] + ".pdf")
            rec = {"id": it["id"], "field": key, "typeGroup": it["typeGroup"], "gradeYear": it["gradeYear"], "examYear": it.get("examYear"),
                   "month": it.get("month"), "subject": it["subject"], "subSubject": it.get("subSubject"), "url": u.split("?")[0], "issues": []}
            try:
                d = fitz.open(p)
                t = re.sub(r"\s+", "", "".join(pg.get_text() for pg in d[:2]))
            except Exception as e:  # noqa: BLE001
                rec["issues"].append("OPEN:" + str(e)[:50])
                out.append(rec)
                continue
            if len(t) < 80:
                rec["status"] = "SKIP_NO_TEXT"
                out.append(rec)
                continue
            ys = {int(y) for y in re.findall(r"(19\d\d|20\d\d)학년도", t)}
            if ys and not ({it["gradeYear"], it.get("examYear")} & ys):
                rec["issues"].append(f"YEAR:{sorted(ys)}")
            ms = {int(x) for x in re.findall(r"(\d{1,2})월", t[:400])}
            if it.get("month") and ms and it["month"] not in ms and it["typeGroup"] in ("suneung", "education"):
                rec["issues"].append(f"MONTH:{sorted(ms)}")
            sub = re.sub(r"[\sⅠⅡ·IV12]", "", (it.get("subSubject") or "")).replace("물리학", "물리").replace("생명과학", "생물")
            base = it["subject"].replace("탐구", "")
            tt = t.replace("물리학", "물리").replace("생명과학", "생물")
            if sub and sub not in tt and not re.fullmatch(r"[A-Z가나]형", sub):
                rec["issues"].append(f"SUB:{sub}")
            elif not sub and base[:2] not in t and it["subject"] not in ("국어", "수학", "영어", "한국사"):
                rec["issues"].append(f"AREA:{base}")
            rec["status"] = "OK" if not rec["issues"] else "CHECK"
            out.append(rec)
    (ROOT / "tmp/source-audit/identity.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(Counter(r.get("status", "ERR") for r in out))
    for r in [x for x in out if x.get("status") == "CHECK"][:25]:
        print(r["id"], r["gradeYear"], r["month"], r["subject"], r["subSubject"], r["field"], r["issues"])


if __name__ == "__main__":
    main()
