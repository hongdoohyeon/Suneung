#!/usr/bin/env python3
"""호서대 5개년(21~25) 입시결과 시드 — 22학년도 데이터 최초 확보."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 호서대 입학처 페이지에서 추출한 21~25 정시 70%컷 (학과 × 연도)
HOSEO = [
    ('한국언어문화학과',          [62.15, 56.69, 56.45, 49.33, 58.33]),
    ('영어영문학과',              [65.9,  62.77, 61.15, 56.67, 56.67]),
    ('중국학과',                 [62.5,  65.48, 62.5,  47.0,  53.33]),
    ('법경찰행정학과',             [65.4,  72.53, 68.3,  66.0,  71.33]),
    ('산업심리학과',              [65.05, 68.86, 63.8,  53.0,  65.33]),
    ('사회복지학부',              [66.05, 66.16, 59.3,  59.33, 60.33]),
    ('유아교육과',               [65.6,  70.05, 71.4,  63.33, 66.33]),
    ('경영학부',                [67.85, 68.58, 64.1,  61.0,  64.67]),
    ('식품공학과',               [68.95, 68.75, 64.85, 48.0,  45.0]),
    ('제약공학과',               [53.65, 70.55, 68.65, 61.33, 59.67]),
    ('화장품과학과',              [66.7,  67.85, 61.35, 58.67, 46.67]),
    ('생명공학과',               [65.5,  67.65, 66.2,  40.0,  46.67]),
    ('간호학과',                [75.75, 78.97, 78.8,  78.33, 80.0]),
    ('물리치료학과',              [72.3,  78.62, 74.15, 75.33, 75.67]),
    ('임상병리학과',              [71.55, 72.22, 73.2,  71.33, 71.33]),
    ('전기공학과',               [66.25, 66.28, 58.9,  52.0,  47.67]),
    ('기계공학과',               [65.65, 68.51, 53.75, 40.0,  58.33]),
    ('화학공학과',               [66.25, 67.91, 59.95, 43.33, 55.67]),
    ('건축토목공학부',             [63.4,  66.84, 52.2,  54.67, 45.67]),
    ('컴퓨터공학부',              [62.8,  73.16, 69.0,  61.33, 46.33]),
    ('반도체공학과',              [60.2,  69.83, 64.25, 68.4,  39.0]),
]
# 컬럼: [2025, 2024, 2023, 2022, 2021]
YEAR_COLS = ['2025', '2024', '2023', '2022', '2021']

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

# 호서대 — 슬러그 'hoseo' (없으면 추가)
slug = 'hoseo'
if slug not in r:
    r[slug] = {'name': '호서대학교'}
elif not isinstance(r[slug], dict):
    r[slug] = {'name': '호서대학교'}
elif 'name' not in r[slug]:
    r[slug]['name'] = '호서대학교'

per_year = {y: [] for y in YEAR_COLS}
for unit, vals in HOSEO:
    for y, v in zip(YEAR_COLS, vals):
        per_year[y].append({'unit': unit, 'pct70': v})

for y, items in per_year.items():
    r[slug][y] = items

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'호서대 5개년(21~25) 시드 — {len(HOSEO)} 학과 × {len(YEAR_COLS)} 연도 = {len(HOSEO)*len(YEAR_COLS)} 항목')

# 최종 통계
years = {}
total = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
print('\n--- 최종 ---')
for y, n in sorted(years.items(), reverse=True):
    print(f'  {y}: {n}개교')
print(f'  총: {total} 학과')
