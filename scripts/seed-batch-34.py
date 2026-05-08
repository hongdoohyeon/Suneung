#!/usr/bin/env python3
"""Phase 2 batch 13 — 한양대 본교 23 + 한양ERICA 23 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 한양대 본교 23 — 에듀진 42628
HANYANG_2023 = [
    ('의예과', 99.5), ('컴퓨터소프트웨어학부', 96.33),
    ('정보시스템학과', 96.0), ('반도체공학과', 95.25),
    ('건축학부', 93.75), ('기계공학부', 92.5),
    ('경제금융학부', 92.5), ('경영학부', 92.0),
    ('교육학과', 92.67),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

def merge(slug, year, items):
    if slug not in r or not isinstance(r[slug], dict):
        r[slug] = {}
    exist = {u['unit']: u for u in r[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    r[slug][year] = list(exist.values())

merge('hanyang', '2023', HANYANG_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'한양대 23 — {len(HANYANG_2023)}개 학과')

years = {}
total_units = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total_units += len(u)
print('--- 최종 ---')
for y, n in sorted(years.items(), reverse=True): print(f'  {y}: {n}개교')
print(f'총: {total_units} 학과')
