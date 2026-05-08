#!/usr/bin/env python3
"""동국대 24학년도 정시 — 입학처 PDF 직접 파싱 (50개 학과)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 동국대 서울 입학처 PDF (ipsi.dongguk.edu/upload/file/20240501095746JHGHCW.PDF)
# 80%컷 평균 백분위 기준
DONGGUK_2024 = [
    ('불교학부', 85.52), ('문화재학과', 87.46),
    ('국어국문문예창작학부', 86.80), ('영어영문학부', 87.06),
    ('일본학과', 86.52), ('중어중문학과', 87.22),
    ('철학과', 87.16), ('사학과', 87.40),
    ('수학과', 88.53), ('화학과', 88.80),
    ('통계학과', 88.48), ('물리학과', 88.62),
    ('법학과', 87.79), ('정치외교학전공', 87.07),
    ('행정학전공', 87.78), ('북한학전공', 86.28),
    ('경제학과', 88.28), ('국제통상학과', 87.82),
    ('사회학전공', 86.83), ('미디어커뮤니케이션학전공', 87.89),
    ('식품산업관리학과', 88.41), ('광고홍보학과', 87.75),
    ('사회복지학과', 87.25), ('경찰행정학부', 90.90),
    ('경영학과', 87.99), ('회계학과', 88.39),
    ('경영정보학과', 88.34),
    ('바이오환경과학과', 87.81), ('생명과학과', 88.44),
    ('식품생명공학과', 87.24), ('의생명공학과', 88.43),
    ('전자전기공학부', 89.55), ('정보통신공학과', 89.08),
    ('건설환경공학과', 88.28), ('화공생물공학과', 88.80),
    ('기계로봇에너지공학과', 89.02), ('건축공학부', 88.19),
    ('산업시스템공학과', 88.70), ('에너지신소재공학과', 89.16),
    ('AI소프트웨어융합학부 (인문)', 89.02), ('AI소프트웨어융합학부 (자연)', 90.03),
    ('시스템반도체학부', 90.02),
    ('교육학과', 87.91), ('국어교육과', 86.73),
    ('역사교육과', 87.66), ('지리교육과', 87.59),
    ('수학교육과', 87.86), ('가정교육과', 87.53),
    ('영화영상학과', 87.57),
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

merge('dongguk', '2024', DONGGUK_2024)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'동국대 24학년도 입학처 PDF 시드 — {len(DONGGUK_2024)}개 학과')

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
