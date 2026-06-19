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
WORK = os.path.expanduser('~/Workspace/geomjeong_work')   # 로컬 스크래치(폴백)
SRC = os.path.join(ROOT, 'data', 'sources')               # repo 동봉 매니페스트(우선)
WORKER = 'https://suneung-files.hdh061224.workers.dev'
TAG = 'ged-v1'


def _load_src(repo_name, local_path):
    """repo 동봉 매니페스트 우선, 없으면 로컬 스크래치 폴백.
    로컬을 통째로 지워도 repo 클론만으로 재현되게."""
    p = os.path.join(SRC, repo_name)
    return json.load(open(p if os.path.exists(p) else local_path, encoding='utf-8'))


records = _load_src('ged_records.json', os.path.join(WORK, 'records.json'))
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

# ── 2013~2017 회차 합본 (신당야학 평가원 원본 재배포, ged-v2) ──────
# 공식 온라인 보관(평가원·검정고시지원센터)이 2018부터라, 그 이전은 회차
# 전과목 통합 문제지(합본)로만 존재. subject='전과목' 단일 카드로 등록.
# 정답표는 전북교육청 2016 제2회(중·고졸)만 별도 확보 → 해당 카드에만 매칭.
TAG2 = 'ged-v2'
JBE_ANS = {
    (2016, 2, '중졸'): '2016_2_mid_answer.pdf',
    (2016, 2, '고졸'): '2016_2_high_answer.pdf',
}
added2 = 0
_yahak_repo = os.path.join(SRC, 'ged_yahak_recs.json')
_yahak_local = os.path.join(WORK, 'pre2018', 'yahak_recs.json')
if os.path.exists(_yahak_repo) or os.path.exists(_yahak_local):
    for r in _load_src('ged_yahak_recs.json', _yahak_local):
        if not r.get('file'):
            continue
        year, sess, level = r['year'], r['sess'], r['level']
        q_korean = f'{year}년 제{sess}회 {level} 검정고시 전과목 문제지(통합본).pdf'
        a_asset = JBE_ANS.get((year, sess, level))
        a_korean = f'{year}년 제{sess}회 {level} 검정고시 정답표.pdf' if a_asset else None
        entry = {
            'id': next_id,
            'curriculum': level,
            'gradeYear': year,
            'examYear': year,
            'month': 4 if sess == 1 else 8,
            'typeGroup': 'ged',
            'type': 'ged_1' if sess == 1 else 'ged_2',
            'studentGrade': None,
            'subject': '전과목',
            'subSubject': None,
            'solutionUrl': None,
            'questionUrl': f"{WORKER}/{TAG2}/{r['asset']}?name={quote(q_korean, safe='')}",
            'answerUrl': (f"{WORKER}/{TAG2}/{a_asset}?name={quote(a_korean, safe='')}"
                          if a_asset else None),
            'questionDownload': q_korean,
            'answerDownload': a_korean,
            'source': TAG2,
        }
        exams.append(entry)
        next_id += 1
        added2 += 1

json.dump(exams, open(exams_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'검정고시 카드 {added}건(2018+) + {added2}건(2013~2017 합본) 추가 → exams.json 총 {len(exams)}건')
