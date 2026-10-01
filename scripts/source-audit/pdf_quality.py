#!/usr/bin/env python3
"""exams.json 의 PDF 링크를 내려받아 깨짐·내용 불일치를 자동 점검한다 (로컬 전용, 산출물은 tmp/source-audit/).

점검 항목
  open       열리는가 / 쪽수
  text       쪽당 추출 글자 수, 한글 비율, 깨진 글자(U+FFFD·사용자 정의 영역·cid) 비율
  blank      렌더링한 쪽 중 거의 비어 있는 쪽 비율(저해상도 렌더로 잉크 비율 측정)
  identity   첫 쪽에서 학년도·영역을 읽어 메타데이터와 대조
사용:
  python3 scripts/source-audit/pdf_quality.py --select hwp-converted|mirror|all [--limit N] [--out tmp/source-audit/x.json]
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp/source-audit/cache"
UA = "kicegg-source-audit/1.0 (+https://kicegg.com)"
FIELDS = (("questionUrl", "문제지"), ("answerUrl", "정답"), ("solutionUrl", "해설"), ("scriptUrl", "대본"))


def tag_of(u: str) -> str:
    m = re.match(r"https://suneung-files\.hdh061224\.workers\.dev/([^/]+)/", u or "")
    if m:
        return m.group(1)
    m = re.match(r"https://github\.com/[^/]+/[^/]+/releases/download/([^/]+)/", u or "")
    if m:
        return m.group(1)
    m = re.match(r"https?://([^/]+)", u or "")
    return m.group(1) if m else ""


def select(items, mode):
    out = []
    for it in items:
        for key, lab in FIELDS:
            u = it.get(key)
            if not u or u.split("?")[0].lower().endswith((".hwp", ".hwpx", ".zip")):
                continue
            t = tag_of(u)
            conv = bool(it.get(key + "_hwp_original")) or t.startswith("hwp-pdf") or \
                (it.get(key.replace("Url", "Download")) or "").lower().endswith((".hwp", ".hwpx"))
            mirror = t.startswith(("daum-mirror", "legacy"))
            if mode == "all" or (mode == "hwp-converted" and conv) or (mode == "mirror" and mirror):
                out.append((it, key, lab, u, t, conv, mirror))
    return out


def fetch(u: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(u.split("?")[0].encode()).hexdigest()[:16] + ".pdf")
    if p.exists() and p.stat().st_size > 0:
        return p
    req = urllib.request.Request(u.split("?")[0], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        p.write_bytes(r.read())
    return p


EQ_LEAK = re.compile(r"¿|BIGCIRC|\brm[A-Z]|\b(PMATRIX|ANGLE|OVER|SQRT|CDOT)\b")
BAD = re.compile("[�-]|\\(cid:\\d+\\)")
HANGUL = re.compile("[가-힣]")


def check(task):
    it, key, lab, u, t, conv, mirror = task
    rec = {"id": it["id"], "field": key, "label": lab, "tag": t, "hwpConverted": conv, "mirror": mirror,
           "typeGroup": it["typeGroup"], "gradeYear": it["gradeYear"], "type": it.get("type"),
           "subject": it["subject"], "subSubject": it.get("subSubject"), "url": u.split("?")[0], "flags": []}
    try:
        p = fetch(u)
        doc = fitz.open(p)
    except Exception as e:  # noqa: BLE001
        rec["flags"].append("OPEN_FAIL:" + str(e)[:80])
        return rec
    n = doc.page_count
    rec["pages"], rec["bytes"] = n, p.stat().st_size
    if n == 0:
        rec["flags"].append("NO_PAGES")
        return rec
    chars = hang = bad = blank = eq = 0
    first = ""
    per = []
    for i, page in enumerate(doc):
        tx = page.get_text()
        if i == 0:
            first = tx
        chars += len(tx)
        hang += len(HANGUL.findall(tx))
        bad += len(BAD.findall(tx))
        eq += len(EQ_LEAK.findall(tx))
        per.append(len(tx.strip()))
        pix = page.get_pixmap(matrix=fitz.Matrix(0.3, 0.3), colorspace=fitz.csGRAY)
        s = pix.samples
        ink = sum(1 for b in s[::3] if b < 200) / max(1, len(s[::3]))
        if ink < 0.004:
            blank += 1
    rec.update({"chars": chars, "hangulRatio": round(hang / chars, 3) if chars else 0, "badRatio": round(bad / chars, 4) if chars else 0,
                "blankPages": blank, "eqLeak": eq, "emptyTextPages": sum(1 for x in per if x < 20)})
    if chars < 80 * n:
        rec["flags"].append("LOW_TEXT")
    if chars and bad / chars > 0.01:
        rec["flags"].append("GARBLED")
    if lab in ("문제지", "해설") and chars and hang / chars < 0.2 and it["subject"] not in ("영어", "제2외국어"):
        rec["flags"].append("LOW_HANGUL")
    if eq >= 2:
        rec["flags"].append(f"EQ_LEAK:{eq}")
    if blank:
        rec["flags"].append(f"BLANK_PAGES:{blank}")
    # 식별: 학년도
    ys = set(int(x) for x in re.findall(r"(20\d\d|19\d\d)\s*학년도", first))
    if ys and it["gradeYear"] not in ys:
        rec["flags"].append(f"YEAR_MISMATCH:{sorted(ys)}")
    rec["firstText"] = re.sub(r"\s+", " ", first)[:120]
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--select", default="hwp-converted")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    tasks = select(items, a.select)
    if a.limit:
        tasks = tasks[: a.limit]
    print(f"{len(tasks)}개 파일 점검 ({a.select})", file=sys.stderr)
    out = []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(check, tasks), 1):
            out.append(r)
            if i % 50 == 0:
                print(f"  {i}/{len(tasks)}", file=sys.stderr)
    dst = Path(a.out or ROOT / f"tmp/source-audit/quality-{a.select}.json")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    flagged = [r for r in out if r["flags"]]
    print(f"완료: {len(out)}개 중 플래그 {len(flagged)}개 → {dst}")


if __name__ == "__main__":
    main()
