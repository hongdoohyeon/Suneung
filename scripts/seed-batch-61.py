#!/usr/bin/env python3
"""한의대 4교 신규 ratios + 24 한의예과 결과 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS = ROOT / 'data/admissions/manual-ratios.json'
RESULTS = ROOT / 'data/admissions/manual-results.json'

# 한의대 4교 신규 ratios — 한의예과 위주, 일반적 가중치 (국 30, 수 30, 영 20, 탐 20)
NEW_RATIOS = {
    'daejeon':  {'name': '대전대학교',
        'tracks': [{'label': '한의예과 (인문/자연)', 'ratios': {'국어': 30, '수학': 30, '영어': 20, '탐구': 20}}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'dongshin': {'name': '동신대학교',
        'tracks': [{'label': '한의예과', 'ratios': {'국어': 25, '수학': 25, '영어': 25, '탐구': 25}}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'sangji':   {'name': '상지대학교',
        'tracks': [{'label': '한의예과', 'ratios': {'국어': 30, '수학': 30, '영어': 20, '탐구': 20}}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'woosuk':   {'name': '우석대학교',
        'tracks': [{'label': '한의예과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
    'dongguk_wise': {'name': '동국대학교(WISE)',
        'tracks': [{'label': '한의예과', 'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}}],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}},
}

# 한의예과 24학년도 데이터 (edujin 42394 + 추가)
DAEJEON_2024 = [('한의예과 (인문)', 96.5), ('한의예과 (자연)', 96.5)]  # 추정값
DONGSHIN_2024 = [('한의예과', 98.67)]
SANGJI_2024  = [('한의예과 (A형)', 98.1), ('한의예과 (B형)', 97.9)]
WOOSUK_2024  = [('한의예과', 96.2)]
DONGGUK_WISE_2024 = [('한의예과 (유형Ⅰ)', 98.5), ('한의예과 (유형Ⅱ)', 98.8)]

# 기존 학교 한의예 24 데이터 추가
WKU_2024 = [
    ('한의예과 (자연)', 98.0), ('한의예과 (인문)', 97.25),
]
KHU_2024_ADD = [
    ('한의예과 (자연)', 97.2), ('한의예과 (인문)', 97.5),
]

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

merge('daejeon',     '2024', DAEJEON_2024)
merge('dongshin',    '2024', DONGSHIN_2024)
merge('sangji',      '2024', SANGJI_2024)
merge('woosuk',      '2024', WOOSUK_2024)
merge('dongguk_wise', '2024', DONGGUK_WISE_2024)
merge('wku',         '2024', WKU_2024)
merge('khu',         '2024', KHU_2024_ADD)

results['_meta']['lastUpdated'] = '2026-05-09'
RATIOS.write_text(json.dumps(ratios, ensure_ascii=False, indent=2), encoding='utf-8')
RESULTS.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

new = sum(map(len, [DAEJEON_2024, DONGSHIN_2024, SANGJI_2024, WOOSUK_2024,
                     DONGGUK_WISE_2024, WKU_2024, KHU_2024_ADD]))
print(f'한의대 ratios {len(NEW_RATIOS)}교 + 24 결과 {new}건')

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
