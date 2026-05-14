#!/usr/bin/env python3
"""namuacademy batch 7 — 23학년도 경기·가천대 + 마무리."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

GACHON_2023 = [
    ('한의예과', 99.52), ('연기예술학과 (연기)', 76.0),
    ('간호학과', 91.26), ('유아교육학과', 79.3),
    ('디자인학과 (산업)', 90.8), ('체육학부 (태권도)', 74.1),
]
GG_2023 = [
    ('유아교육과 (수원캠)', 75.7),
    ('컴퓨터공학전공 (수원캠)', 84.2),
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

merge('gachon', '2023', GACHON_2023)
# 경기대 슬러그 — manual-ratios 에 'kgu' 인지 확인
slugs = list(r.keys())
gg_slug = next((s for s in slugs if r.get(s, {}).get('name', '').startswith('경기대')), None)
if gg_slug:
    merge(gg_slug, '2023', GG_2023)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = len(GACHON_2023) + (len(GG_2023) if gg_slug else 0)
print(f'추가 batch — 23학년도 경기/가천 / {total}개 학과')
