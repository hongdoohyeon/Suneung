#!/usr/bin/env python3
"""Phase 2 batch 15 — 26학년도 아주·한양ERICA·인천대 베리타스."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

AJOU_2026 = [
    ('의학과', 98.83), ('약학과', 94.5), ('첨단신소재공학과', 90.5),
    ('사이버보안학과', 90.33), ('지능형반도체공학과', 89.5),
    ('자유전공학부 (인문)', 88.83), ('간호학과 (교차)', 88.17),
    ('간호학과', 86.83), ('소프트웨어학과', 86.5),
    ('미래모빌리티공학과', 86.33), ('건축학과', 86.17),
    ('기계공학과', 86.17), ('전자공학과', 86.17),
    ('금융공학과', 85.83), ('자유전공학부 (자연)', 85.83),
    ('경영학과', 85.67), ('산업공학과', 85.67), ('응용화학과', 85.67),
    ('프론티어과학학부', 85.5),
]

HYERICA_2026 = [
    ('약학과', 97.0), ('전자공학부 지능형클라우드전공', 83.17),
    ('신소재반도체공학전공', 83.0), ('분자의약전공', 83.0),
    ('반도체디스플레이공학전공', 82.67),
    ('산업경영공학과', 82.5), ('인공지능학과', 82.5),
    ('컴퓨터학부', 82.33),
]

INU_2026 = [
    ('윤리교육과', 85.9), ('동북아국제통상학부', 85.1),
    ('경영학과', 85.0), ('영어교육과', 84.6),
    ('생명공학부', 84.4), ('컴퓨터공학부', 84.3),
    ('도시행정학과', 83.9), ('체육교육과', 83.8),
    ('전기공학과', 83.5), ('기계공학과', 83.4),
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

merge('ajou',          '2026', AJOU_2026)
merge('hanyang_erica', '2026', HYERICA_2026)
merge('inu',           '2026', INU_2026)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(AJOU_2026) + len(HYERICA_2026) + len(INU_2026)
print(f'Phase 2 batch 15 — 3 / {total}개 학과')

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
