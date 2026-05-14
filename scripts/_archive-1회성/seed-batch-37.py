#!/usr/bin/env python3
"""Phase 2 batch 16 — 서강·인하 23."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

SOGANG_2023 = [
    ('인문학부', 91.0), ('영문학부', 90.83),
    ('경제학부', 91.17), ('경영학부', 91.5),
    ('컴퓨터공학과', 93.0), ('전자공학과', 92.83),
    ('시스템반도체공학과', 95.33), ('기계공학과', 91.0),
]

INHA_2023 = [
    ('의예과', 98.54), ('전자공학과', 86.6),
    ('항공우주공학과', 86.43), ('컴퓨터공학과', 86.36),
    ('인공지능공학과', 86.32), ('전기공학과', 85.87),
    ('생명공학과', 84.94), ('스마트모빌리티공학과', 84.92),
    ('자유전공학부 (인문/자연)', 84.89),
    ('화학공학과', 84.78),
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

merge('sogang', '2023', SOGANG_2023)
merge('inha',   '2023', INHA_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(SOGANG_2023) + len(INHA_2023)
print(f'Phase 2 batch 16 — 2 / {total}개 학과')

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
