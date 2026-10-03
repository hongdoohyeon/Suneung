"""평가원 공식 '영역/과목별 표준점수 도수분포' 엑셀(2006~2013학년도)을 JSON 으로.

입력: score_data/old_dist/{학년도}{csat|june|sept}_dist.xls(x)  — kice.re.kr boardID=10024 첨부
출력: score_data/old_dist/std_dist_2006_2013.json
      {"2010|csat": {"윤리": {"69": 3596, ...}, ...}, ...}   (값 = 계(남+여) 인원)

양식: 시트마다 '과목명' 행 아래 '표준점수|남자|여자|계|누적(계)' 5열 묶음이 가로로 반복.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import openpyxl
import xlrd

HERE = Path(__file__).resolve().parent


def sheets(path: Path):
    if path.suffix == ".xlsx":
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            yield [["" if c is None else c for c in row] for row in ws.iter_rows(values_only=True)]
    else:
        book = xlrd.open_workbook(path)
        for sh in book.sheets():
            yield [sh.row_values(r) for r in range(sh.nrows)]


def num(v):
    try:
        f = float(str(v).replace(",", ""))
    except ValueError:
        return None
    return int(f) if f == int(f) else None


def parse(path: Path) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for rows in sheets(path):
        for i, row in enumerate(rows):
            for j, cell in enumerate(row):
                if str(cell).replace(" ", "") != "표준점수" or i == 0:
                    continue
                name = re.sub(r"\s+", " ", str(rows[i - 1][j])).strip()
                if not name:
                    continue
                dist = {}
                for r in rows[i + 1:]:
                    if j + 3 >= len(r):
                        break
                    s, total = num(r[j]), num(r[j + 3])
                    if s is None:
                        break
                    if total:
                        dist[str(s)] = total
                if dist:
                    out[name] = dist
    return out


def main():
    result = {}
    for p in sorted(HERE.glob("*_dist.xls*")):
        m = re.match(r"(\d{4})(csat|june|sept)_dist", p.name)
        result[f"{m.group(1)}|{m.group(2)}"] = parse(p)
    (HERE / "std_dist_2006_2013.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
    for k, v in result.items():
        print(k, len(v), "과목", list(v)[:6])


if __name__ == "__main__":
    main()
