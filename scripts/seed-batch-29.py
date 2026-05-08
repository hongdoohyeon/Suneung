#!/usr/bin/env python3
"""Phase 2 batch 8 — 단국·고려·성대 24 베리타스 단독 기사 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 단국대 죽전 24
DANKOOK_2024 = [
    ('건축학과 (5년)', 86.85), ('철학과', 85.71),
    ('영화학과', 85.44), ('미디어커뮤니케이션학부', 85.11),
    ('전기공학과', 85.02),
]

# 단국대 천안 24
DANKOOK_CH_2024 = [
    ('의예과', 96.21), ('치의예과', 95.27),
    ('약학과', 93.51), ('간호학과', 86.74),
    ('물리치료학과', 83.44),
]

# 고려대 24 추가
KOREA_2024_EXTRA = [
    ('스마트보안학부', 96.0),
    ('산업경영공학과', 96.0), ('화공생명공학과', 96.0),
]

# 성대 24 추가
SKKU_2024_EXTRA = [
    ('전자전기공학부', 94.67),
    ('글로벌경영학과', 93.0),
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

merge('dankook',         '2024', DANKOOK_2024)
merge('dankook_cheonan', '2024', DANKOOK_CH_2024)
merge('korea',           '2024', KOREA_2024_EXTRA)
merge('skku',            '2024', SKKU_2024_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(DANKOOK_2024) + len(DANKOOK_CH_2024) +
         len(KOREA_2024_EXTRA) + len(SKKU_2024_EXTRA))
print(f'Phase 2 batch 8 — 4 / {total}개 학과')

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
