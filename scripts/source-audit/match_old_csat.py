#!/usr/bin/env python3
"""1999~2004학년도 수능 legacy-csat-v2 분리본이 평가원 게시판 원본 스캔의 어느 쪽에서 잘려 나왔는지 쪽 이미지로 찾는다(로컬 전용)."""
import hashlib
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
OFF = ROOT / "tmp/source-audit/official"
CACHE = ROOT / "tmp/source-audit/cache"
W, H = 40, 56


def thumb(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(W / page.rect.width, H / page.rect.height), colorspace=fitz.csGRAY)
    return list(pix.samples[: W * H])


def corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) ** .5
    vb = sum((x - mb) ** 2 for x in b) ** .5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb) if va and vb else 0


def main():
    items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    man = json.loads((OFF / "manifest.json").read_text(encoding="utf-8")) + json.loads((OFF / "manifest-1994-2002.json").read_text(encoding="utf-8"))
    pool = {}
    for p in man:
        if p["board"] in ("csat", "csat_old") and 1999 <= int(p["year"]) <= 2004:
            for f in p["files"]:
                if f["name"].lower().endswith(".pdf") and "error" not in f:
                    pool.setdefault(p["year"], {})[f"{p['dir']}/{f['name']}"] = f
    cache = {}

    def thumbs(path):
        if path not in cache:
            d = fitz.open(ROOT / path)
            cache[path] = [thumb(pg) for pg in d]
        return cache[path]
    out = []
    for it in items:
        if it["typeGroup"] != "suneung" or it["type"] != "csat" or not 1999 <= it["gradeYear"] <= 2004:
            continue
        for key in ("questionUrl", "answerUrl"):
            u = it.get(key) or ""
            if "/legacy-csat-v2/" not in u:
                continue
            p = CACHE / (hashlib.sha1(u.split("?")[0].encode()).hexdigest()[:16] + ".pdf")
            rec = {"id": it["id"], "field": key, "year": it["gradeYear"], "subject": it["subject"], "sub": it.get("subSubject"), "url": u.split("?")[0]}
            try:
                d = fitz.open(p)
                lt = [thumb(pg) for pg in d]
            except Exception as e:  # noqa: BLE001
                rec["error"] = str(e)[:60]
                out.append(rec)
                continue
            best = (0, None, None)
            for path in pool.get(str(it["gradeYear"]), {}):
                ot = thumbs(path)
                for s in range(0, max(1, len(ot) - len(lt) + 1)):
                    k = min(len(lt), 3, len(ot) - s)
                    if k <= 0:
                        continue
                    cs = [corr(lt[i], ot[s + i]) for i in range(k)]
                    sc = sum(cs) / len(cs)
                    if sc > best[0]:
                        best = (sc, path, s)
            rec.update(pages=len(lt), score=round(best[0], 3), official=best[1], startPage=best[2])
            out.append(rec)
    (ROOT / "tmp/source-audit/old-csat-match.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = [r for r in out if r.get("score", 0) >= 0.9]
    print(len(out), "중 쪽 이미지 일치(>=0.9)", len(ok))


if __name__ == "__main__":
    main()
