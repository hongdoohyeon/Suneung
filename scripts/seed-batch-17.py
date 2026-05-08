#!/usr/bin/env python3
"""Phase 1 batch 1 — 명지·중앙·부산·가천 25학년도 보강 (ipsihogu)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 명지대 25 — ipsihogu (2025 입결, 26 페이지에서)
MJU_2025_EXTRA = [
    ('스마트시스템공학과', 77.0), ('반도체ICT학부', 65.0),
    ('화학생명과학과', 54.0), ('건축학부', 65.0),
    ('자연과학계열 자유전공', 68.0),
]

# 중앙대 25 — ipsihogu (영역별 평균 환산)
CAU_2025_EXTRA = [
    ('영어영문학과', 89.17), ('철학과', 91.17),
    ('역사학과', 89.33), ('공공인재학부', 92.5),
    ('문헌정보학과', 91.83), ('약학부', 96.17),
    ('의학부', 99.0), ('소프트웨어학부', 93.5),
    ('경영학부 (경영학)', 91.83),
]

# 부산대 25 — ipsihogu (영역별 평균 환산)
PUSAN_2025_EXTRA = [
    ('의예과', 97.0), ('약학부', 94.33), ('한의학', 96.17),
    ('간호학과', 82.5), ('전자공학과', 87.5),
    ('기계공학과', 84.0), ('컴퓨터공학과', 85.0),
    ('인공지능학과', 83.67),
]

# 가천대 25 — ipsihogu 직접 백분위
GACHON_2025_EXTRA = [
    ('항공관광경영학과', 82.6), ('금융빅데이터학과', 83.7),
    ('경제학과', 83.1), ('응용통계학과', 83.4),
    ('AI인문대학', 81.9), ('법학과', 82.7),
    ('도시계획조경학과', 82.5), ('화공배터리공학과', 83.2),
    ('생명과학과', 83.6), ('반도체물리학과', 83.8),
    ('전기공학과', 83.7), ('컴퓨터공학과', 85.4),
    ('한의예과', 97.5), ('연기예술학과 (연출)', 74.4),
    ('연기예술학과 (연기)', 66.0),
    ('약학과', 96.8), ('의예과', 98.4),
    ('회계세무학과', 84.5), ('심리학과', 83.0),
    ('사회복지학과', 82.5), ('유아교육학과', 81.3),
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

merge('mju',    '2025', MJU_2025_EXTRA)
merge('cau',    '2025', CAU_2025_EXTRA)
merge('pusan',  '2025', PUSAN_2025_EXTRA)
merge('gachon', '2025', GACHON_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(MJU_2025_EXTRA) + len(CAU_2025_EXTRA) +
         len(PUSAN_2025_EXTRA) + len(GACHON_2025_EXTRA))
print(f'Phase 1 batch 1 — 4개 학교 / {total}개 학과')

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
