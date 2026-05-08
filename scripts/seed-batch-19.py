#!/usr/bin/env python3
"""Phase 1 batch 3 — 단국대 죽전 25학년도 영역평균 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

DANKOOK_2025_EXTRA = [
    ('영어영문학과', 78.5), ('미디어커뮤니케이션학부', 87.83),
    ('상담학과', 80.83), ('컴퓨터공학과', 81.67),
    ('기계공학과', 78.83), ('화학공학과', 81.67),
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

merge('dankook', '2025', DANKOOK_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'단국대 25학년도 영역평균 보강 — {len(DANKOOK_2025_EXTRA)}개 학과')

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
