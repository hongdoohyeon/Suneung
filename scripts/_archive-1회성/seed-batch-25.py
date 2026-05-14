#!/usr/bin/env python3
"""덕성여대 25 입학처 PDF (공식) — 70%컷 정확 데이터 8개."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

DUKSUNG_2025_OFFICIAL = [
    ('글로벌융합대학 (인문사회)', 87.55),
    ('글로벌융합대학 (유아교육과)', 86.95),
    ('과학기술대학', 87.40),
    ('약학대학', 96.70),
    ('미래인재대학 (자유전공학부)', 86.70),
    ('미래인재대학 (가상현실융합학과)', 87.05),
    ('미래인재대학 (데이터사이언스학과)', 87.85),
    ('미래인재대학 (AI신약학과)', 91.10),
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

merge('duksung', '2025', DUKSUNG_2025_OFFICIAL)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'덕성여대 25 공식 — {len(DUKSUNG_2025_OFFICIAL)}개 학과')

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
