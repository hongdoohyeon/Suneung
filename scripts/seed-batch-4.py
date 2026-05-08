#!/usr/bin/env python3
"""namuacademy 추가 batch — 중앙대·외대·시립대·이대·숙대·성신·가천 25학년도."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

CAU_2025 = [
    ('약학부', 97.49), ('경영학부 (글로벌금융)', 92.49),
    ('생명자원공학부 (식물생명공학)', 71.75),
    ('사회기반시스템공학부 (도시시스템공학)', 92.55),
    ('예술공학부', 76.5),
]
KHU_2025_EXTRA = [
    ('정보디스플레이학과', 91.5), ('한국어학과', 84.33),
    ('한의예과', 97.21), ('치의예과', 97.33),
    ('디지털콘텐츠학과', 98.5), ('스포츠지도학과', 44.0),
    ('태권도학과', 85.5), ('건축공학과', 87.5),
]
HUFS_2025 = [
    ('Language & Trade학부', 90.17),
    ('디지털콘텐츠학부', 70.17),
    ('Language & Diplomacy학부', 91.0),
    ('세르비아크로아티아어과', 73.33),
]
UOS_2025 = [
    ('인공지능학과', 91.3), ('지능형반도체전공', 87.0),
    ('도시공학과', 91.7), ('스포츠과학과', 78.2),
]
EWHA_2025 = [
    ('의예과 (자연)', 98.5), ('약학전공', 97.0),
    ('사회과교육과', 87.67), ('교육학과', 87.83),
]
SOOKMYUNG_2025 = [
    ('인공지능학부', 88.88), ('수학과', 83.88),
]
SUNGSHIN_2025 = [
    ('간호학과 (인문)', 88.15), ('간호학과 (자연)', 88.13), ('디자인과', 87.51),
]
GACHON_2025 = [
    ('의예과', 98.8), ('한의예과', 98.8), ('약학과', 96.85),
    ('컴퓨터공학과', 86.46), ('법학과', 81.2),
    ('간호학과', 88.92), ('유아교육학과', 81.25),
    ('클라우드공학과', 90.95), ('신소재공학과', 81.4),
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

merge('cau',       '2025', CAU_2025)
merge('khu',       '2025', KHU_2025_EXTRA)
merge('hufs',      '2025', HUFS_2025)
merge('uos',       '2025', UOS_2025)
merge('ewha',      '2025', EWHA_2025)
merge('sookmyung', '2025', SOOKMYUNG_2025)
merge('gachon',    '2025', GACHON_2025)

# 성신여대 — 슬러그 'sungshin' 확인
merge('sungshin',  '2025', SUNGSHIN_2025)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')
total = sum(len(d) for d in [CAU_2025, KHU_2025_EXTRA, HUFS_2025, UOS_2025, EWHA_2025, SOOKMYUNG_2025, SUNGSHIN_2025, GACHON_2025])
print(f'추가 batch 시드 — 8개 학교 / {total}개 학과')
