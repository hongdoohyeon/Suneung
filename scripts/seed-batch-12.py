#!/usr/bin/env python3
"""ipsihogu batch 12 — 홍익대 24학년도."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

HONGIK_2024 = [
    ('건축학부 (5년제)', 92.33), ('금속조형디자인과', 90.75),
    ('컴퓨터공학과', 90.5), ('도예유리과', 90.25),
    ('목조형가구학과', 90.0), ('디자인학부', 89.0),
    ('섬유미술패션디자인과', 89.0), ('판화과', 88.5),
    ('경제학부', 88.4), ('법학부', 88.2),
    ('미술사학과', 88.0), ('경영학부', 86.6),
    ('조소과', 82.25), ('회화과', 81.25),
    ('디자인융합학부', 81.5), ('동양화과', 80.5),
    ('게임그래픽디자인전공', 75.5), ('영상애니메이션전공', 63.75),
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

merge('hongik', '2024', HONGIK_2024)
F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'홍익대 24학년도 시드 — {len(HONGIK_2024)}개 학과')

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
