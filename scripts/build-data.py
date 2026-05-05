#!/usr/bin/env python3
"""
KICE archive (SQLite) → 정적 JSON 변환기.

수능/모의/예비/교육청 데이터를 한 번에 읽어 사이트가 그대로 fetch 할 수
있는 data/exams.json 형태로 출력합니다.

실행:  python3 scripts/build-data.py
출력:  data/exams.json
"""

from __future__ import annotations
import json, re, sqlite3, sys
from collections import Counter
from html import escape as html_escape
from pathlib import Path
from urllib.parse import quote

ROOT     = Path(__file__).resolve().parents[1]            # suneung-site/
ARCHIVE  = Path('/Users/hongduhyeon/Workspace/kice_archive')  # KICE archive 위치
OUT_JSON = ROOT / 'data' / 'exams.json'

# Cloudflare Worker 프록시 — Github Release URL 을 가져와 Content-Disposition 에
# 한국어 파일명을 박아 보냄. ?name= 쿼리로 원하는 한국어 파일명 전달.
WORKER_BASE = 'https://suneung-files.hdh061224.workers.dev'

# release tag 목록은 동적 발견 (build_asset_index 에서 gh release list).
# 새 release(예: kice-v5, edu-v4)가 생기면 코드 변경 없이 자동 인덱싱.
KICE_RELEASES: list[str] = []

# 추후 카테고리별 release (예약 — file_url 분기에선 사용 안 하지만 내부 관리용)
FUTURE_RELEASE = {
    'leet':     'leet-v1',
    'meet':     'meet-v1',
    'military': 'military-v1',
    'police':   'police-v1',
}

# 시험 유형(DB exam_type) → 한국어 라벨
KOREAN_TYPE_LABEL = {
    'csat':   '수능',
    'june':   '6모',          # 평가원 6월 모의평가 (학생 약칭)
    'sept':   '9모',          # 평가원 9월 모의평가
    'mock06': '6모',          # legacy 키 fallback
    'mock09': '9모',
    'prelim': '예비시험',
    'military_annual': '사관학교 1차',
    'police_annual':   '경찰대학 1차',
}

# 정식 명칭 (SEO description 풍부화 용도)
FULL_TYPE_LABEL = {
    'csat':   '대학수학능력시험',
    'june':   '6월 모의평가',
    'sept':   '9월 모의평가',
    'mock06': '6월 모의평가',
    'mock09': '9월 모의평가',
    'prelim': '예비시험',
}

# 학생 검색 약칭 (title·description SEO 키워드)
SHORT_TYPE_LABEL = {
    'csat':   '수능',
    'june':   '6모',
    'sept':   '9모',
    'mock06': '6모',
    'mock09': '9모',
    'prelim': '예비',
}

# 문서 타입 라벨
KOREAN_DOC_LABEL = {'q': '문제지', 'a': '정답', 's': '해설',
                    'l': '듣기', 't': '듣기 스크립트'}


def discover_release_tags() -> list[str]:
    """gh CLI 로 repo의 모든 release tag 동적 수집.
    하드코드 KICE_RELEASES/FUTURE_RELEASE 의존 제거 — 새 release가 생기면 자동 반영.
    """
    import subprocess
    r = subprocess.run(
        ['gh', 'release', 'list', '--repo', 'hongdoohyeon/Suneung',
         '--limit', '200', '--json', 'tagName', '--jq', '.[].tagName'],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        # gh 미설치/네트워크 오류 시 fallback (구 하드코드)
        print(f'[warn] gh release list failed: {r.stderr.strip()}', file=sys.stderr)
        return ['kice-v1', 'kice-v2', 'kice-v3', 'kice-v4',
                'edu-v1', 'edu-v2', 'edu-v3',
                'leet-v1', 'meet-v1', 'military-v1', 'police-v1']
    return [t for t in r.stdout.strip().split('\n') if t]


def build_asset_index() -> dict:
    """모든 release의 자산 → basename→tag 매핑.

    자산 목록은 release당 1번 gh API 호출 (병렬 가능하나 release 수 적음).
    인덱스가 비어있으면 file_url() 이 'data/files/...' fallback 처리.
    """
    import subprocess
    idx: dict = {}
    tags = discover_release_tags()
    print(f'release tags: {tags}', file=sys.stderr)
    KICE_RELEASES.clear(); KICE_RELEASES.extend(tags)
    for tag in tags:
        r = subprocess.run(
            ['gh', 'release', 'view', tag, '--repo', 'hongdoohyeon/Suneung',
             '--json', 'assets', '--jq', '.assets[].name'],
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
    ext = '.mp3' if doc_type == 'l' else '.pdf'
    return ' '.join(p for p in parts if p) + ext


def file_url(typegroup: str, file_path: str, item: dict, doc_type: str, db_type: str | None = None) -> str:
    """Worker 프록시 URL 반환. ?name= 에 한국어 파일명 인코딩.

    PDF + MP3 둘 다 Worker가 처리 (한국어 파일명 + Cloudflare 캐시).
    실제 release 에 자산이 존재하는지 ASSET_INDEX 로 확인.
    누락된 경우엔 'data/files/...' 로컬 fallback (validator 가 catch).
    """
    name = Path(file_path).name
    tag = ASSET_INDEX.get(name)
    if not tag:
        return f'data/files/{file_path}'

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

EDU_MONTH = {
    # 고3 학평 시행월
    3: 'mar', 4: 'apr', 7: 'jul', 10: 'oct',
    # 고1/고2 학평 시행월
    6: 'jun', 9: 'sep', 11: 'nov',
    5: None,  # 5월 데이터는 표준이 아니라 무시
}

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
    questions, answers, listens, scripts = {}, {}, {}, {}
    for r in con.execute('SELECT * FROM exams'):
        key = (r['year'], r['exam_type'], r['subject'],
               r['subtype'] or '', r['curriculum'])
        if   r['doc_type'] == 'q': questions[key] = r['file_path']
        elif r['doc_type'] == 'a': answers[key]   = r['file_path']
        elif r['doc_type'] == 'l': listens[key]   = r['file_path']  # 영어 듣기 mp3
        elif r['doc_type'] == 't': scripts[key]   = r['file_path']  # 듣기 스크립트
    con.close()

    # 사탐/과탐 통합 카드(subtype='')는 같은 그룹의 모든 영역별 a가 따로 있으면
    # 의미가 모호한 중복 카드라 스킵 — 사용자는 영역별 카드를 통해 정답 접근.
    # 그 외(영어 등 통합 카드가 정상)는 그대로 매칭.
    grouped_subtypes: dict = {}
    for k in {(k[0], k[1], k[2], k[4]): None for k in list(questions.keys()) + list(answers.keys())}:
        # 같은 (year, et, subj, curr) 그룹의 모든 subtype 수집 (questions+answers 양쪽)
        pass
    # questions 기준 그룹별 subtype 셋
    qsubs = {}
    for k in questions:
        gk = (k[0], k[1], k[2], k[4])
        qsubs.setdefault(gk, set()).add(k[3])

    # Q 한 행 = 카드 1개. A는 같은 (year, exam_type, subject) 그룹에서 매칭.
    for key, q in questions.items():
        year, et, subj, sub, curr = key
        a = answers.get(key) or answers.get((year, et, subj, '', curr))
        # 통합 카드 스킵 조건: 사탐/과탐 + 통합 q이지만 영역별 q가 같은 그룹에 ≥3건 존재
        # → 통합 q는 잘못 분류된 자료일 확률 높음.
        if (sub == '' and subj in ('social', 'science')
                and len(qsubs.get((year, et, subj, curr), set())) >= 4):
            continue
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
        # 영어 듣기 mp3 + 스크립트 (다른 과목엔 listens/scripts에 entry 없음)
        l = listens.get(key)
        t = scripts.get(key)
        if l:
            item['listenUrl']      = file_url(group, l, item, 'l', et)
            item['listenDownload'] = korean_filename(item, 'l', et)
        if t:
            item['scriptUrl']      = file_url(group, t, item, 't', et)
            item['scriptDownload'] = korean_filename(item, 't', et)
        items.append(item)


# ── 교육청 DB 처리 ─────────────────────────────────────────
def from_edu(db: Path, items: list):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    questions, answers, listens, scripts = {}, {}, {}, {}
    # EBSi PDF 카드의 "월" flag가 실제 시행월과 다른 경우(4월 말 학평이 5월로 분류 등)
    # src_url의 wdown 경로 'YYYYMMDD' 가 ground truth — 이를 우선 적용해 month 보정.
    import re as _re
    URL_DATE_RE = _re.compile(r'wdown\.ebsi\.co\.kr/[^/]+/[^/]+/(\d{8})/')
    # 고1/고2/고3 모두 포함. 학년은 key에 추가하여 분리.
    for r in con.execute('SELECT * FROM exams_edu'):
        # src_url의 시행일 → year/month 보정
        real_year, real_month = r['year'], r['month']
        mu = URL_DATE_RE.search(r['src_url'] or '') if r['src_url'] else None
        if mu:
            ymd = mu.group(1)
            real_year, real_month = int(ymd[:4]), int(ymd[4:6])
        m = EDU_MONTH.get(real_month)
        if m is None: continue
        key = (real_year, real_month, r['grade'], r['subject'],
               r['subtype'] or '', r['curriculum'])
        if   r['doc_type'] == 'q': questions[key] = r['file_path']
        elif r['doc_type'] == 'a': answers[key]   = r['file_path']
        elif r['doc_type'] == 'l': listens[key]   = r['file_path']  # 영어 듣기 mp3
        elif r['doc_type'] == 't': scripts[key]   = r['file_path']
    con.close()

    for key, q in questions.items():
        year, month, sgrade, subj, sub, curr = key
        a = (answers.get(key)
             or answers.get((year, month, sgrade, subj, '', curr)))
        site_curr = CURRICULUM[curr]
        # 학년에 따라 gradeYear(학년도) 의미가 달라짐:
        #   고3: 시행연도 + 1 = 학년도 (수능 응시 학년도)
        #   고1/고2: 시행연도 = 학년 진학 연도. gradeYear는 시행연도 그대로 사용.
        grade_year = year + 1 if sgrade == 3 else year
        item = {
            'curriculum':   site_curr,
            'gradeYear':    grade_year,
            'examYear':     year,
            'month':        month,
            'studentGrade': sgrade,         # 1 | 2 | 3 (고1/고2/고3)
            'typeGroup':    'education',
            'type':         EDU_MONTH[month],
            'subject':      map_subject(subj, site_curr),
            'subSubject':   map_subtype(sub, site_curr),
            'solutionUrl':  None,
        }
        item['questionUrl'] = file_url('education', q, item, 'q')
        item['answerUrl']   = file_url('education', a, item, 'a') if a else None
        l = listens.get(key)
        t = scripts.get(key)
        if l:
            item['listenUrl']      = file_url('education', l, item, 'l')
            item['listenDownload'] = korean_filename(item, 'l', None)
        if t:
            item['scriptUrl']      = file_url('education', t, item, 't')
            item['scriptDownload'] = korean_filename(item, 't', None)
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
        item['questionUrl'] = file_url('leet', q, item, 'q')
        item['answerUrl']   = file_url('leet', a, item, 'a') if a else None

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
        item['questionUrl'] = file_url('meet', q, item, 'q')
        item['answerUrl']   = file_url('meet', a, item, 'a') if a else None

        year_disp = f"{year}학년도" if et == 'main' else "예비시험"
        item['questionDownload'] = f"{year_disp} MEET {subject} 문제지{Path(q).suffix}"
        item['answerDownload']   = f"{year_disp} MEET {subject} 정답{Path(a).suffix}" if a else None
        items.append(item)


# ── 메인 ───────────────────────────────────────────────────
def build_exam_meta(it: dict) -> dict:
    """SSG 페이지·sitemap에 쓰일 시험 단건 메타 빌드.
    학생 검색 키워드(9모/6모/학평/기출/답지/등급컷)를 자연스럽게 포함한다."""
    gy   = it['gradeYear']
    gy2  = str(gy)[-2:]                # '26'   ← 학생 약식 표기 ("26수능", "26 9모")
    sub  = it['subject']
    sub_part = f' {it["subSubject"]}' if it.get('subSubject') else ''
    typ  = it.get('type')
    tg   = it.get('typeGroup')

    if tg == 'suneung':
        ui_label   = KOREAN_TYPE_LABEL.get(typ, typ or '')   # '9모'
        full_label = FULL_TYPE_LABEL.get(typ, ui_label)      # '9월 모의평가'
        short_lbl  = SHORT_TYPE_LABEL.get(typ, ui_label)     # '9모'
        head  = f'{gy}학년도 {ui_label} {sub}{sub_part}'
        seo_kw = f'{gy2}학년도 {short_lbl} {sub}{sub_part} 기출답'
        full_phrase = f'{gy}학년도 {full_label}({short_lbl}) {sub}{sub_part}'
    elif tg == 'education':
        sg    = it.get('studentGrade') or 3
        month = it.get('month') or 0
        head  = f'{gy}년 {month}월 학평 (고{sg}) {sub}{sub_part}'
        seo_kw = f'{gy2}년 {month}월 고{sg} 학평 {sub}{sub_part} 기출답'
        full_phrase = f'{gy}년 {month}월 고{sg} 학력평가(학평) {sub}{sub_part}'
    elif tg == 'military':
        head  = f'{gy}학년도 사관학교 1차 {sub}{sub_part}'
        seo_kw = f'{gy2}학년도 사관학교 {sub}{sub_part} 기출'
        full_phrase = f'{gy}학년도 육·해·공군 사관학교 1차 시험 {sub}{sub_part}'
    elif tg == 'police':
        head  = f'{gy}학년도 경찰대학 1차 {sub}{sub_part}'
        seo_kw = f'{gy2}학년도 경찰대 {sub}{sub_part} 기출'
        full_phrase = f'{gy}학년도 경찰대학 1차 시험 {sub}{sub_part}'
    elif tg == 'leet':
        head  = f'{gy}학년도 LEET {sub}'
        seo_kw = f'{gy2}학년도 리트 {sub} 기출'
        full_phrase = f'{gy}학년도 LEET(법학적성시험) {sub}'
    elif tg == 'meet':
        head  = f'{gy}학년도 MEET {sub}'
        seo_kw = f'{gy2}학년도 미트 {sub} 기출'
        full_phrase = f'{gy}학년도 MEET(의·치학교육입문검사) {sub}'
    else:
        head = f'{gy} {sub}{sub_part}'
        seo_kw = f'{gy2} {sub}'
        full_phrase = head

    # title: 본문 + 기출 키워드 (검색에 가장 강한 자리)
    title = f'{head} 기출 — 기출해체분석기'

    # description: 정식 명칭(약칭) 기반 + 답지·등급컷 키워드 + 약식 학년도
    desc = (
        f'{full_phrase} 기출 문제지·정답·답지 PDF와 등급컷·표준점수 통계. '
        f'{seo_kw} 한 페이지에서 해체. 다운로드 무료.'
    )

    canonical = f'https://kicegg.com/exam-{it["id"]}.html'
    return {'title': title, 'description': desc, 'canonical': canonical, 'head': head}


def build_static_exam_pages(items: list[dict], template_path: Path, out_root: Path):
    """exam.html 템플릿을 시험별로 사전 렌더링해 검색엔진이 JS 없이도 인덱싱하게 한다."""
    template = template_path.read_text(encoding='utf-8')

    # 옛 SSG 파일 정리 — exam-{숫자}.html 만 (exam-set.html 등은 보호)
    _ssg_re = re.compile(r'^exam-\d+\.html$')
    for old in out_root.iterdir():
        if old.is_file() and _ssg_re.match(old.name):
            old.unlink()

    def _set_attr(html: str, pattern: str, value: str) -> str:
        # ("...attr=\")…(\")" 형태 정규식 → 값만 갱신, 백슬래시 escape 안전
        return re.sub(pattern,
                      lambda m: m.group(1) + html_escape(value, quote=True) + m.group(2),
                      html, count=1)

    pat = {
      'title':  r'(<title>)[^<]*(</title>)',
      'desc':   r'(<meta name="description" content=")[^"]*(")',
      'canon':  r'(<link rel="canonical" href=")[^"]*(")',
      'ogt':    r'(<meta property="og:title" content=")[^"]*(")',
      'ogd':    r'(<meta property="og:description" content=")[^"]*(")',
      'ogu':    r'(<meta property="og:url" content=")[^"]*(")',
      'twt':    r'(<meta name="twitter:title" content=")[^"]*(")',
      'twd':    r'(<meta name="twitter:description" content=")[^"]*(")',
      'twa':    r'(<meta name="twitter:image:alt" content=")[^"]*(")',
    }

    written = 0
    for it in items:
        meta = build_exam_meta(it)
        canonical = meta['canonical']
        head      = meta['head']

        jsonld = {
          '@context': 'https://schema.org',
          '@type': 'LearningResource',
          '@id':  canonical,
          'url':  canonical,
          'name': head,
          'description': meta['description'],
          'inLanguage': 'ko-KR',
          'learningResourceType': '기출문제',
          'educationalLevel': '고등학교' if it.get('typeGroup') in ('suneung', 'education') else '대학원',
          'isPartOf': {'@id': 'https://kicegg.com/#website'},
        }
        if it.get('questionUrl'):
            parts = [{'@type': 'DigitalDocument', 'name': '문제지',
                      'url': it['questionUrl'], 'encodingFormat': 'application/pdf'}]
            if it.get('answerUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': '정답',
                              'url': it['answerUrl'], 'encodingFormat': 'application/pdf'})
            if it.get('listenUrl'):
                parts.append({'@type': 'AudioObject', 'name': '영어 듣기 mp3',
                              'contentUrl': it['listenUrl'], 'encodingFormat': 'audio/mpeg'})
            if it.get('scriptUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': '듣기 스크립트',
                              'url': it['scriptUrl'], 'encodingFormat': 'application/pdf'})
            jsonld['hasPart'] = parts
        ld_block = (
          '<script type="application/ld+json">'
          + json.dumps(jsonld, ensure_ascii=False, separators=(',', ':'))
          + '</script>\n'
        )

        html = template
        html = _set_attr(html, pat['title'], meta['title'])
        html = _set_attr(html, pat['desc'],  meta['description'])
        html = _set_attr(html, pat['canon'], canonical)
        html = _set_attr(html, pat['ogt'],   meta['title'])
        html = _set_attr(html, pat['ogd'],   meta['description'])
        html = _set_attr(html, pat['ogu'],   canonical)
        html = _set_attr(html, pat['twt'],   meta['title'])
        html = _set_attr(html, pat['twd'],   meta['description'])
        html = _set_attr(html, pat['twa'],   head + ' — 기출해체분석기')
        # JSON-LD: </head> 직전 한 번만 삽입
        html = html.replace('</head>', '  ' + ld_block + '</head>', 1)

        (out_root / f'exam-{it["id"]}.html').write_text(html, encoding='utf-8')
        written += 1
    print(f'  + exam-{{id}}.html SSG {written:,}건 (Naver/Bing 인덱싱)')


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

    # ─ id별 단건 split (exam.html 단건 진입의 lazy fetch 용) ─
    # archive 는 통합 파일 그대로 사용 (필터링 즉시성 유지),
    # exam.html 은 우선 data/exam/{id}.json 시도 → 실패 시 통합 fallback.
    EXAM_DIR = OUT_JSON.parent / 'exam'
    # 옛 split 파일 정리 (지금 빌드에 없는 id 의 잔여 제거)
    if EXAM_DIR.exists():
        for f in EXAM_DIR.glob('*.json'):
            f.unlink()
    EXAM_DIR.mkdir(parents=True, exist_ok=True)
    for it in items:
        with (EXAM_DIR / f"{it['id']}.json").open('w', encoding='utf-8') as f:
            json.dump(it, f, ensure_ascii=False)
    print(f'  + data/exam/{{id}}.json {len(items)}건 (exam.html lazy fetch 용)')

    # ─ exam-{id}.html SSG 사전렌더링 (Naver/Bing 인덱싱) ─
    build_static_exam_pages(items, ROOT / 'exam.html', ROOT)

    # ─ sitemap 분할: index + sets + exams ─
    base = 'https://kicegg.com'
    from urllib.parse import quote as _q
    from xml.sax.saxutils import escape as _xe

    # (1) sitemap-sets.xml — 회차 단위 URL
    sets = set()
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sets.add((it['curriculum'], str(it['gradeYear']), it['type'],
                  it.get('studentGrade') if it.get('typeGroup') == 'education' else None))
    sets_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for curr, year, t, sg in sorted(sets):
        params = f'curriculum={_q(curr)}&amp;year={year}&amp;type={_q(t)}'
        if sg is not None: params += f'&amp;grade={sg}'
        sets_parts.append(
            f'  <url><loc>{base}/exam-set.html?{params}</loc>'
            f'<changefreq>monthly</changefreq><priority>0.6</priority></url>')
    sets_parts.append('</urlset>')
    (ROOT / 'sitemap-sets.xml').write_text('\n'.join(sets_parts) + '\n', encoding='utf-8')

    # (2) sitemap-exams.xml — SSG 단건 URL (3,201)
    exams_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for it in items:
        exams_parts.append(
            f'  <url><loc>{base}/exam-{it["id"]}.html</loc>'
            f'<changefreq>monthly</changefreq><priority>0.4</priority></url>')
    exams_parts.append('</urlset>')
    (ROOT / 'sitemap-exams.xml').write_text('\n'.join(exams_parts) + '\n', encoding='utf-8')

    # (3) sitemap.xml — index (분할 sitemap 가리킴) + 정적 페이지
    main_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <sitemap><loc>{base}/sitemap-static.xml</loc></sitemap>',
        f'  <sitemap><loc>{base}/sitemap-sets.xml</loc></sitemap>',
        f'  <sitemap><loc>{base}/sitemap-exams.xml</loc></sitemap>',
        '</sitemapindex>',
    ]
    (ROOT / 'sitemap.xml').write_text('\n'.join(main_parts) + '\n', encoding='utf-8')

    # (4) sitemap-static.xml — index/archive/gradecut/patchnotes
    # privacy/terms는 noindex 정책이라 sitemap에서 제외
    static_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>',
        f'  <url><loc>{base}/archive.html</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>',
        f'  <url><loc>{base}/gradecut.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>',
        f'  <url><loc>{base}/patchnotes.html</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>',
        '</urlset>',
    ]
    (ROOT / 'sitemap-static.xml').write_text('\n'.join(static_parts) + '\n', encoding='utf-8')

    print(f'  + sitemap (index + static + sets {len(sets)} + exams {len(items)})')

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
