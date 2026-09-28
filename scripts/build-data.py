#!/usr/bin/env python3
"""
KICE archive (SQLite) → 정적 JSON 변환기.

수능/모의/예비/교육청 데이터를 한 번에 읽어 사이트가 그대로 fetch 할 수
있는 data/exams.json 형태로 출력합니다.

실행:  python3 scripts/build-data.py
출력:  data/exams.json
"""

from __future__ import annotations
import datetime, hashlib, json, os, re, sqlite3, sys
from collections import Counter
from html import escape as html_escape
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]            # suneung-site/

# KICE archive 위치 — 우선순위: --archive=… argv > KICE_ARCHIVE env > ../kice_archive
def _resolve_archive() -> Path:
    for arg in sys.argv[1:]:
        if arg.startswith('--archive='):
            return Path(arg.split('=', 1)[1]).expanduser().resolve()
    env = os.environ.get('KICE_ARCHIVE')
    if env:
        return Path(env).expanduser().resolve()
    return (ROOT.parent / 'kice_archive').resolve()

ARCHIVE  = _resolve_archive()
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


def _has_batchim(text: str) -> bool:
    """문구 마지막 한글 음절의 받침 여부."""
    for ch in reversed(text):
        if '가' <= ch <= '힣':
            return (ord(ch) - ord('가')) % 28 > 0
        if ch.isalnum():
            return False
    return False


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
        return ['kice-v1', 'kice-v2', 'kice-v3', 'kice-v4', 'kice-v5',
                'edu-v1', 'edu-v2', 'edu-v3', 'edu-v4', 'edu-listening-v1',
                'leet-v1', 'meet-v1', 'military-v1', 'police-v1',
                'ged-v1', 'ged-v2']
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
    3: 'mar', 4: 'apr', 5: 'may', 7: 'jul', 10: 'oct',
    # 고1/고2 학평 시행월
    6: 'jun', 9: 'sep', 11: 'nov',
    # 주: 5월은 서울교육청 주관 고3 전용 학평
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
            # EBSi H 버튼 원문은 단순 정답표가 아니라 문항별 풀이가 포함된
            # '정답 및 해설' PDF다. 화면과 구조화 데이터가 이를 숨기지 않게 명시한다.
            'answerIncludesSolution': bool(a),
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
## ── OG 이미지 (시험별 1200×630 JPG) ────────────────────────
# 카톡·트위터·네이버 공유 시 미리보기 카드. macOS 빌드 환경 가정.
# OG 폰트: repo 동봉 Pretendard 우선(로컬·CI 어디서나 동일 렌더). 없으면 맥 시스템 폰트 폴백.
_BUNDLED_OG_FONT = Path(__file__).resolve().parent.parent / 'fonts' / 'Pretendard-Regular.ttf'
_OG_FONT_PATH = (str(_BUNDLED_OG_FONT) if _BUNDLED_OG_FONT.exists()
                 else '/System/Library/Fonts/AppleSDGothicNeo.ttc')
_OG_DIR = ROOT / 'og'

def generate_og_image(it: dict, head: str, out_path: Path):
    """1200×630 JPG. 흰 배경 + 색띠 + 시험명 + 부가정보."""
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), '#ffffff')
    d = ImageDraw.Draw(img)

    # typeGroup별 색띠
    color = {
        'suneung':   '#1f6feb',
        'education': '#475569',
        'military':  '#6b4220',
        'police':    '#2e3a5f',
        'leet':      '#7c2d12',
        'meet':      '#581c87',
        'ged':       '#0e7a5f',
    }.get(it.get('typeGroup'), '#1f6feb')
    d.rectangle([0, 0, W, 12], fill=color)

    brand_font  = ImageFont.truetype(_OG_FONT_PATH, 30)
    title_font  = ImageFont.truetype(_OG_FONT_PATH, 64)
    sub_font    = ImageFont.truetype(_OG_FONT_PATH, 32)
    bottom_font = ImageFont.truetype(_OG_FONT_PATH, 26)
    domain_font = ImageFont.truetype(_OG_FONT_PATH, 22)

    # 좌상단 브랜드 + 차별화 슬로건 태그라인 (공유될 때마다 노출)
    d.text((60, 56), '기출해체분석기', fill='#64748b', font=brand_font)
    tagline_font = ImageFont.truetype(_OG_FONT_PATH, 22)
    tagline = ('가입 없이 · 한 페이지에서 · 등급컷까지'
               if it.get('typeGroup') in ('suneung', 'education')
               else '가입 없이 · 한 페이지에서 · 전부 무료')
    d.text((60, 96), tagline, fill='#94a3b8', font=tagline_font)

    # 중앙 시험명 — 너무 길면 자동 줄바꿈
    title = head
    if len(title) > 22:
        # 중간 공백에서 분할
        words = title.split(' ')
        mid = len(words) // 2
        title_lines = [' '.join(words[:mid]), ' '.join(words[mid:])]
    else:
        title_lines = [title]

    # 줄별 측정 + 중앙 배치
    y_cur = H / 2 - (len(title_lines) * 80) / 2 + 10
    for line in title_lines:
        bbox = d.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        d.text(((W - tw) / 2, y_cur), line, fill='#0f172a', font=title_font)
        y_cur += 80

    # 부제 — "기출"
    sub = '기출'
    bbox = d.textbbox((0, 0), sub, font=sub_font)
    sw = bbox[2] - bbox[0]
    d.text(((W - sw) / 2, y_cur + 14), sub, fill='#64748b', font=sub_font)

    # 하단 — 자료 종류
    bottom = '문제지 · 정답 · 등급컷'
    if it.get('listenUrl'):
        bottom += ' · 영어 듣기 mp3'
    bbox = d.textbbox((0, 0), bottom, font=bottom_font)
    bw = bbox[2] - bbox[0]
    d.text(((W - bw) / 2, H - 100), bottom, fill='#94a3b8', font=bottom_font)

    # 도메인
    dom = 'kicegg.com'
    bbox = d.textbbox((0, 0), dom, font=domain_font)
    dw_ = bbox[2] - bbox[0]
    d.text(((W - dw_) / 2, H - 50), dom, fill='#cbd5e1', font=domain_font)

    img.save(out_path, 'JPEG', quality=82, optimize=True)


# ─ 학생 검색어 별칭 ──────────────────────────────────────────────
# "27학년도 5모" / "2026년 5월 고3 학평" 같은 약식·정식 검색어를 본문·키워드 배열에 깔아둠.
SUNEUNG_TYPE_ALIAS = {
    'jun':    ['6모', '6월 모의평가', '6월모의평가', '6월모평'],
    'sep':    ['9모', '9월 모의평가', '9월모의평가', '9월모평'],
    'csat':   ['수능', '대학수학능력시험'],
    'prelim': ['예비시험', '예비'],
}
EDU_MONTH_ALIAS = {
    3:  ['3모', '3월 학평', '3월 모의고사', '3월 학력평가'],
    4:  ['4모', '4월 학평', '4월 모의고사', '4월 학력평가'],
    5:  ['5모', '5월 학평', '5월 모의고사', '5월 학력평가'],
    7:  ['7모', '7월 학평', '7월 모의고사', '7월 학력평가'],
    10: ['10모', '10월 학평', '10월 모의고사', '10월 학력평가'],
    11: ['11모', '11월 학평', '11월 모의고사', '11월 학력평가'],
}
# 영어 시험에 강하게 잡혀야 하는 자료 키워드 (학생들이 직접 치는 검색어)
ENGLISH_ASSET_KEYWORDS = [
    '영어 듣기', '영어 듣기 파일', '영어 듣기 mp3', '영어 듣기 음원',
    '영어 듣기 대본', '영어 스크립트', '듣기 대본', '듣기평가',
    '듣기평가 음원', 'listening script',
    '영어 답지', '영어 해설지', '영어 정답', '영어 문제지',
]
COMMON_ASSET_KEYWORDS = ['문제지', '기출문제', '정답', '답지', '해설지', '풀이', '등급컷']

# 대학별 논술 허브 URL 슬러그 (subject 전체명 → ASCII slug). 허브: nonsul-{slug}.html
ESSAY_SCHOOL_SLUG = {
    '한양대학교': 'hanyang', '경희대학교': 'khu', '이화여자대학교': 'ewha',
    '한국외국어대학교': 'hufs', '서울시립대학교': 'uos', '건국대학교': 'konkuk',
    '동국대학교': 'dongguk', '숙명여자대학교': 'sookmyung', '인하대학교': 'inha',
    '아주대학교': 'ajou', '가톨릭대학교': 'catholic', '홍익대학교': 'hongik',
    '단국대학교': 'dankook', '세종대학교': 'sejong', '광운대학교': 'kw',
    '숭실대학교': 'soongsil', '서울여자대학교': 'swu', '성신여자대학교': 'sungshin',
    '부산대학교': 'pusan', '경북대학교': 'knu', '가천대학교': 'gachon',
    '경기대학교': 'kyonggi', '한국항공대학교': 'kau', '서경대학교': 'seokyeong',
    '상명대학교': 'sangmyung', '을지대학교': 'eulji', '한국공학대학교': 'tukorea',
    '수원대학교': 'suwon', '한신대학교': 'hanshin', '동덕여자대학교': 'dongduk',
    '삼육대학교': 'samyook', '한양대학교(ERICA)': 'erica', '중앙대학교': 'cau',
    '연세대학교': 'yonsei', '고려대학교': 'korea', '성균관대학교': 'skku',
    '서강대학교': 'sogang', '덕성여자대학교': 'duksung', '연세대학교(미래)': 'yonsei-mirae',
    '강남대학교': 'kangnam', '고려대학교(세종)': 'korea-sejong', '국민대학교': 'kookmin',
    '서울과학기술대학교': 'seoultech', '신한대학교': 'shinhan',
    '한국기술교육대학교': 'koreatech',
}


def essay_hub_filename(subject: str) -> str:
    """대학별 논술 허브 페이지 파일명. 매핑 없으면 빈 문자열(허브 미생성)."""
    slug = ESSAY_SCHOOL_SLUG.get(subject)
    return f'nonsul-{slug}.html' if slug else ''


# 과목별 기출 허브 — 수능(suneung-{slug})·학평(hakpyeong-{slug}). 상위 과목 축.
SUBJECT_HUB_SLUG = {
    '국어': 'korean', '수학': 'math', '영어': 'english', '한국사': 'history',
    '사회탐구': 'social', '과학탐구': 'science', '직업탐구': 'vocational', '제2외국어': 'foreign',
}
SUBJECT_HUB_PREFIX = {'suneung': 'suneung', 'education': 'hakpyeong'}


def subject_hub_filename(it: dict) -> str:
    """과목별 기출 허브 파일명. 수능/학평의 매핑된 상위 과목만, 아니면 빈 문자열."""
    pre = SUBJECT_HUB_PREFIX.get(it.get('typeGroup'))
    slug = SUBJECT_HUB_SLUG.get(it.get('subject'))
    return f'{pre}-{slug}.html' if (pre and slug) else ''


def _exam_aliases(it: dict) -> list[str]:
    """시험 별 학생 검색어 별칭 (본문·keywords 양쪽에 깔리는 키워드)."""
    gy = it['gradeYear']; gy2 = str(gy)[-2:]
    sub = it['subject']
    tg  = it.get('typeGroup'); typ = it.get('type')
    aliases: list[str] = []
    if tg == 'suneung':
        for a in SUNEUNG_TYPE_ALIAS.get(typ, []):
            aliases.append(f'{gy2}학년도 {a}')
            aliases.append(f'{gy}학년도 {a}')
            aliases.append(f'{gy2} {a}')
        # 종합형
        if typ in ('jun','sep'):
            month = 6 if typ == 'jun' else 9
            aliases += [f'{gy}학년도 {month}월 모의평가', f'{gy2}학년도 {month}모']
    elif tg == 'education':
        sg = it.get('studentGrade') or 3
        month = it.get('month') or 0
        cy = it.get('examYear') or (gy - 1)  # 시험 시행 연도(달력 기준)
        for a in EDU_MONTH_ALIAS.get(month, []):
            aliases += [
                f'{gy2}학년도 {a}', f'{gy}학년도 {a}',
                f'{cy}년 {a}',
                f'고{sg} {a}',
                f'{cy}년 고{sg} {month}월 학평',
                f'{cy}년 {month}월 고{sg} 모의고사',
            ]
        if month and 0 < month < 13:
            aliases.append(f'{gy2}학년도 {month}모')
            aliases.append(f'{gy} {month}모')
    elif tg == 'ged':
        sess = '2' if typ == 'ged_2' else '1'
        ey = it.get('examYear') or gy
        level = it.get('curriculum')
        aliases += [
            f'{ey}년 {level} 검정고시 {sub}',
            f'{level} 검정고시 {sub} 기출',
            f'검정고시 {sub} 기출',
            f'{ey} 제{sess}회 검정고시 {sub}',
        ]
    return list(dict.fromkeys(aliases))  # 순서 보존 dedup


def _exam_date(it: dict) -> str:
    """Return ISO 8601 date (YYYY-MM-DD) for an exam, approximated from metadata."""
    tg = it.get('typeGroup', '')
    gy = it.get('gradeYear', 0)
    ey = it.get('examYear', 0)
    m  = it.get('month', 0)
    typ = it.get('type', '')
    if tg == 'suneung':
        # 수능: November of (gradeYear - 1), e.g. 2026학년도 = 2025-11-14
        return f'{gy - 1}-11-14'
    elif tg == 'education':
        # 학평: examYear-month-01 (month 0일 때는 1월로 fallback)
        if m and m > 0:
            return f'{ey or (gy - 1)}-{m:02d}-01'
        return f'{ey or (gy - 1)}-01-01'
    elif tg == 'ged':
        # 검정고시: 1회=4월, 2회=8월
        mm = '08' if typ == 'ged_2' else '04'
        return f'{ey or gy}-{mm}-01'
    elif tg in ('military', 'police'):
        # 사관학교/경찰대 1차: July–August
        return f'{gy - 1}-07-31'
    elif tg in ('leet', 'meet'):
        # LEET/MEET: July
        return f'{gy - 1}-07-27'
    elif tg == 'essay':
        # 대학별 논술: October–November
        return f'{gy - 1}-10-15'
    elif tg == 'reference':
        if ey:
            return f'{ey}-01-01'
        return f'{gy}-01-01'
    else:
        return f'{gy or 2020}-01-01'


def answer_label_for(it: dict) -> str:
    if it.get('answerIncludesSolution'):
        return '정답·해설'
    if it.get('answerStatus') == 'official_objection_period':
        return '정답 (이의신청 중)'
    return '정답'


def build_exam_meta(it: dict) -> dict:
    """SSG 페이지·sitemap에 쓰일 시험 단건 메타 빌드.
    학생 검색 키워드(9모/6모/학평/기출/답지/등급컷)를 자연스럽게 포함한다.
    영어 시험은 듣기·대본·스크립트·MP3 키워드를 추가로 노출한다."""
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
        ey    = it.get('examYear') or (gy - 1)
        # primary: 시행연도 기준 ("2026년 3월 고3 학력평가") — H1·title 의 직관적 표기
        head  = f'{ey}년 {month}월 고{sg} 학력평가 {sub}{sub_part}'
        # SEO alias: 학년도 표기도 함께 노출 ("27학년도 3모" 같은 학생 검색어)
        seo_kw = f'{gy}학년도 {month}모 {sub}{sub_part} 기출답 · {ey}년 {month}월 고{sg} 학평'
        full_phrase = f'{ey}년 {month}월 고{sg} 학력평가(={gy}학년도 {month}월 학평) {sub}{sub_part}'
    elif tg == 'military':
        head  = f'{gy}학년도 사관학교 1차 {sub}{sub_part}'
        seo_kw = f'{gy2}학년도 사관학교 {sub}{sub_part} 기출'
        full_phrase = f'{gy}학년도 육·해·공군 사관학교 1차 시험 {sub}{sub_part}'
    elif tg == 'police':
        head  = f'{gy}학년도 경찰대학 1차 {sub}{sub_part}'
        seo_kw = f'{gy2}학년도 경찰대 {sub}{sub_part} 기출'
        full_phrase = f'{gy}학년도 경찰대학 1차 시험 {sub}{sub_part}'
    elif tg == 'leet':
        prelim = ' 예비시험' if typ == 'prelim' else ''   # 예비/본시험 제목 구분 (동명 중복 방지)
        head  = f'{gy}학년도 LEET{prelim} {sub}'
        seo_kw = f'{gy2}학년도 리트{prelim} {sub} 기출'
        full_phrase = f'{gy}학년도 LEET(법학적성시험){prelim} {sub}'
    elif tg == 'meet':
        prelim = ' 예비시험' if typ == 'prelim' else ''
        head  = f'{gy}학년도 MEET{prelim} {sub}'
        seo_kw = f'{gy2}학년도 미트{prelim} {sub} 기출'
        full_phrase = f'{gy}학년도 MEET(의·치학교육입문검사){prelim} {sub}'
    elif tg == 'essay':
        lbl = '모의논술' if typ == 'essay_mock' else '논술'
        uni_short = sub.replace('학교', '')          # '연세대학교' → '연세대'
        head  = f'{gy}학년도 {uni_short} {lbl}{sub_part}'
        seo_kw = f'{gy2} {uni_short} {lbl}{sub_part} 기출'
        full_phrase = f'{gy}학년도 {sub} 수시 {lbl}고사{sub_part}'
    elif tg == 'ged':
        sess = '2' if typ == 'ged_2' else '1'
        ey = it.get('examYear') or gy
        level = it.get('curriculum')           # 초졸 / 중졸 / 고졸
        head  = f'{ey}년 제{sess}회 {level} 검정고시 {sub}'
        seo_kw = f'{ey} {level} 검정고시 {sub} 기출답'
        full_phrase = f'{ey}년 제{sess}회 {level} 검정고시 {sub}'
    elif tg == 'reference':
        # 통계 PDF — 학년도 의미 없음, 자료명 중심
        ey   = it.get('examYear') or ''
        head = f'KICE 공식 — {sub}{sub_part}'
        seo_kw = f'수능 통계 {sub} 평가원 공식 자료'
        full_phrase = f'한국교육과정평가원(KICE) 공식 수능 통계 — {sub}{sub_part} ({ey}년 공개)' if ey else f'KICE 공식 수능 통계 — {sub}{sub_part}'
    else:
        head = f'{gy} {sub}{sub_part}'
        seo_kw = f'{gy2} {sub}'
        full_phrase = head

    is_english = (sub == '영어')
    has_listen = bool(it.get('listenUrl') or it.get('scriptUrl'))

    is_reference = (tg == 'reference')

    answer_label = answer_label_for(it)
    assets = []
    if it.get('questionUrl'): assets.append('문제지')
    if it.get('answerUrl'): assets.append(answer_label)
    if it.get('solutionUrl'): assets.append('해설지')
    if it.get('listenUrl'): assets.append('영어 듣기 MP3')
    if it.get('scriptUrl'): assets.append('듣기 대본 PDF')
    assets_phrase = '·'.join(dict.fromkeys(assets))

    # title — 영어는 실제 보유 자료만 노출, reference는 통계 안내
    if is_reference:
        title = f'{head} 통계 PDF — 기출해체분석기'
    elif is_english and has_listen:
        title = f'{head} 듣기·대본·{answer_label} — 기출해체분석기'
    else:
        _docs = [x for x, k in (('문제지', 'questionUrl'), (answer_label, 'answerUrl'), ('해설', 'solutionUrl')) if it.get(k)]
        title = f'{head} {"·".join(dict.fromkeys(_docs))} — 기출해체분석기' if _docs else f'{head} 기출 — 기출해체분석기'

    # description — 영어는 듣기 mp3·대본 PDF 키워드를 명시
    if is_reference:
        desc = (
            f'{full_phrase}. 평가원이 공개한 수능 통계 PDF를 다운로드하세요. '
            f'{seo_kw}, 응시·접수·채점 현황 데이터.'
        )
    elif is_english and has_listen:
        desc = (
            f'{full_phrase} {assets_phrase} 자료를 '
            f'한 페이지에서 확인하고 무료로 내려받으세요.'
        )
    elif tg == 'ged':
        if it.get('answerUrl'):
            desc = (
                f'{full_phrase} 기출 문제지와 정답(확정안)을 한 곳에서 확인하고 무료로 내려받으세요.'
            )
        else:
            desc = (
                f'{full_phrase} 기출 문제지를 한 곳에서 확인하고 무료로 내려받으세요.'
            )
    else:
        desc = (
            f'{full_phrase} 기출 {assets_phrase} 자료와 등급컷을 한 곳에서 확인하고 무료로 내려받으세요.'
        )

    # description 160자 권장 (SERP/OG 절단 회피) — 단어 경계 보존하며 잘라냄
    if len(desc) > 160:
        cut = desc[:157]
        last_space = max(cut.rfind('. '), cut.rfind(' '), cut.rfind('·'))
        if last_space > 100:
            cut = cut[:last_space]
        desc = cut.rstrip(' ·,.') + '…'

    canonical = f'https://kicegg.com/exam-{it["id"]}.html'

    # 소개 문장 — 시험 정보 카드에 들어가는 사실 기반 설명 (키워드 나열 금지: 저품질 신호)
    aliases = _exam_aliases(it)
    if is_reference:
        intro = (
            f'{full_phrase}. 한국교육과정평가원이 공개한 공식 통계 자료로, '
            f'역대 수능의 응시 인원·접수 현황·과목별 채점 결과(평균·등급·계열별 분포)를 담고 있습니다. '
            f'PDF 파일을 무료로 다운로드해 확인하세요.'
        )
    else:
        # 자료 유형 조건부 노출 — 실제 보유한 url 만 문구에 포함
        assets = []
        if it.get('questionUrl'):  assets.append('문제지')
        if it.get('answerUrl'):    assets.append(answer_label)
        if it.get('solutionUrl'):  assets.append('해설지')
        if it.get('listenUrl'):    assets.append('영어 듣기 MP3')
        if it.get('scriptUrl'):    assets.append('듣기 대본 PDF')
        names = [a.replace(' PDF', '') for a in assets]
        if names:
            obj = '·'.join(names) + ('을' if _has_batchim(names[-1]) else '를')
            intro = f'{full_phrase} 기출 {obj} 제공합니다.'
        else:
            intro = f'{full_phrase} 기출 자료입니다.'
        if tg not in ('ged', 'essay', 'reference'):
            intro += ' 공개된 등급컷이 있으면 등급별 원점수·표준점수와 역대 대비 난이도를 함께 보여 줍니다.'

    # JSON-LD keywords 배열 — 핵심어만(스터핑 방지): 제목·과목·대표 별칭 3개 + 자료유형 키워드
    kw = list(dict.fromkeys(
        [head, sub] + aliases[:3]
        + (ENGLISH_ASSET_KEYWORDS if is_english else COMMON_ASSET_KEYWORDS)
    ))

    return {
        'title': title, 'description': desc, 'canonical': canonical,
        'head': head, 'intro': intro, 'keywords': kw,
        'is_english': is_english, 'has_listen': has_listen,
        'datePublished': _exam_date(it),
    }


# ── 등급컷 매칭 · 난이도 5단계 ─────────────────────────────────
# 상세 페이지(SSG)와 기출검색(data/archive/cuts.json)이 같은 값을 쓰도록 한 곳에서 계산한다.
TIER_LABELS = {1: '매우 쉬움', 2: '쉬움', 3: '보통', 4: '어려움', 5: '매우 어려움'}
_TIER_MIN_SAMPLES = 5


def _load_gradecuts() -> list[dict]:
    try:
        return json.loads((ROOT / 'data' / 'gradecuts.json').read_text(encoding='utf-8'))
    except Exception:
        return []


def clean_cut_series(vals, lo: float, hi: float):
    """표준점수·백분위·누적 배열 검증 — 범위를 벗어난 값(0 채움, 인원수 오입력 등)이 하나라도 있으면
    그 열 전체를 버린다. 원천 데이터 일부에 깨진 레코드가 있어 화면에 그대로 내보내지 않기 위함."""
    if not isinstance(vals, list):
        return []
    nums = [v for v in vals if v is not None]
    if not nums or any(not isinstance(v, (int, float)) or v < lo or v > hi for v in nums):
        return []
    return vals


def build_cut_matcher(cuts: list[dict]):
    """exam → 등급컷 레코드. lib/exam-gradedist.js 와 동일 조인키.
    학평은 학년별 컷 우선, 없으면 학년무관(sg=null) 컷만 폴백. 검정고시는 없음."""
    idx: dict = {}
    idx6: dict = {}
    idx_none: dict = {}
    for c in cuts:
        k = (c.get('curriculum'), str(c.get('gradeYear')), c.get('type'), c.get('subject'), c.get('subSubject'))
        idx.setdefault(k, c)
        idx6.setdefault(k + (c.get('studentGrade'),), c)
        if c.get('studentGrade') is None:
            idx_none.setdefault(k, c)

    def match(it: dict):
        k = (it.get('curriculum'), str(it.get('gradeYear')), it.get('type'), it.get('subject'), it.get('subSubject'))
        tg = it.get('typeGroup')
        if tg == 'ged':
            return None
        if tg == 'education':
            return idx6.get(k + (it.get('studentGrade'),)) or idx_none.get(k)
        return idx.get(k)
    return match


def is_absolute_cut(it: dict, cut: dict | None) -> bool:
    if cut and cut.get('absolute'):
        return True
    subj, gy = it.get('subject'), it.get('gradeYear') or 0
    if it.get('typeGroup') in ('suneung', 'education') and isinstance(gy, int):
        return (subj == '영어' and gy >= 2018) or (subj == '한국사' and gy >= 2017)
    return False


def tier_series_key(it: dict):
    """난이도 비교 묶음 — 같은 기관·교육과정·과목(선택과목)·학년끼리만 비교."""
    tg = it.get('typeGroup')
    if tg == 'suneung' and it.get('type') not in ('csat', 'june', 'sept'):
        return None
    if tg in ('ged', 'reference', 'essay'):
        return None
    sg = it.get('studentGrade') if tg == 'education' else None
    return (tg, it.get('curriculum'), it.get('subject'), it.get('subSubject'), sg)


def compute_exam_scores(items: list[dict], cuts: list[dict] | None = None) -> dict:
    """{exam_id: {raw, std, top, cum, abs, basis, tier, cut}} — 1등급 원점수 컷 기준 난이도.

    난이도는 같은 묶음(tier_series_key)의 역대 1등급 원점수 컷 안에서의 백분위(중간순위)로
    5단계를 매긴다: 상위 20%(컷 높음) = 매우 쉬움 … 하위 20% = 매우 어려움.
    표본이 5회 미만이거나 절대평가·값이 모두 같으면 매기지 않는다."""
    match = build_cut_matcher(cuts if cuts is not None else _load_gradecuts())
    try:   # 영어(절대평가) 등급별 비율 — scripts/extract-english-ratios.py (평가원 채점결과)
        en_ratios = json.loads((ROOT / 'data' / 'english-grade-ratios.json').read_text(encoding='utf-8'))
    except Exception:
        en_ratios = {}
    out: dict = {}
    series: dict = {}
    for it in items:
        cut = match(it)
        if not cut:
            continue
        raw = cut.get('rawCuts') if isinstance(cut.get('rawCuts'), list) else []
        std = clean_cut_series(cut.get('standardCuts'), 1, 200)
        cum = clean_cut_series(cut.get('cumulativePercent'), 0, 100)
        top = cut.get('highestStandardScore')
        if not isinstance(top, (int, float)) or (std and std[0] is not None and top < std[0]):
            top = None
        r1 = raw[0] if raw and raw[0] is not None else None
        absolute = is_absolute_cut(it, cut)
        out[it['id']] = {
            'raw': r1,
            'std': std[0] if std and std[0] is not None else None,
            'top': top,
            'cum': cum[0] if cum and cum[0] is not None else None,
            'abs': absolute,
            'basis': cut.get('rawCutBasis'),
            'tier': None,
            'cut': cut,
            'ratio': None,
            'ratios': None,
        }
        er = en_ratios.get(f'{it.get("gradeYear")}|{it.get("type")}') if (
            it.get('subject') == '영어' and it.get('typeGroup') == 'suneung') else None
        if er:
            out[it['id']]['ratios'] = er['ratios']
            out[it['id']]['ratio'] = er['ratios'][0]
        key = tier_series_key(it)
        # 난이도 비교값: 상대평가는 1등급 원점수 컷, 영어(절대평가)는 1등급 비율 — 둘 다 높을수록 쉬움
        metric = out[it['id']]['ratio'] if absolute else r1
        if key and metric is not None:
            series.setdefault(key, {})[(it.get('gradeYear'), it.get('type'), it.get('month'))] = metric
    for it in items:
        rec = out.get(it['id'])
        key = tier_series_key(it)
        v = (rec['ratio'] if rec['abs'] else rec['raw']) if rec else None
        if v is None or not key or key not in series:
            continue
        values = list(series[key].values())
        if len(values) < _TIER_MIN_SAMPLES or len(set(values)) < 3:
            continue
        below = sum(1 for x in values if x < v)
        equal = sum(1 for x in values if x == v)
        p = (below + 0.5 * equal) / len(values)
        rec['tier'] = 1 if p >= 0.8 else 2 if p >= 0.6 else 3 if p >= 0.4 else 4 if p >= 0.2 else 5
    return out


# ── 상세 페이지 표시 조각 (SSG) ───────────────────────────────
_ORG_LABEL = {
    'suneung': '한국교육과정평가원', 'education': '시·도교육청', 'military': '육·해·공군사관학교',
    'police': '경찰대학', 'leet': '법학전문대학원협의회', 'meet': '의·치학교육입문검사 관리위원회',
    'essay': '각 대학교', 'ged': '한국교육과정평가원·시도교육청', 'reference': '한국교육과정평가원',
}
_CURR_LABEL = {'2015': '2015 개정', '2009': '2009 개정', '2007개정': '2007 개정', '7차': '7차 교육과정',
               '6차': '6차 교육과정', '예비': '예비시행'}
_SUBJECT_ORDER = ['국어', '수학', '영어', '한국사', '사회탐구', '과학탐구', '직업탐구', '제2외국어',
                  '통합사회', '통합과학', '통합탐구']
_SUNEUNG_MONTH = {'csat': 11, 'june': 6, 'sept': 9}
# 화면 표시용 선택과목 이름 (config.js prettySub 와 동일) · 교육과정 순서
_SUB_PRETTY = {'화법과작문': '화법과 작문', '언어와매체': '언어와 매체', '확률과통계': '확률과 통계',
               '생활과윤리': '생활과 윤리', '윤리와사상': '윤리와 사상', '정치와법': '정치와 법', '법과정치': '법과 정치'}
# 평가원 공식 선택과목 순서 (수능 시행기본계획·채점결과 표 기준). 교육과정별 과목명이 섞여 있어
# 공백을 뺀 이름으로 비교하고, 과학탐구는 Ⅰ 과목 전부 → Ⅱ 과목 순.
_SUB_ORDER = [
    '화법과작문', '언어와매체', '확률과통계', '미적분', '기하', '가형', '나형', 'A형', 'B형',
    '생활과윤리', '윤리와사상', '윤리', '국사', '한국사', '한국지리', '세계지리', '경제지리', '동아시아사',
    '한국근현대사', '세계사', '법과사회', '법과정치', '정치', '경제', '정치와법', '사회·문화',
    '성공적인직업생활', '농업이해', '농업기초기술', '농생명산업', '공업일반', '기초제도', '공업', '상업경제',
    '회계원리', '상업정보', '수산·해운산업기초', '수산·해운', '해양의이해', '인간발달', '생활서비스산업의이해', '가사·실업',
    '독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어', '베트남어', '한문',
]
_SCIENCE_STEMS = ['물리학', '물리', '화학', '생명과학', '생물', '지구과학']


def sub_order_key(sub) -> tuple:
    s = str(sub or '').replace(' ', '')
    for i, stem in enumerate(_SCIENCE_STEMS):
        if s.startswith(stem):
            level = 2 if s.endswith(('Ⅱ', 'II')) else 1
            return (500 + level * 10 + i, s)
    base = s.rstrip('ⅠI')
    return (_SUB_ORDER.index(base) if base in _SUB_ORDER else 900, s)


def pretty_sub(sub) -> str:
    return _SUB_PRETTY.get(str(sub), str(sub)) if sub else ''


def exam_badge_label(it: dict) -> str:
    tg, t = it.get('typeGroup'), it.get('type')
    if tg == 'suneung':
        return KOREAN_TYPE_LABEL.get(t, t or '')
    if tg == 'education':
        return f'{it.get("month")}월 학평'
    return {'military': '사관학교', 'police': '경찰대', 'leet': 'LEET', 'meet': 'MEET',
            'essay': '모의논술' if t == 'essay_mock' else '논술', 'ged': '검정고시',
            'reference': '통계'}.get(tg, t or '')


def exam_year_label(it: dict) -> str:
    tg = it.get('typeGroup')
    if tg == 'education':
        return f'{it.get("examYear")}년 고{it.get("studentGrade") or 3}'
    if tg == 'ged':
        return f'{it.get("examYear") or it.get("gradeYear")}년 제{2 if it.get("type") == "ged_2" else 1}회'
    if tg == 'reference':
        return str(it.get('examYear') or '')
    return f'{it.get("gradeYear")}학년도'


def _held_label(it: dict) -> str:
    """시행 시기 — 날짜 데이터가 없어 '연·월' 까지만 표기."""
    tg = it.get('typeGroup')
    gy = it.get('gradeYear')
    if tg == 'suneung' and it.get('type') in _SUNEUNG_MONTH and isinstance(gy, int):
        return f'{gy - 1}년 {_SUNEUNG_MONTH[it["type"]]}월'
    if tg == 'education' and it.get('examYear') and it.get('month'):
        return f'{it["examYear"]}년 {it["month"]}월'
    if tg == 'ged' and it.get('examYear'):
        return f'{it["examYear"]}년 {8 if it.get("type") == "ged_2" else 4}월'
    return ''


def exam_set_title(it: dict) -> str:
    tg, gy, t = it.get('typeGroup'), it.get('gradeYear'), it.get('type')
    if tg == 'suneung':
        return f'{gy}학년도 {FULL_TYPE_LABEL.get(t, KOREAN_TYPE_LABEL.get(t, t or ""))}'
    if tg == 'education':
        return f'{it.get("examYear")}년 {it.get("month")}월 고{it.get("studentGrade") or 3} 학력평가'
    if tg == 'military':
        return f'{gy}학년도 사관학교 1차'
    if tg == 'police':
        return f'{gy}학년도 경찰대학 1차'
    if tg in ('leet', 'meet'):
        return f'{gy}학년도 {tg.upper()}' + (' 예비시험' if t == 'prelim' else '')
    if tg == 'essay':
        return f'{gy}학년도 {"모의논술" if t == "essay_mock" else "논술"} 전체'
    if tg == 'ged':
        return f'{it.get("examYear") or gy}년 제{2 if t == "ged_2" else 1}회 {it.get("curriculum")} 검정고시'
    return '이 회차 전체'


def exam_sub_label(it: dict) -> str:
    tg = it.get('typeGroup')
    if tg == 'education':   # 제목에 이미 연·월·학년이 있어 주관 정보만
        return '전국연합학력평가 · 시·도교육청 주관'
    if tg == 'ged':
        return f'{it.get("curriculum")} 학력 검정고시 · 시·도교육청 시행'
    parts = [exam_set_title(it) if tg != 'essay' else f'{it.get("subject")} 수시 논술고사']
    held = _held_label(it)
    if held and it.get('typeGroup') not in ('education', 'ged'):   # 학평·검정고시는 제목에 이미 연·월
        parts.append(f'{held} 시행')
    return ' · '.join(parts)


def exam_fact_rows(it: dict) -> list[tuple[str, str]]:
    esc = lambda v: html_escape(str(v), quote=False)
    subj = it.get('subject') or ''
    if it.get('subSubject'):
        subj += f' · {pretty_sub(it["subSubject"])}'
    rows = [('시험', esc(exam_set_title(it) if it.get('typeGroup') != 'essay' else f'{it.get("gradeYear")}학년도 {it.get("subject")} 논술'))]
    held = _held_label(it)
    if held:
        rows.append(('시행', esc(held)))
    rows.append(('영역' if it.get('typeGroup') != 'essay' else '계열', esc(subj if it.get('typeGroup') != 'essay' else (it.get('subSubject') or '논술'))))
    curr = _CURR_LABEL.get(str(it.get('curriculum')))
    if curr:
        rows.append(('교육과정', esc(curr)))
    org = _ORG_LABEL.get(it.get('typeGroup'))
    if org:
        rows.append(('출제', esc(org)))
    docs = [n for k, n in (('questionUrl', '문제지'), ('answerUrl', answer_label_for(it)), ('solutionUrl', '해설지'),
                           ('listenUrl', '듣기 MP3'), ('scriptUrl', '듣기 대본')) if it.get(k)]
    if docs:
        rows.append(('자료', esc(' · '.join(dict.fromkeys(docs)))))
    return rows


def _exam_sort_key(it: dict):
    tg = it.get('typeGroup')
    gy = it.get('gradeYear') if isinstance(it.get('gradeYear'), int) else 0
    if tg == 'suneung':
        return ((gy - 1) * 100 + _SUNEUNG_MONTH.get(it.get('type'), 0), it['id'])
    return ((it.get('examYear') or gy) * 100 + (it.get('month') or 0), it['id'])


def _subject_sort_key(it: dict):
    s = it.get('subject') or ''
    return (_SUBJECT_ORDER.index(s) if s in _SUBJECT_ORDER else 99, s, sub_order_key(it.get('subSubject')), it['id'])


def _subject_tab_label(it: dict) -> tuple[str, str]:
    if it.get('typeGroup') == 'essay':
        return (it.get('subSubject') or '논술', '')
    return (it.get('subject') or '', pretty_sub(it.get('subSubject')))


def _short_round(it: dict) -> str:
    """추이 그래프·목록용 짧은 회차 표기 — 26수능 / 26 9모 / 25.10 학평."""
    tg, gy = it.get('typeGroup'), it.get('gradeYear')
    if tg == 'suneung':
        lbl = KOREAN_TYPE_LABEL.get(it.get('type'), '')
        return f'{str(gy)[-2:]}{lbl}' if lbl == '수능' else f'{str(gy)[-2:]} {lbl}'
    if tg == 'education':
        return f'{str(it.get("examYear"))[-2:]}.{int(it.get("month") or 0):02d}'
    return f'{gy}'


def score_stats_html(sc: dict) -> str:
    esc = lambda v: html_escape(str(v), quote=False)
    cells = []
    basis = sc.get('basis')
    kind = ('역산값' if basis == 'academy_reverse_calculated' else '추정 경계' if basis == 'academy_integerized_threshold'
            else '추정' if basis == 'academy_consensus_estimate' else '')
    if sc['abs']:
        cells.append(('1등급 기준', f'{esc(sc["raw"])}<small>점 이상</small>', False))
        if sc.get('ratio') is not None:
            cells.append(('1등급 비율', f'{esc(sc["ratio"])}<small>%</small>', True))
            if sc.get('tier'):
                cells.append(('난이도 (역대 1등급 비율 대비)', TIER_LABELS[sc['tier']], True))
        else:
            cells.append(('평가 방식', '절대평가', False))
    else:
        cells.append(('1등급컷' + (f' ({kind})' if kind else ''), f'{esc(sc["raw"])}<small>원점수</small>', True))
        if sc.get('top') is not None:
            cells.append(('표준점수 최고점', esc(sc['top']), True))
        elif sc.get('std') is not None:
            cells.append(('1등급 표준점수', esc(sc['std']), True))
        if sc.get('cum') is not None:
            cells.append(('1등급 누적 비율', f'{esc(sc["cum"])}<small>%</small>', True))
        if sc.get('tier'):
            cells.append(('난이도 (역대 대비)', TIER_LABELS[sc['tier']], True))
    return '<div class="stats">' + ''.join(
        f'<div class="card-box stat"><span class="stat__label">{lbl}</span>'
        f'<span class="stat__value{" spoil-val" if blur else ""}">{val}</span></div>' for lbl, val, blur in cells) + '</div>'


def grade_table_html(cut: dict, absolute: bool, ratios: list | None = None) -> str:
    """등급별 원점수·표준점수·백분위·누적 비율 표 (lib/exam-gradedist.js 와 동일 형식).
    영어(절대평가)는 등급별 인원 비율(ratios)을 곁들이고 그 열만 스포일러 대상으로 흐린다."""
    cols = [('원점수', cut.get('rawCuts') or [], '')]
    for key, lbl, unit, lo, hi in (('standardCuts', '표준점수', '', 1, 200), ('standardPercentile', '백분위', '', 0, 100),
                                   ('cumulativePercent', '누적', '%', 0, 100)):
        vals = clean_cut_series(cut.get(key), lo, hi)
        if isinstance(vals, list) and any(v is not None for v in vals) and not absolute:
            cols.append((lbl, vals, unit))
    if ratios:
        cols.append(('비율', ratios, '%'))
    n = max((len(v) for _, v, _ in cols), default=0)
    rows = []
    for i in range(min(n, 9)):
        if all(i >= len(v) or v[i] is None for _, v, _ in cols):
            continue
        cells = []
        for j, (_, v, u) in enumerate(cols):
            if i >= len(v) or v[i] is None:
                cells.append('<td>—</td>')
            else:
                cls = ' class="spoil-val"' if (absolute and ratios and j == len(cols) - 1) else (' class="is-muted"' if j > 1 else '')
                cells.append(f'<td{cls}>{v[i]}{u}</td>')
        tds = ''.join(cells)
        rows.append(f'<tr><td>{i + 1}</td>{tds}</tr>')
    basis = cut.get('rawCutBasis')
    note = ('입시기관 역산값' if basis == 'academy_reverse_calculated' else
            '입시기관 추정 정수 경계' if basis == 'academy_integerized_threshold' else
            '공식 표준점수 컷 기준 입시기관 추정 종합' if basis == 'academy_consensus_estimate' else '')
    legend = ' · '.join(x for x in ('등급별 컷', '절대평가' if absolute else '', note,
                                    f'만점 {cut.get("fullScore")}점' if cut.get('fullScore') else '') if x)
    head = ''.join(f'<th scope="col">{lbl}</th>' for lbl, _, _ in cols)
    return ('<table class="grade-table"><thead><tr><th scope="col">등급</th>' + head + '</tr></thead>'
            '<tbody' + ('' if absolute else ' class="spoil-val"') + '>' + ''.join(rows) + '</tbody></table>'
            f'<p class="grade-table__legend">{legend}</p>')


_COMPARE_METRICS = (('raw', '1등급컷', '원점수'), ('top', '표점 최고', '표준점수'), ('std', '1등급 표점', '표준점수'))
_RATIO_METRICS = (('ratio', '1등급 비율', '%'),)


def exam_insight_html(it: dict, series: list[dict], scores: dict) -> str:
    """이 시험 한눈에 — 공개 등급컷으로 만든 사실 문장(같은 과목 역대 회차 대비 순위·직전 대비 증감·난이도).
    페이지마다 다른 실제 정보라 얇은 본문을 보강한다. 숫자는 스포일러 방지로 흐리게."""
    sc = scores.get(it['id']) or {}
    ratio_mode = sc.get('abs') and sc.get('ratio') is not None
    val = sc.get('ratio') if ratio_mode else (None if sc.get('abs') else sc.get('raw'))
    if val is None:
        return ''
    unit, what = ('%', '1등급 비율') if ratio_mode else ('점', '1등급컷(원점수)')
    metric = lambda x: (scores.get(x['id']) or {}).get('ratio' if ratio_mode else 'raw')
    pts = [x for x in series if metric(x) is not None]
    cur_key = _exam_sort_key(it)
    past = [x for x in pts if x['id'] != it['id'] and _exam_sort_key(x) < cur_key]
    sv = lambda v: f'<span class="spoil-val">{html_escape(str(v), quote=False)}{unit}</span>'
    fmt = lambda v: (f'{v:.2f}'.rstrip('0').rstrip('.') if isinstance(v, float) else v)
    out = [f'이 시험의 {what}은 {sv(fmt(val))}입니다.']
    vals = sorted({metric(x) for x in pts}, reverse=True)
    if len(pts) >= 5:
        higher = sum(1 for x in pts if metric(x) > val)
        n = len(pts)
        if higher < n / 2:
            out.append(f'같은 과목 역대 {n}회 가운데 <span class="spoil-val">{"가장" if higher == 0 else f"{higher + 1}번째로"} 높습니다</span>.')
        else:
            lower = sum(1 for x in pts if metric(x) < val)
            out.append(f'같은 과목 역대 {n}회 가운데 <span class="spoil-val">{"가장" if lower == 0 else f"{lower + 1}번째로"} 낮습니다</span>.')
    if past:
        prev = past[-1]; d = round(val - metric(prev), 2)
        lab = (f"{prev.get('examYear')}년 {prev.get('month')}월" if prev.get('typeGroup') == 'education' and prev.get('examYear')
               else f"{prev.get('gradeYear')}학년도 {KOREAN_TYPE_LABEL.get(prev.get('type'), '')}".strip())
        if d:
            out.append(f'직전 회차({html_escape(lab, quote=False)})보다 <span class="spoil-val">{fmt(abs(d))}{unit} {"높고" if d > 0 else "낮고"}</span>,'
                       if sc.get('tier') else f'직전 회차({html_escape(lab, quote=False)})보다 <span class="spoil-val">{fmt(abs(d))}{unit} {"높습니다" if d > 0 else "낮습니다"}</span>.')
        else:
            out.append(f'직전 회차({html_escape(lab, quote=False)})와 같{"고," if sc.get("tier") else "습니다."}')
    if sc.get('tier'):
        _tl = TIER_LABELS[sc['tier']]
        out.append(f'역대 대비 난이도는 <span class="spoil-val">{_tl}</span>{"으로" if _has_batchim(_tl) else "로"} 분류됩니다.')
    if sc.get('top') and not ratio_mode:
        out.append(f'표준점수 최고점은 <span class="spoil-val">{sc["top"]}점</span>입니다.')
    # '…높고,' 로 끝난 문장 뒤에 난이도 문장이 이어지도록 공백으로 합친다
    return '<p class="info-card__desc exam-insight" id="examInsight">' + ' '.join(out) + '</p>'


def compare_html(it: dict, series: list[dict], scores: dict, with_toggle: bool = False) -> str:
    """최근 회차와 비교 — 같은 과목 묶음의 직전 회차들 + 이 시험을 막대그래프·비교표로.
    이 시험의 등급컷이 아직 없어도(발표 전) 지난 회차 비교는 보여 준다. 값은 스포일러 방지 대상."""
    esc = lambda v: html_escape(str(v), quote=False)
    cur_key = _exam_sort_key(it)
    past = [x for x in series if x['id'] != it['id'] and _exam_sort_key(x) <= cur_key]
    pts = past[-9:] + [it]
    sc = lambda x, k: (scores.get(x['id']) or {}).get(k)
    base = _RATIO_METRICS if is_absolute_cut(it, None) else _COMPARE_METRICS   # 영어는 1등급 비율로 비교
    metrics = [m for m in base if sum(1 for x in pts if sc(x, m[0]) is not None) >= 2]
    if not metrics:
        return ''
    charts = []
    for key, label, unit in metrics:
        vals = [sc(x, key) for x in pts if sc(x, key) is not None]
        lo, hi = min(vals), max(vals)
        pad = max(1, (hi - lo) * 0.25)
        lo, hi = lo - pad, hi + pad
        bars = []
        for x in pts:
            v = sc(x, key)
            cur = ' is-current' if x['id'] == it['id'] else ''
            tier = sc(x, 'tier') if key in ('raw', 'ratio') else None
            tier_cls = f' bar--t{tier}' if tier else ''
            h = 0 if v is None else round(12 + (v - lo) / (hi - lo) * 78)
            val = esc(v) if v is not None else '발표 전'
            bars.append(f'<a class="bar{cur}{tier_cls}" href="exam-{x["id"]}.html" style="--h:{h}%" '
                        f'aria-label="{html_escape(_short_round(x), quote=True)} {label} {val}">'
                        f'<span class="bar__v">{val}</span><span class="bar__fill"></span>'
                        f'<span class="bar__l">{esc(_short_round(x))}</span></a>')
        charts.append(f'<div class="bars spoil-val" data-metric="{key}" aria-label="{label} ({unit})">{"".join(bars)}</div>')
    btns = ''.join(f'<button type="button" data-metric="{k}" aria-pressed="{str(i == 0).lower()}">{lbl}</button>'
                   for i, (k, lbl, _) in enumerate(metrics))
    rows = []
    for x in reversed(pts):
        cur = x['id'] == it['id']
        t = sc(x, 'tier')
        cells = ''.join(f'<td class="spoil-val{" cmp-opt" if k in ("top", "std") else ""}">{esc(sc(x, k)) if sc(x, k) is not None else "—"}{u if (sc(x, k) is not None and u == "%") else ""}</td>' for k, _, u in base)
        tier_span = f'<span class="tier tier--{t}">{TIER_LABELS[t]}</span>' if t else '—'
        tier_td = f'<td class="spoil-val">{tier_span}</td>'
        name = f'<a href="exam-{x["id"]}.html"><span class="type-badge tg-{x.get("typeGroup")}">{esc(exam_badge_label(x))}</span>' \
               f'<span>{esc(exam_year_label(x))}</span>{"<em>이 시험</em>" if cur else ""}</a>'
        tr_cls = ' class="is-current"' if cur else ''
        rows.append(f'<tr{tr_cls}><th scope="row">{name}</th>{cells}{tier_td}</tr>')
    subj = pretty_sub(it.get('subSubject')) or it.get('subject') or ''
    head = ''.join(f'<th scope="col"{" class=cmp-opt" if k in ("top", "std") else ""}>{lbl}</th>' for k, lbl, _ in base)
    # 이 시험의 등급컷 섹션이 없으면(발표 전 등) 스포일러 스위치를 여기에 둔다 — 끌 곳이 없어지지 않게
    toggle = note = ''
    if with_toggle:
        toggle = ('<button type="button" class="switch" role="switch" aria-checked="true" data-spoiler-toggle>'
                  '스포일러 방지<span class="switch__knob" aria-hidden="true"></span></button>')
        note = ('<p class="spoil-note"><span>지난 회차의 <b>등급컷 · 표준점수 · 난이도</b>를 흐리게 가려 뒀어요.</span>'
                '<button type="button" class="btn btn--sm btn--primary" data-spoiler-off>결과 보기</button></p>')
    return (
        f'<section class="exam-section compare" id="examCompare" data-metric="{metrics[0][0]}" aria-labelledby="cmpTitle">'
        f'<div class="exam-section__head"><h2 id="cmpTitle">최근 회차와 비교 · {esc(subj)}</h2>'
        f'<div class="view-toggle compare__metric" role="group" aria-label="비교 지표">{btns}</div>{toggle}</div>{note}'
        f'<div class="card-box compare__chart">{"".join(charts)}'
        '<p class="compare__legend">막대 색은 역대 대비 난이도 · 진한 막대가 이 시험 · 막대를 누르면 그 회차로 이동</p></div>'
        '<div class="card-box compare__table-wrap"><table class="compare__table">'
        f'<thead><tr><th scope="col">회차</th>{head}<th scope="col">난이도</th></tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table></div></section>')


def related_cards_html(it: dict, rel: list[dict]) -> str:
    """등급컷 비교가 없는 시험(논술·검정고시·절대평가 등) — 다른 회차 카드 목록."""
    esc = lambda v: html_escape(str(v), quote=False)
    subj = it.get('subject') or ''
    name = f'{subj} · {pretty_sub(it["subSubject"])}' if it.get('subSubject') and it.get('typeGroup') != 'essay' else subj
    cards = []
    for r in rel:
        r_name = (pretty_sub(r.get('subSubject')) if r.get('typeGroup') == 'essay' and r.get('subSubject')
                  else (f'{r.get("subject")} · {pretty_sub(r["subSubject"])}' if r.get('subSubject') else r.get('subject') or ''))
        cards.append(f'<a class="card-box rel-card" href="exam-{r["id"]}.html">'
                     f'<span class="rel-card__top"><span class="type-badge tg-{r.get("typeGroup")}">{esc(exam_badge_label(r))}</span>'
                     f'<span class="rel-card__year">{esc(exam_year_label(r))}</span></span>'
                     f'<span class="rel-card__name">{esc(r_name)}</span></a>')
    return (f'<section class="exam-section exam-related" aria-labelledby="relTitle"><div class="exam-section__head">'
            f'<h2 id="relTitle">다른 회차 {esc(name)}</h2></div><div class="rel-grid">{"".join(cards)}</div></section>')


def preview_image_path(url, root: Path):
    """시험지 1쪽 흐린 미리보기 경로 (없으면 None) — 파일 이름 = sha1(쿼리 뺀 URL) 앞 12자."""
    if not url or not str(url).startswith('https:'):
        return None
    h = hashlib.sha1(str(url).split('?')[0].encode()).hexdigest()[:12]
    rel = f'previews/{h}.jpg'
    return rel if (root / rel).exists() else None


def build_static_exam_pages(items: list[dict], template_path: Path, out_root: Path):
    """exam.html 템플릿을 시험별로 사전 렌더링해 검색엔진이 JS 없이도 인덱싱하게 한다.
    동시에 시험별 OG JPG (1200×630)도 생성 — 카톡·트위터·네이버 미리보기 카드."""
    template = template_path.read_text(encoding='utf-8')

    # [SEO] SSG 페이지에선 숨김 에러블록 제거 — JS 없는 크롤러에 본문(soft-404 신호)으로
    # 읽히는 것을 막는다. 유효 id 만 SSG 로 생성돼 showError()(exam.js)는 호출되지 않아 안전.
    template = re.sub(r'<!-- 에러/없음.*?-->\s*<div id="examError".*?</div>',
                      '', template, count=1, flags=re.S)

    # 옛 SSG 파일 정리 — exam-{숫자}.html 만 (exam-set.html 등은 보호)
    _ssg_re = re.compile(r'^exam-\d+\.html$')
    for old in out_root.iterdir():
        if old.is_file() and _ssg_re.match(old.name):
            old.unlink()

    # OG 디렉토리 준비 (옛 og/exam-*.jpg 정리)
    _OG_DIR.mkdir(parents=True, exist_ok=True)
    for old in _OG_DIR.glob('exam-*.jpg'):
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
      'ogi':    r'(<meta property="og:image" content=")[^"]*(")',
      'twt':    r'(<meta name="twitter:title" content=")[^"]*(")',
      'twd':    r'(<meta name="twitter:description" content=")[^"]*(")',
      'twi':    r'(<meta name="twitter:image" content=")[^"]*(")',
      'twa':    r'(<meta name="twitter:image:alt" content=")[^"]*(")',
      'robots': r'(<meta name="robots" content=")[^"]*(")',
      'pub':    r'(<meta property="article:published_time" content=")[^"]*(")',
      'mod':    r'(<meta property="article:modified_time" content=")[^"]*(")',
    }

    # 관련 기출 내부링크 인덱스 — 얇은·고립 페이지 SEO 보강(크롤링됨-색인안됨 완화).
    # 시리즈(같은 과목·트랙·종류, 연도만 다름) + 같은 회차(같은 시험, 영역/계열만 다름).
    from collections import defaultdict as _dd
    _by_series: dict = _dd(list)
    _by_set: dict = _dd(list)
    def _set_grade(d):
        # 학년은 학평에서만 의미 — 수능·모평 일부 레코드(직탐·제2외)에 붙은 studentGrade 는 무시
        return d.get('studentGrade') if d.get('typeGroup') == 'education' else None

    def _series_key(d):
        # 검정고시: 학력(curriculum)이 다르면 별개 시험 → 학력 포함, 회차(type)는
        # 무시해 같은 학력 전 회차(1·2회)·전 연도를 한 시리즈로 묶음.
        if d.get('typeGroup') == 'ged':
            return ('ged', d.get('curriculum'), d.get('subject'))
        return (d.get('subject'), d.get('subSubject'), d.get('type'), _set_grade(d))
    for _it in items:
        _by_series[_series_key(_it)].append(_it)
        _by_set[(_it.get('curriculum'), _it.get('gradeYear'), _it.get('type'), _set_grade(_it))].append(_it)
    for _k in _by_series:
        _by_series[_k].sort(key=lambda x: x.get('gradeYear') or 0, reverse=True)

    # 등급컷·난이도 — compute_exam_scores() 가 매칭(검색 cuts.json 과 동일 값).
    _scores = compute_exam_scores(items)
    # 1컷 추이 그래프용 묶음 (난이도 비교 묶음과 동일 키, 시행 순)
    _trend: dict = _dd(list)
    for _it in items:
        _k = tier_series_key(_it)
        _sc = _scores.get(_it['id'])
        if _k and _sc and ((_sc['raw'] is not None and not _sc['abs']) or _sc.get('ratio') is not None):
            _trend[_k].append(_it)
    for _k in _trend:
        _trend[_k].sort(key=_exam_sort_key)

    TODAY_ISO = datetime.date.today().isoformat()
    written = 0
    for it in items:
        meta = build_exam_meta(it)
        canonical = meta['canonical']
        head      = meta['head']
        answer_label = answer_label_for(it)

        # reference(KICE 통계자료) → 기출이 아닌 DigitalDocument 로 분류
        is_reference = it.get('typeGroup') == 'reference'
        if is_reference:
            jsonld = {
              '@context': 'https://schema.org',
              '@type': 'DigitalDocument',
              '@id':  canonical,
              'url':  canonical,
              'name': head,
              'description': meta['description'],
              'inLanguage': 'ko-KR',
              'encodingFormat': 'application/pdf',
              'dateModified': TODAY_ISO,
              'publisher': {'@type': 'Organization', 'name': '한국교육과정평가원 (KICE)'},
              'isPartOf': {'@id': 'https://kicegg.com/#website'},
              'keywords': meta['keywords'],
            }
            if it.get('questionUrl'):
                jsonld['contentUrl'] = it['questionUrl']
        else:
            jsonld = {
              '@context': 'https://schema.org',
              '@type': 'LearningResource',
              '@id':  canonical,
              'url':  canonical,
              'name': head,
              'description': meta['description'],
              'inLanguage': 'ko-KR',
              'learningResourceType': '기출문제',
              'dateModified': TODAY_ISO,
              'educationalLevel': (
                  '대학원' if it.get('typeGroup') in ('leet', 'meet')
                  else {'초졸': '초등학교', '중졸': '중학교'}.get(it.get('curriculum'), '고등학교')
                  if it.get('typeGroup') == 'ged'
                  else '고등학교'),   # 수능·학평·논술·사관·경찰=고등학교, 검정고시=학력별, LEET/MEET=대학원
              'isPartOf': {'@id': 'https://kicegg.com/#website'},
              'keywords': meta['keywords'],
              'publisher': {'@type': 'Organization', 'name': '기출해체분석기', 'url': 'https://kicegg.com'},
            }
            def _doc_mime(url, name=None):
                # 잔존 HWP(사관 2018 수학, daumcdn 원본 등)는 application/x-hwp 로 정확히 표기
                u = (url or '').split('?')[0].lower()
                n = (name or '').lower()
                return 'application/x-hwp' if (u.endswith('.hwp') or n.endswith('.hwp')) else 'application/pdf'
            parts = []
            if it.get('questionUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': '문제·해설' if it.get('questionUrl') == it.get('solutionUrl') else '문제지',
                              'url': it['questionUrl'], 'encodingFormat': _doc_mime(it['questionUrl'], it.get('questionDownload'))})
            if it.get('questionUrlEven'):
                parts.append({'@type': 'DigitalDocument', 'name': '문제지(짝수형)',
                              'url': it['questionUrlEven'], 'encodingFormat': _doc_mime(it['questionUrlEven'], it.get('questionDownloadEven'))})
            if it.get('answerUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': answer_label,
                              'url': it['answerUrl'], 'encodingFormat': _doc_mime(it['answerUrl'], it.get('answerDownload'))})
            if it.get('answerUrlEven'):
                parts.append({'@type': 'DigitalDocument', 'name': '정답(짝수형)',
                              'url': it['answerUrlEven'], 'encodingFormat': _doc_mime(it['answerUrlEven'], it.get('answerDownloadEven'))})
            if it.get('solutionUrl') and it.get('solutionUrl') != it.get('questionUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': '해설지',
                              'url': it['solutionUrl'], 'encodingFormat': _doc_mime(it['solutionUrl'], it.get('solutionDownload'))})
            if it.get('listenUrl'):
                parts.append({'@type': 'AudioObject', 'name': '영어 듣기 MP3',
                              'contentUrl': it['listenUrl'], 'encodingFormat': 'audio/mpeg'})
            if it.get('scriptUrl'):
                parts.append({'@type': 'DigitalDocument', 'name': '듣기 대본',
                              'url': it['scriptUrl'], 'encodingFormat': 'application/pdf'})
            if parts:
                jsonld['hasPart'] = parts

        # BreadcrumbList — SERP rich snippet (홈 › 기출 검색 › 시험명)
        breadcrumb = {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': '홈',
             'item': 'https://kicegg.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': '기출 검색',
             'item': 'https://kicegg.com/archive.html'},
            {'@type': 'ListItem', 'position': 3, 'name': head,
             'item': canonical},
          ],
        }
        ld_block = (
          '<script type="application/ld+json">'
          + json.dumps(jsonld, ensure_ascii=False, separators=(',', ':'))
          + '</script>\n  '
          '<script type="application/ld+json">'
          + json.dumps(breadcrumb, ensure_ascii=False, separators=(',', ':'))
          + '</script>\n'
        )

        # 시험별 OG 이미지 생성 — 1200×630 JPG
        og_path = _OG_DIR / f'exam-{it["id"]}.jpg'
        try:
            generate_og_image(it, head, og_path)
            og_url = f'https://kicegg.com/og/exam-{it["id"]}.jpg'
        except Exception as e:
            # 폰트 또는 PIL 없으면 default OG로 fallback
            print(f'[warn] og fail id={it["id"]}: {e}', file=sys.stderr)
            og_url = 'https://kicegg.com/og-image.png'

        html = template
        html = _set_attr(html, pat['title'], meta['title'])
        html = _set_attr(html, pat['desc'],  meta['description'])
        html = _set_attr(html, pat['canon'], canonical)
        html = _set_attr(html, pat['ogt'],   meta['title'])
        html = _set_attr(html, pat['ogd'],   meta['description'])
        html = _set_attr(html, pat['ogu'],   canonical)
        html = _set_attr(html, pat['ogi'],   og_url)
        html = _set_attr(html, pat['twt'],   meta['title'])
        html = _set_attr(html, pat['twd'],   meta['description'])
        html = _set_attr(html, pat['twi'],   og_url)
        html = _set_attr(html, pat['twa'],   head + ' — 기출해체분석기')
        html = _set_attr(html, pat['robots'], 'index,follow')   # 템플릿의 noindex 덮어씀
        pub_date = meta['datePublished']
        html = _set_attr(html, pat['pub'], pub_date)
        html = _set_attr(html, pat['mod'], TODAY_ISO)  # SSG 생성일 = 최종 수정일
        # 템플릿(동적 fallback)에서 복사된 '인덱싱 제외' 주석은 SSG 페이지에선 반대 의미 — 교체
        html = html.replace(
            '<!-- 동적 fallback (?id=N). SSG exam-{id}.html 가 검색 노출 대상 — 이 페이지는 인덱싱 제외. -->',
            '<!-- SSG 사전렌더링 페이지 — 인덱싱 대상 (exam.html 템플릿에서 생성). -->')

        # H1·칩·부제 — JS 로딩 전에도 검색엔진·사용자 모두 같은 내용을 보게 SSG 로 채운다.
        html = re.sub(
            r'(<h1 class="exam__title" id="examTitle">)[^<]*(</h1>)',
            lambda m: m.group(1) + html_escape(head, quote=True) + m.group(2),
            html, count=1)
        sc = _scores.get(it['id'])
        tier = sc['tier'] if sc else None
        chips = (f'<span class="type-badge type-badge--lg tg-{it.get("typeGroup")}">{html_escape(exam_badge_label(it), quote=False)}</span>'
                 f'<span class="chiplet chiplet--ink">{html_escape(exam_year_label(it), quote=False)}</span>')
        if tier:
            chips += f'<span class="tier tier--{tier} spoil-hide">{TIER_LABELS[tier]}</span>'
        html = html.replace('<div class="exam__chips" id="examChips"></div>',
                            f'<div class="exam__chips" id="examChips">{chips}</div>', 1)
        html = html.replace('<p class="exam__sub" id="examSub"></p>',
                            f'<p class="exam__sub" id="examSub">{html_escape(exam_sub_label(it), quote=False)}</p>', 1)

        # 시험 정보 카드 + 소개 문장(검색엔진용 고유 설명 — 키워드 나열 없이 사실만)
        facts = ''.join(f'<dt>{k}</dt><dd>{v}</dd>' for k, v in exam_fact_rows(it))
        html = html.replace('<dl class="facts" id="examFacts"></dl>',
                            f'<dl class="facts" id="examFacts">{facts}</dl>\n          '
                            f'<p class="info-card__desc" id="examSeoIntro">{html_escape(meta["intro"], quote=False)}</p>'
                            + (exam_insight_html(it, _trend.get(tier_series_key(it), []) if tier_series_key(it) else [], _scores)), 1)

        # 흐린 표지 = 이 시험지 1쪽 (scripts/material-audit/extract.mjs 가 만든 previews/{h}.jpg 가 있을 때만)
        _pv = preview_image_path(it.get('questionUrl'), out_root)
        if _pv:
            html = html.replace('<div class="preview__viewer" id="previewQViewer">',
                                f'<div class="preview__viewer" id="previewQViewer" data-preview="{_pv}">', 1)

        # JSON-LD: </head> 직전 한 번만 삽입
        html = html.replace('</head>', '  ' + ld_block + '</head>', 1)

        # 다운로드 버튼 — SSG 단계에서 채워 JS 없이도 작동
        btns = []
        q_url   = it.get('questionUrl')
        qE_url  = it.get('questionUrlEven')
        a_url   = it.get('answerUrl')
        aE_url  = it.get('answerUrlEven')
        sol_url = it.get('solutionUrl')
        listen  = it.get('listenUrl')
        script  = it.get('scriptUrl')
        def _file_tag(url, name):
            u = (url or '').split('?')[0].lower()
            n = (name or '').lower()
            return 'HWP' if (u.endswith('.hwp') or n.endswith('.hwp')) else 'PDF'
        q_tag = _file_tag(q_url, it.get('questionDownload'))
        a_tag = _file_tag(a_url, it.get('answerDownload'))
        combined_document = bool(q_url and q_url == sol_url)
        q_label = f'문제·해설 {q_tag}' if combined_document else (f'문제지 {q_tag} (홀수형)' if qE_url else f'문제지 {q_tag}')
        a_label = f'{answer_label} {a_tag} (홀수형)' if aE_url else f'{answer_label} {a_tag}'
        def _btn(cls, url, label, dl_name):
            if not url or not re.match(r'^https?://', str(url), flags=re.I): return ''
            dl_attr = f' download="{html_escape(dl_name, quote=True)}"' if dl_name else ' download'
            # 'PDF' 표기는 폰에서 숨겨 버튼을 두 줄 안에 모은다 (HWP 는 형식이 달라 항상 표시)
            label_html = html_escape(label, quote=False).replace(' PDF', ' <span class="btn__tag">PDF</span>')
            return f'<a class="btn {cls}" href="{html_escape(url, quote=True)}"{dl_attr}>{label_html}</a>'
        # 영어 듣기는 최상단 — 모바일에서 자료 접근 우선
        if it.get('subject') == '영어' and listen:
            btns.append(_btn('btn--primary', listen, '듣기 MP3', it.get('listenDownload')))
            if script: btns.append(_btn('', script, '듣기 대본 PDF', it.get('scriptDownload')))
            btns.append(_btn('', q_url, q_label, it.get('questionDownload')))
            if qE_url: btns.append(_btn('', qE_url, '문제지 PDF (짝수형)', it.get('questionDownloadEven')))
            btns.append(_btn('', a_url, a_label, it.get('answerDownload')))
            if aE_url: btns.append(_btn('', aE_url, '정답 PDF (짝수형)', it.get('answerDownloadEven')))
            if sol_url and not combined_document: btns.append(_btn('', sol_url, '해설지 PDF', it.get('solutionDownload')))
        else:
            btns.append(_btn('btn--primary', q_url, q_label, it.get('questionDownload')))
            if qE_url: btns.append(_btn('', qE_url, '문제지 PDF (짝수형)', it.get('questionDownloadEven')))
            btns.append(_btn('', a_url, a_label, it.get('answerDownload')))
            if aE_url: btns.append(_btn('', aE_url, '정답 PDF (짝수형)', it.get('answerDownloadEven')))
            if sol_url and not combined_document: btns.append(_btn('', sol_url, '해설지 PDF', it.get('solutionDownload')))
            if listen: btns.append(_btn('', listen, '듣기 MP3', it.get('listenDownload')))
            if script: btns.append(_btn('', script, '듣기 대본 PDF', it.get('scriptDownload')))
        # 공유 버튼 자리까지 SSG 에서 확정 (JS 가 뒤늦게 넣으면 레이아웃이 밀림)
        btns.append(
            '<button type="button" class="btn" id="examShareBtn" aria-label="공유하기">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
            'stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>'
            '<span class="btn__label">공유</span></button>')
        btns_html = ''.join(b for b in btns if b)
        html = re.sub(
            r'(<div class="exam__actions" id="examActions">)\s*(</div>)',
            lambda m: m.group(1) + btns_html + m.group(2),
            html, count=1)

        # 이동 경로: 기출검색 › 회차 전체 › 과목/대학 허브 (JS 없이 크롤러가 링크 그래프를 따라가게)
        sep = '<span class="exam__crumb-sep" aria-hidden="true">›</span>'
        if it.get('curriculum') and it.get('gradeYear') and it.get('type'):
            _sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
            _set_fname = set_friendly_filename(str(it['curriculum']), str(it['gradeYear']), it['type'], _sg)
            html = html.replace(
                '<a href="#" id="examSetSideLink" hidden><span>이 회차 전체</span></a>',
                f'{sep}<a href="{_set_fname}" id="examSetSideLink"><span>{html_escape(exam_set_title(it), quote=False)}</span></a>', 1)
        _hub, _hub_label = '', ''
        if it.get('typeGroup') == 'essay':
            _hub, _hub_label = essay_hub_filename(it.get('subject')), f'{it.get("subject")} 논술 전체'
        elif it.get('typeGroup') in ('suneung', 'education'):
            _hub, _hub_label = subject_hub_filename(it), f'{it.get("subject")} 전체 기출'
        if _hub:
            html = html.replace('</nav>\n\n    <div class="exam__top"',
                                f'{sep}<a href="{_hub}"><span>{html_escape(_hub_label, quote=False)}</span></a>\n    </nav>\n\n    <div class="exam__top"', 1)

        # 같은 회차 다른 과목 탭 (내부 링크 + 과목 이동)
        _sibs = sorted(_by_set[(it.get('curriculum'), it.get('gradeYear'), it.get('type'), _set_grade(it))],
                       key=_subject_sort_key)
        if it.get('typeGroup') == 'essay':
            _sibs = [x for x in _sibs if x.get('subject') == it.get('subject')]
        if len(_sibs) > 1:
            # 두 단 — 윗줄 영역(국어·수학…, 선택과목 수 표시), 아랫줄 현재 영역의 선택과목.
            # 한 줄에 과목이 몰려 옆으로 한참 밀어야 하던 문제를 줄인다. 논술은 계열 한 줄.
            def _tab(x, label, count=0, current=False):
                cur = ' aria-current="page"' if current else ''
                cnt = f' <small>{count}</small>' if count > 1 else ''
                return f'<a href="exam-{x["id"]}.html"{cur}>{html_escape(label, quote=False)}{cnt}</a>'
            if it.get('typeGroup') == 'essay':
                rows = [''.join(_tab(x, _subject_tab_label(x)[0], current=x['id'] == it['id']) for x in _sibs)]
            else:
                areas: dict = {}
                for x in _sibs:
                    areas.setdefault(x.get('subject') or '', []).append(x)
                cur_area = it.get('subject') or ''
                top = ''.join(
                    _tab(xs[0] if area != cur_area else it, area, len(xs), area == cur_area)
                    for area, xs in areas.items())
                rows = [top]
                if len(areas.get(cur_area, [])) > 1:
                    rows.append(''.join(_tab(x, pretty_sub(x.get('subSubject')) or x.get('subject') or '',
                                             current=x['id'] == it['id']) for x in areas[cur_area]))
            inner = ''.join(f'<div class="exam__subjects-row{" exam__subjects-row--subs" if i else ""} hscroll">{r}</div>'
                            for i, r in enumerate(rows))
            html = html.replace('<nav class="exam__subjects hscroll" id="examSubjects" aria-label="같은 회차 다른 과목"></nav>',
                                f'<nav class="exam__subjects" id="examSubjects" aria-label="같은 회차 다른 과목">{inner}</nav>', 1)

        # 본문(시험 총평 등) — data/exam-notes/{id}.html 이 있으면 주입. 없으면 섹션 숨김 유지.
        _note = ROOT / 'data' / 'exam-notes' / f'{it["id"]}.html'
        if _note.exists():
            html = html.replace('<section class="card-box exam__body" id="examBody" hidden></section>',
                                '<section class="card-box exam__body" id="examBody">'
                                + _note.read_text(encoding='utf-8').strip() + '</section>', 1)

        # 등급컷·난이도 — 매칭 컷이 있을 때만 섹션 공개 (검정고시 등은 숨김 유지)
        _cut = sc['cut'] if sc else None
        if (_cut is not None and isinstance(_cut.get('rawCuts'), list)
                and any(v is not None for v in _cut['rawCuts'])):
            html = html.replace('<body class="page-exam">', '<body class="page-exam has-gradecut">', 1)
            html = html.replace('<section class="exam-section" id="gradeDist" aria-labelledby="gradeDistTitle" hidden>',
                                '<section class="exam-section' + (' exam-section--open' if sc['abs'] and sc.get('ratio') is None else '')
                                + '" id="gradeDist" aria-labelledby="gradeDistTitle">', 1)
            if sc['abs']:
                _t = '등급 기준 · 1등급 비율' if sc.get('ratio') is not None else '등급 기준 · 절대평가'
                html = html.replace('<h2 id="gradeDistTitle">등급컷 · 난이도</h2>', f'<h2 id="gradeDistTitle">{_t}</h2>', 1)
            html = html.replace('<div id="gradeDistStats"></div>',
                                '<div id="gradeDistStats">' + score_stats_html(sc) + '</div>', 1)
            html = html.replace('<div class="exam-card__body" id="gradeDistBody"></div>',
                                '<div class="exam-card__body" id="gradeDistBody">'
                                + grade_table_html(_cut, sc['abs'], sc.get('ratios')) + '</div>', 1)

        # 최근 회차와 비교(그래프·비교표) — 등급컷 있는 지난 회차가 2개 이상일 때. 없으면 다른 회차 카드.
        _k = tier_series_key(it)
        _series = _trend.get(_k, []) if _k else []
        _cmp = ''
        if (not (sc and sc['abs']) or (sc and sc.get('ratio') is not None)) and sum(1 for x in _series if x['id'] != it['id']) >= 2:
            _cmp = compare_html(it, _series, _scores, with_toggle='class="page-exam has-gradecut"' not in html)
        if _cmp:
            html = html.replace('<!-- exam-related -->', _cmp, 1)
        else:
            _rel = [r for r in _by_series[_series_key(it)] if r['id'] != it['id']][:8]
            if _rel:
                html = html.replace('<!-- exam-related -->', related_cards_html(it, _rel), 1)

        (out_root / f'exam-{it["id"]}.html').write_text(html, encoding='utf-8')
        written += 1
    print(f'  + exam-{{id}}.html SSG {written:,}건 (Naver/Bing 인덱싱)')

    # 삭제된 중복 항목의 옛 주소 → 같은 내용의 남은 항목으로 이동 안내 (data/exam-redirects.json)
    red_path = out_root / 'data' / 'exam-redirects.json'
    if red_path.exists():
        live = {it['id'] for it in items}
        n_red = 0
        for old_id, new_id in json.loads(red_path.read_text(encoding='utf-8'))['redirects'].items():
            if int(old_id) in live or new_id not in live:
                continue
            (out_root / f'exam-{old_id}.html').write_text(
                '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8" />\n'
                '  <meta name="robots" content="noindex,follow" />\n'
                f'  <link rel="canonical" href="https://kicegg.com/exam-{new_id}.html" />\n'
                f'  <meta http-equiv="refresh" content="0;url=exam-{new_id}.html" />\n'
                '  <title>같은 시험으로 이동 — 기출해체분석기</title>\n</head>\n<body>\n'
                f'  <p>같은 자료가 다른 페이지로 합쳐졌습니다. <a href="exam-{new_id}.html">이동하기</a></p>\n</body>\n</html>\n',
                encoding='utf-8')
            n_red += 1
        print(f'  + 이동 안내 페이지 {n_red}건 (삭제된 중복 항목)')


def build_set_meta(curr: str, year: str, t: str, sg: int | None, exams_in_set: list[dict]) -> dict:
    """회차 페이지 메타. 학생 검색 키워드("5모", "27수능", "고3 5월 학평") 강화."""
    gy   = int(year) if year != 'preliminary' else 0
    gy2  = str(gy)[-2:] if gy else ''

    if sg is not None:
        month_map = {
            'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jun_edu': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'sep_edu': 9,
            'oct': 10, 'nov': 11, 'nov_edu': 11, 'dec': 12,
        }
        if t not in month_map:
            raise ValueError(f'알 수 없는 교육청 시험 유형: {t}')
        month = month_map[t]
        cy = gy - 1
        head = f'{cy}년 {month}월 고{sg} 학력평가'
        short = f'{month}모'
        full = f'{cy}년 {month}월 고{sg} 학력평가(={gy}학년도 {month}월 학평)'
        aliases = [
            f'{gy2}학년도 {month}모', f'{gy}학년도 {month}모', f'{cy}년 {month}모',
            f'고{sg} {month}모', f'{cy}년 고{sg} {month}월 학평',
            f'{cy}년 {month}월 고{sg} 모의고사', f'{gy2}학년도 {month}월 학평',
        ]
    elif curr in ('2015', '2009', '예비', '2007개정', '7차', '6차', 'pre2009'):
        if t == 'csat':
            head = f'{gy}학년도 대학수학능력시험'
            short = '수능'
            full = f'{gy}학년도 수능(대학수학능력시험)'
            aliases = [f'{gy2}수능', f'{gy} 수능', f'{gy}학년도 수능', f'{gy2}학년도 수능']
        elif t in ('jun', 'june'):
            head = f'{gy}학년도 6월 모의평가'
            short = '6모'
            full = f'{gy}학년도 6월 모의평가(6모)'
            aliases = [f'{gy2}학년도 6모', f'{gy}학년도 6모', f'{gy2} 6모', f'{gy}학년도 6월 모평']
        elif t in ('sep', 'sept'):
            head = f'{gy}학년도 9월 모의평가'
            short = '9모'
            full = f'{gy}학년도 9월 모의평가(9모)'
            aliases = [f'{gy2}학년도 9모', f'{gy}학년도 9모', f'{gy2} 9모', f'{gy}학년도 9월 모평']
        elif t == 'prelim':
            head = f'{gy}학년도 예비시험'
            short = '예비'
            full = f'{gy}학년도 예비시험(예비)'
            aliases = [f'{gy2}학년도 예비', f'{gy} 예비시험', f'{gy2} 예비']
        else:
            head = f'{gy}학년도'
            short = ''
            full = head
            aliases = []
    elif curr == '사관':
        head = f'{gy}학년도 사관학교 1차 시험'
        short = '사관'
        full = f'{gy}학년도 육·해·공군 사관학교 1차'
        aliases = [f'{gy2}학년도 사관', f'{gy} 사관학교']
    elif curr == '경찰대':
        head = f'{gy}학년도 경찰대학 1차 시험'
        short = '경찰대'
        full = f'{gy}학년도 경찰대학 1차 시험'
        aliases = [f'{gy2}학년도 경찰대', f'{gy} 경찰대 1차']
    elif curr == 'LEET':
        is_prelim = t == 'prelim'
        head = f'{gy}학년도 LEET' + (' 예비시험' if is_prelim else '')
        short = 'LEET 예비' if is_prelim else 'LEET'
        full = f'{gy}학년도 법학적성시험(LEET)' + (' 예비시험' if is_prelim else '')
        aliases = [f'{gy2}학년도 리트', f'{gy} LEET', f'{gy} 리트']
        if is_prelim:
            aliases.extend([f'{gy} LEET 예비', f'{gy} 리트 예비시험'])
    elif curr == 'MEET':
        is_prelim = t == 'prelim'
        head = f'{gy}학년도 MEET' + (' 예비시험' if is_prelim else '')
        short = 'MEET 예비' if is_prelim else 'MEET'
        full = f'{gy}학년도 MEET(의·치학교육입문검사)' + (' 예비시험' if is_prelim else '')
        aliases = [f'{gy2}학년도 미트', f'{gy} MEET', f'{gy} 미트']
        if is_prelim:
            aliases.extend([f'{gy} MEET 예비', f'{gy} 미트 예비시험'])
    elif curr == '논술':
        lbl = '모의논술' if t == 'essay_mock' else '논술'
        head = f'{gy}학년도 대학별 {lbl}'
        short = lbl
        full = f'{gy}학년도 대학별 수시 {lbl}고사 (고려대·연세대·서강대·성균관대·중앙대 등)'
        aliases = [f'{gy2} {lbl}', f'{gy}학년도 {lbl} 기출', f'{gy} 대학 논술']
    elif curr == 'reference':
        head = 'KICE 공식 수능 통계'
        short = '수능 통계'
        full = '한국교육과정평가원(KICE) 공식 수능 통계'
        aliases = ['수능 응시현황', '수능 접수현황', '수능 채점현황']
    elif curr in ('초졸', '중졸', '고졸'):
        sess = '2' if t == 'ged_2' else '1'
        head = f'{gy}년 제{sess}회 {curr} 검정고시'
        short = '검정고시'
        full = f'{gy}년 제{sess}회 {curr} 검정고시'
        aliases = [f'{gy} {curr} 검정고시', f'{curr} 검정고시 기출',
                   f'검정고시 기출', f'{gy} 검정고시 제{sess}회']
    else:
        head = f'{gy}학년도'
        short = ''
        full = head
        aliases = []

    # 영어+듣기 보유 여부 — 회차 안에서 한 과목이라도 영어 듣기 자료 있으면 듣기 키워드 노출
    has_english_listen = any(
        e.get('subject') == '영어' and e.get('listenUrl') for e in exams_in_set)
    subjects = sorted({e['subject'] for e in exams_in_set if e.get('subject')})
    subj_phrase = '·'.join(subjects[:6])
    is_ged = curr in ('초졸', '중졸', '고졸')
    is_reference = curr == 'reference'

    if is_reference:
        title = f'{head} PDF — 기출해체분석기'
        desc = f'{full} 응시·접수·채점 현황 PDF를 한 페이지에서 확인하고 무료로 내려받으세요.'
    elif is_ged:
        title = f'{head} 과목별 문제·정답 — 기출해체분석기'
        desc = (f'{full} {subj_phrase} 기출 문제지와 정답(확정안)을 한 페이지에서 '
                f'확인하고 무료로 내려받으세요.')
    elif has_english_listen:
        title = f'{head} {short} 영역별 문제·정답·영어 듣기·해설지 — 기출해체분석기'
        desc = (f'{full} {subj_phrase} 기출 문제지·정답·해설지·등급컷. '
                f'영어 듣기 MP3와 듣기 대본 PDF도 함께 받을 수 있습니다.')
    else:
        title = f'{head} 영역별 문제·정답·해설지 — 기출해체분석기'
        desc = (f'{full} {subj_phrase} 기출 문제지·정답·해설지와 등급컷을 '
                f'영역별로 한 페이지에서 확인하고 무료로 내려받으세요.')

    if is_reference:
        intro_parts = [f'{full} 자료입니다.',
                       '연도별 응시 인원·접수 현황·과목별 채점 결과 PDF를 확인할 수 있습니다.']
    elif is_ged:
        intro_parts = [f'{full} 기출 자료입니다.',
                       f'{subj_phrase} 과목별 문제지와 정답(확정안)을 확인할 수 있습니다.']
    else:
        intro_parts = [f'{full} 기출 자료입니다.',
                       f'국어·수학·영어·한국사·탐구 문제지와 정답, 해설지를 확인할 수 있습니다.']
    if has_english_listen:
        intro_parts.append('영어 영역은 듣기 MP3와 듣기 대본 PDF도 함께 제공합니다.')
    intro = ' '.join(intro_parts)

    keywords = list(dict.fromkeys(aliases + [head, full, short] + subjects + COMMON_ASSET_KEYWORDS
                                  + (ENGLISH_ASSET_KEYWORDS if has_english_listen else [])))
    return {
        'title': title, 'description': desc, 'head': head, 'intro': intro,
        'keywords': keywords, 'has_english_listen': has_english_listen,
        'short': short,
    }


def set_friendly_filename(curr: str, year: str, t: str, sg: int | None) -> str:
    """회차 친화 URL 파일명. 예: exam-set-edu-2027-mar-g3.html / exam-set-kice-2027-csat.html"""
    curr_slug = {
        '2015':'kice','2009':'kice','예비':'kice',
        # 7차 이전 분리 키는 모두 기존 pre2009 슬러그로 통일 — SEO·이력 호환
        '2007개정':'pre2009','7차':'pre2009','6차':'pre2009','pre2009':'pre2009',
        '사관':'mil','경찰대':'police','LEET':'leet','MEET':'meet','논술':'essay',
        '초졸':'gedelem','중졸':'gedmid','고졸':'gedhigh',
    }.get(curr, curr.lower())
    grade_part = f'-g{sg}' if sg else ''
    return f'exam-set-{curr_slug}-{year}-{t}{grade_part}.html'


def build_static_set_pages(items: list[dict], template_path: Path, out_root: Path):
    """회차별 정적 SSG. 친화 URL(exam-set-{curr}-{year}-{type}-g{grade}.html) 로 검색 노출 강화."""
    template = template_path.read_text(encoding='utf-8')

    # 옛 친화 회차 SSG 정리
    _set_re = re.compile(r'^exam-set-[a-z0-9_\-]+-(g[123])?\.html$|^exam-set-[a-z0-9_]+-\d+-[a-z_]+(-g[123])?\.html$')
    for old in out_root.iterdir():
        if old.is_file() and old.name.startswith('exam-set-') and old.name != 'exam-set.html':
            old.unlink()

    # 회차별 시험 그룹화
    groups: dict[tuple, list[dict]] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        key = (it['curriculum'], str(it['gradeYear']), it['type'], sg)
        groups.setdefault(key, []).append(it)

    pat = {
      'title':  r'(<title>)[^<]*(</title>)',
      'desc':   r'(<meta name="description" content=")[^"]*(")',
      'canon':  r'(<link rel="canonical" href=")[^"]*(")',
      'ogt':    r'(<meta property="og:title" content=")[^"]*(")',
      'ogd':    r'(<meta property="og:description" content=")[^"]*(")',
      'ogu':    r'(<meta property="og:url" content=")[^"]*(")',
      'twt':    r'(<meta name="twitter:title" content=")[^"]*(")',
      'twd':    r'(<meta name="twitter:description" content=")[^"]*(")',
      'robots': r'(<meta name="robots" content=")[^"]*(")',  # 템플릿의 noindex 를 index 로 덮어씀
    }
    def _set_attr(html, p, v):
        return re.sub(p, lambda m: m.group(1) + html_escape(v, quote=True) + m.group(2), html, count=1)

    # 파일명 기준 병합 — '7차'/'2007개정'처럼 다른 curriculum 이 같은 slug 로
    # 합쳐지는 경우(pre2009-2011-june/sept 등) 마지막 그룹이 파일을 덮어써
    # 다른 그룹의 시험이 정적 카드에서 빠지던 문제 방지. 한 페이지에 모두 담는다.
    by_fname: dict[str, list] = {}
    for key, exams_in_set in groups.items():
        fname = set_friendly_filename(key[0], key[1], key[2], key[3])
        by_fname.setdefault(fname, []).append((key, exams_in_set))

    written = 0
    for fname, group_list in by_fname.items():
        # 대표 그룹(시험 수 최다)으로 meta/H1/data-attr 구성, 카드는 전체 병합
        (curr, year, t, sg), exams_in_set = max(group_list, key=lambda g: len(g[1]))
        merged_exams = [e for _, es in group_list for e in es]
        meta = build_set_meta(curr, year, t, sg, exams_in_set)
        canonical = f'https://kicegg.com/{fname}'

        jsonld = {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonical,
            'url': canonical,
            'name': meta['head'],
            'description': meta['description'],
            'inLanguage': 'ko-KR',
            'keywords': meta['keywords'],
            'isPartOf': {'@id': 'https://kicegg.com/#website'},
        }
        breadcrumb = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type':'ListItem','position':1,'name':'홈','item':'https://kicegg.com/'},
                {'@type':'ListItem','position':2,'name':'기출 검색','item':'https://kicegg.com/archive.html'},
                {'@type':'ListItem','position':3,'name':meta['head'],'item':canonical},
            ],
        }
        ld_block = (
            '<script type="application/ld+json">'
            + json.dumps(jsonld, ensure_ascii=False, separators=(',', ':'))
            + '</script>\n  '
            '<script type="application/ld+json">'
            + json.dumps(breadcrumb, ensure_ascii=False, separators=(',', ':'))
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
        html = _set_attr(html, pat['robots'], 'index,follow')   # 친화 URL은 인덱싱 대상

        # body data-* — exam-set.js 가 친화 URL에서도 동작하게
        body_data = (
            f' data-curriculum="{html_escape(curr, quote=True)}"'
            f' data-year="{html_escape(year, quote=True)}"'
            f' data-type="{html_escape(t, quote=True)}"'
        )
        if sg:
            body_data += f' data-grade="{sg}"'
        html = re.sub(r'(<body class="page-examset")', r'\1' + body_data, html, count=1)
        # body 클래스 다른 경우(템플릿 변경 가능성) fallback — body 첫 태그
        if 'data-curriculum' not in html:
            html = re.sub(r'(<body[^>]*?)(>)', r'\1' + body_data + r'\2', html, count=1)

        # H1 미리 채움
        html = re.sub(
            r'(<h1 class="examset__title" id="examsetTitle">)[^<]*(</h1>)',
            lambda m: m.group(1) + html_escape(meta['head'], quote=True) + m.group(2),
            html, count=1)

        # 회차 수·SEO 인트로를 정적으로 채워 JS 없이도 완성된 본문 유지.
        count_intro_html = (
            f'<p class="examset__count" id="examsetCount">총 {len(merged_exams):,}개 영역</p>\n      '
            '<p class="exam__seo-intro" id="examsetSeoIntro">'
            + html_escape(meta['intro'], quote=False)
            + '</p>'
        )
        html = re.sub(
            r'<p class="examset__count" id="examsetCount"></p>',
            lambda _m: count_intro_html, html, count=1)

        # JSON-LD 삽입
        html = html.replace('</head>', '  ' + ld_block + '</head>', 1)

        # 완전한 정적 카드 — 친화 URL 페이지는 JS fetch·재렌더 없이 즉시 사용한다.
        def _static_card(it2):
            title2 = pretty_sub(it2.get('subSubject')) or it2.get('subject') or ''
            subject2 = it2.get('subject') or ''
            has_files = any(it2.get(k) for k in ('questionUrl', 'answerUrl', 'solutionUrl'))

            def _action(label, url, dl_name, primary=False):
                if not url or not re.match(r'^https?://', str(url), flags=re.I):
                    return ''
                cls = 'btn btn--primary' if primary else 'btn'
                dl = f' download="{html_escape(dl_name, quote=True)}"' if dl_name else ' download'
                return (f'<a class="{cls}" href="{html_escape(url, quote=True)}"{dl}>'
                        f'{html_escape(label, quote=False)}</a>')

            actions = ''.join(filter(None, [
                _action('문제지', it2.get('questionUrl'), it2.get('questionDownload'), True),
                _action(answer_label_for(it2),
                        it2.get('answerUrl'), it2.get('answerDownload')),
                _action('해설', it2.get('solutionUrl'), it2.get('solutionDownload')),
            ]))
            card_cls = 'card has-files' if has_files else 'card'
            return (
                f'<article class="{card_cls}">'
                f'<a class="card__link" href="exam-{it2["id"]}.html"'
                f' aria-label="{html_escape(title2, quote=True)} 상세 보기"></a>'
                + (f'<p class="card__sub">{html_escape(subject2, quote=False)}</p>' if title2 != subject2 else '')
                + f'<h2 class="card__title">{html_escape(title2, quote=False)}</h2>'
                '<div class="card__divider"></div>'
                f'<div class="card__actions">{actions}</div>'
                '</article>'
            )
        _sorted = sorted(merged_exams, key=lambda x: (
            SUBJECT_ORDER.get(x.get('subject'), 99), x.get('subject') or '', sub_order_key(x.get('subSubject'))))
        cards_html = ''.join(_static_card(x) for x in _sorted)
        html = re.sub(
            r'(<section class="examset__grid grid" id="examsetGrid">)\s*(</section>)',
            lambda m: m.group(1) + cards_html + m.group(2),
            html, count=1)

        (out_root / fname).write_text(html, encoding='utf-8')
        written += 1
    print(f'  + {fname.split("-")[0]}-* 회차 SSG {written:,}건 (친화 URL, 정적 카드 링크 포함)')


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

    # ─ KICE 아카이브 (1999~2013 + 2022/2028 예시) merge — sqlite 외 보강 자료 ─
    kice_archive_path = ROOT / 'data' / 'kice-archive-new-items.json'
    if kice_archive_path.exists():
        kice_items = json.loads(kice_archive_path.read_text(encoding='utf-8'))
        # ID 충돌 회피: 임시 -1 후 재할당
        for ki in kice_items: ki['id'] = -1
        items.extend(kice_items)
        items.sort(key=lambda i: (
            -i['gradeYear'] if isinstance(i.get('gradeYear'), int) else -2099,
            -(i.get('month') or 0),
            SUBJECT_ORDER.get(i['subject'], 99),
            i.get('subject',''),
            i.get('subSubject') or '',
        ))
        items = [{**it, 'id': idx} for idx, it in enumerate(items, 1)]
        print(f'  + KICE 아카이브 merge: +{len(kice_items)} → 총 {len(items)}')

        # 같은 시험 이중 등재 방지 — DB 원본(studentGrade null)과 아카이브 인제스트
        # (studentGrade 3)가 매칭 실패로 쌍을 이루던 사고(426쌍, 2026-06 dedupe) 재발 차단.
        # 평가원류는 sg 를 무시하고 비교하되 학평(education)은 sg 가 학년 구분이므로 유지.
        seen: dict[tuple, dict] = {}
        deduped: list[dict] = []
        merge_fields = ('questionUrl','answerUrl','solutionUrl','scriptUrl','listenUrl',
                        'questionUrlEven','answerUrlEven','questionDownload','answerDownload',
                        'solutionDownload','scriptDownload','listenDownload',
                        'questionDownloadEven','answerDownloadEven','answerIncludesSolution',
                        'solutionSource','solutionSourcePage')
        for it in items:
            sg_norm = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
            k = (it.get('gradeYear'), it.get('type'), it.get('subject'), it.get('subSubject'),
                 it.get('examYear'), it.get('month'), it.get('typeGroup'), it.get('curriculum'), sg_norm)
            prev = seen.get(k)
            if prev is None:
                seen[k] = it
                deduped.append(it)
                continue
            # 원본(source 없음) 우선 — donor 파일 필드만 보강
            keeper, donor = (prev, it) if prev.get('source') is None else (it, prev)
            for f in merge_fields:
                if not keeper.get(f) and donor.get(f):
                    keeper[f] = donor[f]
            if keeper is not prev:
                deduped[deduped.index(prev)] = keeper
                seen[k] = keeper
        if len(deduped) != len(items):
            print(f'  - 중복 제거: {len(items) - len(deduped)}건 (원본 우선, 파일 필드 병합)')
            items = [{**it, 'id': idx} for idx, it in enumerate(deduped, 1)]

    # ─ 영역 보강 (사탐/과탐) area-fill items — 누락 item 의 url 채우거나 신규 추가 ─
    area_path = ROOT / 'data' / 'kice-area-fill-items.json'
    if area_path.exists():
        area_items = json.loads(area_path.read_text(encoding='utf-8'))
        # (gy, type, subject, subSubject) → 우리 item lookup
        idx = {}
        for it in items:
            k = (it.get('gradeYear'), it.get('type'), it.get('subject'), it.get('subSubject'))
            idx.setdefault(k, []).append(it)
        attached = added = 0
        next_id = max((it.get('id', 0) for it in items if isinstance(it.get('id'), int)), default=0) + 1
        for ai in area_items:
            k = (ai.get('gradeYear'), ai.get('type'), ai.get('subject'), ai.get('subSubject'))
            matches = idx.get(k, [])
            if matches:
                for m in matches:
                    # 기존 url 보존 — 누락 시에만 채움
                    for fld in ('questionUrl','answerUrl','solutionUrl',
                                'questionDownload','answerDownload'):
                        if not m.get(fld) and ai.get(fld):
                            m[fld] = ai[fld]
                attached += 1
            else:
                ai['id'] = next_id
                items.append(ai)
                next_id += 1
                added += 1
        print(f'  + 영역 보강 area-fill: attach {attached}, 신규 {added} → 총 {len(items)}')

    # ─ 학년도별 영역 명명 정정 (sqlite 잘못된 매핑) ─
    # 2014~2016 csat 국어·수학: 실제는 A형/B형 (수준별 분리). 가형/나형은 09개정 수학용.
    # 2014 csat 사회탐구: '한국사' 는 17수능부터 필수영역. 14년엔 '한국근현대사' 가 정답.
    NAME_FIX = {
        (2014, 'csat', '국어', '가형'): 'A형',
        (2014, 'csat', '국어', '나형'): 'B형',
        (2015, 'csat', '국어', '가형'): 'A형',
        (2015, 'csat', '국어', '나형'): 'B형',
        (2016, 'csat', '국어', '가형'): 'A형',
        (2016, 'csat', '국어', '나형'): 'B형',
        (2014, 'csat', '수학', '가형'): 'B형',   # 가형(자연) = B형
        (2014, 'csat', '수학', '나형'): 'A형',   # 나형(인문) = A형
        (2015, 'csat', '수학', '가형'): 'B형',
        (2015, 'csat', '수학', '나형'): 'A형',
        (2014, 'csat', '사회탐구', '한국사'): '한국근현대사',
    }
    # 잘못된 subSubject 라벨 제거 (None 으로 → 단일 영역)
    # 1995~98 csat 영어: 실제는 계열 통합 시험지. sqlite '인문계' 라벨은 오류.
    BAD_LABEL = {
        (1995, 'csat', '영어', '인문계'),
        (1996, 'csat', '영어', '인문계'),
        (1997, 'csat', '영어', '인문계'),
        (1998, 'csat', '영어', '인문계'),
    }
    fixed = 0
    cleared = 0
    for it in items:
        k = (it.get('gradeYear'), it.get('type'), it.get('subject'), it.get('subSubject'))
        if k in NAME_FIX:
            it['subSubject'] = NAME_FIX[k]
            fixed += 1
        elif k in BAD_LABEL:
            it['subSubject'] = None
            cleared += 1
    if fixed:   print(f'  + subSubject 정정: {fixed}건 (학년도별 명명 룰)')
    if cleared: print(f'  + subSubject 제거: {cleared}건 (잘못된 계열 라벨)')

    # ─ KICE 평가원 합본 PDF 분리본 (split-overrides) 우선 적용 ─
    # 평가원 자료마당 직접 다운 PDF 가 합본 (1~N 홀수형 + N+1~2N 짝수형) → 페이지 헤더로 분리.
    # questionUrl·answerUrl 을 분리본으로 갱신 + questionUrlEven·answerUrlEven 부착.
    split_path = ROOT / 'data' / 'kice-split-overrides.json'
    if split_path.exists():
        split_ovs = json.loads(split_path.read_text(encoding='utf-8'))
        attached = 0
        for ov in split_ovs:
            m = ov['match']
            kind = ov.get('kind')
            for it in items:
                if it.get('typeGroup') != 'suneung': continue
                if it.get('gradeYear') != m['gradeYear']: continue
                if it.get('type')      != m['type']:      continue
                if it.get('subject')   != m['subject']:   continue
                # subSubject 무관 — 평가원 합본은 영역 통합본 (모든 sub 카드에 동일 attach)
                if kind == 'q':
                    if 'questionUrl' in ov:     it['questionUrl']      = ov['questionUrl']
                    if 'questionDownload' in ov: it['questionDownload'] = ov['questionDownload']
                    if 'questionUrlEven' in ov: it['questionUrlEven']  = ov['questionUrlEven']
                    if 'questionDownloadEven' in ov: it['questionDownloadEven'] = ov['questionDownloadEven']
                elif kind == 'a':
                    if 'answerUrl' in ov:       it['answerUrl']      = ov['answerUrl']
                    if 'answerDownload' in ov:  it['answerDownload'] = ov['answerDownload']
                    if 'answerUrlEven' in ov:   it['answerUrlEven']  = ov['answerUrlEven']
                    if 'answerDownloadEven' in ov: it['answerDownloadEven'] = ov['answerDownloadEven']
                attached += 1
        print(f'  + KICE split overrides: {len(split_ovs)} → {attached}건 attach')

    # ─ 짝수형 PDF overrides 적용 — 매칭되는 item 에 questionUrlEven 부착 ─
    even_path = ROOT / 'data' / 'even-form-overrides.json'
    # 09개정 초기(2014~2016) A/B형 ↔ 가/나형 — SUBTYPE_BASE 의 atype/btype 정규화와 동일.
    # override 파일이 옛 'A형'/'B형' 표기를 사용하더라도 데이터의 '가형/나형' 카드에 attach.
    EVEN_SUB_ALIAS = {'A형': '가형', 'B형': '나형'}
    if even_path.exists():
        even_overrides = json.loads(even_path.read_text(encoding='utf-8'))
        attached = 0
        for ov in even_overrides:
            m = ov['match']
            target_sub = EVEN_SUB_ALIAS.get(m.get('subSubject'), m.get('subSubject'))
            for it in items:
                if it.get('gradeYear') != m['gradeYear']: continue
                if it.get('type')      != m['type']:      continue
                if it.get('subject')   != m['subject']:   continue
                # match.subSubject 가 명시되면 정확 일치 (alias 적용 후), None 이면 모든 sub 변형에 attach
                if target_sub is not None and it.get('subSubject') != target_sub:
                    continue
                # 홀수 분리본 — 기존 합본 url 을 odd 분리본으로 대체
                if 'questionUrl' in ov:
                    it['questionUrl']      = ov['questionUrl']
                    it['questionDownload'] = ov['questionDownload']
                if 'answerUrl' in ov:
                    it['answerUrl']      = ov['answerUrl']
                    it['answerDownload'] = ov['answerDownload']
                if 'questionUrlEven' in ov:
                    it['questionUrlEven']      = ov['questionUrlEven']
                    it['questionDownloadEven'] = ov['questionDownloadEven']
                if 'answerUrlEven' in ov:
                    it['answerUrlEven']      = ov['answerUrlEven']
                    it['answerDownloadEven'] = ov['answerDownloadEven']
                attached += 1
        print(f'  + 짝수형 overrides {len(even_overrides)} → {attached}건 attach')

    # ─ 검증된 수동 자료 보강 ─
    # 릴리스 자산은 존재하지만 연결이 빠졌거나, 잘못 연결된 소수 항목만 재현 가능하게 적용한다.
    backfill_path = ROOT / 'data' / 'sources' / 'material-backfills.json'
    if backfill_path.exists():
        backfills = json.loads(backfill_path.read_text(encoding='utf-8')).get('records', [])
        by_id = {it.get('id'): it for it in items}
        attached = 0
        for record in backfills:
            item = by_id.get(record['id'])
            if not item:
                raise RuntimeError(f"자료 보강 대상 id={record['id']}가 exams.json에 없습니다.")
            replace_existing = record.get('replaceExisting', False)
            for field, value in record.get('set', {}).items():
                if replace_existing or not item.get(field):
                    item[field] = value
            attached += 1
        print(f'  + 자료 보강 overrides: {attached}건 attach')

    # ─ 안전 가드: 기존 exams.json 대비 데이터 소실 차단 ─
    # exams.json 은 1회성 ingest(ebsi-archive, savetest-* 등)가 누적된 머지
    # 산출물이라 이 스크립트의 소스만으로는 전체를 재구성할 수 없다.
    # 과거 단독 재실행으로 사이트 2/3가 삭제된 사고의 재발 방지용.
    if OUT_JSON.exists():
        prev = json.loads(OUT_JSON.read_text(encoding='utf-8'))
        prev_sources = {it.get('source') for it in prev if it.get('source')}
        new_sources  = {it.get('source') for it in items if it.get('source')}
        problems = []
        if len(items) < len(prev):
            problems.append(f'건수 감소: {len(prev)} → {len(items)}')
        lost = prev_sources - new_sources
        if lost:
            problems.append(f'소실되는 source: {", ".join(sorted(lost))}')
        if problems and os.environ.get('FORCE_BUILD_DATA') != '1':
            sys.exit('\n'.join([
                '⛔ build-data.py 중단 — 기존 exams.json 대비 데이터가 줄어듭니다.',
                *('  - ' + p for p in problems),
                '단독 재실행은 surgical append 데이터를 파괴합니다 (scripts/README.md 참고).',
                '새 시험 반영은 기존 exams.json에 surgical append + regen-exam-splits.py 를 쓰세요.',
                '정말 의도한 전체 재빌드면 FORCE_BUILD_DATA=1 로 재실행하세요 (백업 .bak 생성됨).',
            ]))
        OUT_JSON.with_suffix('.json.bak').write_text(
            OUT_JSON.read_text(encoding='utf-8'), encoding='utf-8')

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

    # ─ exam-set-*.html 회차 SSG (친화 URL) ─
    build_static_set_pages(items, ROOT / 'exam-set.html', ROOT)

    # ─ sitemap 분할: index + sets + exams ─
    base = 'https://kicegg.com'
    today = datetime.date.today().isoformat()
    from urllib.parse import quote as _q
    from xml.sax.saxutils import escape as _xe

    # priority 계산 — 신규 도메인의 crawl budget을 인기/최근 시험에 우선 할당.
    # Google이 priority를 약하게 참고하긴 하나, sitemap 우선순위 신호로 차등화 의미 있음.
    CURRENT_YEAR = datetime.date.today().year + 1  # 학년도 기준 (e.g. 2026년 5월 = 2027학년도 cohort)
    def _exam_priority(it):
        gy = it.get('gradeYear', 0) or 0
        tp = it.get('type', '')
        tg = it.get('typeGroup', '')
        is_english = (it.get('subject') == '영어')
        has_listen = bool(it.get('listenUrl') or it.get('scriptUrl'))
        # 잡학(prelim/reference)·옛 1994~2007: 거의 색인 가치 없음
        if tg == 'reference' or tp == 'prelim': return '0.2'
        if gy and gy <= 2007: return '0.2'
        # 최근(현재 학년도 ± 1년) 평가원 핵심
        if tg == 'suneung' and tp in ('csat', 'june', 'sept'):
            if gy >= CURRENT_YEAR - 1: return '0.9'
            if gy >= CURRENT_YEAR - 3: return '0.7'
            if gy >= 2014: return '0.5'
            return '0.3'
        # 최근 학평·기타
        if gy >= CURRENT_YEAR - 1: return '0.7' if (is_english and has_listen) else '0.6'
        if gy >= CURRENT_YEAR - 3: return '0.5' if (is_english and has_listen) else '0.4'
        return '0.4' if (is_english and has_listen) else '0.3'

    def _set_priority(curr, year_str, t, sg):
        try: gy = int(year_str)
        except: gy = 0
        if t == 'prelim' or curr == 'reference': return '0.3'
        if gy and gy <= 2007: return '0.3'
        if t in ('csat', 'june', 'sept'):
            if gy >= CURRENT_YEAR - 1: return '1.0'
            if gy >= CURRENT_YEAR - 3: return '0.9'
            if gy >= 2014: return '0.7'
            return '0.5'
        # 학평
        if gy >= CURRENT_YEAR - 1: return '0.8'
        if gy >= CURRENT_YEAR - 3: return '0.6'
        return '0.5'

    # (1) sitemap-sets.xml — 회차 단위 친화 URL (검색 노출 우선)
    # 파일명 기준 dedupe — 다른 curriculum('예비'/'2015', '7차'/'2007개정')이 같은
    # slug 로 합쳐지며 중복 <url> 이 생기던 버그 방지.
    sets: dict[str, tuple] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        curr, year, t = it['curriculum'], str(it['gradeYear']), it['type']
        sets.setdefault(set_friendly_filename(curr, year, t, sg), (curr, year, t, sg))
    sets_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for fname in sorted(sets):
        curr, year, t, sg = sets[fname]
        sets_parts.append(
            f'  <url><loc>{base}/{fname}</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq><priority>{_set_priority(curr, year, t, sg)}</priority></url>')
    sets_parts.append('</urlset>')
    (ROOT / 'sitemap-sets.xml').write_text('\n'.join(sets_parts) + '\n', encoding='utf-8')

    # (2) sitemap-exams.xml — SSG 단건 URL
    today = datetime.date.today().isoformat()
    exams_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for it in items:
        exams_parts.append(
            f'  <url><loc>{base}/exam-{it["id"]}.html</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq><priority>{_exam_priority(it)}</priority></url>')
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

    # (4) sitemap-static.xml — index/archive/gradecut/admissions/calendar
    # privacy/terms는 noindex 정책이라 sitemap에서 제외
    static_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{base}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>',
        f'  <url><loc>{base}/archive.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>',
        f'  <url><loc>{base}/sets.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>',
        f'  <url><loc>{base}/calendar.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
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
