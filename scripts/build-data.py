#!/usr/bin/env python3
"""
KICE archive (SQLite) → 정적 JSON 변환기.

수능/모의/예비/교육청 데이터를 한 번에 읽어 사이트가 그대로 fetch 할 수
있는 data/exams.json 형태로 출력합니다.

실행:  python3 scripts/build-data.py
출력:  data/exams.json
"""

from __future__ import annotations
import json, sqlite3, sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote

ROOT     = Path(__file__).resolve().parents[1]            # suneung-site/
ARCHIVE  = Path('/Users/hongduhyeon/coding/kice_archive')  # KICE archive 위치
OUT_JSON = ROOT / 'data' / 'exams.json'

# Cloudflare Worker 프록시 — Github Release URL 을 가져와 Content-Disposition 에
# 한국어 파일명을 박아 보냄. ?name= 쿼리로 원하는 한국어 파일명 전달.
WORKER_BASE = 'https://suneung-files.hdh061224.workers.dev'

KICE_RELEASES = ['kice-v1', 'kice-v2', 'kice-v3', 'kice-v4']

# 추후 카테고리별 release (예약)
FUTURE_RELEASE = {
    'leet':     'leet-v1',
    'meet':     'meet-v1',
    'military': 'military-v1',
    'police':   'police-v1',
}

# 시험 유형(DB exam_type) → 한국어 라벨
KOREAN_TYPE_LABEL = {
    'csat':   '수능',
    'mock06': '6월 모의평가',
    'mock09': '9월 모의평가',
    'prelim': '예비시험',
    'military_annual': '사관학교 1차',
    'police_annual':   '경찰대학 1차',
}

# 문서 타입 라벨
KOREAN_DOC_LABEL = {'q': '문제지', 'a': '정답', 's': '해설'}


def build_asset_index() -> dict:
    """gh CLI 로 모든 kice-v* release 의 자산을 받아 basename → tag 매핑 생성."""
    import subprocess
    idx = {}
    for tag in KICE_RELEASES:
        r = subprocess.run(
            ['gh', 'release', 'view', tag, '--json', 'assets', '--jq', '.assets[].name'],
            capture_output=True, text=True
        )
        if r.returncode != 0:
            continue
        for name in r.stdout.strip().split('\n'):
            if name:
                idx[name] = tag
    return idx

ASSET_INDEX: dict = {}


def korean_filename(item: dict, doc_type: str, db_type: str | None) -> str:
    """다운로드 시 사용할 한국어 파일명 생성."""
    is_edu = item['typeGroup'] == 'education'

    # 연도 부분
    if is_edu:
        year_part = f"{item['examYear']}년 {item['month']}월"
    else:
        year_part = f"{item['gradeYear']}학년도"

    # 시험 라벨
    if is_edu:
        type_label = '학력평가'
    elif db_type and db_type in KOREAN_TYPE_LABEL:
        type_label = KOREAN_TYPE_LABEL[db_type]
    else:
        type_label = ''

    # 과목 + 선택과목
    subj = item['subject']
    sub  = item.get('subSubject')
    subject_part = f"{subj}({sub})" if sub else subj

    # 문서 타입
    doc_label = KOREAN_DOC_LABEL.get(doc_type, '')

    parts = [year_part, type_label, subject_part, doc_label]
    return ' '.join(p for p in parts if p) + '.pdf'


def file_url(typegroup: str, file_path: str, item: dict, doc_type: str, db_type: str | None = None) -> str:
    """Worker 프록시 URL 반환. ?name= 에 한국어 파일명 인코딩."""
    name = Path(file_path).name

    if typegroup in FUTURE_RELEASE:
        tag = FUTURE_RELEASE[typegroup]
    else:
        tag = ASSET_INDEX.get(name)
        if not tag:
            return f'data/files/{file_path}'   # 인덱스에 없으면 로컬 fallback

    korean = korean_filename(item, doc_type, db_type)
    return f"{WORKER_BASE}/{tag}/{name}?name={quote(korean, safe='')}"

# ── 매핑 ───────────────────────────────────────────────────
SUBJECT = {
    'korean': '국어',  'math': '수학',
    'english': '영어', 'khistory': '한국사',
    'social': '사회탐구', 'science': '과학탐구',
}

# 28예비(2022 개정)는 사탐/과탐 대신 통합사회/통합과학으로 출제
def map_subject(subj_db: str, site_curr: str) -> str:
    if site_curr == '예비':
        if subj_db == 'social':  return '통합사회'
        if subj_db == 'science': return '통합과학'
    return SUBJECT[subj_db]

# 카드 그리드 영역 정렬 순서 (사용자 요청: 국·수·영·한국사·과탐·사탐 순)
SUBJECT_ORDER = {
    '국어': 1, '수학': 2, '영어': 3, '한국사': 4,
    '과학탐구': 5, '사회탐구': 6,
    '통합과학': 5, '통합사회': 6,
    '언어이해': 1, '추리논증': 2, '논술': 3,
    '언어추론': 1, '자연과학추론Ⅰ': 2, '자연과학추론Ⅱ': 3,
}

EXAM_TYPE = {
    # db 값        (사이트 type, typeGroup,  month)
    'csat':       ('csat',     'suneung',   11),
    'mock06':     ('june',     'suneung',    6),
    'mock09':     ('sept',     'suneung',    9),
    # 평가원 예비(prelim) 도 평가원(suneung) 그룹에 흡수
    'prelim':     ('prelim',   'suneung',    5),
}

CURRICULUM = {'2015': '2015', '2009': '2009', '2028': '예비'}

EDU_MONTH = {3: 'mar', 4: 'apr', 7: 'jul', 10: 'oct', 5: None}  # 5월 데이터는 표준이 아니라 일단 무시

# subtype: 한국어 변환. 정치와법/물리학은 curriculum 의존이라 함수로 분기.
SUBTYPE_BASE = {
    'hwajak': '화법과작문', 'eokmae': '언어와매체',
    'hwakton': '확률과통계', 'mijeok': '미적분', 'giha': '기하',
    'ga': '가형', 'na': '나형',
    'atype': '가형', 'btype': '나형',         # 09 개정 초기 A/B형도 가/나로 통일
    'saengwun': '생활과윤리', 'yulli': '윤리와사상',
    'hangukji': '한국지리', 'segyeji': '세계지리',
    'dongasa': '동아시아사', 'segyesa': '세계사',
    'kyungje': '경제',     'sahoe': '사회·문화',
    'chem1': '화학Ⅰ', 'chem2': '화학Ⅱ',
    'biology1': '생명과학Ⅰ', 'biology2': '생명과학Ⅱ',
    'earth1': '지구과학Ⅰ',  'earth2': '지구과학Ⅱ',
}

def map_subtype(sub: str | None, site_curr: str) -> str | None:
    if not sub:
        return None
    if sub == 'jungchi':
        return '정치와법' if site_curr in ('2015', '예비') else '법과정치'
    if sub == 'physics1':
        return '물리학Ⅰ' if site_curr in ('2015', '예비') else '물리Ⅰ'
    if sub == 'physics2':
        return '물리학Ⅱ' if site_curr in ('2015', '예비') else '물리Ⅱ'
    return SUBTYPE_BASE.get(sub, sub)


# ── 사관학교 subtype 매핑 ─────────────────────────────────────
def map_saw_subtype(sub: str | None, subject: str) -> str | None:
    """사관학교 DB subtype → 표시용 한국어 변환."""
    if not sub:
        return None
    if subject == 'math':
        return {'가': '가형', '나': '나형', 'A': '가형', 'B': '나형'}.get(sub, sub)
    if subject == 'korean':
        return {'A': 'A형', 'B': 'B형'}.get(sub, sub)
    return sub


# ── KICE DB 처리 ───────────────────────────────────────────
def from_kice(db: Path, items: list):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers = {}, {}
    for r in con.execute('SELECT * FROM exams'):
        key = (r['year'], r['exam_type'], r['subject'],
               r['subtype'] or '', r['curriculum'])
        (questions if r['doc_type'] == 'q' else answers)[key] = r['file_path']
    con.close()

    # Q 한 행 = 카드 1개. A는 같은 (year, exam_type, subject) 그룹에서 매칭.
    for key, q in questions.items():
        year, et, subj, sub, curr = key
        a = answers.get(key) or answers.get((year, et, subj, '', curr))
        if et not in EXAM_TYPE: continue
        type_key, group, month = EXAM_TYPE[et]
        site_curr = CURRICULUM[curr]

        item = {
            'curriculum':  site_curr,
            'gradeYear':   year,
            'examYear':    year - 1,
            'month':       month,
            'typeGroup':   group,
            'type':        type_key,
            'subject':     map_subject(subj, site_curr),
            'subSubject':  map_subtype(sub, site_curr),
            'solutionUrl': None,
        }
        item['questionUrl'] = file_url(group, q, item, 'q', et)
        item['answerUrl']   = file_url(group, a, item, 'a', et) if a else None
        items.append(item)


# ── 교육청 DB 처리 ─────────────────────────────────────────
def from_edu(db: Path, items: list):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers = {}, {}
    for r in con.execute('SELECT * FROM exams_edu WHERE grade=3'):
        m = EDU_MONTH.get(r['month'])
        if m is None: continue
        key = (r['year'], r['month'], r['subject'],
               r['subtype'] or '', r['curriculum'])
        (questions if r['doc_type'] == 'q' else answers)[key] = r['file_path']
    con.close()

    for key, q in questions.items():
        year, month, subj, sub, curr = key
        a = answers.get(key) or answers.get((year, month, subj, '', curr))
        site_curr = CURRICULUM[curr]
        item = {
            'curriculum':  site_curr,
            'gradeYear':   year + 1,    # 교육청: 시행연도 + 1 = 학년도
            'examYear':    year,
            'month':       month,
            'typeGroup':   'education',
            'type':        EDU_MONTH[month],
            'subject':     map_subject(subj, site_curr),
            'subSubject':  map_subtype(sub, site_curr),
            'solutionUrl': None,
        }
        item['questionUrl'] = file_url('education', q, item, 'q')
        item['answerUrl']   = file_url('education', a, item, 'a') if a else None
        items.append(item)


# ── 사관학교 DB 처리 ───────────────────────────────────────
def from_saw(db: Path, items: list):
    """사관학교 1차 시험 (saw.db → exams_saw) 처리."""
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers = {}, {}
    for r in con.execute('SELECT * FROM exams_saw'):
        key = (r['year'], r['exam_type'], r['subject'], r['subtype'] or '')
        (questions if r['doc_type'] == 'q' else answers)[key] = r['file_path']
    con.close()

    for key, q in questions.items():
        year, et, subj, sub = key
        a = answers.get(key) or answers.get((year, et, subj, ''))
        subject = SUBJECT.get(subj, subj)
        sub_mapped = map_saw_subtype(sub or None, subj)

        item = {
            'curriculum':  '사관',
            'gradeYear':   year,
            'examYear':    year - 1,
            'month':       7,
            'typeGroup':   'military',
            'type':        'military_annual',
            'subject':     subject,
            'subSubject':  sub_mapped,
            'solutionUrl': None,
        }
        item['questionUrl'] = file_url('military', q, item, 'q', 'military_annual')
        item['answerUrl']   = file_url('military', a, item, 'a', 'military_annual') if a else None
        items.append(item)


# ── 경찰대학 처리 (파일시스템 스캔 + release 자산 보강) ──────────
def from_police(pdfs_dir: Path, items: list):
    """경찰대학 1차 시험 — police.db가 비어 있으므로 pdfs_police/ 디렉토리 + release 자산을 합쳐 스캔.

    로컬에 HWP만 있고 release에 PDF로 변환된 파일이 있는 경우, PDF URL을 우선 사용.
    """
    # {(year, subject): {'q': rel_path, 'a': rel_path}} 형태로 수집
    groups: dict[tuple, dict] = {}

    def assign(year: int, subj: str, doc_type: str, rel: str):
        """기존 항목이 없거나 PDF가 HWP를 덮어쓸 때만 추가."""
        if subj == 'all':
            for s in ('korean', 'math', 'english'):
                groups.setdefault((year, s), {})
                if doc_type == 'a':
                    cur = groups[(year, s)].get('a_all')
                    if cur is None or (rel.endswith('.pdf') and not cur.endswith('.pdf')):
                        groups[(year, s)]['a_all'] = rel
            return
        groups.setdefault((year, subj), {})
        cur = groups[(year, subj)].get(doc_type)
        if cur is None or (rel.endswith('.pdf') and not cur.endswith('.pdf')):
            groups[(year, subj)][doc_type] = rel

    # 1. 로컬 PDF/HWP 스캔
    for f in sorted(list(pdfs_dir.rglob('*.pdf')) + list(pdfs_dir.rglob('*.hwp'))):
        rel = str(f.relative_to(pdfs_dir.parent))  # pdfs_police/2013/main/...
        parts = f.stem.split('_')  # e.g. 2013_main_korean_q
        if len(parts) < 4:
            continue
        year_str, _, subj, doc_type = parts[0], parts[1], parts[2], parts[3]
        try:
            year = int(year_str)
        except ValueError:
            continue
        assign(year, subj, doc_type, rel)

    # 2. release police-v1 PDF 자산 보강 (로컬에 PDF가 없는 경우의 fallback)
    import subprocess
    r = subprocess.run(
        ['gh', 'release', 'view', 'police-v1', '-R', 'hongdoohyeon/Suneung',
         '--json', 'assets', '--jq', '.assets[].name'],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        for name in r.stdout.strip().split('\n'):
            if not name.endswith('.pdf'):
                continue
            parts = Path(name).stem.split('_')
            if len(parts) < 4:
                continue
            year_str, _, subj, doc_type = parts[0], parts[1], parts[2], parts[3]
            try:
                year = int(year_str)
            except ValueError:
                continue
            assign(year, subj, doc_type, f'pdfs_police/{year}/main/{name}')

    for (year, subj), files in groups.items():
        q_path = files.get('q')
        a_path = files.get('a') or files.get('a_all')  # 개별 정답 우선, 없으면 통합 정답
        if not q_path and not a_path:
            continue
        subject = SUBJECT.get(subj, subj)
        item = {
            'curriculum':  '경찰대',
            'gradeYear':   year,
            'examYear':    year - 1,
            'month':       7,
            'typeGroup':   'police',
            'type':        'police_annual',
            'subject':     subject,
            'subSubject':  None,
            'solutionUrl': None,
        }
        item['questionUrl'] = file_url('police', q_path, item, 'q', 'police_annual') if q_path else None
        item['answerUrl']   = file_url('police', a_path, item, 'a', 'police_annual') if a_path else None
        items.append(item)
# ── LEET DB 처리 ───────────────────────────────────────────
def from_leet(db: Path, items: list):
    if not db.exists(): return
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers = {}, {}
    for r in con.execute('SELECT * FROM exams_leet'):
        key = (r['year'], r['exam_type'], r['subject'])
        (questions if r['doc_type'] == 'q' else answers)[key] = r['file_path']
    con.close()

    subj_map = {'verbal': '언어이해', 'reasoning': '추리논증', 'essay': '논술', 'intro': '도입'}
    for key, q in questions.items():
        year, et, subj = key
        a = answers.get(key)
        subject = subj_map.get(subj, subj)
        
        item = {
            'curriculum':  'LEET',
            'gradeYear':   year,
            'examYear':    year - 1,
            'month':       7 if et == 'main' else 1,
            'typeGroup':   'leet',
            'type':        'leet_annual' if et == 'main' else 'prelim',
            'subject':     subject,
            'subSubject':  None,
            'solutionUrl': None,
        }
        item['questionUrl'] = q
        item['answerUrl']   = a if a else None
        
        year_disp = f"{year}학년도" if et == 'main' else "예비시험"
        item['questionDownload'] = f"{year_disp} LEET {subject} 문제지{Path(q).suffix}"
        item['answerDownload']   = f"{year_disp} LEET {subject} 정답{Path(a).suffix}" if a else None
        items.append(item)

# ── MEET DB 처리 ───────────────────────────────────────────
def from_meet(db: Path, items: list):
    if not db.exists(): return
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers = {}, {}
    for r in con.execute('SELECT * FROM exams_meet'):
        key = (r['year'], r['exam_type'], r['subject'])
        (questions if r['doc_type'] == 'q' else answers)[key] = r['file_path']
    con.close()

    subj_map = {'verbal': '언어추론', 'science1': '자연과학추론Ⅰ', 'science2': '자연과학추론Ⅱ'}
    for key, q in questions.items():
        year, et, subj = key
        a = answers.get(key)
        subject = subj_map.get(subj, subj)
        
        item = {
            'curriculum':  'MEET',
            'gradeYear':   year,
            'examYear':    year - 1,
            'month':       8 if et == 'main' else 1,
            'typeGroup':   'meet',
            'type':        'meet_annual' if et == 'main' else 'prelim',
            'subject':     subject,
            'subSubject':  None,
            'solutionUrl': None,
        }
        item['questionUrl'] = q
        item['answerUrl']   = a if a else None
        
        year_disp = f"{year}학년도" if et == 'main' else "예비시험"
        item['questionDownload'] = f"{year_disp} MEET {subject} 문제지{Path(q).suffix}"
        item['answerDownload']   = f"{year_disp} MEET {subject} 정답{Path(a).suffix}" if a else None
        items.append(item)


# ── 메인 ───────────────────────────────────────────────────
def main():
    # GitHub release 자산 인덱스 빌드 (한 번)
    global ASSET_INDEX
    print('자산 인덱스 빌드 중... (gh release view ×4)')
    ASSET_INDEX = build_asset_index()
    print(f'인덱스 항목: {len(ASSET_INDEX):,}개')

    items: list[dict] = []
    for db_name in ('kice_2015.db', 'kice_2009.db', 'kice_2028.db'):
        from_kice(ARCHIVE / db_name, items)
    from_edu(ARCHIVE / 'edu.db', items)
    from_saw(ARCHIVE / 'saw.db', items)
    from_police(ARCHIVE / 'pdfs_police', items)
    from_leet(ARCHIVE / 'leet.db', items)
    from_meet(ARCHIVE / 'meet.db', items)

    # 정렬: 학년도↓ → month↓ (시험 시간 역순: 수능 11 → 10모 → 9모 → 7모 → 6모 → 4모 → 3모)
    #       → 영역 정해진 순서(국·수·영·한국사·과탐·사탐) → 소과목
    items.sort(key=lambda i: (
        -i['gradeYear'],
        -i['month'],
        SUBJECT_ORDER.get(i['subject'], 99),
        i['subject'],
        i['subSubject'] or '',
    ))

    # ID 부여 (id가 첫 키가 되도록 dict 재구성)
    items = [{'id': idx, **it} for idx, it in enumerate(items, 1)]

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSON.open('w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    # 요약
    print(f'\n✓ {len(items):,}건 → {OUT_JSON.relative_to(ROOT)}')
    print('\n  교육과정별:')
    for k, v in sorted(Counter(i['curriculum']        for i in items).items()):
        print(f'    {k:6} {v:>4}건')
    print('\n  시험 그룹별:')
    for k, v in sorted(Counter(i['typeGroup']         for i in items).items()):
        print(f'    {k:11} {v:>4}건')
    print('\n  파일 미존재:')
    miss_q = sum(1 for i in items if not i['questionUrl'])
    miss_a = sum(1 for i in items if not i['answerUrl'])
    print(f'    문제지 누락: {miss_q}건 / 정답표 누락: {miss_a}건')


if __name__ == '__main__':
    sys.exit(main())
