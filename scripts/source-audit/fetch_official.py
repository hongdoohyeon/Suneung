#!/usr/bin/env python3
"""평가원 게시판(수능 기출·모의평가) 첨부를 모두 내려받아 풀어 둔다. 로컬 전용(tmp/source-audit/official/).

입력: data/kice-catalog.json (게시판 목록 — 게시물별 fileSeq·파일명)
출력: tmp/source-audit/official/{수능|모평}/{학년도}-{회차}-{영역}/{풀린 파일들}, manifest.json (sha256·원본 파일명·게시물 번호)
mp3·exe 는 받지 않는다.
"""
import concurrent.futures as cf
import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tmp/source-audit/official"
UA = "Mozilla/5.0 (compatible; kicegg-source-audit/1.0)"
SKIP = (".mp3", ".exe", ".wav")


def dec(n: str) -> str:
    try:
        return n.encode("cp437").decode("cp949")
    except Exception:  # noqa: BLE001
        return n


def safe(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip()


def work(job):
    board, post = job
    base = OUT / ("수능" if board in ("csat", "csat_old") else "모평") / f"{post['gradeYear']}-{post['round']}-{safe(post['subject'])}-{post['postId']}"
    recs = []
    for f in post["files"]:
        name = f["fileName"]
        if name.lower().endswith(SKIP):
            continue
        try:
            req = urllib.request.Request("https://suneung.re.kr/boardCnts/fileDown.do?fileSeq=" + f["fileSeq"], headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=120).read()
        except Exception as e:  # noqa: BLE001
            recs.append({"post": post["postId"], "name": name, "error": str(e)[:80]})
            continue
        base.mkdir(parents=True, exist_ok=True)
        if name.lower().endswith(".zip") and data[:2] == b"PK":
            try:
                z = zipfile.ZipFile(io.BytesIO(data))
                for i in z.infolist():
                    if i.is_dir() or i.filename.lower().endswith(SKIP):
                        continue
                    n = safe(dec(i.filename).split("/")[-1])
                    body = z.read(i)
                    (base / n).write_bytes(body)
                    recs.append({"post": post["postId"], "zip": name, "name": n, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
                continue
            except Exception as e:  # noqa: BLE001
                recs.append({"post": post["postId"], "name": name, "error": "zip:" + str(e)[:60]})
        n = safe(name)
        (base / n).write_bytes(data)
        recs.append({"post": post["postId"], "name": n, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return {"board": board, "year": post["gradeYear"], "round": post["round"], "subject": post["subject"], "postId": post["postId"],
            "dir": str(base.relative_to(ROOT)), "files": recs}


def main():
    cat = json.loads((ROOT / "data/kice-catalog.json").read_text(encoding="utf-8"))["boards"]
    ymin = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    jobs = [(b, p) for b in ("csat", "csat_old", "mock") for p in cat[b] if int(p["gradeYear"]) >= ymin]
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"{len(jobs)}개 게시물", file=sys.stderr)
    out = []
    with cf.ThreadPoolExecutor(6) as ex:
        for i, r in enumerate(ex.map(work, jobs), 1):
            out.append(r)
            if i % 40 == 0:
                print(f"  {i}/{len(jobs)}", file=sys.stderr)
    (OUT / "manifest.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("완료", sum(len(r["files"]) for r in out), "파일")


if __name__ == "__main__":
    main()
