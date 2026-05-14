#!/usr/bin/env python3
"""Phase 1 batch 5 — 서강대 25 영역평균 풍부화 (22개 학과)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 서강대 25 — ipsihogu 영역별 백분위 → 평균 환산
SOGANG_2025_EXTRA = [
    ('인문학부', 89.17), ('영문학부', 88.83),
    ('유럽문화학과', 94.0), ('중국문화학과', 90.5),
    ('사회과학부', 88.33), ('경제학부', 93.17),
    ('경영학부', 93.5), ('한국학협동전공', 90.83),
    ('지식융합미디어학부', 91.17), ('수학과', 92.33),
    ('물리학과', 90.17), ('화학과', 91.33),
    ('생명과학과', 89.5), ('자연과학부', 94.17),
    ('전자공학과', 90.83), ('화공생명공학과', 91.83),
    ('기계공학과', 92.67), ('컴퓨터공학과', 89.17),
    ('인공지능학과', 93.5), ('시스템반도체공학과', 93.67),
    ('인문기반자유전공학부', 94.0), ('AI기반자유전공학부', 93.5),
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

merge('sogang', '2025', SOGANG_2025_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'서강대 25학년도 영역평균 — {len(SOGANG_2025_EXTRA)}개 학과')

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
print(f'총: {total_units} 학과 🎉')
