#!/usr/bin/env python3
"""Phase 2 batch 1 — 시립대·한양대 본교 25 영역별 평균 환산."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 서울시립대 25 — ipsihogu 영역별 → 평균
UOS_2025_EXTRA = [
    ('도시행정학과', 90.83), ('인공지능학과', 90.33),
    ('인문계열 통합', 86.33), ('자연계열 통합', 92.50),
    ('지능형반도체전공', 91.0), ('행정학과', 91.33),
    ('국제관계학과', 91.17), ('경제학부', 87.50),
]

# 한양대 본교 25 — ipsihogu 영역별 → 평균 (기존 80%컷 데이터 보강)
HANYANG_2025_EXTRA = [
    ('의예과', 96.67), ('반도체공학과', 91.67),
    ('컴퓨터소프트웨어학부', 92.67), ('경영학부', 87.67),
    ('건축학부', 89.83), ('건설환경공학과', 96.0),
    ('간호학과', 89.17), ('국어국문학과', 90.67),
    ('경제금융학부', 92.17),
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

merge('uos',     '2025', UOS_2025_EXTRA)
merge('hanyang', '2025', HANYANG_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(UOS_2025_EXTRA) + len(HANYANG_2025_EXTRA)
print(f'Phase 2 batch 1 — 2개 학교 / {total}개 학과')

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
