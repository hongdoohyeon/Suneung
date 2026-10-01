#!/usr/bin/env python3
"""HWP→PDF 변환본을 원본 HWP 와 내용 대조한다(원본 HWP 링크가 *_hwp_original 로 남은 것만). 로컬 전용.

coverage = 원본 HWP 텍스트의 5글자 조각 중 변환 PDF 에도 있는 비율. 표·수식·그림은 hwp5txt 가 못 읽으므로
  이 값이 낮으면 변환 중 본문이 빠졌거나 글자가 깨진 것이고, 높아도 수식·그림 손상까지 보장하지는 않는다.
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).parent))
from hwp_text import coverage, hwp_text  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp/source-audit/cache"
UA = "kicegg-source-audit/1.0"


def fetch(u, suffix):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(u.split("?")[0].encode()).hexdigest()[:16] + suffix)
    if not p.exists() or p.stat().st_size == 0:
        req = urllib.request.Request(u.split("?")[0], headers={"User-Agent": UA})
        p.write_bytes(urllib.request.urlopen(req, timeout=90).read())
    return p


def main():
    items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    out = []
    for it in items:
        for key in ("questionUrl", "answerUrl", "solutionUrl"):
            orig = it.get(key + "_hwp_original")
            if not orig or not it.get(key):
                continue
            rec = {"id": it["id"], "field": key, "gradeYear": it["gradeYear"], "typeGroup": it["typeGroup"], "subject": it["subject"], "hwp": orig}
            try:
                hp, pp = fetch(orig, ".hwp"), fetch(it[key], ".pdf")
                ht = hwp_text(str(hp))
                pt = "".join(pg.get_text() for pg in fitz.open(pp))
                from hwp_text import norm
                rec.update(hwpChars=len(norm(ht)), pdfChars=len(norm(pt)), coverage=round(coverage(ht, pt), 3),
                           reverse=round(coverage(pt, ht), 3))
            except Exception as e:  # noqa: BLE001
                rec["error"] = str(e)[:120]
            out.append(rec)
            print(rec.get("coverage"), rec["id"], key, rec.get("error", ""), file=sys.stderr)
    dst = ROOT / "tmp/source-audit/verify-converted.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    low = [r for r in out if r.get("coverage", 0) < 0.9]
    print(f"{len(out)}개 대조, coverage<0.9 {len(low)}개 → {dst}")


if __name__ == "__main__":
    main()
