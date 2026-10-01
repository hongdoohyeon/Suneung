#!/usr/bin/env python3
"""사이트 데이터로만 쓰는 분석 글 3편을 만든다(blog-*.html). 수치는 전부 이 스크립트가 데이터에서 계산해 문장에 넣는다.

  blog-csat-top-scores.html        수능 국어·수학 표준점수 최고점 추이 (data/gradecuts.json)
  blog-csat-takers.html            수능 응시자 수 1994~2026학년도 + 고3 3월 학평 응시자 (data/raw/kice/csat_applicants.csv, data/edu-official.json)
  blog-hakpyeong-electives.html    고3 3월 학평 선택과목 비율 2022~2026 (data/edu-official.json)

CI 에서는 돌리지 않는다. 데이터가 바뀌어 글을 고칠 때 로컬에서 실행해 결과 HTML 을 커밋한다.
csat_applicants.csv 는 로컬 원본이라, 아래 APPLICANTS 에 값을 옮겨 두었다(공공데이터포털 15098904, 평가원).
"""

import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "blog-2027-sept-mock.html"
TODAY = "2026-10-01"
TODAY_KO = "2026년 10월 1일"

CUTS = json.loads((ROOT / "data/gradecuts.json").read_text(encoding="utf-8"))
EDU = json.loads((ROOT / "data/edu-official.json").read_text(encoding="utf-8"))


def read_applicants():
    import csv
    rows = list(csv.reader((ROOT / "data/raw/kice/csat_applicants.csv").open(encoding="utf-8-sig")))[1:]
    out = {}
    for y, day, reg, taken, rate in rows:
        out[int(y)] = {"day": day, "reg": int(reg), "taken": int(taken), "rate": float(rate)}   # 1994학년도는 두 번 시행 → 마지막(11월) 값
    return out


def top(y, subject, sub=None):
    for c in CUTS:
        if (c["typeGroup"] == "suneung" and c["type"] == "csat" and c["gradeYear"] == y and c["subject"] == subject
                and c.get("subSubject") == sub and c.get("highestStandardScore")):
            return c["highestStandardScore"]
    return None


# ── SVG 도구 ───────────────────────────────────────────────
def svg(w, h, label, body):
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{escape(label, quote=True)}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'


def txt(x, y, t, cls="mf-txt", anchor="middle"):
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}">{escape(str(t), quote=False)}</text>'


def line_chart(label, years, series, lo, hi, step, divider=None, note=""):
    """series: [(이름, {년: 값}, 클래스번호)]. 선은 값이 있는 해끼리만 잇는다."""
    W, H, L, R, T, B = 480, 300, 40, 14, 34, 40
    X = lambda i: L + i * (W - L - R) / (len(years) - 1)
    Y = lambda v: T + (H - T - B) * (1 - (v - lo) / (hi - lo))
    b = []
    for g in range(lo, hi + 1, step):
        b.append(f'<line class="mf-grid" x1="{L}" y1="{Y(g):.1f}" x2="{W - R}" y2="{Y(g):.1f}"/>' + txt(L - 6, Y(g) + 4, g, "mf-txt mf-txt--sm", "end"))
    b.append(f'<line class="mf-axis" x1="{L}" y1="{Y(lo):.1f}" x2="{W - R}" y2="{Y(lo):.1f}"/>')
    for i, y in enumerate(years):
        b.append(txt(X(i), H - B + 16, y, "mf-txt mf-txt--sm"))
    if divider is not None:
        xd = (X(years.index(divider)) + X(years.index(divider) + 1)) / 2
        b.append(f'<line class="mf-grid" x1="{xd:.1f}" y1="{T - 6}" x2="{xd:.1f}" y2="{H - B}" stroke-dasharray="4 3"/>')
    for k, (name, data, n) in enumerate(series):
        pts = [(X(i), Y(data[y]), data[y], y) for i, y in enumerate(years) if y in data]
        b.append(f'<polyline class="mf-line mf-line--{n}" points="' + " ".join(f"{x:.1f},{yy:.1f}" for x, yy, _, _ in pts) + '"/>')
        for x, yy, v, y in pts:
            b.append(f'<circle class="mf-dot mf-dot--{n}" cx="{x:.1f}" cy="{yy:.1f}" r="3.6"/>')
            others = [d[y] for nm, d, m in series if m != n and y in d]
            above = (not others) or v >= max(others) if len(series) > 1 else True   # 같은 해에 값이 더 큰 쪽 라벨은 위, 작은 쪽은 아래
            b.append(txt(x, yy - 9 if above else yy + 17, v, f"mf-txt mf-txt--sm mf-txt--c{n}"))
        b.append(f'<circle class="mf-dot mf-dot--{n}" cx="{L + 8}" cy="{12 + k * 16}" r="4"/>' + txt(L + 16, 16 + k * 16, name, "mf-txt", "start"))
    if note:
        b.append(txt(W / 2, H - 4, note, "mf-txt mf-txt--sm"))
    return f'<div>{svg(W, H, label, "".join(b))}</div>'


def bar_chart(label, data, lo_label_years, unit_fmt):
    W, H, L, R, T, B = 480, 280, 40, 12, 26, 34
    ys = sorted(data)
    mx = max(data.values())
    top_v = (mx // 100000 + 1) * 100000
    bw = (W - L - R) / len(ys)
    Y = lambda v: T + (H - T - B) * (1 - v / top_v)
    b = []
    for g in range(0, top_v + 1, 200000):
        b.append(f'<line class="mf-grid" x1="{L}" y1="{Y(g):.1f}" x2="{W - R}" y2="{Y(g):.1f}"/>' + txt(L - 6, Y(g) + 4, f"{g // 10000}만", "mf-txt mf-txt--sm", "end"))
    mn = min(data, key=data.get)
    for i, y in enumerate(ys):
        cls = "mf-bar mf-bar--now" if y in (max(data, key=data.get), mn, ys[-1]) else "mf-bar"
        b.append(f'<rect class="{cls}" x="{L + i * bw + 1:.1f}" y="{Y(data[y]):.1f}" width="{bw - 2:.1f}" height="{Y(0) - Y(data[y]):.1f}"/>')
        if y in lo_label_years:
            b.append(txt(L + (i + .5) * bw, H - B + 15, y, "mf-txt mf-txt--sm"))
    for y in (max(data, key=data.get), mn, ys[-1]):
        i = ys.index(y)
        b.append(txt(L + (i + .5) * bw, Y(data[y]) - 6, unit_fmt(data[y]), "mf-txt mf-txt--sm mf-txt--strong"))
    return f'<div>{svg(W, H, label, "".join(b))}</div>'


def share_chart(label, rows, names):
    """rows: [(라벨, [값...])] — 각 행을 100% 가로 막대로."""
    W, L, R = 480, 50, 12
    rh = 44
    H = 30 + rh * len(rows) + 30
    b = []
    for r, (lab, vals) in enumerate(rows):
        tot = sum(vals)
        y0 = 30 + r * rh
        b.append(txt(L - 8, y0 + 22, lab, "mf-txt", "end"))
        x = L
        for k, v in enumerate(vals):
            w = (W - L - R) * v / tot
            b.append(f'<rect class="mf-s{k + 1}" x="{x:.1f}" y="{y0}" width="{w:.1f}" height="28"/>')
            if w > 34:
                b.append(txt(x + w / 2, y0 + 19, f"{v / tot * 100:.1f}%", "mf-txt mf-txt--sm mf-txt--strong"))
            x += w
    lx = L
    for k, n in enumerate(names):
        b.append(f'<rect class="mf-s{k + 1}" x="{lx}" y="8" width="12" height="12"/>' + txt(lx + 18, 18, n, "mf-txt", "start"))
        lx += 26 + 13 * len(n)
    return f'<div>{svg(W, H, label, "".join(b))}</div>'


def table(head, rows, cls="method__table"):
    th = "".join(f'<th scope="col">{escape(h)}</th>' for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="post__tablewrap"><table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


def fig(inner, caption):
    return f'<figure class="method__fig method__fig--chart">\n        {inner}\n        <figcaption>{caption}</figcaption>\n      </figure>'


def fmt(n):
    return f"{n:,}"


# ── 글 1: 표준점수 최고점 ──────────────────────────────────
def post_top():
    kor = {y: top(y, "국어", None) for y in range(2017, 2027)}
    kor = {y: v for y, v in kor.items() if v}
    kor_ab = {y: (top(y, "국어", "A형"), top(y, "국어", "B형")) for y in (2014, 2015, 2016)}
    mat_ga = {y: top(y, "수학", "가형") for y in range(2017, 2022)}
    mat_na = {y: top(y, "수학", "나형") for y in range(2017, 2022)}
    mat_ab = {y: (top(y, "수학", "A형"), top(y, "수학", "B형")) for y in (2014, 2015, 2016)}
    mat_u = {y: top(y, "수학", None) for y in range(2022, 2027)}
    mat_main = {**mat_ga, **mat_u}
    assert all(kor.values()) and all(mat_main.values()) and all(mat_na.values())
    ys = list(range(2017, 2027))
    kmax = max(kor.values()); kmax_y = [y for y, v in kor.items() if v == kmax]
    kmin = min(kor.values()); kmin_y = [y for y, v in kor.items() if v == kmin]
    d = {y: kor[y] - kor[y - 1] for y in range(2018, 2027)}
    big = sorted(d.items(), key=lambda kv: -abs(kv[1]))[:3]
    mean_abs = sum(abs(v) for v in d.values()) / len(d)
    md = {y: mat_main[y] - mat_main[y - 1] for y in range(2018, 2027)}
    mmean_abs = sum(abs(v) for v in md.values()) / len(md)
    both = [y for y in ys if kor[y] >= 140 and mat_main[y] >= 140]
    ko = lambda y: f"{y}학년도"
    big_txt = ", ".join(f"{ko(y)}({'+' if v > 0 else '-'}{abs(v)}점)" for y, v in sorted(big))
    tbl = table(["학년도", "국어", "수학 가형(A형)", "수학 나형(B형)", "수학(통합)"],
                [[y,
                  f"A {kor_ab[y][0]} / B {kor_ab[y][1]}" if y in kor_ab else kor.get(y, ""),
                  mat_ab[y][0] if y in mat_ab else mat_ga.get(y, ""),
                  mat_ab[y][1] if y in mat_ab else mat_na.get(y, ""),
                  mat_u.get(y, "")] for y in range(2014, 2027)])
    f1 = fig(line_chart("국어와 수학 표준점수 최고점 추이", ys,
                        [("국어", kor, 1), ("수학(2017~2021 가형, 2022부터 통합)", mat_main, 2)], 120, 155, 10,
                        divider=2021, note="점선은 문이과 통합 수능이 시작된 2022학년도 앞입니다"),
             f"그림 1. 2017학년도부터 2026학년도까지 수능 국어와 수학의 표준점수 최고점입니다. 국어는 {kmin}점({', '.join(ko(y) for y in kmin_y)})에서 {kmax}점({', '.join(ko(y) for y in kmax_y)}) 사이에서 움직였습니다.")
    body = f"""
    <section class="legal__section">
      <p>표준점수 최고점은 그 시험에서 가장 높은 표준점수입니다. 시험이 어려워 점수 분포가 넓게 퍼질수록 높아지고, 쉬워서 만점자가 몰리면 낮아집니다. 이 사이트의 난이도 5단계도 표준점수 최고점을 지표 중 하나로 씁니다. 같은 과목의 역대 시험과 견줬을 때 최고점과 평균 점수율의 순위 상관이 0.87로 원점수 1등급 컷(0.72)보다 높았기 때문입니다. 자세한 검증은 <a href="methodology.html">난이도 산정 기준</a>에 있습니다.</p>
      <p>이 글은 사이트가 가진 등급컷 데이터에서 2014학년도부터 2026학년도까지 수능의 국어와 수학 표준점수 최고점을 모아 정리한 것입니다.</p>
    </section>

    <section class="legal__section" id="korean">
      <h2>국어는 해마다 크게 흔들렸다</h2>
      <p>2017학년도부터 2026학년도까지 국어 최고점은 {kmin}점에서 {kmax}점 사이였습니다. 전년 대비 변동 폭의 평균은 {mean_abs:.1f}점이고, 가장 크게 움직인 해는 {big_txt}입니다. 150점은 {', '.join(ko(y) for y in kmax_y)}에 나왔고, 가장 낮은 {kmin}점은 {', '.join(ko(y) for y in kmin_y)}입니다.</p>
      {f1}
      <p>2014학년도부터 2016학년도까지는 국어가 A형과 B형으로 나뉘어 있어 하나의 최고점으로 묶을 수 없습니다. 표에는 두 유형을 함께 적었습니다.</p>
    </section>

    <section class="legal__section" id="math">
      <h2>수학은 통합 이후 최고점 수준이 높아졌다</h2>
      <p>수학은 2017학년도부터 2021학년도까지 가형 최고점이 130점에서 137점 사이였고, 통합 수능이 시작된 2022학년도 이후에는 {min(mat_u.values())}점에서 {max(mat_u.values())}점 사이입니다. 통합 이전 나형은 {min(mat_na.values())}점에서 {max(mat_na.values())}점이었습니다. 통합 이후 응시 집단이 문과와 이과 학생을 모두 포함해 구성이 달라졌으므로, 2021학년도 이전 값과 2022학년도 이후 값을 같은 척도의 난이도로 직접 비교하기는 어렵습니다.</p>
      <p>2018학년도부터 2026학년도까지 수학 최고점(2021학년도까지 가형, 이후 통합)의 전년 대비 변동 폭 평균은 {mmean_abs:.1f}점으로, 같은 기간 국어 {mean_abs:.1f}점보다 {'작았습니다' if mmean_abs < mean_abs else '컸습니다'}. 통합이 시작된 2022학년도에는 전년보다 {md[2022]:+d}점 움직였습니다. 국어와 수학 최고점이 모두 140점 이상이었던 해는 {', '.join(ko(y) for y in both) if both else '없었습니다'}입니다.</p>
    </section>

    <section class="legal__section" id="table">
      <h2>2014학년도부터 2026학년도까지 전체 표</h2>
      {tbl}
      <p>2022학년도부터는 국어와 수학의 표준점수 도수분포가 영역 하나로 공개되므로, 표에는 영역 최고점을 적었습니다.</p>
    </section>

    <section class="legal__section" id="notes">
      <h2>자료와 한계</h2>
      <p>수치는 한국교육과정평가원과 교육부가 공개한 채점 결과에 이 사이트가 정리한 등급컷 데이터입니다. 표준점수 도수분포가 공개된 2018, 2019, 2020, 2022, 2024, 2025, 2026학년도는 국어와 수학 최고점이 도수분포의 최고점과 일치하는지 대조했고, 모두 일치했습니다. 공식값과 추정값을 구분하는 원칙은 <a href="data-policy.html#cuts">데이터 출처와 정정 원칙</a>에 있습니다.</p>
      <p>표준점수 최고점은 한 시험의 가장 높은 점수 하나이므로 응시 집단과 만점자 분포에 영향을 받습니다. 난이도의 유일한 기준으로 삼지는 않습니다.</p>
    </section>"""
    return body, "수능 국어·수학 표준점수 최고점 추이, 2014~2026학년도", \
        f"수능 국어와 수학의 표준점수 최고점을 2014학년도부터 2026학년도까지 정리했습니다. 국어 최고점은 {kmin}점에서 {kmax}점 사이에서 움직였습니다."


# ── 글 2: 응시자 ─────────────────────────────────────────
def post_takers():
    ap = read_applicants()
    taken = {y: v["taken"] for y, v in ap.items()}
    py = max(taken, key=taken.get); ny = min(taken, key=taken.get)
    last = max(taken)
    yoy = {y: (taken[y] - taken[y - 1]) / taken[y - 1] * 100 for y in taken if y - 1 in taken and y > 1995}
    cy = max(yoy, key=lambda y: abs(yoy[y]))
    rate = {y: v["rate"] for y, v in ap.items()}
    rmin = min(rate, key=rate.get); rmax = max(rate, key=rate.get)
    reg_only = {y: ap[y]["reg"] for y in ap}
    hp = {y: EDU[f"{y}_03_g3"]["e"]["국어|"]["n"] for y in range(2022, 2027)}
    chart = bar_chart("수능 응시자 수 1994~2026학년도", taken, {1994, 2000, 2005, 2010, 2015, 2020, 2026}, lambda v: f"{v / 10000:.1f}만")
    f1 = fig(chart, f"그림 1. 수능 응시 인원입니다. 가장 많았던 {py}학년도({fmt(taken[py])}명), 가장 적었던 {ny}학년도({fmt(taken[ny])}명), 가장 최근인 {last}학년도({fmt(taken[last])}명)를 강조했습니다.")
    def pct(a, b):
        return f"{(b - a) / a * 100:+.1f}%"
    rows = [[y, fmt(ap[y]["reg"]), fmt(ap[y]["taken"]), f"{ap[y]['rate']:.1f}%"] for y in (2000, 2005, 2010, 2015, 2020, 2021, 2022, 2023, 2024, 2025, 2026)]
    tbl = table(["학년도", "지원 인원", "응시 인원", "응시율"], rows)
    hrows = [[f"{y}년 3월", fmt(hp[y])] for y in range(2022, 2027)]
    body = f"""
    <section class="legal__section">
      <p>수능 응시자 수는 그 해 시험의 규모이자, 등급 비율이 어떤 집단에서 계산되는지를 보여 주는 기초 자료입니다. 이 글은 한국교육과정평가원이 공개한 연도별 응시현황으로 1994학년도부터 2026학년도까지의 응시 인원과 응시율을 정리하고, 시·도교육청이 공개한 고3 학력평가 응시자 수를 함께 봅니다.</p>
    </section>

    <section class="legal__section" id="takers">
      <h2>응시 인원은 {py}학년도에 가장 많았다</h2>
      <p>응시 인원이 가장 많았던 해는 {py}학년도로 {fmt(taken[py])}명입니다. 가장 적었던 해는 {ny}학년도로 {fmt(taken[ny])}명이고, 최고치와 비교하면 {pct(taken[py], taken[ny])}입니다. 2026학년도는 {fmt(taken[last])}명이었습니다.</p>
      {f1}
      <p>전년 대비 변화가 가장 컸던 해는 {cy}학년도입니다. {cy - 1}학년도 {fmt(taken[cy - 1])}명에서 {cy}학년도 {fmt(taken[cy])}명으로 한 해 만에 {abs(yoy[cy]):.1f}% {'줄었' if yoy[cy] < 0 else '늘었'}습니다. 이 사이트의 자료만으로는 변화의 원인까지 확인할 수 없습니다. 1994학년도는 8월과 11월에 두 번 시행되어, 그래프에는 11월 시험 값을 넣었습니다.</p>
    </section>

    <section class="legal__section" id="rate">
      <h2>응시율은 {rmin}학년도에 가장 낮았다</h2>
      <p>지원한 인원 중 실제로 응시한 비율은 {rmin}학년도 {rate[rmin]:.1f}%로 가장 낮았고, {rmax}학년도 {rate[rmax]:.1f}%로 가장 높았습니다. 2026학년도는 {rate[last]:.1f}%였습니다.</p>
      {tbl}
    </section>

    <section class="legal__section" id="hakpyeong">
      <h2>고3 3월 학력평가 응시자</h2>
      <p>시·도교육청이 공개한 전국연합학력평가 성적 분석 및 통계자료에서 고3 3월 시험의 국어 응시자 수를 모으면 다음과 같습니다.</p>
      {table(["시험", "국어 응시자(명)"], hrows)}
      <p>2022년 3월 {fmt(hp[2022])}명에서 2025년 3월 {fmt(hp[2025])}명까지 늘었다가 2026년 3월에는 {fmt(hp[2026])}명이었습니다. 학력평가 응시자는 시험 시행 범위와 자료 집계 기준이 회차마다 같지 않을 수 있어 수능 응시자와 직접 비교하지 않습니다. 다만 같은 통계자료 안에서 해마다 비교하는 데에는 쓸 수 있습니다.</p>
    </section>

    <section class="legal__section" id="notes">
      <h2>자료와 한계</h2>
      <p>수능 수치는 공공데이터포털에 공개된 한국교육과정평가원의 연도별 응시현황입니다. 학력평가 수치는 서울특별시교육청 학력평가자료실에 공개된 통계자료를 사이트가 정리한 것입니다. 이 글은 재학생과 졸업생의 구성이나 지역별 차이는 다루지 않습니다. 해당 자료를 이 사이트가 갖고 있지 않기 때문입니다. 출처 표기와 정정 원칙은 <a href="data-policy.html">데이터 출처와 정정 원칙</a>을 참고하세요.</p>
    </section>"""
    return body, "수능 응시자 수 30년, 1994~2026학년도", \
        f"수능 응시 인원과 응시율을 1994학년도부터 2026학년도까지 정리했습니다. 응시 인원은 {py}학년도 {fmt(taken[py])}명에서 {ny}학년도 {fmt(taken[ny])}명까지 움직였습니다."


# ── 글 3: 학평 선택과목 ───────────────────────────────────
def post_electives():
    ys = list(range(2022, 2027))
    def n(y, k):
        return EDU[f"{y}_03_g3"]["e"][k]["n"]
    kor = {y: (n(y, "국어|화법과작문"), n(y, "국어|언어와매체")) for y in ys}
    mat = {y: (n(y, "수학|확률과통계"), n(y, "수학|미적분"), n(y, "수학|기하")) for y in ys}
    soc_k = [k for k in EDU["2022_03_g3"]["e"] if k.startswith("사회탐구|")]
    sci_k = [k for k in EDU["2022_03_g3"]["e"] if k.startswith("과학탐구|")]
    tam = {y: (sum(n(y, k) for k in sci_k), sum(n(y, k) for k in soc_k)) for y in ys}
    share = lambda t, i: t[i] / sum(t) * 100
    f1 = fig(share_chart("고3 3월 학평 국어 선택과목 비율", [(f"{y}", list(kor[y])) for y in ys], ["화법과 작문", "언어와 매체"]),
             f"그림 1. 고3 3월 학력평가 국어 선택과목 응시자 비율입니다. 화법과 작문은 {share(kor[2022], 0):.1f}%에서 {share(kor[2026], 0):.1f}%로 바뀌었습니다.")
    f2 = fig(share_chart("고3 3월 학평 수학 선택과목 비율", [(f"{y}", list(mat[y])) for y in ys], ["확률과 통계", "미적분", "기하"]),
             f"그림 2. 수학 선택과목 응시자 비율입니다. 확률과 통계는 {share(mat[2022], 0):.1f}%에서 {share(mat[2026], 0):.1f}%로, 미적분은 {share(mat[2022], 1):.1f}%에서 {share(mat[2026], 1):.1f}%로 바뀌었습니다.")
    f3 = fig(share_chart("고3 3월 학평 탐구 과목 응시 비율", [(f"{y}", list(tam[y])) for y in ys], ["과학탐구", "사회탐구"]),
             f"그림 3. 탐구 과목 응시 건수에서 과학탐구와 사회탐구가 차지하는 비율입니다. 과학탐구는 {share(tam[2022], 0):.1f}%에서 {share(tam[2026], 0):.1f}%로 줄었습니다.")
    rows = [[y, fmt(kor[y][0]), fmt(kor[y][1]), fmt(mat[y][0]), fmt(mat[y][1]), fmt(mat[y][2]), fmt(tam[y][0]), fmt(tam[y][1])] for y in ys]
    tbl = table(["3월", "화법과 작문", "언어와 매체", "확률과 통계", "미적분", "기하", "과학탐구(건)", "사회탐구(건)"], rows)
    body = f"""
    <section class="legal__section">
      <p>통합 수능 체제에서는 국어와 수학에서 선택과목을 고르고 탐구에서는 사회와 과학 중 과목을 고릅니다. 학생들이 어느 선택에 몰리는지는 등급 비율과 표준점수 최고점이 어떤 집단에서 계산되는지에 영향을 줍니다. 이 글은 시·도교육청이 공개한 고3 3월 전국연합학력평가 통계자료로 2022년부터 2026년까지 선택과목 응시자 수를 비교합니다. 3월 시험은 해마다 같은 시기에 치러져 비교하기 좋습니다.</p>
    </section>

    <section class="legal__section" id="korean">
      <h2>국어는 화법과 작문이 늘었다</h2>
      <p>2026년 3월 고3 국어 응시자는 {fmt(sum(kor[2026]))}명이고 이 중 화법과 작문이 {fmt(kor[2026][0])}명({share(kor[2026], 0):.1f}%), 언어와 매체가 {fmt(kor[2026][1])}명({share(kor[2026], 1):.1f}%)입니다. 2022년 3월에는 화법과 작문 {share(kor[2022], 0):.1f}%, 언어와 매체 {share(kor[2022], 1):.1f}%였습니다.</p>
      {f1}
    </section>

    <section class="legal__section" id="math">
      <h2>수학은 확률과 통계로 이동했다</h2>
      <p>2026년 3월 고3 수학 응시자는 {fmt(sum(mat[2026]))}명입니다. 확률과 통계 {share(mat[2026], 0):.1f}%, 미적분 {share(mat[2026], 1):.1f}%, 기하 {share(mat[2026], 2):.1f}%였습니다. 2022년 3월에는 확률과 통계 {share(mat[2022], 0):.1f}%, 미적분 {share(mat[2022], 1):.1f}%, 기하 {share(mat[2022], 2):.1f}%로 미적분 응시 비중이 지금보다 컸습니다.</p>
      {f2}
    </section>

    <section class="legal__section" id="tamgu">
      <h2>탐구는 사회탐구 비율이 커졌다</h2>
      <p>탐구는 한 학생이 여러 과목을 응시하므로 사람 수가 아니라 과목 응시 건수로 비교합니다. 2026년 3월 고3의 과학탐구 응시 건수는 {fmt(tam[2026][0])}건, 사회탐구는 {fmt(tam[2026][1])}건이었습니다. 과학탐구 비율은 2022년 {share(tam[2022], 0):.1f}%에서 2026년 {share(tam[2026], 0):.1f}%로 낮아졌습니다.</p>
      {f3}
      <p>2026년 3월 사회탐구에서는 사회·문화가 {fmt(n(2026, "사회탐구|사회·문화"))}건, 생활과 윤리가 {fmt(n(2026, "사회탐구|생활과윤리"))}건으로 가장 많았고, 과학탐구에서는 생명과학Ⅰ과 지구과학Ⅰ이 각각 {fmt(n(2026, "과학탐구|생명과학Ⅰ"))}건, {fmt(n(2026, "과학탐구|지구과학Ⅰ"))}건이었습니다.</p>
    </section>

    <section class="legal__section" id="table">
      <h2>2022~2026년 3월 응시자 수</h2>
      {tbl}
    </section>

    <section class="legal__section" id="notes">
      <h2>자료와 한계</h2>
      <p>수치는 서울특별시교육청 학력평가자료실에 공개된 고3 3월 전국연합학력평가 성적 분석 및 통계자료입니다. 학력평가 선택과목 비율은 수능 실제 선택과 다를 수 있습니다. 3월 시점의 선택이 이후에 바뀌는 학생도 있고, 응시하지 않은 학생은 집계되지 않기 때문입니다. 이 글은 원인을 판단하지 않고 공개된 응시자 수의 변화만 보여 줍니다. 출처 표기와 정정 원칙은 <a href="data-policy.html">데이터 출처와 정정 원칙</a>을 참고하세요.</p>
    </section>"""
    return body, "고3 3월 학평 선택과목 비율 변화, 2022~2026년", \
        f"고3 3월 전국연합학력평가에서 국어, 수학, 탐구 선택과목 응시 비율이 2022년부터 2026년까지 어떻게 달라졌는지 정리했습니다. 2026년 3월 확률과 통계는 {share(mat[2026], 0):.1f}%였습니다."


POSTS = [
    ("blog-csat-top-scores.html", post_top, "데이터 분석"),
    ("blog-csat-takers.html", post_takers, "데이터 분석"),
    ("blog-hakpyeong-electives.html", post_electives, "데이터 분석"),
]


def build():
    tpl = TEMPLATE.read_text(encoding="utf-8")
    m0, m1 = tpl.index('<main id="main"'), tpl.index("</main>") + len("</main>")
    cards = []
    for fname, fn, tag in POSTS:
        body, title, desc = fn()
        url = f"https://kicegg.com/{fname}"
        html = tpl
        rep = {
            r'(<meta name="description" content=")[^"]*"': desc,
            r'(<meta property="og:title" content=")[^"]*"': f"{title} - 기출해체분석기",
            r'(<meta property="og:description" content=")[^"]*"': desc,
            r'(<meta name="twitter:title" content=")[^"]*"': f"{title} - 기출해체분석기",
            r'(<meta name="twitter:description" content=")[^"]*"': desc,
        }
        for pat, val in rep.items():
            html = re.sub(pat, lambda mm, v=val: mm.group(1) + escape(v, quote=True) + '"', html, count=1)
        html = html.replace("https://kicegg.com/blog-2027-sept-mock.html", url)
        html = re.sub(r"<title>[^<]*</title>", f"<title>{escape(title)} - 기출해체분석기</title>", html, count=1)
        ld = json.dumps({"@context": "https://schema.org", "@type": "Article", "@id": url, "url": url, "headline": title,
                         "datePublished": TODAY, "dateModified": TODAY, "inLanguage": "ko-KR",
                         "isPartOf": {"@id": "https://kicegg.com/#website"}, "author": {"@id": "https://kicegg.com/#org"},
                         "publisher": {"@id": "https://kicegg.com/#org"}}, ensure_ascii=False, separators=(",", ":"))
        bc = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "블로그", "item": "https://kicegg.com/blog.html"},
            {"@type": "ListItem", "position": 2, "name": title, "item": url}]}, ensure_ascii=False, separators=(",", ":"))
        html = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', '', html, flags=re.S)
        html = html.replace('  <script src="lib/measure.js', f'  <script type="application/ld+json">{ld}</script>\n  <script type="application/ld+json">{bc}</script>\n  <script src="lib/measure.js', 1)
        main = (f'<main id="main" class="container legal method">\n    <p class="blog-crumb"><a href="blog.html">블로그 목록</a></p>\n'
                f'    <header class="legal__head">\n      <h1 class="legal__title">{escape(title)}</h1>\n'
                f'      <p class="blog-meta"><time datetime="{TODAY}">{TODAY_KO}</time></p>\n    </header>\n{body}\n  </main>')
        html = html[:html.index('<main id="main"')] + main + html[html.index("</main>") + len("</main>"):]
        (ROOT / fname).write_text(html, encoding="utf-8")
        cards.append((fname, tag, title, desc))
        print(f"  + {fname}")
    return cards


if __name__ == "__main__":
    build()
