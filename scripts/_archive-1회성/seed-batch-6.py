#!/usr/bin/env python3
"""namuacademy batch 6 — 23학년도 메이저 데이터 + 누락 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 23학년도 (백분위만 사용 가능한 데이터)
SNU_2023    = [('의예과', 99.17)]
YONSEI_2023 = [('의예과', 99.25), ('언더우드학부 (인문사회)', 86.0)]
KOREA_2023  = [('의과대학', 97.97)]
JBNU_2023   = [('의예과', 98.2), ('수의예과', 95.5), ('작물생명과학과', 53.3)]
SUNGSHIN_2023 = [('산업디자인학과', 89.78), ('경제학과', 88.47)]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

def merge(slug, year, items):
    if slug not in r or not isinstance(r[slug], dict):
        r[slug] = {}
    exist = {u['unit']: u for u in r[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    r[slug][year] = list(exist.values())

merge('snu',      '2023', SNU_2023)
merge('yonsei',   '2023', YONSEI_2023)
merge('korea',    '2023', KOREA_2023)
merge('jbnu',     '2023', JBNU_2023)
merge('sungshin', '2023', SUNGSHIN_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = sum(len(d) for d in [SNU_2023, YONSEI_2023, KOREA_2023, JBNU_2023, SUNGSHIN_2023])
print(f'추가 batch — 5개교 23학년도 / {total}개 학과')
