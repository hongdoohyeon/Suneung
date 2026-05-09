#!/usr/bin/env python3
"""정시 입결 데이터 스냅샷 export.

생성:
  data/admissions/exports/cuts.csv               — 학교·연도·학과·70%컷 평탄화
  data/admissions/exports/catalog.json           — 학교 인덱스 (슬러그·이름·연도·학과수·ratios 보유)
  data/admissions/exports/coverage-matrix.txt    — 학교×연도 매트릭스 (ASCII)
  data/admissions/exports/coverage-matrix.json   — 머신용 매트릭스
  data/admissions/exports/SCHEMA.txt             — 스키마 가이드
"""
import json, csv, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'admissions'
OUT = SRC / 'exports'
OUT.mkdir(exist_ok=True)

results = json.loads((SRC / 'manual-results.json').read_text(encoding='utf-8'))
ratios  = json.loads((SRC / 'manual-ratios.json').read_text(encoding='utf-8'))

today = datetime.date.today().isoformat()

# ── 1. CSV: 평탄화 (학교·연도·학과·70%컷) ──
csv_path = OUT / 'cuts.csv'
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['slug', 'school_name', 'year', 'unit', 'pct70'])
    rows = 0
    for slug, v in results.items():
        if slug.startswith('_') or not isinstance(v, dict): continue
        name = v.get('name') or ratios.get(slug, {}).get('name') or slug
        for year, units in v.items():
            if not isinstance(units, list): continue
            for u in units:
                w.writerow([slug, name, year, u['unit'], u['pct70']])
                rows += 1

# ── 2. catalog.json: 학교 인덱스 ──
catalog = {'_generated': today, '_total_schools': 0, '_total_units': 0, 'schools': []}
for slug in sorted(set(list(results.keys()) + list(ratios.keys()))):
    if slug.startswith('_'): continue
    rv = ratios.get(slug, {})
    res = results.get(slug, {})
    if not isinstance(rv, dict) and not isinstance(res, dict): continue

    name = (rv.get('name') if isinstance(rv, dict) else None) \
           or (res.get('name') if isinstance(res, dict) else None) or slug

    years = {}
    if isinstance(res, dict):
        for y, items in res.items():
            if isinstance(items, list):
                years[y] = len(items)

    has_ratios = bool(isinstance(rv, dict) and rv.get('tracks'))
    catalog['schools'].append({
        'slug': slug,
        'name': name,
        'has_ratios': has_ratios,
        'years': years,  # {'2025': 21, '2024': 17, ...}
        'total_units': sum(years.values()),
    })

catalog['_total_schools'] = len(catalog['schools'])
catalog['_total_units']   = sum(s['total_units'] for s in catalog['schools'])

(OUT / 'catalog.json').write_text(
    json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')

# ── 3. 매트릭스 (ASCII + JSON) ──
YEARS = ['2026', '2025', '2024', '2023', '2022', '2021']
PRIORITY = [
    ('서울대','snu'),('고려대','korea'),('연세대','yonsei'),
    ('서강대','sogang'),('성균관대','skku'),('한양대','hanyang'),
    ('중앙대','cau'),('경희대','khu'),('한국외대','hufs'),('서울시립대','uos'),
    ('건국대','konkuk'),('동국대','dongguk'),('홍익대','hongik'),
    ('국민대','kookmin'),('숭실대','ssu'),('세종대','sejong'),('단국대','dankook'),
    ('광운대','kw'),('명지대','mju'),('상명대','smu'),('가천대','gachon'),
]

# ASCII matrix
lines = []
lines.append(f'정시 입결 데이터 — 학교×연도 커버리지 (생성: {today})')
lines.append('=' * 70)
lines.append('')
lines.append('▣ 인서울 메이저 21교 (서고연·서성한·중경외시·건동홍·국숭세단·광명상가)')
lines.append('─' * 70)
lines.append(f'{"학교":<10}' + ''.join(f'{y[2:]:>5}' for y in YEARS) + f'  {"합":>5}')
lines.append('─' * 70)

priority_total = 0
for name, slug in PRIORITY:
    yr = results.get(slug, {})
    counts = []
    sub = 0
    for y in YEARS:
        n = len(yr.get(y, [])) if isinstance(yr.get(y), list) else 0
        counts.append(n); sub += n
    priority_total += sub
    line = f'{name:<10}' + ''.join(f'{n:>5}' if n else '    ·' for n in counts) + f'  {sub:>5}'
    lines.append(line)
lines.append('─' * 70)
lines.append(f'{"합계":<10}' + ' ' * (5*len(YEARS)) + f'  {priority_total:>5}')
lines.append('')

# 전체 학교
lines.append('▣ 전체 학교 (' + str(len(catalog['schools'])) + '교)')
lines.append('─' * 70)
lines.append(f'{"학교":<22} {"slug":<18}' + ''.join(f'{y[2:]:>5}' for y in YEARS) + f'  {"합":>5}')
lines.append('─' * 70)

# 가나다 정렬
all_schools = sorted(catalog['schools'], key=lambda s: s['name'])
for s in all_schools:
    yr = results.get(s['slug'], {})
    counts = []
    sub = 0
    for y in YEARS:
        n = len(yr.get(y, [])) if isinstance(yr.get(y), list) else 0
        counts.append(n); sub += n
    line = f'{s["name"][:22]:<22} {s["slug"]:<18}' + \
           ''.join(f'{n:>5}' if n else '    ·' for n in counts) + f'  {sub:>5}'
    lines.append(line)

lines.append('─' * 70)
lines.append(f'전체: {catalog["_total_schools"]}교 / {catalog["_total_units"]}학과')

(OUT / 'coverage-matrix.txt').write_text('\n'.join(lines), encoding='utf-8')

# JSON matrix
mat = {
    '_generated': today,
    '_years': YEARS,
    'priority_21': [],
    'all_schools': [],
}
for name, slug in PRIORITY:
    yr = results.get(slug, {})
    mat['priority_21'].append({
        'slug': slug, 'name': name,
        'counts': {y: len(yr.get(y, [])) if isinstance(yr.get(y), list) else 0 for y in YEARS},
    })
for s in all_schools:
    yr = results.get(s['slug'], {})
    mat['all_schools'].append({
        'slug': s['slug'], 'name': s['name'],
        'counts': {y: len(yr.get(y, [])) if isinstance(yr.get(y), list) else 0 for y in YEARS},
        'total': s['total_units'],
        'has_ratios': s['has_ratios'],
    })
(OUT / 'coverage-matrix.json').write_text(
    json.dumps(mat, ensure_ascii=False, indent=2), encoding='utf-8')

# ── 4. 스키마 ──
schema = '''data/admissions/exports/ — 정시 입결 데이터 스냅샷

생성 시점: {today}

파일 구성
─────────────────────────────────────────────────────────
  cuts.csv                — 평탄화된 컷 데이터 (학교·연도·학과·70%컷)
  catalog.json            — 학교 인덱스 (메타·연도별 학과수)
  coverage-matrix.txt     — ASCII 매트릭스 (사람이 읽기용)
  coverage-matrix.json    — 머신용 매트릭스
  SCHEMA.txt              — 본 파일

cuts.csv 컬럼
─────────────────────────────────────────────────────────
  slug         — 학교 슬러그 (예: snu, korea)
  school_name  — 한글 학교명
  year         — 학년도 (예: 2025)
  unit         — 모집단위 학과명
  pct70        — 국·수·탐 백분위 평균 70%컷

catalog.json 구조
─────────────────────────────────────────────────────────
  {{
    "_generated": "{today}",
    "_total_schools": 88,
    "_total_units": 3131,
    "schools": [
      {{
        "slug": "snu",
        "name": "서울대학교",
        "has_ratios": true,
        "years": {{"2025": 15, "2024": 42, ...}},
        "total_units": 130
      }},
      ...
    ]
  }}

원천 파일 (편집용)
─────────────────────────────────────────────────────────
  ../manual-results.json   — 학과별 70%컷 (스냅샷의 source-of-truth)
  ../manual-ratios.json    — 학교별 영역 가중치

백업
─────────────────────────────────────────────────────────
  ../_archive/manual-results-{today}.json
  ../_archive/manual-ratios-{today}.json
'''.format(today=today)

(OUT / 'SCHEMA.txt').write_text(schema, encoding='utf-8')

# ── 결과 요약 ──
print(f'export 완료 ({today})')
print(f'  cuts.csv              : {rows:>6} rows')
print(f'  catalog.json          : {catalog["_total_schools"]:>6} schools')
print(f'  coverage-matrix.txt   : ASCII')
print(f'  coverage-matrix.json  : 머신용')
print(f'  SCHEMA.txt            : 스키마 가이드')
print()
print(f'경로: {OUT}')
