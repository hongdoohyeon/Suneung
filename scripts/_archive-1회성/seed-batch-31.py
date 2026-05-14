#!/usr/bin/env python3
"""Phase 2 batch 10 — 인하대 24 + 이화여대 24 베리타스 단독."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 인하대 24 베리타스 511895
INHA_2024_EXTRA = [
    ('의예과', 98.67), ('반도체시스템공학과', 86.17),
    ('전자공학과', 86.0), ('인공지능공학과', 85.17),
    ('생명공학과', 85.0), ('항공우주공학과', 85.0),
]

# 이화여대 24 베리타스 510996 (백분위 합 ÷3)
EWHA_2024 = [
    ('의예과 (자연)', 98.67), ('약학전공', 97.0),
    ('의예과 (인문)', 96.67), ('미래산업약학전공', 96.33),
    ('뇌인지과학 (인문)', 92.33), ('뇌인지과학 (자연)', 92.0),
    ('인공지능학과', 91.33),
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

merge('inha', '2024', INHA_2024_EXTRA)
merge('ewha', '2024', EWHA_2024)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(INHA_2024_EXTRA) + len(EWHA_2024)
print(f'Phase 2 batch 10 — 2 / {total}개 학과')

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
