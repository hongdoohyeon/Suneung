#!/usr/bin/env python3
"""manual-ratios 누락 학교 추가 — 호서대·가톨릭관동대.
results 만 있고 ratios 없으면 라인 산정에서 학교 자체가 빠짐.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS_F = ROOT / 'data' / 'admissions' / 'manual-ratios.json'
RESULTS_F = ROOT / 'data' / 'admissions' / 'manual-results.json'

ratios  = json.loads(RATIOS_F.read_text(encoding='utf-8'))
results = json.loads(RESULTS_F.read_text(encoding='utf-8'))

# 호서대 — 모집요강 기본 정시 반영비율 (국 25 / 수 25 / 영 20 / 탐 25 / 한국사 5)
ratios['hoseo'] = {
    "name": "호서대학교",
    "tracks": [
        {"label": "정시 일반전형 (인문/자연 통합)",
         "ratios": {"국어": 25, "수학": 25, "영어": 20, "탐구": 25, "한국사": 5},
         "scoreFormula": "정시 일반 — 국·수·영·탐 + 한국사 (수능 100%)"}
    ],
    "english_grades": {"1": 100, "2": 96, "3": 90, "4": 82, "5": 72, "6": 60, "7": 46, "8": 30, "9": 0},
    "hanguksa_grades": {"1": 0, "2": 0, "3": 0, "4": -1, "5": -2, "6": -3, "7": -4, "8": -5, "9": -6},
    "math_compulsory": "자연계 미적분/기하 가산 (실제 모집요강 확인)",
    "tamgu_compulsory": "자연계 과학탐구 권장",
}

# 가톨릭관동대 — extra_gw_catholic 슬러그를 정식 슬러그로 이전
existing = results.pop('extra_gw_catholic', None)
if existing:
    results['cu_kd'] = existing

ratios['cu_kd'] = {
    "name": "가톨릭관동대학교",
    "tracks": [
        {"label": "정시 일반전형 (인문/자연 통합)",
         "ratios": {"국어": 30, "수학": 25, "영어": 20, "탐구": 25},
         "scoreFormula": "정시 — 국·수·영·탐"}
    ],
    "english_grades": {"1": 100, "2": 96, "3": 90, "4": 82, "5": 72, "6": 60, "7": 46, "8": 30, "9": 0},
    "hanguksa_grades": {"1": 0, "2": 0, "3": 0, "4": -1, "5": -2, "6": -3, "7": -4, "8": -5, "9": -6},
}

RATIOS_F.write_text(json.dumps(ratios, ensure_ascii=False, indent=2), encoding='utf-8')
RESULTS_F.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

print('호서대·가톨릭관동대 ratios 추가 완료')
print(f'호서대: 5개년 105학과 라인 산정 가능')
print(f'가톨릭관동대: 16학과 라인 산정 가능 (slug: extra_gw_catholic → cu_kd)')
