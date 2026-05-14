#!/usr/bin/env python3
"""Phase 2 batch 23 — 동덕·서울여 23 에듀진."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

DONGDUK_2023 = [
    ('약학과', 96.33), ('커뮤니케이션콘텐츠전공', 93.0),
    ('문화예술경영전공', 89.5), ('국사학전공', 75.67),
    ('유러피언스터디즈전공', 74.67),
]

SWU_2023 = [
    ('시각디자인전공', 97.0), ('자연과학대학 자유전공', 95.17),
    ('산업디자인전공', 93.0), ('기독교학과', 89.67),
    ('독어독문학과', 90.33), ('일어일문학과', 90.33),
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

merge('dongduk', '2023', DONGDUK_2023)
merge('swu',     '2023', SWU_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(DONGDUK_2023) + len(SWU_2023)
print(f'Phase 2 batch 23 — 2 / {total}개 학과')

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
