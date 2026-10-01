#!/usr/bin/env python3
"""미러 PDF 와 짝지어진 평가원 공식 파일(PDF·HWP)의 내용을 대조한다(로컬 전용).

분류: SAME(양방향 5글자 조각 일치율 모두 0.85 이상) / DIFF / NO_TEXT(어느 쪽이든 글자층이 없어 비교 불가) / ERROR
"""
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).parent))
from hwp_text import coverage, hwp_text, norm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp/source-audit/cache"


def pdf_text(p):
    return "".join(pg.get_text() for pg in fitz.open(p))


def one(r):
    o = r["official"]
    res = {"id": r["id"], "field": r["field"], "official": o["path"], "ext": o["ext"], "mirror": r["mirror"]}
    try:
        mp = CACHE / (hashlib.sha1(r["mirror"].encode()).hexdigest()[:16] + ".pdf")
        mt = pdf_text(mp)
        op = ROOT / o["path"]
        ot = pdf_text(op) if o["ext"] == "pdf" else hwp_text(str(op))
        res.update(mirrorChars=len(norm(mt)), officialChars=len(norm(ot)))
        if len(norm(mt)) < 60 or len(norm(ot)) < 60:
            res["verdict"] = "NO_TEXT"
        else:
            a, b = coverage(ot, mt), coverage(mt, ot)
            res.update(offInMirror=round(a, 3), mirrorInOff=round(b, 3))
            res["verdict"] = "SAME" if min(a, b) >= 0.85 else "DIFF"
        if o["ext"] == "pdf":
            res["pages"] = [fitz.open(mp).page_count, fitz.open(op).page_count]
    except Exception as e:  # noqa: BLE001
        res.update(verdict="ERROR", error=str(e)[:100])
    return res


def main():
    m = json.loads((ROOT / "tmp/source-audit/match-official.json").read_text(encoding="utf-8"))
    todo = [r for r in m if r["official"]]
    with ThreadPoolExecutor(4) as ex:
        out = list(ex.map(one, todo))
    (ROOT / "tmp/source-audit/verify-pairs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(Counter((r["ext"], r["verdict"]) for r in out))


if __name__ == "__main__" and len(sys.argv) == 1:
    main()


def thumb(p, page, w=64, h=88):
    pg = fitz.open(p)[page]
    pix = pg.get_pixmap(matrix=fitz.Matrix(w / pg.rect.width, h / pg.rect.height), colorspace=fitz.csGRAY)
    return list(pix.samples[: pix.width * pix.height]), pix.width * pix.height


def corr(a, b):
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) ** 0.5
    vb = sum((x - mb) ** 2 for x in b) ** 0.5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb) if va and vb else 0.0


def visual(r):
    """글자 비교가 안 되는 쌍: 쪽수가 같으면 앞 3쪽 축소 이미지의 상관계수 평균."""
    mp = CACHE / (hashlib.sha1(r["mirror"].encode()).hexdigest()[:16] + ".pdf")
    op = ROOT / r["official"]
    a, b = fitz.open(mp), fitz.open(op)
    if a.page_count != b.page_count:
        return {"visual": None, "pageCounts": [a.page_count, b.page_count]}
    cs = [corr(thumb(mp, i)[0], thumb(op, i)[0]) for i in range(min(3, a.page_count))]
    return {"visual": round(sum(cs) / len(cs), 3), "pageCounts": [a.page_count, b.page_count]}


def visual_pass():
    p = ROOT / "tmp/source-audit/verify-pairs.json"
    v = json.loads(p.read_text(encoding="utf-8"))
    for r in v:
        if r["ext"] == "pdf" and r["verdict"] in ("NO_TEXT", "DIFF"):
            try:
                r.update(visual(r))
            except Exception as e:  # noqa: BLE001
                r["visualError"] = str(e)[:80]
    p.write_text(json.dumps(v, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(Counter((r["verdict"], None if r.get("visual") is None else ("vis>=.85" if r["visual"] >= .85 else "vis<.85")) for r in v if r["ext"] == "pdf"))


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "visual":
    visual_pass()
