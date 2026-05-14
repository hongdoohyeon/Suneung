#!/usr/bin/env python3
"""21학년도 보강 — SKY 학과별 (freshnewinfo /474)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

SNU_2021 = [
    ('인문계열', 97.83), ('경제학부', 98.50), ('심리학과', 98.33),
    ('경영대학', 98.50), ('국어교육과', 96.83), ('수학교육과', 96.17),
    ('정치외교학부', 98.17),
    ('의예과', 99.0), ('치의학과', 98.83), ('간호대학', 98.0),
    ('생명과학부', 95.67), ('기계공학부', 96.33),
    ('컴퓨터공학부', 95.83), ('농경제사회학부', 98.17),
]

YONSEI_2021 = [
    ('경제학부', 96.67), ('경영학과', 95.67), ('독어독문학과', 96.33),
    ('사학과', 96.0), ('심리학과', 97.33), ('정치외교학과', 96.17),
    ('사회복지학과', 96.83),
    ('의예과', 99.5), ('치의예과', 98.17), ('간호학과 (자연)', 93.83),
    ('화공생명공학부', 95.17), ('전기전자공학부', 95.67),
    ('컴퓨터과학과', 95.33), ('글로벌융합공학부', 95.33),
    ('식품영양학과', 94.17),
]

KOREA_2021 = [
    ('경영대학', 97.33), ('경제학과', 95.87), ('정치외교학과', 96.60),
    ('행정학과', 96.87), ('교육학과', 96.82), ('국어교육과', 96.72),
    ('수학교육과', 93.87), ('미디어학부', 95.67),
    ('국어국문학과', 95.78), ('사학과', 95.12),
    ('의과대학', 98.80), ('간호대학', 92.07), ('컴퓨터학과', 95.08),
    ('식품자원경제학과', 95.43), ('화공생명공학과', 93.73),
    ('기계공학과', 93.02), ('전기전자공학부', 94.47),
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

merge('snu',    '2021', SNU_2021)
merge('yonsei', '2021', YONSEI_2021)
merge('korea',  '2021', KOREA_2021)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

added = len(SNU_2021) + len(YONSEI_2021) + len(KOREA_2021)
print(f'21학년도 SKY — {added}개 학과 (3교)')

years = {}
total = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
print(f'  21학년도: {years.get("2021", 0)}개교')
print(f'  22학년도: {years.get("2022", 0)}개교')
print(f'  23학년도: {years.get("2023", 0)}개교')
print(f'  총 학과: {total}')
