#!/usr/bin/env python3
"""22학년도 5차 — 광운(보강)·명지·상명·가천 (freshnewinfo /564)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

KW_2022 = [
    ('전자공학과', 79.5), ('전기공학과', 76.8),
    ('컴퓨터정보공학부', 79.8), ('화학공학과', 79.3),
    ('미디어커뮤니케이션학부', 80.0), ('경영학부', 71.8),
    ('산업심리학과', 79.0),
    ('전자통신공학과', 78.0), ('건축공학과', 78.0),
    ('국어국문학과', 77.3), ('영어산업학과', 78.3),
    ('법학부', 78.8), ('국제학부', 75.3), ('국제통상학부', 71.0),
]

MJU_2022 = [
    ('전기전자공학부', 77.0), ('컴퓨터공학과', 79.67),
    ('정보통신공학과', 73.33),
    ('어문학부', 75.67), ('인문학부', 75.33),
    ('사회과학대학', 77.33), ('자연과학대학', 72.0),
    ('경영대학', 79.33), ('법학과', 78.67),
    ('융합소프트웨어학부', 83.0),
]

SMU_2022 = [
    ('역사콘텐츠학과', 79.67), ('문헌정보학과', 78.33),
    ('행정학부', 76.33), ('경제금융학부', 78.33),
    ('경영학부', 80.0), ('컴퓨터과학과', 81.33),
    ('전기공학과', 79.67), ('게임학과', 78.0),
    ('화공신소재학과', 80.33), ('애니메이션전공', 78.0),
    ('국어교육과', 82.67), ('교육학과', 81.33), ('수학교육과', 84.0),
]

GACHON_2022 = [
    ('경찰행정학과', 85.29), ('응용통계학과', 83.19),
    ('법학과', 80.82), ('경제학과', 81.0),
    ('컴퓨터공학과', 87.49), ('전기공학과', 85.3),
    ('의예과', 98.58), ('약학과', 96.82),
    ('간호학과', 91.26), ('스마트보안학과', 85.38),
    ('물리학과', 81.93), ('소프트웨어학과', 88.75),
    ('전자공학과', 87.06), ('기계공학과', 84.76),
    ('방사선학과', 85.33),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-09'

def merge(slug, year, items):
    if slug not in r or not isinstance(r[slug], dict):
        r[slug] = {}
    exist = {u['unit']: u for u in r[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    r[slug][year] = list(exist.values())

merge('kw',     '2022', KW_2022)
merge('mju',    '2022', MJU_2022)
merge('smu',    '2022', SMU_2022)
merge('gachon', '2022', GACHON_2022)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

added = sum(map(len, [KW_2022, MJU_2022, SMU_2022, GACHON_2022]))
print(f'22학년도 5차 — {added}개 학과 (4교)')

years = {}
total = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
for y in sorted(years, reverse=True):
    print(f'  {y}학년도: {years[y]}개교')
print(f'  총 학과: {total}')
