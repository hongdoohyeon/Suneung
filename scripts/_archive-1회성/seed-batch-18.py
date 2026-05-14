#!/usr/bin/env python3
"""Phase 1 batch 2 — 가톨릭대·국민대 25학년도 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

CATHOLIC_2025 = [
    ('인문사회계열', 79.33), ('생명건강과학계열', 85.33),
    ('인공지능학과', 82.67), ('특수교육과', 79.33),
    ('약학과', 96.67), ('의예과', 99.17),
    ('자유전공학부', 79.67), ('데이터사이언스학과', 79.33),
    ('간호학과', 89.0), ('자연과학공학계열', 79.67),
    ('바이오메디컬소프트웨어학과', 82.0),
]

KOOKMIN_2025_EXTRA = [
    ('교육학과', 84.67), ('경영학부', 81.0),
    ('경영정보학부 (인문)', 83.83), ('기계재료공학과', 83.5),
    ('지능형ICT융합학과', 87.67), ('인공지능학부', 81.83),
    ('나노소재과학과', 86.5), ('바이오의공학과', 87.83),
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

merge('catholic', '2025', CATHOLIC_2025)
merge('kookmin',  '2025', KOOKMIN_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(CATHOLIC_2025) + len(KOOKMIN_2025_EXTRA)
print(f'Phase 1 batch 2 — 2개 학교 / {total}개 학과')

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
