#!/usr/bin/env python3
"""Phase 2 batch 25 — 경희대 22 검색 텍스트 (호서·인하·한양ERICA 외 22학년도 4번째 학교)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 경희대 22학년도 — 검색 결과 텍스트 추출 (베리타스/에듀진 보조)
KHU_2022 = [
    ('의예과', 98.7), ('한의예과 (자연)', 95.8),
    ('한의예과 (인문)', 97.2), ('치의예과', 97.0),
    ('국어국문학과', 91.3), ('철학과', 91.7),
    ('자유전공학부', 92.5), ('사회학과', 92.8),
    ('경영학과', 93.0), ('경제학과', 92.5),
    ('관광학과', 91.8), ('수학과', 90.5),
    ('생물학과', 90.5), ('간호학과 (자연)', 89.2),
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

merge('khu', '2022', KHU_2022)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'경희대 22 — {len(KHU_2022)}개 학과 — 22학년도 4교 돌파!')

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
