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

TAG_SPLIT = 'ged-v3'
split_records = _load_src(
    'ged_subject_splits.json',
    os.path.join(WORK, 'ged_subject_splits.json'),
)
split_index = {
    (r['year'], r['level'], r['sess'], r['subject']): r
    for r in split_records
}

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
    split = split_index.get((year, level, sess, subject), {})
    a_asset = split.get('answerAsset')
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
        'answerUrl': (f"{WORKER}/{TAG_SPLIT}/{a_asset}?name={quote(a_korean, safe='')}"
                      if a_asset else None),
        'questionDownload': q_korean,
        'answerDownload': a_korean,
        'source': TAG,
    }
    exams.append(entry)
    next_id += 1
    added += 1

# ── 2013~2017 회차 과목별 분리본 ─────────────────────────────
# 신당야학에 남아 있던 전과목 합본을 페이지 경계대로 분리한 ged-v3 자산.
# 2016년 제2회 중·고졸 정답 합본도 과목별 1쪽 PDF로 분리했다.
added2 = 0
for r in split_records:
    q_asset = r.get('questionAsset')
    if not q_asset:
        continue
    year, sess, level, subject = r['year'], r['sess'], r['level'], r['subject']
    q_korean = kfn(year, sess, level, subject, 'q')
    a_asset = r.get('answerAsset')
    a_korean = kfn(year, sess, level, subject, 'a') if a_asset else None
    entry = {
        'id': next_id,
        'curriculum': level,
        'gradeYear': year,
        'examYear': year,
        'month': 4 if sess == 1 else 8,
        'typeGroup': 'ged',
        'type': 'ged_1' if sess == 1 else 'ged_2',
        'studentGrade': None,
        'subject': subject,
        'subSubject': None,
        'solutionUrl': None,
        'questionUrl': f"{WORKER}/{TAG_SPLIT}/{q_asset}?name={quote(q_korean, safe='')}",
        'answerUrl': (f"{WORKER}/{TAG_SPLIT}/{a_asset}?name={quote(a_korean, safe='')}"
                      if a_asset else None),
        'questionDownload': q_korean,
        'answerDownload': a_korean,
        'source': TAG_SPLIT,
    }
    exams.append(entry)
    next_id += 1
    added2 += 1

json.dump(exams, open(exams_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'검정고시 카드 {added}건(2018+) + {added2}건(2013~2017 과목별) 추가 → exams.json 총 {len(exams)}건')
