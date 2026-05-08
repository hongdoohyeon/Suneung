#!/usr/bin/env python3
"""Phase 2 batch 6 — 한밭대 24 + 부산대 24 추가."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 한밭대 24 — 베리타스 502074 (한밭대는 manual-ratios에 데이터 없음, 신규 학교)
HANBAT_2024 = [
    ('경제학과', 85.33), ('융합경영학과', 83.67),
    ('회계세무학과', 83.33), ('시각영상디자인학과', 82.33),
    ('전기공학과', 82.0), ('공공행정학과', 85.89),
    ('영어영문학과', 83.11),
]

# 부산대 24 — 베리타스 501981 추가 (의약 톱)
PUSAN_2024_EXTRA = [
    ('의예과 (지역인재)', 98.51), ('의예과', 98.25),
    ('치의학전문대학원 (지역인재)', 96.88),
    ('약학부', 96.39), ('약학부 (지역인재)', 96.38),
    ('한의학전문대학원', 96.25), ('치의학전문대학원', 96.19),
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

merge('hanbat', '2024', HANBAT_2024)
merge('pusan',  '2024', PUSAN_2024_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(HANBAT_2024) + len(PUSAN_2024_EXTRA)
print(f'Phase 2 batch 6 — 2개 학교 / {total}개 학과')

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
