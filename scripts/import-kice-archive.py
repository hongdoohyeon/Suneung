#!/usr/bin/env python3
"""kice_archive(SQLite) → suneung-site gradecuts 형식 변환.

입력:
  ~/Workspace/kice_archive/kice_2009.db   (평가원 2014~2021, 2009 개정)
  ~/Workspace/kice_archive/kice_2015.db   (평가원 2022~2026, 2015 개정)
  ~/Workspace/kice_archive/edu.db         (학평 2014~2026, 고1/2/3)

출력:
  data/raw/kice-archive/gradecuts-normalized.json

신뢰도: 평가원 공식 보도자료 + 시도교육청 공식 자료를 ingest한 결과 → 최우선 출처.
"""
from __future__ import annotations
import json
import os
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
ARCHIVE = Path.home() / 'Workspace' / 'kice_archive'
OUT_DIR = ROOT / 'data' / 'raw' / 'kice-archive'
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / 'gradecuts-normalized.json'

# exam_type → 사이트 type
EXAM_TYPE = {'csat': 'csat', 'mock06': 'june', 'mock09': 'sept'}
EXAM_MONTH = {'csat': 11, 'mock06': 6, 'mock09': 9}

# subject(영문) → 사이트 subject(한글)
SUBJECT_KO = {
    'korean': '국어',
    'math': '수학',
    'english': '영어',
    'khistory': '한국사',
    'social': '사회탐구',
    'science': '과학탐구',
    'foreign': '제2외국어',
    'vocation': '직업탐구',
}

# (subject, subtype) → subSubject (한글). subtype별 site name.
# curriculum 'old' = 2009 개정, 'new' = 2015 개정 차이 있는 케이스 표시
SUBTYPE_KO = {
    # 국어
    ('korean', 'atype'): 'A형',
    ('korean', 'btype'): 'B형',
    ('korean', 'eokmae'): '언어와매체',
    ('korean', 'hwajak'): '화법과작문',
    # 수학
    ('math', 'atype'): 'A형',
    ('math', 'btype'): 'B형',
    ('math', 'ga'): '가형',
    ('math', 'na'): '나형',
    ('math', 'hwakton'): '확률과통계',
    ('math', 'mijeok'): '미적분',
    ('math', 'giha'): '기하',
    # 영어
    ('english', 'atype'): 'A형',
    ('english', 'btype'): 'B형',
    # 사회탐구
    ('social', 'saengwun'): '생활과윤리',
    ('social', 'yulli'): '윤리와사상',
    ('social', 'hangukji'): '한국지리',
    ('social', 'segyeji'): '세계지리',
    ('social', 'dongasa'): '동아시아사',
    ('social', 'segyesa'): '세계사',
    ('social', 'kyungje'): '경제',
    ('social', 'sahoe'): '사회·문화',
    # 법과정치(2009)·정치와법(2015) — DB는 모두 'jungchi' 통일.
    # 학년도별로 사이트가 다르게 표기되므로 일단 통합 키로 두고 매칭 시 dual 시도.
    ('social', 'jungchi'): '__jungchi__',
    ('social', 'integrated'): None,  # 통합사회 (고1 학평) → subSubject 없음
    ('social', 'ethics'): None,      # 윤리 (고1 옛 단일과목) — 사이트 무매칭
    ('social', 'gen_society'): None, # 일반사회 — 사이트 무매칭
    ('social', 'geography'): None,   # 지리 — 사이트 무매칭
    # 과학탐구 — 2009 개정=물리Ⅰ/Ⅱ, 2015 개정=물리학Ⅰ/Ⅱ
    ('science', 'physics1'): '__physics1__',
    ('science', 'physics2'): '__physics2__',
    ('science', 'chem1'): '화학Ⅰ',
    ('science', 'chem2'): '화학Ⅱ',
    ('science', 'biology1'): '생명과학Ⅰ',
    ('science', 'biology2'): '생명과학Ⅱ',
    ('science', 'earth1'): '지구과학Ⅰ',
    ('science', 'earth2'): '지구과학Ⅱ',
    ('science', 'integrated'): None,  # 통합과학 (고1 학평)
    # 통합 (학평 고1 미세 변형)
    ('science', 'physics_int'): None,
    ('science', 'chem_int'): None,
    ('science', 'biology_int'): None,
    ('science', 'earth_int'): None,
    # 제2외국어
    # 제2외국어 — 사이트는 'Ⅰ' 없이 짧은 형태 저장
    ('foreign', 'arabic'): '아랍어',
    ('foreign', 'chinese'): '중국어',
    ('foreign', 'french'): '프랑스어',
    ('foreign', 'german'): '독일어',
    ('foreign', 'hanmun'): '한문',
    ('foreign', 'japanese'): '일본어',
    ('foreign', 'russian'): '러시아어',
    ('foreign', 'spanish'): '스페인어',
    ('foreign', 'vietnamese'): '베트남어',
    ('foreign', 'vietnamese_basic'): '베트남어',
    # 직업탐구 — 평가원 영문 코드 → 사이트 한글 풀네임. 모호한 것은 매핑 안 함(skip).
    ('vocation', 'accounting'): '회계 원리',
    ('vocation', 'basic_design'): '기초 제도',
    ('vocation', 'commerce'): '상업 경제',
    ('vocation', 'commerce_info'): '상업 정보',
    ('vocation', 'fishery'): '수산·해운',
    ('vocation', 'household'): '가사·실업',
    ('vocation', 'human'): '인간 발달',
    ('vocation', 'lifeservice'): '생활 서비스 산업의 이해',
    ('vocation', 'ocean'): '해양의 이해',
    ('vocation', 'success'): '성공적인 직업생활',
    # 농업 계열 — 평가원이 시기별로 명칭을 바꿔써서 모호. 신뢰도 위험 → skip.
    ('vocation', 'agriculture'): None,
    ('vocation', 'agri_old'): None,
    ('vocation', 'agri_industry'): None,
    # 공업 계열 — industry / industry_group / 공업 / 공업 일반 — 1:1 매핑 불명 → skip.
    ('vocation', 'industry'): None,
    ('vocation', 'industry_group'): None,
    # 수산·해운 vs 수산·해운 산업 기초 vs fishery_marine — 불명 → skip.
    ('vocation', 'fishery_marine'): None,
}


def curriculum_for(gradeYear: int) -> str:
    """gradeYear → curriculum."""
    if gradeYear >= 2022:
        return '2015'
    return '2009'


def resolve_subject(subject: str, subtype, curriculum: str):
    """(subject, subtype, curriculum) → (site_subject, site_subSubject) 후보 리스트.
    curriculum별 변형이 있는 경우 dual 후보 반환."""
    sub_ko = SUBJECT_KO.get(subject)
    if sub_ko is None:
        return []  # 매핑 없음
    key = (subject, subtype)
    if subtype is None:
        return [(sub_ko, None)]
    sub_sub = SUBTYPE_KO.get(key, '__unknown__')
    if sub_sub == '__unknown__':
        return []  # 사이트 매핑 없음 → skip (옛 단일과목 등)
    if sub_sub is None:
        return [(sub_ko, None)]
    # 사회 jungchi 처리: 2014~2017학년도=법과정치, 2018~=정치와법
    if sub_sub == '__jungchi__':
        if curriculum == '2009':
            # 2014~2017: 법과정치, 2018~2021: 정치와법
            return [(sub_ko, '법과정치'), (sub_ko, '정치와법')]
        return [(sub_ko, '정치와법')]
    # 과학 물리1/2: 2009=물리Ⅰ/Ⅱ, 2015=물리학Ⅰ/Ⅱ
    if sub_sub == '__physics1__':
        return [(sub_ko, '물리학Ⅰ' if curriculum == '2015' else '물리Ⅰ')]
    if sub_sub == '__physics2__':
        return [(sub_ko, '물리학Ⅱ' if curriculum == '2015' else '물리Ⅱ')]
    return [(sub_ko, sub_sub)]


def load_kice(db_path: Path, source_tag: str):
    """평가원 DB → records.

    year(DB) = gradeYear (학년도)
    examYear = gradeYear - 1 (모든 평가원 시험은 전년도 시행)

    grade_cuts에 raw가 없으면 score_conversion의 grade 컬럼에서 derive
    (grade별 MIN(raw_score) = 그 등급 컷).
    """
    out = []
    c = sqlite3.connect(str(db_path))
    # grade_cuts: (year, exam_type, subject, subtype, grade, cut_score, cut_type)
    bucket = defaultdict(lambda: {'raw': {}, 'std': {}})
    for year, exam_type, subject, subtype, grade, cut_score, cut_type in c.execute(
        'SELECT year, exam_type, subject, subtype, grade, cut_score, cut_type FROM grade_cuts'):
        if exam_type not in EXAM_TYPE: continue
        if cut_type not in ('raw', 'std'): continue
        key = (year, exam_type, subject, subtype)
        bucket[key][cut_type][grade] = cut_score

    # score_conversion에서 raw cut derive — grade_cuts에 raw 없는 시험만
    derived = 0
    for year, exam_type, subject, subtype, grade, min_raw in c.execute(
        '''SELECT year, exam_type, subject, subtype, grade, MIN(raw_score)
           FROM score_conversion
           WHERE grade IS NOT NULL AND raw_score IS NOT NULL
           GROUP BY year, exam_type, subject, subtype, grade'''):
        if exam_type not in EXAM_TYPE: continue
        key = (year, exam_type, subject, subtype)
        if grade in bucket[key]['raw']: continue  # grade_cuts raw 우선
        if min_raw is None: continue
        bucket[key]['raw'][grade] = min_raw
        derived += 1
    if derived: print(f"  [{db_path.name}] score_conversion으로 raw 보강: {derived}건")
    c.close()

    for (year, exam_type, subject, subtype), cuts in bucket.items():
        gradeYear = year
        examYear = year - 1
        month = EXAM_MONTH[exam_type]
        site_type = EXAM_TYPE[exam_type]
        curriculum = curriculum_for(gradeYear)
        candidates = resolve_subject(subject, subtype, curriculum)
        if not candidates:
            continue
        rawCuts = [cuts['raw'].get(g) for g in range(1, 9)]
        standardCuts = [cuts['std'].get(g) for g in range(1, 9)]
        # 등급컷 6개 이상은 있어야 신뢰
        if sum(v is not None for v in standardCuts) < 5 and sum(v is not None for v in rawCuts) < 5:
            continue
        for site_subject, site_subSubject in candidates:
            out.append({
                'curriculum': curriculum,
                'gradeYear': gradeYear,
                'examYear': examYear,
                'month': month,
                'typeGroup': 'suneung',
                'type': site_type,
                'subject': site_subject,
                'subSubject': site_subSubject,
                'rawCuts': rawCuts if any(v is not None for v in rawCuts) else None,
                'standardCuts': standardCuts,
                'source': source_tag,
                'studentGrade': 3,
            })
    return out


def load_edu(db_path: Path):
    """학평 DB → records.

    학년(grade) = studentGrade. month = 시행월.
    gradeYear:
      - 고3 (grade=3): year + 1 (학년도)
      - 고1·고2: year (사이트 컨벤션: 달력 연도 그대로)
    """
    out = []
    c = sqlite3.connect(str(db_path))
    bucket = defaultdict(lambda: {'raw': {}, 'std': {}})
    for year, month, sgrade, subject, subtype, grade_cut, cut_score, cut_type in c.execute(
        'SELECT year, month, grade, subject, subtype, grade_cut, cut_score, cut_type FROM grade_cuts_edu'):
        if cut_type not in ('raw', 'std'): continue
        if sgrade not in (1, 2, 3): continue
        key = (year, month, sgrade, subject, subtype)
        bucket[key][cut_type][grade_cut] = cut_score

    # score_conversion_edu의 grade_cut 컬럼은 "이 raw 점수가 정확히 어느 등급의 컷"인지 표시.
    # grade_cuts_edu에 raw 없는 시험만 보강.
    derived = 0
    for year, month, sgrade, subject, subtype, gcut, raw in c.execute(
        '''SELECT year, month, grade, subject, subtype, grade_cut, raw_score
           FROM score_conversion_edu
           WHERE grade_cut IS NOT NULL AND raw_score IS NOT NULL'''):
        if sgrade not in (1, 2, 3): continue
        key = (year, month, sgrade, subject, subtype)
        if gcut in bucket[key]['raw']: continue
        bucket[key]['raw'][gcut] = raw
        derived += 1
    if derived: print(f"  [{db_path.name}] score_conversion_edu로 raw 보강: {derived}건")
    c.close()

    # month → 사이트 type
    MONTH_TYPE_G3 = {3:'mar', 4:'apr', 5:'may', 7:'jul', 10:'oct'}
    MONTH_TYPE_G12 = {3:'mar', 6:'jun', 9:'sep', 11:'nov'}

    for (year, month, sgrade, subject, subtype), cuts in bucket.items():
        if sgrade == 3:
            site_type = MONTH_TYPE_G3.get(month)
            gradeYear = year + 1
        else:
            site_type = MONTH_TYPE_G12.get(month)
            gradeYear = year
        if site_type is None: continue
        curriculum = curriculum_for(gradeYear)
        candidates = resolve_subject(subject, subtype, curriculum)
        if not candidates: continue
        rawCuts = [cuts['raw'].get(g) for g in range(1, 9)]
        standardCuts = [cuts['std'].get(g) for g in range(1, 9)]
        if sum(v is not None for v in standardCuts) < 5 and sum(v is not None for v in rawCuts) < 5:
            continue
        for site_subject, site_subSubject in candidates:
            out.append({
                'curriculum': curriculum,
                'gradeYear': gradeYear,
                'examYear': year,
                'month': month,
                'typeGroup': 'education',
                'type': site_type,
                'subject': site_subject,
                'subSubject': site_subSubject,
                'rawCuts': rawCuts if any(v is not None for v in rawCuts) else None,
                'standardCuts': standardCuts,
                'source': 'kice-archive-edu',
                'studentGrade': sgrade,
            })
    return out


def main():
    records = []
    records += load_kice(ARCHIVE / 'kice_2009.db', 'kice-archive-2009')
    records += load_kice(ARCHIVE / 'kice_2015.db', 'kice-archive-2015')
    records += load_edu(ARCHIVE / 'edu.db')

    # 통계
    from collections import Counter
    by_tg = Counter((r['typeGroup'], r.get('studentGrade')) for r in records)
    print(f"총 {len(records)}건 ingest")
    print("typeGroup × studentGrade:")
    for k, c in sorted(by_tg.items()):
        print(f"  {k}: {c}건")
    raw_count = sum(1 for r in records if r['rawCuts'])
    std_count = sum(1 for r in records if any(v is not None for v in r['standardCuts']))
    print(f"rawCuts 보유: {raw_count}건  /  standardCuts 보유: {std_count}건")

    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(f"저장: {OUT.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
