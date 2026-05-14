#!/usr/bin/env python3
"""Phase 2 batch 9 — 한양·중앙·경북 24 베리타스."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 한양대 본교 24 추가
HANYANG_2024_EXTRA = [
    ('의예과', 98.83), ('반도체공학과', 95.45),
    ('미래자동차공학과', 95.04), ('생명과학과', 94.92),
    ('데이터사이언스학부', 94.64), ('신소재공학부', 94.38),
]

# 중앙대 24 추가
CAU_2024_EXTRA = [
    ('의학부', 98.8), ('약학부', 97.5),
    ('소프트웨어학부', 93.6), ('전자전기공학부', 93.2),
    ('AI학과', 92.9),
]

# 경북대 24 (백분위합/3 = 평균)
KNU_2024_EXTRA = [
    ('의예과', 98.5), ('치의예과', 97.2), ('약학과', 96.37),
    ('수의예과', 95.5), ('전자공학부 모바일공학전공', 94.47),
    ('전자공학부', 87.67), ('첨단신약개발학과', 87.53),
    ('컴퓨터학부 (플랫폼소프트웨어)', 87.53),
    ('컴퓨터학부 (AI컴퓨팅)', 85.8),
    ('화학공학과', 85.53), ('간호학과', 85.53),
    ('윤리교육과', 83.43),
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

merge('hanyang', '2024', HANYANG_2024_EXTRA)
merge('cau',     '2024', CAU_2024_EXTRA)
merge('knu',     '2024', KNU_2024_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(HANYANG_2024_EXTRA) + len(CAU_2024_EXTRA) + len(KNU_2024_EXTRA)
print(f'Phase 2 batch 9 — 3 / {total}개 학과')

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
