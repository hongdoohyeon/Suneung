#!/usr/bin/env python3
"""고려대 세종캠 24 정시 — 입학처 PDF 직접."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

KOREA_SEJONG_2024 = [
    ('응용수리과학부', 68.95), ('반도체물리학부', 69.42),
    ('신소재화학과', 69.55), ('컴퓨터융합소프트웨어학과', 69.48),
    ('전자및정보공학과', 68.47), ('생명정보공학과', 72.13),
    ('식품생명공학과', 68.82), ('전자기계융합공학과', 70.47),
    ('환경시스템공학과', 70.05), ('미래모빌리티학과', 69.82),
    ('지능형반도체공학과', 69.93), ('인공지능사이버보안학과', 72.10),
    ('약학과', 94.91),
    ('글로벌학부', 68.36), ('융합경영학부', 68.83),
    ('표준지식학과', 70.02), ('정부행정학부', 69.32),
    ('공공사회통일외교학부', 68.53), ('경제통계학부', 67.93),
    ('빅데이터사이언스학부', 72.08), ('국제스포츠학부', 51.93),
    ('문화유산융합학부', 68.98), ('문화창의학부', 72.95),
    ('스마트도시학부', 68.56),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

slug = 'korea_sejong'
if slug not in r or not isinstance(r[slug], dict):
    r[slug] = {'name': '고려대학교(세종)'}
exist = {u['unit']: u for u in r[slug].get('2024', [])}
for u, p in KOREA_SEJONG_2024:
    exist[u] = {'unit': u, 'pct70': p}
r[slug]['2024'] = list(exist.values())

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'고려대 세종 24 — {len(KOREA_SEJONG_2024)}개 학과')

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
