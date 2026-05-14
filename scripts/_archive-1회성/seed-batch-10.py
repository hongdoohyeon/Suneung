#!/usr/bin/env python3
"""ipsihogu 추가 — 동국·외대·경북 25 학년도 70%컷 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 동국대 25 — ipsihogu (70%컷, 베리타스 80%컷보다 정확)
DONGGUK_2025 = [
    ('약학과', 96.92),
    ('컴퓨터AI학부 (인문)', 90.51), ('경찰행정학부', 90.36),
    ('시스템반도체학부', 90.36),
    ('국어국문문예창작학부', 87.82), ('영어영문학부', 87.43),
    ('일본학과', 87.79), ('문화유산학과', 86.6), ('불교학부', 85.8),
]

# 경북대 25 — ipsihogu
KNU_2025 = [
    ('의예과', 97.67), ('치의예과', 96.98),
    ('수의예과', 96.25), ('약학과', 95.00),
    ('전자공학부 모바일공학전공', 93.93),
    ('간호학과', 86.17), ('화학공학과', 85.05),
    ('IT첨단자율학부', 85.33),
]

# 한국외대 25 — ipsihogu (영역별 평균 환산)
HUFS_2025_EXTRA = [
    ('ELLT학과', 86.7), ('중국언어문화학부', 86.7),
    ('영어교육과', 85.62), ('경영학부', 87.6),
    ('Language & AI융합학부', 88.15),
    ('자유전공학부 (서울)', 85.77),
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

merge('dongguk', '2025', DONGGUK_2025)
merge('knu',     '2025', KNU_2025)
merge('hufs',    '2025', HUFS_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(DONGGUK_2025) + len(KNU_2025) + len(HUFS_2025_EXTRA)
print(f'추가 batch 10 — 3개 학교 / {total}개 학과')

years = {}
total_units = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total_units += len(u)
print('\n--- 최종 ---')
for y, n in sorted(years.items(), reverse=True): print(f'  {y}: {n}개교')
print(f'  총: {total_units} 학과')
