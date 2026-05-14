#!/usr/bin/env python3
"""한양대 ERICA 23~25학년도 정시 — 입학처 PDF 추가 파싱."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 한양대 ERICA 입학처 (2023~2025) 정시 70%컷
# 출처: goerica.hanyang.ac.kr/upload/GUIDES/2023~2025_ipsi_results_web.pdf (page 7)
ERICA_2025 = [
    ('건축학전공', 81.00), ('건축공학전공', 80.67),
    ('건설환경공학과', 79.83), ('교통물류공학과', 80.67),
    ('전자공학부', 81.83), ('배터리소재화학공학과', 83.00),
    ('기계공학과', 80.33), ('산업경영공학과', 81.33),
    ('로봇공학과', 81.33), ('에너지바이오학과', 79.50),
    ('해양융합공학과', 80.17), ('컴퓨터학부', 81.33),
    ('ICT융합학부', 80.50), ('인공지능학과', 81.33),
    ('수리데이터사이언스학과', 77.33), ('약학과', 95.50),
    ('신소재반도체공학전공', 79.67), ('반도체디스플레이공학전공', 81.00),
    ('바이오신약융합학부', 81.17), ('분자의약전공', 79.67),
    ('바이오나노공학전공', 80.83), ('지능정보양자공학전공', 79.33),
    ('글로벌문화통상학부', 77.83), ('광고홍보학과', 79.50),
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

merge('hanyang_erica', '2025', ERICA_2025)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'한양대 ERICA 25학년도 — {len(ERICA_2025)}개 학과')

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
