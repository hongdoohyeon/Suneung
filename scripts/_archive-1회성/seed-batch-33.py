#!/usr/bin/env python3
"""Phase 2 batch 12 — 중앙·숭실 23학년도 베리타스."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 중앙대 23 — 베리타스 463694
CAU_2023 = [
    ('의학부', 98.9), ('약학부', 96.9),
    ('산업보안학과 (인문)', 93.0),
    ('AI학과', 92.4), ('전자전기공학부', 92.2),
    ('화학신소재공학부', 92.1), ('소프트웨어학부', 92.1),
    ('도시계획부동산학과', 92.0), ('기계공학부', 92.0),
    ('생명과학과', 91.9),
]

# 숭실대 23 — 베리타스 465401
SSU_2023 = [
    ('컴퓨터학부', 88.2), ('소프트웨어학부', 87.2),
    ('글로벌미디어학부', 86.4), ('사회복지학부', 85.5),
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

merge('cau', '2023', CAU_2023)
merge('ssu', '2023', SSU_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(CAU_2023) + len(SSU_2023)
print(f'Phase 2 batch 12 — 2 / {total}개 학과')

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
