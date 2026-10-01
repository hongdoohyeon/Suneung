#!/usr/bin/env python3
"""미러 출처 파일을 평가원 게시판 공식 파일과 짝짓는다(로컬 전용).

입력: data/exams.json, tmp/source-audit/official/manifest.json (fetch_official.py 산출물)
출력: tmp/source-audit/match-official.json — 항목별 {id, field, mirrorUrl, official: {path, name, post, ext, sha256}|None, reason}
짝짓기 규칙: 같은 학년도·회차(수능/6월/9월)·영역 게시물 안에서 파일명을 정규화(공백·기호 제거, I/1→Ⅰ, II/2→Ⅱ, 물리학→물리,
  생명과학→생물)해 문서 종류(문제/정답/대본)와 세부과목 이름이 정확히 같은 파일 하나만 짝으로 인정한다. 둘 이상이면 보류.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OFF = ROOT / "tmp/source-audit/official"
ROUND = {"csat": "수능", "june": "6월", "sept": "9월"}
AREA = {  # 항목 영역 → 게시물 영역 후보
    "국어": ["국어", "언어"], "수학": ["수학", "수리"], "영어": ["영어", "외국어"], "한국사": ["한국사", "국사"],
    "사회탐구": ["사회탐구"], "과학탐구": ["과학탐구"], "직업탐구": ["직업탐구"], "제2외국어": ["제2외국어/한문"],
}
STRIP = ("제Ⅱ외국어", "제2외국어한문영역", "답안지", "답안", "사회탐구영역", "과학탐구영역", "직업탐구영역", "제2외국어한문영역", "제2외국어", "사회탐구", "과학탐구", "직업탐구",
         "사탐", "과탐", "직탐", "영역", "문제지", "정답표", "정답", "문제", "최종본", "탐구", "교시")


def canon(s: str) -> str:
    s = re.sub(r"\.[A-Za-z]{2,4}$", "", s)
    s = re.sub(r"[\s·ㆍ_\-\(\)\[\]]+", "", s)
    s = s.replace("II", "Ⅱ").replace("I", "Ⅰ")
    s = re.sub(r"(?<=[가-힣])1(?!\d)", "Ⅰ", s)
    s = re.sub(r"(?<=[가-힣])2(?!\d)", "Ⅱ", s)
    s = s.replace("물리학", "물리").replace("생명과학", "생물").replace("법과정치", "법과정치")
    s = re.sub(r"(독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어|한문)Ⅰ", r"\1", s)
    s = s.replace("기초베트남어", "베트남어").replace("한국사", "국사")
    return s


def kind_of(name: str, zipname: str = ""):
    n = re.sub(r"\s", "", zipname + "|" + name)
    if re.search(r"듣기대본|대본", n):
        return "scriptUrl"
    if re.search(r"정답|답안|해설", n):
        return "answerUrl"
    return "questionUrl"


def key_of(name: str, area_words) -> str:
    name = re.sub(r"\d{4}\s*학년도", "", name)
    s = canon(re.sub(r"^\d+\s*[\._\s]*", "", name))
    s = re.sub(r"^\d+", "", s)
    s = re.sub(r"\d{4}학년도", "", s)
    s = re.sub(r"\d{1,2}월", "", s)
    for w in ("대학수학능력시험", "모의평가", "평가원", "수능", "듣기", "대본", "정답지", "최종"):
        s = s.replace(w, "")
    for w in STRIP + tuple(area_words):
        s = s.replace(w, "")
    s = re.sub(r"\d+", "", s) if re.fullmatch(r"\d+", s) else s
    return s


def main():
    items = json.loads((ROOT / "data/exams.json").read_text(encoding="utf-8"))
    man = json.loads((OFF / "manifest.json").read_text(encoding="utf-8"))
    posts = {}
    for p in man:
        posts.setdefault((p["year"], p["round"], p["subject"]), []).append(p)
    audit = json.loads((ROOT / "tmp/source-audit/quality-mirror.json").read_text(encoding="utf-8"))
    targets = {(r["id"], r["field"]): r for r in audit}
    out = []
    for it in items:
        if it["typeGroup"] != "suneung" or it["type"] not in ROUND:
            continue
        for field in ("questionUrl", "answerUrl", "scriptUrl", "solutionUrl"):
            if (it["id"], field) not in targets:
                continue
            tr = targets[(it["id"], field)]
            rec = {"id": it["id"], "field": field, "gradeYear": it["gradeYear"], "type": it["type"], "subject": it["subject"],
                   "subSubject": it.get("subSubject"), "mirror": tr["url"], "mirrorFlags": tr["flags"], "official": None, "reason": ""}
            out.append(rec)
            if field not in ("questionUrl", "answerUrl", "scriptUrl"):
                rec["reason"] = "해설은 평가원 게시판에 없음"
                continue
            areas = AREA.get(it["subject"])
            cands = []
            for a in areas or []:
                for p in posts.get((str(it["gradeYear"]), ROUND[it["type"]], a), []):
                    cands.append(p)
            if not cands:
                rec["reason"] = "해당 학년도·회차·영역 게시물 없음"
                continue
            want = canon(it["subSubject"] or "")
            want = re.sub(r"^(국어|수학)", "", want)
            area_words = tuple(w for w in (areas or []))
            hits = []
            for p in cands:
                for f in p["files"]:
                    if "error" in f or f["name"].lower().rsplit(".", 1)[-1] not in ("pdf", "hwp"):
                        continue
                    if kind_of(f["name"], f.get("zip", "")) != field:
                        continue
                    n = re.sub(r"\s", "", f["name"])
                    if "짝수" in n:
                        continue
                    k = key_of(f["name"], area_words)
                    k = re.sub(r"(홀수형?|홀|\d교시)", "", k)
                    k = re.sub(r"^(국어|수학|영어|한국사)", "", k) if it["subject"] in ("국어", "수학", "영어", "한국사") else k
                    if k == want or (not want and k in ("", it["subject"])) or (want and k.replace("형", "") == want.replace("형", "")):
                        hits.append((p, f))
            if len(hits) == 1:
                p, f = hits[0]
                rec["official"] = {"path": f"{p['dir']}/{f['name']}", "name": f["name"], "post": p["postId"], "board": p["board"],
                                   "ext": f["name"].lower().rsplit(".", 1)[-1], "sha256": f["sha256"]}
            else:
                rec["reason"] = "후보 없음" if not hits else f"후보 {len(hits)}개(모호)"
    dst = ROOT / "tmp/source-audit/match-official.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = [r for r in out if r["official"]]
    print(f"미러 {len(out)}개 중 공식 짝 {len(ok)}개 (pdf {sum(1 for r in ok if r['official']['ext'] == 'pdf')}, hwp {sum(1 for r in ok if r['official']['ext'] == 'hwp')}) → {dst}")


if __name__ == "__main__":
    main()
