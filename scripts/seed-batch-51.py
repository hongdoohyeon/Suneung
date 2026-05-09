#!/usr/bin/env python3
"""23학년도 보강: 서울대 + 한국외대 학과별."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

SNU_2023 = [
    # 인문
    ('인문계열', 97.5), ('역사학부', 92.25), ('정치외교학부', 98.5),
    ('경제학부', 97.25), ('사회학과', 95.25), ('심리학과', 96.5),
    ('지리학과', 97.0), ('사회복지학과', 96.25),
    ('언론정보학과', 95.75),
    # 자연
    ('수리과학부', 97.75), ('통계학과', 97.0), ('물리학과', 96.0),
    ('천문학과', 93.0), ('화학과', 96.0), ('생명과학부', 94.0),
    ('지구환경과학부', 92.5),
    # 공학
    ('건설환경공학부', 88.0), ('기계공학부', 91.75),
    ('재료공학부', 94.0), ('전기정보공학부', 96.0),
    ('컴퓨터공학부', 95.75), ('화학생물공학부', 95.5),
    # 의약
    ('의예과', 99.25), ('치의학과', 99.0), ('간호대학', 94.0),
    ('수의예과', 97.25), ('약학계열', 95.75),
]

HUFS_2023 = [
    # 가군
    ('ELLT학과', 89.5), ('말레이·인도네시아어과', 86.33),
    ('아랍어과', 86.67), ('태국어과', 86.5),
    ('베트남어과', 87.83), ('인도어과', 87.17),
    ('터키·아제르바이잔어과', 87.5), ('페르시아어·이란학과', 86.67),
    ('몽골어과', 87.33), ('중국언어문화학부', 87.33),
    ('일본언어문화학부', 88.17), ('영어교육과', 88.33),
    ('한국어교육과', 87.5), ('국제학부', 89.0),
    ('Language&Trade학부', 91.5),
    ('그리스·불가리아학과', 73.5), ('중앙아시아학과', 73.33),
    ('아프리카학부', 75.17), ('한국학과', 73.67),
    ('바이오메디컬공학부', 75.17),
    # 나군
    ('영미문학·문화학과', 88.5), ('EICC학과', 89.17),
    ('경제학부', 88.83), ('Language&Diplomacy학부', 91.33),
    ('정치외교학과', 89.5), ('국제통상학과', 90.17),
    # 다군
    ('경영학부', 90.67),
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

merge('snu',  '2023', SNU_2023)
merge('hufs', '2023', HUFS_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

added = len(SNU_2023) + len(HUFS_2023)
print(f'23학년도 — 서울대 {len(SNU_2023)} + 한국외대 {len(HUFS_2023)} = {added}개')

years = {}
total = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
print(f'  23학년도: {years.get("2023", 0)}개교')
print(f'  총 학과: {total}')
