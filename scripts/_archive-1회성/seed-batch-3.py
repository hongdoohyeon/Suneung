#!/usr/bin/env python3
"""namuacademy + 베리타스 추가 batch — 메이저 학교 25학년도 70%컷 보강."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 서울대 25 — namuacademy wr_id=138 (베리타스 단독 기사는 환산점수만)
SNU_2025 = [
    ('의예과', 99.0), ('정치외교학부', 98.25),
    ('수리과학부', 98.5), ('농경제사회학부', 98.5),
    ('약학계열', 98.5), ('인문계열', 96.25),
    ('첨단융합학부', 96.50),
]

# 서강대 25 — namuacademy wr_id=487
SOGANG_2025 = [
    ('시스템반도체공학과', 93.33),
    ('영문학부', 90.5), ('중국문화학과', 90.5),
]

# 성균관대 25 — namuacademy wr_id=487
SKKU_2025 = [
    ('의예과', 99.0), ('약학과', 97.0),
    ('반도체시스템공학과', 95.67), ('지능형소프트웨어학과', 95.67),
    ('소프트웨어학과', 94.83),
    ('영상학과', 91.33), ('한문교육과', 91.33),
    ('미술학과 (동양화)', 78.5), ('미술학과 (서양화)', 82.5),
    ('디자인학과 (서피스디자인)', 82.5),
]

# 부산대 25 — 베리타스 paywall 부분 정보만
PUSAN_2025 = [
    ('의예과', 99.0), ('의예과 (지역인재)', 97.41),
]

# 한양대 25 70%컷 추가 — namuacademy wr_id=487 (기존 80%컷 데이터 보완)
HANYANG_2025_70 = [
    ('의예과', 98.83), ('융합전자공학부', 94.01),
    ('반도체공학과', 95.45), ('수학과', 92.75),
    ('스포츠사이언스전공', 88.72), ('실내건축디자인학과', 91.38),
]

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

# 서울대 25 신규 (snu['2025'] 비어있으므로 직접 적재)
r.setdefault('snu', {}).setdefault('2025', [])
existing_units = {u['unit'] for u in r['snu']['2025']}
for u, p in SNU_2025:
    if u not in existing_units:
        r['snu']['2025'].append({'unit': u, 'pct70': p})

# 서강대 25 신규
r.setdefault('sogang', {})['2025'] = [{'unit': u, 'pct70': p} for u, p in SOGANG_2025]

# 성균관대 25 — 기존 negagea 33개 + 추가 (중복 학과는 명시 새값으로 교체)
exist_skku = {u['unit']: u for u in r.get('skku', {}).get('2025', [])}
for u, p in SKKU_2025:
    exist_skku[u] = {'unit': u, 'pct70': p}
r.setdefault('skku', {})['2025'] = list(exist_skku.values())

# 부산대 25 신규
r.setdefault('pusan', {})['2025'] = [{'unit': u, 'pct70': p} for u, p in PUSAN_2025]

# 한양대 25 70%컷 — 기존 80%컷 데이터를 70%컷으로 교체 (정확도 우선)
exist_hy = {u['unit']: u for u in r.get('hanyang', {}).get('2025', [])}
for u, p in HANYANG_2025_70:
    exist_hy[u] = {'unit': u, 'pct70': p}
r.setdefault('hanyang', {})['2025'] = list(exist_hy.values())

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')

total = (len(SNU_2025) + len(SOGANG_2025) + len(SKKU_2025) +
         len(PUSAN_2025) + len(HANYANG_2025_70))
print(f'추가 batch 시드 — 5개 학교 / {total}개 학과 (중복 제외 적재)')
