#!/usr/bin/env python3
"""namuacademy batch 5 — 23·24·26 학년도 데이터 추가."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 24학년도 — namuacademy wr_id=364
KW_2024 = [
    ('전자공학과', 82.5), ('수학과', 77.8),
    ('미디어커뮤니케이션학부', 83.8), ('경영학부', 78.8),
    ('법학부', 83.8), ('전자바이오물리학과', 79.0),
]
MJU_2024 = [
    ('반도체공학과', 79.67), ('토목교통공학부', 75.33),
    ('패션디자인전공', 91.0), ('자연과학대학', 75.33),
    ('융합소프트웨어학부', 84.67), ('법학과', 79.67),
]
SMU_2024 = [
    ('수학교육과', 91.6), ('국가안보학과', 78.1),
    ('사진영상미디어전공', 89.40), ('AR·VR미디어디자인전공', 93.80),
    ('건설시스템공학부', 79.10),
]
CATHOLIC_2024 = [
    ('의예과', 99.7), ('인문계열', 78.5),
    ('데이터사이언스학과', 80.9), ('생활과학계열', 80.7),
    ('바이오메디컬소프트웨어학과', 81.6), ('어문계열', 77.6),
]

# 23학년도 — namuacademy wr_id=311 (백분위 데이터만 추출)
MJU_2023 = [
    ('자연과학대학', 73.3), ('건축학부 (공간디자인)', 73.3),
    ('융합소프트웨어학부', 85.0),
]
SMU_2023 = [
    ('컴퓨터과학전공', 91.35),  # 88.9~93.8 평균
]

# 26학년도 — namuacademy wr_id=568
MJU_2026 = [
    ('건축대학', 83.7), ('화학생명과학대학', 77.7),
    ('반도체ICT대학', 77.7),
]
CATHOLIC_2026 = [
    ('의예과', 99.2), ('약학과', 96.7),
    ('인문사회계열', 79.3), ('데이터사이언스학과', 79.3),
    ('특수교육과', 79.3),
]

# 25학년도 여대 — namuacademy wr_id=431
SWU_2025 = [
    ('생명환경공학과', 94.91), ('기독교학과', 86.11),
]
DONGDUK_2025 = [
    ('약학과', 96.17), ('문화예술경영전공', 91.0),
    ('정보통계학전공', 72.0), ('시각&실내디자인 (시각)', 86.0),
    ('패션디자인전공 (야간)', 71.0),
]
DUKSUNG_2025 = [
    ('약학대학', 97.21), ('글로벌융합대학 (유아교육과)', 87.82),
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

# 24학년도
merge('kw',       '2024', KW_2024)
merge('mju',      '2024', MJU_2024)
merge('smu',      '2024', SMU_2024)
merge('catholic', '2024', CATHOLIC_2024)

# 23학년도
merge('mju', '2023', MJU_2023)
merge('smu', '2023', SMU_2023)

# 26학년도
merge('mju',      '2026', MJU_2026)
merge('catholic', '2026', CATHOLIC_2026)

# 25학년도 여대
merge('swu',      '2025', SWU_2025)
merge('dongduk',  '2025', DONGDUK_2025)
merge('duksung',  '2025', DUKSUNG_2025)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(KW_2024)+len(MJU_2024)+len(SMU_2024)+len(CATHOLIC_2024)+
         len(MJU_2023)+len(SMU_2023)+
         len(MJU_2026)+len(CATHOLIC_2026)+
         len(SWU_2025)+len(DONGDUK_2025)+len(DUKSUNG_2025))
print(f'추가 batch 시드 — 11개 학교/연도 / {total}개 학과')
