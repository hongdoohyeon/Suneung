#!/usr/bin/env python3
"""LEET·MEET(MDEET)·PEET 공식 채점결과의 표준점수 5점 급간 분포 → data/entrance-score-dist.json

로컬 전용(CI 안 돌림). 원본은 ~/Workspace/kice_archive/score_data/{leet,mdeet,peet}/*_dist.csv
(각 폴더 README — 시행기관 공지 첨부에서 뽑고 구간 합계를 공식 응시자 수와 대조함).
build-data.py entrance_dist_html 이 상세 페이지 '점수 분포' 섹션을 만든다.

형식: {"LEET": {"2026": {"언어이해": {"": [[lo, n], ...]}}}, "MEET": {"2012": {"언어추론": {"med": [...], "dent": [...]}}}}
  급간은 lo 이상 lo+5 미만(폭이 다르면 [lo, n, hi]). 앞뒤 0명 급간은 뺀다. 트랙 키: '' 단일, med 의학, dent 치의학, common 공통.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path.home() / 'Workspace' / 'kice_archive' / 'score_data'
OUT = ROOT / 'data' / 'entrance-score-dist.json'

LEET_AREA = {'verbal': '언어이해', 'reasoning': '추리논증'}


def load(path: Path, exam: str, out: dict) -> None:
    rows = {}
    for r in csv.DictReader(path.open(encoding='utf-8')):
        area = LEET_AREA.get(r['area'], r['area'])
        key = (r['year'], area, r.get('track') or '')
        rows.setdefault(key, []).append((int(float(r['lo'])), int(float(r['hi'])), int(r['n'])))
    for (year, area, track), bins in sorted(rows.items()):
        bins.sort()
        nz = [i for i, (_, _, n) in enumerate(bins) if n]
        bins = bins[nz[0]:nz[-1] + 1]
        # 표 양 끝에 '0 이상 ~ 10 미만'처럼 넓은 급간이 있는 해가 있다 — 폭이 다르면 hi 를 같이 둔다
        out.setdefault(exam, {}).setdefault(year, {}).setdefault(area, {})[track] = [
            [lo, n] if hi - lo == 5 else [lo, n, hi] for lo, hi, n in bins]


def main() -> None:
    out = {}
    load(SRC / 'leet' / 'leet_dist.csv', 'LEET', out)
    load(SRC / 'mdeet' / 'mdeet_dist.csv', 'MEET', out)
    load(SRC / 'peet' / 'peet_dist.csv', 'PEET', out)
    # 2015학년도 LEET 는 원문이 없어 보도 수치만 — 섹션에서 카드로만 보여 준다
    part = json.loads((SRC / 'leet' / 'leet_2015_partial.json').read_text(encoding='utf-8'))
    out['LEET']['2015'] = {LEET_AREA[k]: {'partial': {
        'mode': part[k]['mode_bin'][0], 'modeN': part[k]['mode_n'], 'modePct': part[k]['mode_pct'],
        'ge55': part[k]['ge55_cum_n'], 'ge55Pct': part[k]['ge55_cum_pct'], 'src': part['source']}}
        for k in ('verbal', 'reasoning')}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    n = sum(len(t) for e in out.values() for y in e.values() for t in y.values())
    print(f'{OUT.relative_to(ROOT)}: {n}개 분포')


if __name__ == '__main__':
    main()
