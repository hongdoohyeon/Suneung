#!/usr/bin/env python3
"""Phase 2 batch 5 — 동덕·덕성 24학년도."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 동덕여대 24 — 베리타스 511678 톱5
DONGDUK_2024 = [
    ('약학과', 97.4), ('문화예술경영전공', 93.6),
    ('커뮤니케이션콘텐츠학과', 92.4),
    ('컴퓨터학과', 86.4), ('HCI사이언스학과', 85.8),
]

# 덕성여대 24 — namuacademy
DUKSUNG_2024 = [
    ('약학대학 (가군)', 97.43),
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

merge('dongduk', '2024', DONGDUK_2024)
merge('duksung', '2024', DUKSUNG_2024)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(DONGDUK_2024) + len(DUKSUNG_2024)
print(f'Phase 2 batch 5 — 2개 학교 / {total}개 학과')

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
