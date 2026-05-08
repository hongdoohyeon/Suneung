#!/usr/bin/env python3
"""입시호구탈출 + namuacademy 추가 batch — 24·25·26 학년도 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 연세대 24 — ipsihogu 풍부 (베리타스 통합 9개 → 17개)
YONSEI_2024 = [
    ('의예과', 99.0), ('치의예과', 98.25), ('약학과', 96.25),
    ('시스템반도체공학과', 95.0), ('전기전자공학부', 95.0),
    ('화학과', 95.0), ('생명과학과', 95.0), ('도시공학과', 95.0),
    ('생화학과', 95.0), ('생명공학과', 95.0), ('인공지능학과', 95.0),
    ('생체의공학과', 94.75), ('식품영양학과 (자연)', 94.75),
    ('기계공학부', 94.25), ('화공생명공학부', 94.25),
    ('문화인류학과', 94.25), ('대기과학과', 94.0),
    ('건축공학과', 94.0), ('컴퓨터과학과', 94.5),
    ('노어노문학과', 89.5),
]

# 성균관대 24 — ipsihogu
SKKU_2024 = [
    ('의예과', 99.0), ('약학과', 97.17),
    ('반도체시스템공학과', 95.67), ('지능형소프트웨어학과', 95.67),
    ('소프트웨어학과', 94.83),
]

# 경북대 24 — ipsihogu
KNU_2024 = [
    ('의예과', 98.62), ('치의예과', 97.61),
    ('수의예과', 96.12), ('약학과', 96.60),
    ('전자공학부', 88.75), ('첨단공학부', 89.10),
    ('간호학과', 87.15), ('수학교육과', 85.36),
    ('화학공학과', 85.17),
    ('동물생명과학과', 39.25), ('식물자원학과', 39.13),
]

# 가천대 24 — ipsihogu
GACHON_2024 = [
    ('의예과', 98.8), ('한의예과', 98.8), ('약학과', 96.85),
    ('클라우드공학과', 90.95), ('소프트웨어학과', 87.51),
    ('간호학과', 88.92),
]

# 한양대 24 70%컷 — ipsihogu
HANYANG_2024 = [
    ('의예과', 98.67), ('반도체공학과', 95.5),
    ('생명공학과', 94.75), ('에너지공학과', 94.25),
    ('미래자동차공학과', 94.5), ('데이터사이언스학부', 94.0),
    ('생체공학과', 94.0), ('융합전자공학부', 93.5),
    ('컴퓨터소프트웨어학부', 93.25), ('전기공학부', 93.5),
]

# 서강대 24 — ipsihogu (베리타스 9개 → 19개로 확장)
SOGANG_2024 = [
    ('경영학부', 91.5), ('경제학부', 91.5),
    ('한국학협동전공', 90.83), ('기계공학과', 91.83),
    ('물리학과', 91.5), ('사회과학부', 90.83),
    ('생명과학과', 92.5), ('수학과', 91.83),
    ('시스템반도체공학과', 93.33), ('영문학부', 90.5),
    ('유럽문화학과', 91.0), ('인공지능학과', 91.83),
    ('인문학부', 91.0), ('전자공학과', 92.83),
    ('중국문화학과', 90.5), ('지식융합미디어학부', 92.17),
    ('컴퓨터공학과', 92.5),
    ('화공생명공학과', 91.17), ('화학과', 91.17),
]

# 인천대 26 — namuacademy
INU_2026 = [
    ('체육교육과', 87.8), ('화학과', 71.8),
]

# 아주대 26 — namuacademy
AJOU_2026 = [
    ('의학과', 98.33), ('화학공학과', 89.17),
    ('교통시스템공학과', 77.50),
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

merge('yonsei',  '2024', YONSEI_2024)
merge('skku',    '2024', SKKU_2024)
merge('knu',     '2024', KNU_2024)
merge('gachon',  '2024', GACHON_2024)
merge('hanyang', '2024', HANYANG_2024)
merge('sogang',  '2024', SOGANG_2024)

merge('inu',  '2026', INU_2026)
merge('ajou', '2026', AJOU_2026)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(YONSEI_2024)+len(SKKU_2024)+len(KNU_2024)+len(GACHON_2024)+
         len(HANYANG_2024)+len(SOGANG_2024)+
         len(INU_2026)+len(AJOU_2026))
print(f'추가 batch 9 — 8개 학교/연도 / {total}개 학과')

# 통계
years = {}
total_units = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total_units += len(u)
print('\n--- 최종 ---')
for y, n in sorted(years.items(), reverse=True):
    print(f'  {y}: {n}개교')
print(f'  총: {total_units} 학과')
