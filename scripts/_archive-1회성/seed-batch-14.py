#!/usr/bin/env python3
"""한양대 ERICA 22~24학년도 정시 — 입학처 PDF 직접 파싱."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 한양대 ERICA 입학처 PDF (goerica.hanyang.ac.kr/upload/GUIDES/2022~2024_ipsi_results_web.pdf)
# 형식: (학과, 22년 70%cut, 23년 70%cut, 24년 70%cut)
ERICA = [
    ('건축학전공',          81.21, 78.83, 80.83),
    ('건축공학전공',         None,  79.67, 79.83),  # 22 데이터 (분리 전)
    ('건설환경공학과',       76.67, 78.50, 79.83),
    ('교통물류공학과',       77.83, 77.33, 77.50),
    ('전자공학부',           80.67, 82.50, 81.50),
    ('재료화학공학과',       80.50, 81.00, 81.00),
    ('기계공학과',           79.67, 80.17, 80.33),
    ('산업경영공학과',       78.00, 78.17, 81.00),
    ('생명나노공학과',       80.83, 80.83, 83.67),
    ('로봇공학과',           80.00, 82.50, 80.83),
    ('컴퓨터학부',           82.33, 82.33, 81.83),
    ('ICT융합학부',          79.67, 81.50, 81.00),
    ('인공지능학과',         81.33, 80.67, 81.83),
    ('약학과',               96.33, 97.17, 97.50),
    ('수리데이터사이언스학과', 77.00, 79.00, 80.67),
    ('응용물리학과',         77.50, 80.67, 78.83),
    ('의약생명과학과',       81.17, 81.50, 82.33),
    ('나노광전자학과',       80.67, 79.50, 80.50),
    ('화학분자공학과',       77.83, 80.00, 79.00),
    ('해양융합공학과',       76.33, 79.33, 79.33),
    ('한국언어문학과',       75.33, 77.83, 75.67),
    ('문화인류학과',         75.17, 75.50, 77.50),
    ('문화콘텐츠학과',       77.33, 79.33, 80.67),
    ('중국학과',             73.83, 75.67, 77.00),
    ('일본학과',             73.67, 74.50, 78.17),
    ('영미언어문화학과',     74.50, 77.33, 77.83),
    ('프랑스학과',           73.83, 75.67, 76.33),
    ('광고홍보학과',         79.83, 79.50, 79.17),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

slug = 'hanyang_erica'
if slug not in r or not isinstance(r[slug], dict):
    r[slug] = {}

per_year = {'2022': [], '2023': [], '2024': []}
for entry in ERICA:
    unit, y22, y23, y24 = entry
    if y22 is not None: per_year['2022'].append({'unit': unit, 'pct70': y22})
    if y23 is not None: per_year['2023'].append({'unit': unit, 'pct70': y23})
    if y24 is not None: per_year['2024'].append({'unit': unit, 'pct70': y24})

for y, items in per_year.items():
    if items:
        r[slug][y] = items

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = sum(len(v) for v in per_year.values())
print(f'한양대 ERICA 22~24 시드 — 학과별 3년치 = {total}개 항목')

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
