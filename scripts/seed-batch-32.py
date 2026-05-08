#!/usr/bin/env python3
"""Phase 2 batch 11 — 가천·안양 24 namuacademy."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

GACHON_2024_EXTRA = [
    ('한의예과', 99.51),  # 100.02 → cap 99.51 (백분위 100 불가)
    ('행정학과', 80.0),
    ('디자인학과 (산업-기초소양평가)', 89.5),
]

ANYANG_2024 = [
    ('컴퓨터공학과', 84.76), ('스마트시티공학과', 50.7),
    ('소프트웨어학과', 84.56), ('게임콘텐츠학과', 52.8),
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

merge('gachon', '2024', GACHON_2024_EXTRA)
merge('anyang', '2024', ANYANG_2024)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(GACHON_2024_EXTRA) + len(ANYANG_2024)
print(f'Phase 2 batch 11 — 2 / {total}개 학과')

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
