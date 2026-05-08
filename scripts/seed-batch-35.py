#!/usr/bin/env python3
"""Phase 2 batch 14 — 경희대 23 + 외대 23 에듀진."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 경희대 23 — 에듀진 42756
KHU_2023 = [
    ('의예과', 98.8), ('치의예과', 96.8),
    ('한의예과', 97.2),
]

# 외대 23 — 에듀진 42638 (서울)
HUFS_2023 = [
    ('Language & Diplomacy학부', 91.33),
    ('Language & Trade학부', 91.5),
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

merge('khu',  '2023', KHU_2023)
merge('hufs', '2023', HUFS_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(KHU_2023) + len(HUFS_2023)
print(f'Phase 2 batch 14 — 2 / {total}개 학과')

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
