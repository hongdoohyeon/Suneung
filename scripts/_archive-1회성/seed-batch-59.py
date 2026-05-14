#!/usr/bin/env python3
"""텔레그노시스 정책 보강 1차:
  - 한국교원대·경인교대·경기대 ratios 신규
  - 24 부산대·전남대, 25 경기대 결과
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS = ROOT / 'data/admissions/manual-ratios.json'
RESULTS = ROOT / 'data/admissions/manual-results.json'

# ── 신규 ratios ──
NEW_RATIOS = {
    'kyonggi': {
        'name': '경기대학교',
        'tracks': [
            {'label': '인문계열',  'ratios': {'국어': 35, '수학': 30, '영어': 20, '탐구': 15}},
            {'label': '자연계열',  'ratios': {'국어': 30, '수학': 35, '영어': 20, '탐구': 15}},
        ],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 80, '5': 70,
                           '6': 58, '7': 44, '8': 28, '9': 10}
    },
    'gnue_in': {
        'name': '경인교육대학교',
        'tracks': [
            {'label': '초등교육과', 'ratios': {'국어': 33.3, '수학': 33.3, '탐구': 33.3}},
        ],
        'english_grades': {'1': 100, '2': 97, '3': 92, '4': 85, '5': 75,
                           '6': 60, '7': 42, '8': 22, '9': 0}
    },
    'knue': {
        'name': '한국교원대학교',
        'tracks': [
            {'label': '인문·사회 (어문·사회)',
             'ratios': {'국어': 40, '수학': 30, '탐구': 30}},
            {'label': '자연·이공',
             'ratios': {'국어': 20, '수학': 40, '탐구': 40}},
        ],
        'english_grades': {'1': 100, '2': 97, '3': 93, '4': 88, '5': 80,
                           '6': 70, '7': 55, '8': 35, '9': 10}
    },
}

# ── 결과 ──
PUSAN_2024 = [
    ('중어중문학과', 79.83), ('언어정보학과', 73.0), ('문헌정보학과', 78.5),
    ('통계학과', 82.5), ('미생물학과', 80.5),
    ('화공생명·환경공학부', 89.5),
    ('전기전자공학부 (반도체공학전공)', 88.0),
    ('건축학과', 82.67), ('경영학과', 84.33),
    ('공공정책학부', 82.17), ('국어교육과', 82.17),
    ('영어교육과', 82.5), ('수학교육과', 85.33),
    ('생물교육과', 84.83), ('간호학과', 82.83),
    ('바이오소재과학과', 74.67), ('한의학전문대학원', 96.17),
    ('행정학과', 82.0), ('정치외교학과', 81.5),
    ('생명과학과', 83.0), ('기계공학부', 84.17),
    ('재료공학부', 83.5), ('항공우주공학과', 83.33),
    ('경제학부', 83.67), ('약학부', 96.33), ('의예과', 98.0),
    ('치의학전문대학원', 96.67),
]

JNU_2024 = [
    ('간호학과', 83.17), ('건축학부', 80.67),
    ('전자컴퓨터공학과', 81.33), ('전기공학과', 90.17),
    ('국어교육과', 81.33), ('수학교육과', 79.83),
    ('행정학과', 72.83), ('의예과', 97.67),
    ('영어영문학과', 70.5), ('통계학과', 77.0),
    ('인공지능학부', 77.0), ('치의학과', 97.5),
    ('경제학부', 71.5), ('토목공학과', 78.5),
    ('조경학과', 72.17), ('역사교육과', 75.5),
    ('수의예과', 95.5), ('약학부', 95.83), ('수학과', 73.17),
]

KYONGGI_2025 = [
    ('건축학과 (5년제)', 82.7), ('자유전공학부 (수원)', 81.95),
    ('AI컴퓨터공학부 인공지능전공', 81.7),
    ('공공안전학부', 81.6), ('전자공학부', 81.25),
    ('호텔외식경영학부', 81.2), ('창의공과대학 (통합)', 81.1),
    ('미디어영상학과', 81.0), ('관광문화콘텐츠학과', 80.8),
    ('수학과', 80.75), ('신소재화학공학부', 80.65),
    ('바이오융합학부', 80.5), ('기계시스템공학과', 80.45),
    ('법학과', 80.3), ('경제학부', 80.15), ('경영학부', 80.05),
    ('스포츠과학부', 88.0), ('체육학과', 84.0),
    ('시큐리티매니지먼트학과', 84.0),
]

# ── 적용 ──
ratios = json.loads(RATIOS.read_text(encoding='utf-8'))
results = json.loads(RESULTS.read_text(encoding='utf-8'))

# ratios merge
for slug, data in NEW_RATIOS.items():
    ratios[slug] = data

# results merge
def merge(slug, year, items):
    if slug not in results or not isinstance(results[slug], dict):
        results[slug] = {}
    exist = {u['unit']: u for u in results[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    results[slug][year] = list(exist.values())

merge('pusan',   '2024', PUSAN_2024)
merge('jnu',     '2024', JNU_2024)
merge('kyonggi', '2025', KYONGGI_2025)

results['_meta']['lastUpdated'] = '2026-05-09'

RATIOS.write_text(json.dumps(ratios, ensure_ascii=False, indent=2), encoding='utf-8')
RESULTS.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'신규 ratios: {len(NEW_RATIOS)}교 ({", ".join(NEW_RATIOS.keys())})')
print(f'24 부산대 {len(PUSAN_2024)}, 24 전남대 {len(JNU_2024)}, 25 경기대 {len(KYONGGI_2025)}')

# 매트릭스
years = {}
total = 0
for s, v in results.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
for y in sorted(years, reverse=True):
    print(f'  {y}학년도: {years[y]}개교')
print(f'  총 학과: {total}')
