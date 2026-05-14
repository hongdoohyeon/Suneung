#!/usr/bin/env python3
"""Phase 2 batch 26 — 중앙대 22 (베리타스 단독)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

CAU_2022 = [
    ('의학부', 98.3), ('약학부', 95.8),
    ('창의ICT공과대학', 91.23), ('소프트웨어학부', 91.2),
    ('AI학과', 91.0), ('산업보안학과 (자연)', 90.61),
    ('기계공학부', 90.5), ('화학신소재공학부', 90.2),
    ('자연과학대학', 89.88),
    # 21학년도 (2022 페이지에 있던 21 데이터)
]

# 중앙대 21 (베리타스 420754에서 발견된 21년도 데이터)
CAU_2021 = [
    ('인문대학', 92.7), ('의학부', 98.5),
    ('자연과학대학', 91.7), ('교육학과', 91.6),
    ('영어교육과', 92.3), ('창의ICT공과대학', 92.3),
    ('경영경제대학', 93.7),
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

merge('cau', '2022', CAU_2022)
merge('cau', '2021', CAU_2021)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(CAU_2022) + len(CAU_2021)
print(f'중앙대 22 + 21 — {total}개 학과')

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
