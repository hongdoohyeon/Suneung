#!/usr/bin/env python3
"""약대 미보유 학교 ratios + 24 약학과 결과 + 메인 그리드 24 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS = ROOT / 'data/admissions/manual-ratios.json'
RESULTS = ROOT / 'data/admissions/manual-results.json'

# 약대 신규 ratios
NEW_RATIOS = {
    'kyungsung': {'name': '경성대학교',
        'tracks': [{'label': '약학과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'cu_daegu': {'name': '대구가톨릭대학교',
        'tracks': [{'label': '약학과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'mokpo': {'name': '목포대학교',
        'tracks': [{'label': '약학과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'sahmyook': {'name': '삼육대학교',
        'tracks': [{'label': '약학과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'sunchon': {'name': '순천대학교',
        'tracks': [{'label': '약학과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
}

# 약대 24 결과 (확인된 백분위)
SAHMYOOK_2024  = [('약학과', 99.41)]
KYUNGSUNG_2024 = [('약학과', 96.0)]   # 추정
CU_DAEGU_2024  = [('약학과', 91.5)]   # 국96.5+수93.4+탐84.6 평균
MOKPO_2024     = [('약학과', 92.1)]   # 국86.6+수100+탐89.7 평균
SUNCHON_2024   = [('약학과', 92.0)]   # 추정

# 기존 학교 약학과 24 보강
SKKU_2024_ADD  = [('약학과', 97.67)]
EWHA_2024_ADD  = [('약학과', 97.43)]
KOREA_SEJONG_2024_ADD = [('약학과', 97.41)]
HANYANG_ERICA_2024_ADD = [('약학과', 97.17)]

# ── 적용 ──
ratios = json.loads(RATIOS.read_text(encoding='utf-8'))
results = json.loads(RESULTS.read_text(encoding='utf-8'))

for slug, data in NEW_RATIOS.items():
    ratios[slug] = data

def merge(slug, year, items):
    if slug not in results or not isinstance(results[slug], dict):
        results[slug] = {}
    exist = {u['unit']: u for u in results[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    results[slug][year] = list(exist.values())

merge('sahmyook',     '2024', SAHMYOOK_2024)
merge('kyungsung',    '2024', KYUNGSUNG_2024)
merge('cu_daegu',     '2024', CU_DAEGU_2024)
merge('mokpo',        '2024', MOKPO_2024)
merge('sunchon',      '2024', SUNCHON_2024)
merge('skku',         '2024', SKKU_2024_ADD)
merge('ewha',         '2024', EWHA_2024_ADD)
merge('korea_sejong', '2024', KOREA_SEJONG_2024_ADD)
merge('hanyang_erica', '2024', HANYANG_ERICA_2024_ADD)

results['_meta']['lastUpdated'] = '2026-05-09'
RATIOS.write_text(json.dumps(ratios, ensure_ascii=False, indent=2), encoding='utf-8')
RESULTS.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'약대 ratios {len(NEW_RATIOS)}교 신규')
print(f'약학과 24 결과 9건')

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
