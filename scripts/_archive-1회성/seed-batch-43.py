#!/usr/bin/env python3
"""Phase 2 batch 22 — 고려대 23 + 가톨릭대 26 추가."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

KOREA_2023 = [
    ('의과대학', 99.37), ('반도체공학과', 97.67),
    ('차세대통신학과', 96.83), ('스마트모빌리티학부', 96.67),
    ('컴퓨터학과', 96.02), ('체육교육과', 87.73),
]

# 가톨릭대 26 추가
CATHOLIC_2026_EXTRA = [
    ('의예과', 99.2), ('약학과', 96.7),
    ('인문사회계열', 79.3), ('데이터사이언스학과', 79.3),
    ('특수교육과', 79.3),
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

merge('korea',    '2023', KOREA_2023)
merge('catholic', '2026', CATHOLIC_2026_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(KOREA_2023) + len(CATHOLIC_2026_EXTRA)
print(f'Phase 2 batch 22 — 2 / {total}개 학과')

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
