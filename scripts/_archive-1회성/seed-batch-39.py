#!/usr/bin/env python3
"""Phase 2 batch 18 — 한양대 26 추가 학과."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

HANYANG_2026_EXTRA = [
    ('한양인터칼리지학부', 93.55), ('융합전자공학부', 93.53),
    ('컴퓨터소프트웨어학부', 93.49), ('간호학과', 93.48),
    ('화학공학과', 93.48), ('물리학과', 93.33),
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

merge('hanyang', '2026', HANYANG_2026_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'한양대 26 추가 — {len(HANYANG_2026_EXTRA)}개 학과')

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
