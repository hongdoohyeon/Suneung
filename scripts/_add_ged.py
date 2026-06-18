# -*- coding: utf-8 -*-
"""검정고시(KICE 공식 2018~2026) 기출을 exams.json 에 append.

소스: ~/Workspace/geomjeong_work/records.json (KICE 자료마당 스크랩 산출물)
릴리즈: ged-v1 (587 PDF, ASCII 자산명)

재실행 가능: 기존 typeGroup=='ged' 엔트리를 먼저 제거 후 새로 추가.
exams.json 은 머지 산출물이므로, 추가 후 render-site.py 로 사이트 재생성한다.
"""
import json, os
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.expanduser('~/Workspace/geomjeong_work')
WORKER = 'https://suneung-files.hdh061224.workers.dev'
TAG = 'ged-v1'

records = json.load(open(os.path.join(WORK, 'records.json'), encoding='utf-8'))
exams_path = os.path.join(ROOT, 'data', 'exams.json')
exams = json.load(open(exams_path, encoding='utf-8'))

# 기존 ged 제거 (재실행 안전)
exams = [e for e in exams if e.get('typeGroup') != 'ged']
next_id = max(e['id'] for e in exams) + 1

# 회차별 정답 자산명 인덱스: (year, level, sess) -> answer asset
ans_asset = {(r['year'], r['level'], r['sess']): r['asset']
             for r in records if r['doc'] == 'a'}

def kfn(examYear, sess, level, subject, doc):
    if doc == 'a':
        return f'{examYear}년 제{sess}회 {level} 검정고시 정답.pdf'
    return f'{examYear}년 제{sess}회 {level} 검정고시 {subject} 문제지.pdf'

def wurl(asset, korean):
    return f'{WORKER}/{TAG}/{asset}?name={quote(korean, safe="")}'

added = 0
for r in records:
    if r['doc'] != 'q':
        continue
    year, level, sess = r['year'], r['level'], r['sess']
    subject = r['subject']
    q_korean = kfn(year, sess, level, subject, 'q')
    a_asset = ans_asset.get((year, level, sess))
    a_korean = kfn(year, sess, level, subject, 'a') if a_asset else None
    entry = {
        'id': next_id,
        'curriculum': level,            # 초졸 / 중졸 / 고졸
        'gradeYear': year,              # 검정고시는 학년도 개념 없음 → 시행연도
        'examYear': year,
        'month': r['month'],            # 4(1회) / 8(2회)
        'typeGroup': 'ged',
        'type': r['type'],              # ged_1 / ged_2
        'studentGrade': None,
        'subject': subject,
        'subSubject': None,
        'solutionUrl': None,
        'questionUrl': wurl(r['asset'], q_korean),
        'answerUrl': wurl(a_asset, a_korean) if a_asset else None,
        'questionDownload': q_korean,
        'answerDownload': a_korean,
        'source': TAG,
    }
    exams.append(entry)
    next_id += 1
    added += 1

json.dump(exams, open(exams_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'검정고시 카드 {added}건 추가 → exams.json 총 {len(exams)}건')
