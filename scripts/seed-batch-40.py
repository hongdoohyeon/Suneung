#!/usr/bin/env python3
"""Phase 2 batch 19 — 부산·경북·전남·전북 24 namuacademy."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

PUSAN_2024_NAMU = [
    ('의예과 (가군)', 96.83), ('조경학과', 66.0),
    ('의예과 (나군)', 97.83), ('식품공학과', 70.17),
]

KNU_2024_NAMU = [
    ('음악학과', 36.47),
    ('곤충생명과학과', 44.57),
]

JNU_2024 = [
    ('의예과', 97.83), ('냉동공조공학과', 34.83),
    ('수의예과', 95.83), ('스마트수산자원관리학과', 27.83),
    ('융합바이오시스템기계공학과', 51.83),
    ('헬스케어메디컬공학부', 32.0),
]

JBNU_2024_EXTRA = [
    ('작물생명과학과', 57.8),
    ('스포츠과학과', 35.8),
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

merge('pusan', '2024', PUSAN_2024_NAMU)
merge('knu',   '2024', KNU_2024_NAMU)
merge('jnu',   '2024', JNU_2024)
merge('jbnu',  '2024', JBNU_2024_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(PUSAN_2024_NAMU) + len(KNU_2024_NAMU) +
         len(JNU_2024) + len(JBNU_2024_EXTRA))
print(f'Phase 2 batch 19 — 4 / {total}개 학과')

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
