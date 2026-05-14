#!/usr/bin/env python3
"""ipsihogu batch 11 — 부산·중앙·건국 24학년도 + 인하대 25 영역 평균."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 부산대 24 — ipsihogu (베리타스 paywall 우회)
PUSAN_2024 = [
    ('의예과', 98.0), ('약학부', 96.33),
    ('치의학전문대학원', 96.67), ('한의학전문대학원', 96.17),
    ('화학공학과', 89.5), ('반도체공학과', 88.0),
    ('컴퓨터공학과', 87.83),
]

# 중앙대 24 — ipsihogu 풍부
CAU_2024 = [
    ('의학부', 98.77), ('약학부', 97.49),
    ('소프트웨어학부', 93.55), ('전자전기공학부', 93.2),
    ('AI학과', 92.94), ('산업보안학과 (자연)', 92.79),
    ('화학공학과', 92.6), ('도시시스템공학', 92.55),
    ('경영학부 (글로벌금융)', 92.49), ('응용통계학과', 92.47),
    ('경영학부 (경영학)', 92.45), ('에너지시스템공학부', 92.23),
    ('융합공학부', 92.26), ('생명과학과', 92.15),
    ('화학과', 92.08), ('물리학과', 91.9),
]

# 건국대 24 — ipsihogu (베리타스 통합 14개에 추가)
KONKUK_2024 = [
    ('수의예과', 95.75), ('화학공학부', 92.25),
    ('의생명공학과', 92.0), ('경영학과', 91.5),
    ('교육공학과', 79.5), ('융합인재학과', 81.5),
    ('정치외교학과', 81.0),
]

# 인하대 25 — ipsihogu 영역별 백분위 평균
INHA_2025_EXTRA = [
    ('의예과', 98.83), ('간호학과', 89.17),
    ('컴퓨터공학과', 85.0), ('기계공학과', 85.83),
    ('경영학과', 81.83), ('법학과', 75.33),
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

merge('pusan',  '2024', PUSAN_2024)
merge('cau',    '2024', CAU_2024)
merge('konkuk', '2024', KONKUK_2024)
merge('inha',   '2025', INHA_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(PUSAN_2024) + len(CAU_2024) + len(KONKUK_2024) + len(INHA_2025_EXTRA)
print(f'추가 batch 11 — 4개 학교 / {total}개 학과')

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
