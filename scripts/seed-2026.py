#!/usr/bin/env python3
"""베리타스알파 idxno=586483 (2026학년도 상위15개대) 부분 시드.
의약·첨단·톱 학과 일부만 백분위 공개. 환산점수만 발표한 학교 다수 → 데이터 제한."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'data' / 'admissions' / 'manual-results.json'

DATA_2026 = {
  'korea': [
    ('의과대학 (일반)', 99.0), ('의과대학 (교과우수)', 99.0),
    ('인공지능학과', 95.5), ('차세대통신학과', 95.17),
    ('스마트모빌리티학부', 95.12),
  ],
  'yonsei': [
    ('의예과', 99.25), ('치의예과', 97.75), ('약학과', 96.25),
    ('시스템반도체공학과', 95.5), ('디스플레이융합공학과', 95.0),
  ],
  'khu': [
    ('의예과 (자연)', 98.5), ('한의예과 (인문)', 98.33),
  ],
  'inha': [
    ('의예과', 98.2),
  ],
}

r = json.loads(F.read_text(encoding='utf-8'))
r['_meta']['lastUpdated'] = '2026-05-08'

added = 0
for slug, items in DATA_2026.items():
    if slug not in r or not isinstance(r[slug], dict):
        r[slug] = {}
    r[slug]['2026'] = [{'unit': u, 'pct70': p} for u, p in items]
    added += len(items)

F.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'2026학년도 부분 시드 완료 — {len(DATA_2026)}개교 / {added}개 학과 (의약·첨단 톱만)')
print('출처: 베리타스알파 idxno=586483')
print('한계: 2025학년도부터 다수 대학이 환산점수만 공개 → 백분위 데이터 부분적')
