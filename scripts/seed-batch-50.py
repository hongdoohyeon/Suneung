#!/usr/bin/env python3
"""22학년도 3차: 광운·국민·단국·서울과기·세종·숭실 (베리타스 381215 - 수도권 9개교 입결)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

KW_2022 = [
    ('전자공학과', 80.83), ('소프트웨어학부', 80.33),
    ('로봇학부', 79.0), ('컴퓨터정보공학부', 79.67),
]

KOOKMIN_2022 = [
    ('영상디자인학과 (비실기)', 94.67),
    ('공간디자인학과 (비실기)', 91.67),
    ('시각디자인학과', 90.5),
    ('경영학부 빅데이터경영통계전공 (인문)', 90.33),
]

DANKOOK_2022 = [
    ('국제학부 (국제경영학전공)', 86.33),
    ('커뮤니케이션학부', 85.83),
    ('공연영화학부 연극(연출)', 84.67),
    ('영미인문학과', 84.17),
]

SEOULTECH_2022 = [
    ('산업공학과-ITM전공 (인문)', 91.33),
    ('문예창작학과', 89.5),
    ('산업공학과-ITM전공 (자연)', 88.0),
    ('경영학과-글로벌테크노경영전공', 86.33),
]

SEJONG_2022 = [
    ('항공시스템공학과', 81.33),
    ('국방시스템공학과', 81.0),
]

SSU_2022 = [
    ('회계학과', 87.83), ('금융학부', 87.83),
    ('건축학부 (실내건축)', 87.83), ('법학과', 87.5),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-09'

def merge(slug, year, items):
    if slug not in r or not isinstance(r[slug], dict):
        r[slug] = {}
    exist = {u['unit']: u for u in r[slug].get(year, [])}
    for u, p in items:
        exist[u] = {'unit': u, 'pct70': p}
    r[slug][year] = list(exist.values())

merge('kw',        '2022', KW_2022)
merge('kookmin',   '2022', KOOKMIN_2022)
merge('dankook',   '2022', DANKOOK_2022)
merge('seoultech', '2022', SEOULTECH_2022)
merge('sejong',    '2022', SEJONG_2022)
merge('ssu',       '2022', SSU_2022)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

added = sum(map(len, [KW_2022, KOOKMIN_2022, DANKOOK_2022,
                       SEOULTECH_2022, SEJONG_2022, SSU_2022]))
print(f'22학년도 4차 — {added}개 학과 (6교)')

years = {}
total = 0
for s, v in r.items():
    if s.startswith('_') or not isinstance(v, dict): continue
    for y, u in v.items():
        if not isinstance(u, list): continue
        years[y] = years.get(y, 0) + 1
        total += len(u)
print(f'  22학년도: {years.get("2022", 0)}개교')
print(f'  총 학과: {total}')
