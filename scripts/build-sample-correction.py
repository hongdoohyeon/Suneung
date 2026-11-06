#!/usr/bin/env python3
"""표본 구성 보정 입력 → data/sample-correction.json (로컬 전용, 결과 JSON 만 커밋).
원본: ~/Workspace/kice_archive/edu.db 의 csat_takers_by_status · mock_takers_by_status · kice_subject_takers
      (평가원 채점결과 보도자료 — kice_archive/scraper_edu/ingest_kice_press_takers.py).
쓰임: build-data.py compute_exam_scores() 가 평균 점수율을 재학생 기준으로 보정한 뒤 난이도 백분위를 매긴다.
"""
import json, os, sqlite3
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.expanduser('~/Workspace/kice_archive/edu.db')
T = {'csat': 'csat', 'mock06': 'june', 'mock09': 'sept'}

def main():
    con = sqlite3.connect(DB)
    g = {}
    for y, tk, gr in con.execute('select hakyeondo,takers,graduate_etc from csat_takers_by_status'):
        g[f'{y}|csat'] = round(gr / tk, 4)
    for y, t, tk, gr in con.execute('select hakyeondo,exam_type,takers,graduate_etc from mock_takers_by_status'):
        g[f'{y}|{T[t]}'] = round(gr / tk, 4)
    takers = {}
    for y, t, s, st, n in con.execute('select hakyeondo,exam_type,subject,subtype,takers from kice_subject_takers'):
        takers[f'{y}|{T[t]}|{"korean" if s == "korean" else st}'] = n
    out = {
        'about': '표본 구성 보정 입력. g=응시자 중 졸업생 등 비율(평가원 채점결과 보도자료). takers=국어·과학탐구 과목별 응시 인원.',
        'params': {
            'delta': {'국어': 0.62, '수학': 0.60, 'default': 0.50},       # 졸업생-재학생 평균 격차(전체 σ 단위). 국수=평가원 N수-재학 표점 격차 ÷ σ, 탐구=가정
            'lambda': 0.5,                                                # Ⅱ과목 이탈이 하위권에서 일어난 정도(0~1)
            'defaultG': {'csat': 0.25, 'june': 0.125, 'sept': 0.16},      # 공식 비율이 없는 학년도(2015 이전 등)
        },
        'g': dict(sorted(g.items())),
        'takers': dict(sorted(takers.items())),
    }
    p = os.path.join(ROOT, 'data', 'sample-correction.json')
    open(p, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(p, len(g), len(takers))

if __name__ == '__main__':
    main()
