#!/usr/bin:env python3
"""의약 카테고리 보강 — 한림대·건양대·인제대 + 24 아주대 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS = ROOT / 'data/admissions/manual-ratios.json'
RESULTS = ROOT / 'data/admissions/manual-results.json'

# ── 신규 ratios ──
# 한림대: 일반 — 1순위 70 + 2순위 30 (국·수·탐 동등 가정), 의학과 — 국 20 수 40 영 10 탐 30, 간호 — 영 30 수 40 국탐 30
NEW_RATIOS = {
    'hallym': {
        'name': '한림대학교',
        'tracks': [
            {'label': '의학과',     'ratios': {'국어': 20, '수학': 40, '영어': 10, '탐구': 30}, 'math_pick': '미적분/기하'},
            {'label': '간호학과',   'ratios': {'국어': 15, '수학': 40, '영어': 30, '탐구': 15}},
            {'label': '일반계열',   'ratios': {'국어': 35, '수학': 35, '탐구': 30}},
        ],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 76, '5': 59, '6': 39, '7': 22, '8': 10, '9': 0}
    },
    'konyang': {
        'name': '건양대학교',
        'tracks': [
            {'label': '의학과',     'ratios': {'국어': 20, '수학': 30, '영어': 20, '탐구': 30}, 'math_pick': '미적분/기하'},
            {'label': '일반학과',   'ratios': {'국어': 33.3, '수학': 33.3, '영어': 33.3, '탐구': 33.3}},
        ],
        'english_grades': {'1': 100, '2': 98, '3': 96, '4': 94, '5': 92, '6': 90, '7': 88, '8': 86, '9': 84}
    },
    'inje': {
        'name': '인제대학교',
        'tracks': [
            {'label': '의예과',     'ratios': {'국어': 25, '수학': 30, '영어': 20, '탐구': 25}, 'math_pick': '미적분/기하'},
            {'label': '일반계열',   'ratios': {'국어': 30, '수학': 30, '영어': 20, '탐구': 20}},
        ],
        'english_grades': {'1': 100, '2': 95, '3': 88, '4': 78, '5': 65, '6': 50, '7': 35, '8': 20, '9': 0}
    },
}

# ── 결과 ──
# 건양대 24: 일반학과 70%컷/3, 의학과 70%컷/4 = 평균 백분위
KONYANG_2024 = [
    ('의학과', 98.45),  # 393.80/4
    ('작업치료학과', 78.33), ('안경광학과', 82.0), ('임상병리학과', 84.33),
    ('방사선학과', 86.33), ('치위생학과', 79.03), ('물리치료학과', 87.67),
    ('응급구조학과', 81.7), ('심리상담치료학과', 72.93),
    ('유아교육과', 60.0), ('국방경찰행정학부', 71.0),
    ('간호학과', 91.43), ('병원경영학과', 79.47),
    ('의공학과', 81.07), ('의료IT공학과', 77.47),
    ('의료공간디자인학과', 72.5), ('제약생명공학과', 82.53),
    ('의료신소재학과', 65.47), ('인공지능학과', 74.9),
    ('기업소프트웨어학부', 71.1), ('스마트보안학과', 60.13),
    ('임상의약학과', 70.8), ('의약바이오학과', 71.0),
    ('재난안전소방학과', 72.4), ('반도체공학과', 64.93),
    ('아동교육학과', 67.67), ('초등특수교육과', 57.0),
    ('중등특수교육과', 50.33), ('사회복지학과', 61.2),
    ('디지털콘텐츠학과', 65.0), ('융합디자인학과', 75.13),
    ('글로벌의료뷰티학과', 50.33), ('경영학부', 65.8),
    ('호텔관광학과', 63.0), ('금융세무학부', 66.9),
]

# 한림대 25: 등급 평균 → 백분위 추정 (1등급=95, 2등급=89, 3등급=80 기준)
def grade_to_pct(g):
    if g <= 1.5: return 99 - (g - 1.0) * 6   # 1.0=99, 1.2=97.8, 1.5=96
    elif g <= 2.0: return 96 - (g - 1.5) * 8  # 1.5=96, 2.0=92
    elif g <= 3.0: return 92 - (g - 2.0) * 6  # 2.0=92, 3.0=86
    elif g <= 4.0: return 86 - (g - 3.0) * 8  # 3.0=86, 4.0=78
    return max(0, 78 - (g - 4.0) * 10)

HALLYM_2025 = [
    ('의학과', round(grade_to_pct(1.2), 2)),
    ('인문학부', round(grade_to_pct(3.01), 2)),
    ('영어영문학과', round(grade_to_pct(2.53), 2)),
    ('중국학과', round(grade_to_pct(3.06), 2)),
    ('일본학과', round(grade_to_pct(2.79), 2)),
    ('러시아학과', round(grade_to_pct(3.11), 2)),
    ('심리학과', round(grade_to_pct(2.49), 2)),
    ('사회학과', round(grade_to_pct(3.09), 2)),
    ('사회복지학부', round(grade_to_pct(3.16), 2)),
    ('정치행정학과', round(grade_to_pct(2.96), 2)),
    ('법학과', round(grade_to_pct(3.0), 2)),
    ('경영대학', round(grade_to_pct(2.75), 2)),
    ('화학과', round(grade_to_pct(2.97), 2)),
    ('생명과학과', round(grade_to_pct(2.86), 2)),
    ('바이오메디컬학과', round(grade_to_pct(2.68), 2)),
    ('환경생명공학과', round(grade_to_pct(2.96), 2)),
    ('식품영양학과', round(grade_to_pct(3.0), 2)),
    ('언어청각학부', round(grade_to_pct(2.74), 2)),
    ('자연과학대학', round(grade_to_pct(3.02), 2)),
    ('소프트웨어학부', round(grade_to_pct(2.76), 2)),
    ('인공지능융합학부', round(grade_to_pct(2.99), 2)),
    ('데이터사이언스학부', round(grade_to_pct(2.91), 2)),
    ('간호학과', round(grade_to_pct(2.85), 2)),
    ('글로벌학부', round(grade_to_pct(2.77), 2)),
    ('융합과학수사학과', round(grade_to_pct(2.77), 2)),
    ('미디어스쿨', round(grade_to_pct(2.79), 2)),
    ('반도체·디스플레이스쿨', round(grade_to_pct(3.06), 2)),
    ('미래융합스쿨', round(grade_to_pct(3.0), 2)),
]

# 인제대 25: 의예 백분위 평균 97.72
INJE_2025 = [
    ('의예과', 97.72),
]

# 24 아주대 추가 (이미 ratios·일부 results 있음, 의·약·소프트·응용화학 추가)
AJOU_2024 = [
    ('의학과', 97.33), ('약학과', 96.67),
    ('소프트웨어학과', 89.33), ('응용화학생명공학과', 77.0),
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

merge('konyang', '2024', KONYANG_2024)
merge('hallym',  '2025', HALLYM_2025)
merge('inje',    '2025', INJE_2025)
merge('ajou',    '2024', AJOU_2024)

results['_meta']['lastUpdated'] = '2026-05-09'
RATIOS.write_text(json.dumps(ratios, ensure_ascii=False, indent=2), encoding='utf-8')
RESULTS.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'신규 ratios: 한림·건양·인제 (3교)')
print(f'24 건양 {len(KONYANG_2024)} / 25 한림 {len(HALLYM_2025)} / 25 인제 {len(INJE_2025)} / 24 아주 {len(AJOU_2024)}')

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
