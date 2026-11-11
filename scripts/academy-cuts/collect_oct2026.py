#!/usr/bin/env python3
"""2026-10 학평(고1·2·3) 입시기관 등급컷을 data/raw/academy-cuts/{ebsi,etoos,jongro,daesung}.json 에 합친다 (2026-11-11 일회성 수집 기록).

EBSi=retrieveGrdCut(irecord 2026102NN), 이투스=sub14.asp(고3, 표 순서: 화작·언매·확통·미적·기하·탐구…),
종로=collect_jongro.py, 대성=collect_daesung.py(groupNo 449~451). 메가스터디는 로그인 필요라 별도.
"""
import json, re, sys, time, urllib.request
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(Path.home() / "Workspace/kice_archive"))
from common import OUT_DIR, record, to_int  # noqa
import collect_daesung as D, collect_jongro as J  # noqa
from scraper_edu.score_ebsi import fetch_grade_cuts  # noqa
from lxml import html  # noqa

Y, M = 2026, 10
SOCIAL = {"생활과윤리", "윤리와사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와법", "사회·문화", "통합사회"}
SCIENCE = {"물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ", "통합과학"}


def nm(s):
    return re.sub(r"\s+", "", s or "").replace("I", "Ⅰ")


def area_sub(name):
    n = nm(name)
    if n in SOCIAL: return "사회탐구", n
    if n in SCIENCE: return "과학탐구", n
    return None, n


def ebsi():
    out, tables = [], {}
    for ir in ("202610201", "202610202", "202610203"):
        g = int(ir[-1]); url = f"https://www.ebsi.co.kr/ebs/xip/xipa/retrieveGrdCut.ajax?irecord={ir}&confYn=Y"
        for t in fetch_grade_cuts(ir):
            rows = {r[0]: r for r in t["rows"] if r and (r[0].isdigit() or r[0] == "최고점")}
            single = t["headers_rows"][0][1] == "작년컷"
            els = [None] if single else t["headers_rows"][1]
            k = len(els)
            for i, el in enumerate(els):
                ri, si, pi = (2, 3, 4) if single else (1 + i, 1 + k, 2 + k)
                c = lambda gr, j: to_int(rows[str(gr)][j]) if str(gr) in rows and j < len(rows[str(gr)]) else None
                raw = [c(x, ri) for x in range(1, 9)]; std = [c(x, si) for x in range(1, 9)]; pct = [c(x, pi) for x in range(1, 9)]
                top = {"raw": c("최고점", ri) if "최고점" in rows else None, "std": c("최고점", si) if "최고점" in rows else None, "pct": c("최고점", pi) if "최고점" in rows else None}
                name = t["subject_name"]
                area, sub = area_sub(name)
                if area: subj, sb = area, sub
                elif name in ("국어", "수학", "영어", "한국사"): subj, sb = name, (nm(el) if el else None)
                else: continue
                if subj in ("영어", "한국사"): continue
                rec = record("ebsi", Y, M, g, subj, sb, raw, std, pct, top=top, url=url)
                out.append(rec)
                if g == 3 and area: tables[(tuple(std), top["std"])] = (area, sub)
    return out, tables


def etoos(tables):
    url = "https://www.etoos.com/report/exam/20261020/sub14.asp?Grd=3"
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("cp949", "replace")
    t = html.fromstring(raw); out = []; order = [("국어", "화법과작문"), ("국어", "언어와매체"), ("수학", "확률과통계"), ("수학", "미적분"), ("수학", "기하")]; n = 0
    for tb in t.xpath('//table[contains(@class,"fullsr_table")]'):
        rows = [[c.text_content().strip() for c in tr.xpath("./th|./td")] for tr in tb.xpath(".//tr")]
        if len(rows) < 10 or rows[0][:2] != ["등급", "원점수"]: continue
        by = {r[0].replace("등급", ""): r for r in rows[1:]}
        top = rows[1]
        rawc = [to_int(re.split(r"~", by[str(g)][1])[0]) if str(g) in by else None for g in range(1, 9)]
        std = [to_int(by[str(g)][2]) if str(g) in by else None for g in range(1, 9)]
        pct = [to_int(by[str(g)][3]) if str(g) in by else None for g in range(1, 9)]
        if n < 5: subj, sb = order[n]
        else:
            key = (tuple(std), to_int(top[2]))
            if key in tables: subj, sb = tables[key]
            else:  # 등급 구멍(None) 자리는 무시하고 표점·최고점으로 맞춘다
                hit = [v for (sv, tp), v in tables.items() if tp == to_int(top[2])
                       and all(a == b for a, b in zip(sv, std) if a is not None and b is not None)]
                if len(hit) != 1: n += 1; continue
                subj, sb = hit[0]
        n += 1
        out.append(record("etoos", Y, M, 3, subj, sb, rawc, std, pct, top={"raw": to_int(top[1]), "std": to_int(top[2]), "pct": to_int(top[3])}, url=url))
    return out


def jongro():
    out = []
    for g in (1, 2, 3):
        u, t = J.fetch("20261020", g); out += J.parse(t, "20261020", g, u)
    return out


def daesung():
    out = []
    for gno in (449, 450, 451):
        for relm in D.AREA:
            t = D.fetch(gno, relm)
            if t is not None:
                ex = D.exam_of(t)
                if ex and ex[:2] == (Y, M): out += D.parse(t, relm, f"{D.BASE}?groupNo={gno}&examRelm={relm}")
            time.sleep(0.15)
    return out


def megastudy():
    base = "https://www.megastudy.net/Entinfo/total_rankCut"
    hdr = {"User-Agent": "Mozilla/5.0", "Referer": base + "/main.asp", "Content-Type": "application/x-www-form-urlencoded"}

    def post(path, body):
        req = urllib.request.Request(f"{base}/{path}", data=body.encode(), headers=hdr)
        return urllib.request.urlopen(req, timeout=30).read().decode("cp949", "replace")

    out = []
    for g in (1, 2, 3):
        lst = post("main_examNm_ax.asp", f"grdFlg={g}")
        for seq, y, mo, d, typ in re.findall(r"fncSelExamSeq\((\d+),'\d+',\d+\);\">\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\S+)\s*<", lst):
            if (int(y), int(mo)) != (Y, M) or not typ.startswith("학력평가"): continue
            for tab in (1, 2, 3):
                h = html.fromstring(post("main_examRankCut_ax.asp", f"examSeq={seq}&tabNo={tab}"))
                for tb in h.xpath('//table[@class="tb_basic"]'):
                    name = "".join(tb.xpath('.//th[@class="sb_th"]/text()')).strip()
                    rows = [[c.text_content().strip() for c in tr.xpath("./td")] for tr in tb.xpath(".//tbody/tr")]
                    rows = [r for r in rows if r]
                    if not name or not rows: continue
                    by = {x[0].replace("등급", ""): x for x in rows}
                    width = max(len(x) for x in rows)
                    cols = {5: (1, 2, 3), 4: (None, 1, 2), 3: (1, None, None)}.get(width, (1, 2, 3))
                    get = lambda gr, j: to_int(by[gr][j]) if j is not None and gr in by and j < len(by[gr]) else None
                    area = {2: "사회탐구", 3: "과학탐구"}.get(tab)
                    subj, sub = (area, name) if area else (name.split()[0], " ".join(name.split()[1:]) or None)
                    tl = "만점" if "만점" in by else "최고점"
                    top = {"raw": get(tl, cols[0]), "std": get(tl, cols[1]), "pct": get(tl, cols[2])} if tl in by else None
                    out.append(record("megastudy", Y, M, g, subj, sub, [get(str(x), cols[0]) for x in range(1, 9)],
                                      [get(str(x), cols[1]) for x in range(1, 9)], [get(str(x), cols[2]) for x in range(1, 9)],
                                      top=top, url=base + "/main.asp"))
    return out


def merge(source, recs):
    p = OUT_DIR / f"{source}.json"
    old = [r for r in json.loads(p.read_text()) if not (r["examYear"] == Y and r["month"] == M)]
    recs = [r for r in recs if r]
    allr = old + recs
    allr.sort(key=lambda r: (r["examYear"], r["month"], r["studentGrade"], r["subject"], r["subSubject"] or ""))
    p.write_text(json.dumps(allr, ensure_ascii=False, indent=1) + "\n")
    print(source, len(recs), "건 합침")


if __name__ == "__main__":
    e, tables = ebsi(); merge("ebsi", e)
    merge("etoos", etoos(tables)); merge("jongro", jongro()); merge("daesung", daesung()); merge("megastudy", megastudy())
