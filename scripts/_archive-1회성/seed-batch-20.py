#!/usr/bin/env python3
"""Phase 1 batch 4 — 이화·숙명·한외·서울대 25/24 풍부화."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 이화여대 25 — ipsihogu 영역평균 환산
EWHA_2025_EXTRA = [
    ('유아교육과', 86.83), ('초등교육과', 90.5),
    ('교육공학과', 89.83), ('특수교육과', 91.33),
    ('영어교육과', 88.67), ('국어교육과', 88.33),
    ('수학교육과', 89.33), ('인문통합', 88.33),
    ('자연통합', 89.0),
    ('의예과 (인문)', 98.0), ('의예과 (자연)', 99.17),
    ('간호학과', 86.0), ('약학부', 97.33),
    ('AI데이터사이언스 (인문)', 92.33), ('AI데이터사이언스 (자연)', 89.17),
]

# 숙명여대 25 — ipsihogu 영역평균 환산
SOOKMYUNG_2025_EXTRA = [
    ('한국어문학부', 79.33),  # (93+70+77)/3
    ('역사문화학과', 82.83),  # (91+70+(83+86)/2)/3 = (91+70+84.5)/3
    ('약학부', 95.5),         # (97+98+(85+90)/2)/3 = (97+98+87.5)/3
    ('법학부', 79.33),        # (93+70+(75+75)/2)/3 = (93+70+75)/3
    ('경제학부', 81.0),       # (86+83+(79+71)/2)/3 = (86+83+75)/3
    ('수학과', 70.33),        # (68+98+(68+56)/2)/3 = (68+98+62)/3
    ('인공지능공학부', 84.0), # (91+92+(74+64)/2)/3 = (91+92+69)/3
    ('기계시스템학부', 81.33),# (86+87+(75+71)/2)/3 = (86+87+73)/3
]

# 한국외대 25 — ipsihogu 컴퓨터공학 추가
HUFS_2025_EXTRA = [
    ('컴퓨터공학과', 73.33),
]

# 서울대 24 — ipsihogu 풍부 (기존 24 데이터 보강)
SNU_2024_EXTRA = [
    ('국사학과', 96.75), ('정치외교학부', 97.5),
    ('경제학부', 98.25), ('사회학과', 97.75),
    ('심리학과', 97.25), ('지리학과', 97.5),
    ('사회복지학과', 95.0), ('언론정보학과', 94.75),
    ('수리과학부', 98.5), ('통계학과', 95.5),
    ('물리천문학부 (물리)', 95.25), ('물리천문학부 (천문)', 96.5),
    ('화학부', 98.25), ('생명과학부', 97.75),
    ('지구환경과학부', 96.5), ('간호대학', 95.75),
    ('경영대학', 96.75),
    ('건설환경공학부', 98.25), ('기계공학부', 96.25),
    ('재료공학부', 97.25), ('전기정보공학부', 97.25),
    ('컴퓨터공학부', 97.25), ('화학생물공학부', 98.25),
    ('건축학과', 91.75), ('산업공학과', 96.0),
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

merge('ewha',      '2025', EWHA_2025_EXTRA)
merge('sookmyung', '2025', SOOKMYUNG_2025_EXTRA)
merge('hufs',      '2025', HUFS_2025_EXTRA)
merge('snu',       '2024', SNU_2024_EXTRA)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(EWHA_2025_EXTRA) + len(SOOKMYUNG_2025_EXTRA) +
         len(HUFS_2025_EXTRA) + len(SNU_2024_EXTRA))
print(f'Phase 1 batch 4 — 4개 학교 / {total}개 학과')

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
