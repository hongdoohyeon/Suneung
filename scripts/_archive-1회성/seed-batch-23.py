#!/usr/bin/env python3
"""Phase 2 batch 2 — 명지대 25 영역평균 + 일부 추가."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 명지대 25 — 더 정확한 평균값
MJU_2025_REFINED = [
    ('스마트시스템공학과', 78.0),
    ('반도체ICT학부', 78.67),
    ('화학생명과학과', 74.83),
    ('건축학부', 82.0),
    ('자연계열 자유전공', 78.67),
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

merge('mju', '2025', MJU_2025_REFINED)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'명지대 25학년도 보강 — {len(MJU_2025_REFINED)}개 학과')

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
