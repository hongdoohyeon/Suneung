#!/usr/bin/env python3
"""Phase 2 batch 20 — 시립대·동국·홍익·부산대 23 에듀진."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

UOS_2023 = [
    ('인공지능학과', 97.0), ('자유전공학부', 96.0),
    ('컴퓨터과학부', 90.8), ('화학공학과', 90.0),
    ('전자전기컴퓨터공학부', 89.0), ('스포츠과학과', 77.2),
]

DONGGUK_2023 = [
    ('약학과', 96.5), ('AI소프트웨어융합학부 (인문)', 89.667),
    ('경찰행정학부', 89.833), ('불교학부', 84.833),
    ('미디어커뮤니케이션학부', 84.167),
]

HONGIK_2023 = [
    ('건축학부 건축학전공 (5년)', 91.17), ('건축학부 실내건축학전공', 89.67),
    ('디자인학부', 97.75), ('경영학부', 89.6),
    ('컴퓨터공학과', 89.17), ('기계시스템디자인공학과', 79.83),
    ('도시공학과', 83.5),
]

PUSAN_2023_EXTRA = [
    ('의예과', 97.83), ('치의학전문대학원', 97.5),
    ('한의학전문대학원', 96.83), ('약학부', 94.17),
    ('의예과 (지역인재)', 98.5),
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

merge('uos',     '2023', UOS_2023)
merge('dongguk', '2023', DONGGUK_2023)
merge('hongik',  '2023', HONGIK_2023)
merge('pusan',   '2023', PUSAN_2023_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(UOS_2023) + len(DONGGUK_2023) +
         len(HONGIK_2023) + len(PUSAN_2023_EXTRA))
print(f'Phase 2 batch 20 — 4 / {total}개 학과')

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
