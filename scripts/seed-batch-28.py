#!/usr/bin/env python3
"""Phase 2 batch 7 — 강원·전북·서울여 24 베리타스."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

KANGWON_2024 = [
    ('의예과', 98.2), ('수의예과', 97.4), ('약학과', 96.6),
    ('간호학과', 78.6), ('자연과학대학 자유전공', 75.2),
]

JBNU_2024 = [
    ('의예과', 98.33), ('치의예과', 98.0),
    ('의예과 (지역인재)', 97.5), ('약학과', 97.33),
    ('수의예과', 96.5), ('치의예과 (지역인재)', 94.5),
    ('역사교육과', 78.33), ('생물교육과', 77.83),
]

SWU_2024 = [
    ('생명환경공학과', 94.91), ('첨단미디어디자인학과', 93.83),
    ('언론영상학부', 93.82), ('자율전공학부 (자연)', 93.50),
    ('바이오헬스융합학과', 93.46),
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

merge('kangwon', '2024', KANGWON_2024)
merge('jbnu',    '2024', JBNU_2024)
merge('swu',     '2024', SWU_2024)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(KANGWON_2024) + len(JBNU_2024) + len(SWU_2024)
print(f'Phase 2 batch 7 — 3개 학교 / {total}개 학과')

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
