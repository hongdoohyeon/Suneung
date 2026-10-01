#!/usr/bin/env python3
"""짝지어진 평가원 공식 PDF 로 미러 링크를 교체한다.

  --stage    교체 대상 PDF 를 tmp/source-audit/upload/ 에 ASCII 이름으로 복사하고 계획(plan.json)을 만든다.
  --upload   gh release upload (kice-official-v1) — 이미 올라간 자산은 건너뜀.
  --apply    data/exams.json 의 URL·내려받기 이름·출처 필드를 갱신한다.
이름 규칙: off_{id}_q.pdf / off_{id}_a.pdf, URL = {WORKER}/kice-official-v1/{asset}?name={한글 이름}
"""
import json
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UP = ROOT / "tmp/source-audit/upload"
TAG = "kice-official-v1"
REPO = "hongdoohyeon/Suneung"
WORKER = "https://suneung-files.hdh061224.workers.dev"
RND = {"csat": "수능", "june": "6모", "sept": "9모"}
KIND = {"questionUrl": ("q", "문제지"), "answerUrl": ("a", "정답")}


def dl_name(it, field):
    sub = f"({it['subSubject']})" if it.get("subSubject") else ""
    return f"{it['gradeYear']}학년도 {RND[it['type']]} {it['subject']}{sub} {KIND[field][1]}.pdf"


def plan():
    v = json.loads((ROOT / "tmp/source-audit/verify-pairs.json").read_text(encoding="utf-8"))
    match = {(r["id"], r["field"]): r for r in json.loads((ROOT / "tmp/source-audit/match-official.json").read_text(encoding="utf-8"))}
    items = {i["id"]: i for i in json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))}
    out = []
    for r in v:
        if r["ext"] != "pdf" or r["field"] not in KIND or r["verdict"] == "ERROR":
            continue
        it = items[r["id"]]
        o = match[(r["id"], r["field"])]["official"]
        asset = f"off_{r['id']}_{KIND[r['field']][0]}.pdf"
        board = 1500236 if o["board"] == "mock" else 1500234
        m = "0403" if o["board"] == "mock" else "0402"
        out.append({"id": r["id"], "field": r["field"], "src": r["official"], "asset": asset, "name": dl_name(it, r["field"]),
                    "post": f"https://suneung.re.kr/boardCnts/view.do?boardID={board}&boardSeq={o['post']}&lev=0&m={m}&s=suneung",
                    "verdict": r["verdict"], "oldUrl": it[r["field"]]})
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    p = plan()
    (ROOT / "tmp/source-audit/plan.json").write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    if mode == "--stage":
        UP.mkdir(parents=True, exist_ok=True)
        for x in p:
            shutil.copy(ROOT / x["src"], UP / x["asset"])
        print(f"{len(p)}개 복사 → {UP}")
    elif mode == "--upload":
        have = subprocess.run(["gh", "release", "view", TAG, "--repo", REPO], capture_output=True)
        if have.returncode != 0:
            subprocess.run(["gh", "release", "create", TAG, "--repo", REPO, "--title", "KICE 공식 원본 PDF (교체분)", "--notes",
                            "평가원 게시판(suneung.re.kr) 원본 PDF. 비공식 미러 파일을 대체한다."], check=True)
        listed = subprocess.run(["gh", "release", "view", TAG, "--repo", REPO, "--json", "assets", "-q", ".assets[].name"], capture_output=True, text=True).stdout.split()
        todo = [UP / x["asset"] for x in p if x["asset"] not in set(listed)]
        for i in range(0, len(todo), 40):
            subprocess.run(["gh", "release", "upload", TAG, "--repo", REPO, *map(str, todo[i:i + 40])], check=True)
            print(f"  업로드 {min(i + 40, len(todo))}/{len(todo)}")
    elif mode == "--apply":
        path = ROOT / "data/exams.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        by = {i["id"]: i for i in data}
        n = 0
        for x in p:
            it = by[x["id"]]
            f = x["field"]
            dlk = f.replace("Url", "Download")
            it[f] = f"{WORKER}/{TAG}/{x['asset']}?name={urllib.parse.quote(x['name'], safe='')}"
            it[dlk] = x["name"]
            it[f + "_source_original"] = x["post"]
            if f == "answerUrl":
                it.pop("answerIncludesSolution", None)
            n += 1
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{n}개 필드 갱신")
    else:
        print(f"계획 {len(p)}개")


if __name__ == "__main__":
    main()
