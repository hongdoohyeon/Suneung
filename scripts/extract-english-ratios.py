#!/usr/bin/env python3
"""평가원 채점결과 아카이브 → 영어(절대평가) 등급별 비율 추출.

입력: data/raw/kice/scoring-archive-normalized/{csat|june_mock|september_mock}_{학년도}/table-*.csv
      (교육부·평가원 채점결과 첨부 표를 CSV 로 정규화한 것 — 로컬 수집본)
출력: data/english-grade-ratios.json  {"{학년도}|{csat|june|sept}": {"ratios": [1~9등급 %], "source": ...}}

영어 표는 '등급, 등급 구분 점수(90·80…), 인원, 비율' 행 구조 — 1행이 [1, 90, 인원, 비율].
표가 없는 해(응시 현황만 있는 자료)는 건너뛴다. 기존 값은 유지하고 새로 찾은 값만 더한다.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'raw' / 'kice' / 'scoring-archive-normalized'
OUT = ROOT / 'data' / 'english-grade-ratios.json'
TYPE = {'csat': 'csat', 'june_mock': 'june', 'september_mock': 'sept'}


def num(x):
    try:
        return float(str(x).replace(',', '').strip())
    except ValueError:
        return None


def find_ratios(folder: Path):
    for f in sorted(folder.glob('table-*.csv')):
        rows = list(csv.reader(f.open(encoding='utf-8', errors='ignore')))
        for i, r in enumerate(rows):
            if len(r) >= 4 and r[0].strip() == '1' and r[1].strip() == '90' \
                    and i + 1 < len(rows) and rows[i + 1][:2] == ['2', '80']:
                ratios = []
                for g in range(9):
                    rr = rows[i + g] if i + g < len(rows) else None
                    if not rr or rr[0].strip() != str(g + 1):
                        break
                    ratios.append(num(rr[3]))
                if len(ratios) == 9 and all(v is not None for v in ratios) and 99 <= sum(ratios) <= 101:
                    return ratios, f.name
    return None, None


def main():
    data = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    added = 0
    for folder in sorted(p for p in SRC.iterdir() if p.is_dir()):
        m = re.fullmatch(r'(csat|june_mock|september_mock)_(\d{4})', folder.name)
        if not m:
            continue
        key = f'{m[2]}|{TYPE[m[1]]}'
        ratios, table = find_ratios(folder)
        if ratios and key not in data:
            data[key] = {'ratios': ratios, 'source': f'kice-scoring-archive/{folder.name}/{table}'}
            added += 1
    OUT.write_text(json.dumps(dict(sorted(data.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'영어 등급 비율 {len(data)}회 (신규 {added})')


if __name__ == '__main__':
    main()
