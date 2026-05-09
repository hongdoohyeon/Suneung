#!/usr/bin/env python3
"""23 단국대 + 25 상명대 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

DANKOOK_2023 = [
    ('영미인문학과', 83.7), ('미디어커뮤니케이션학부', 84.45),
    ('기계공학과', 83.8), ('영화전공', 84.9),
    ('법학과', 84.6), ('경제학과', 83.45),
    ('전자전기공학전공', 84.73), ('건축학전공 (5년제)', 87.05),
    ('경영학부', 84.45), ('소프트웨어학과', 86.0),
    ('컴퓨터공학과', 86.2), ('과학교육과', 85.13),
    ('체육교육과', 57.54),
]

# 상명대 25학년도 (입학처 PDF "평균"컷 — 70%컷 근사)
SMU_2025 = [
    ('자유전공 (인문사회계열)', 81.68), ('자유전공 (경영경제계열)', 80.22),
    ('자유전공 (IT계열)', 83.17), ('자유전공 (이공계열)', 83.17),
    ('자유전공 (예체능계열)', 80.94),
    ('역사콘텐츠전공', 80.83), ('지적재산권전공', 81.56),
    ('문헌정보학전공', 80.38), ('한일문화콘텐츠전공', 80.0),
    ('공간환경학부', 81.98), ('행정학부', 81.0),
    ('가족복지학과', 79.79), ('경제금융학부', 81.67),
    ('경영학부', 82.33), ('글로벌경영학과', 82.35),
    ('국어교육과', 80.85), ('영어교육과', 79.84),
    ('교육학과', 81.44), ('수학교육과', 84.87),
    ('휴먼지능정보공학전공', 81.65), ('빅데이터융합전공', 80.44),
    ('컴퓨터과학전공', 83.2), ('전기공학전공', 83.0),
    ('게임전공', 82.54), ('생명공학전공', 80.89),
    ('화학에너지공학전공', 82.52), ('화공신소재전공', 81.3),
    ('식품영양학전공', 76.5), ('의류학전공', 83.86),
    ('애니메이션전공', 82.04),
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

merge('dankook', '2023', DANKOOK_2023)
merge('smu',     '2025', SMU_2025)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

added = len(DANKOOK_2023) + len(SMU_2025)
print(f'23 단국대 + 25 상명대 — {added}개')

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
