#!/usr/bin/env python3
"""tmp/kice-extracted-lang2-voca/ 트리 → 영문 hash 파일명으로 rename + 매핑 records 생성.

산출:
  tmp/kice-final-lang2-voca/  — 업로드 가능 영문 PDF
  data/kice-lang2-voca-items.json — exams.json 에 추가될 records
"""
import json, re, shutil, hashlib
from pathlib import Path

SRC = Path('tmp/kice-extracted-lang2-voca')
DST = Path('tmp/kice-final-lang2-voca')
OUT = Path('data/kice-lang2-voca-items.json')
DST.mkdir(parents=True, exist_ok=True)

REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v3/'

# 직업탐구 과목명 (PDF 파일명 → subSubject 정규화)
VOCA_NORM = {
    '성공적인 직업생활': '성공적인 직업생활',
    '농업 기초 기술':    '농업기초기술',
    '공업 일반':         '공업일반',
    '상업 경제':         '상업경제',
    '수산·해운 산업 기초': '수산·해운 산업 기초',
    '인간 발달':         '인간발달',
    '농업이해':           '농업이해',
    '농업기초':           '농업기초',
    '공업입문':           '공업입문',
    '식품과영양':         '식품과영양',
    '디자인일반':         '디자인일반',
    '컴퓨터일반':         '컴퓨터일반',
    '프로그래밍':         '프로그래밍',
    '해사일반':           '해사일반',
    '기초제도':           '기초제도',
    '회계원리':           '회계원리',
    '정보기술기초':       '정보기술기초',
    '농업정보관리':       '농업정보관리',
    '수산해운정보처리':   '수산해운정보처리',
}

# 파일명 → (subSubject, kind) 파싱
KIND_MAP = {'문제':'q', '문제지':'q', '정답':'a', '정답표':'a', '해설':'sol', '해설지':'sol',
            '듣기대본':'script', '대본':'script', '듣기':'listen'}
KIND_PAT = re.compile(r'(문제지|문제|정답표|정답|해설지|해설|듣기대본|대본)')


def parse_pdf_name(fname: str):
    """관대한 파서. 반환: (sub_name_raw, kind) or None"""
    stem = re.sub(r'\.pdf$', '', fname, flags=re.IGNORECASE).strip()

    # 1) kind 키워드 위치 찾기
    m = KIND_PAT.search(stem)
    if not m:
        return None
    kind_kr = m.group(1)
    kind = KIND_MAP.get(kind_kr, 'q')

    # 2) kind 키워드 제거하고 남은 문자열에서 subSubject 추출
    rest = (stem[:m.start()] + stem[m.end():]).strip()

    # 3) 다양한 접두/접미 정리
    rest = re.sub(r'^\d+\s*', '', rest)             # '03 ' or '03'
    rest = re.sub(r'^(?:직탐|직업탐구|제2외국어/?한문|제2외국어한문|제2외국어|한문)[\s_\-]*', '', rest)
    rest = re.sub(r'[_\-]+', ' ', rest).strip()
    rest = re.sub(r'\s+', ' ', rest).strip()
    rest = re.sub(r'[①②③④⑤]+', '', rest).strip()  # 분반 마크 제거
    rest = rest.strip('·-_ ')

    if not rest:
        return None
    return rest, kind

HANGUL_RE = re.compile(r'[가-힣]')
def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s):
        return re.sub(r'[^A-Za-z0-9_\-]', '', s)
    h = hashlib.md5(s.encode('utf-8')).hexdigest()[:8]
    return f'k{h}'


LANG2_CANON = {  # 정규명 → 자기 자신; 변종은 정규명으로
    '독일어': '독일어', '프랑스어': '프랑스어', '스페인어': '스페인어',
    '중국어': '중국어', '일본어': '일본어', '러시아어': '러시아어',
    '아랍어': '아랍어', '베트남어': '베트남어', '한문': '한문',
}
# 변종 매핑
LANG2_ALIAS = {
    '러시아': '러시아어', '독': '독일어', '불': '프랑스어',
    '기초 베트남어': '베트남어', '기초베트남어': '베트남어',
}

VOCA_CANON_LIST = [
    '성공적인 직업생활',
    '농업 기초 기술', '공업 일반', '상업 경제', '수산·해운 산업 기초',
    '인간 발달', '농업 이해', '기초 제도', '회계 원리',
    '생활 서비스 산업의 이해', '해양의 이해',
    # 옛 (2014~16) 통합형
    '농생명 산업', '공업', '상업 정보', '수산·해운', '가사·실업',
]
def voca_canon(s):
    s = s.strip().replace('  ', ' ')
    # 접두 잔재 제거
    s = re.sub(r'^(=수능\s*|직탐\s*|-+|=+)', '', s).strip()
    # 공백 정규화 (양쪽으로 매칭 시도)
    spaced = s
    no_space = s.replace(' ', '')
    for cand in VOCA_CANON_LIST:
        if spaced == cand: return cand
        if no_space == cand.replace(' ', ''): return cand
    # 매칭 실패 — None (가비지로 간주)
    return None


def normalize_sub(subject_dir, raw_sub):
    s = raw_sub.strip()
    # 공통 가비지 — fileSeq hash 같은 게 들어온 경우
    if re.search(r'_[0-9a-f]{6,}', s) or s.startswith('_'):
        return None

    if subject_dir.startswith('제2외국어'):
        s = re.sub(r'\s*[ⅠⅡI1Ii]+$', '', s).strip()
        if s in LANG2_ALIAS: s = LANG2_ALIAS[s]
        return LANG2_CANON.get(s)   # 9개 정규명만 통과
    # 직업탐구
    return voca_canon(s)


records = []   # {gradeYear, type(csat/sept/june/prelim), subject, subSubject, q_pdf_local, a_pdf_local, ...}

for gy_dir in sorted(SRC.iterdir()):
    if not gy_dir.is_dir(): continue
    gy = int(gy_dir.name)
    for type_dir in gy_dir.iterdir():
        type_ = type_dir.name
        for board_dir in type_dir.iterdir():
            for subj_dir in board_dir.iterdir():
                subj_name = subj_dir.name
                subject = '제2외국어' if subj_name.startswith('제2외국어') else '직업탐구'
                # 디렉토리 구조: subj_dir / {q,a,sol,listen,misc} / *.pdf
                bucket = {}
                for kind_dir in subj_dir.iterdir():
                    if not kind_dir.is_dir(): continue
                    dir_kind = kind_dir.name   # 'q', 'a', 'sol', etc.
                    for f in sorted(kind_dir.iterdir()):
                        if f.suffix.lower() != '.pdf': continue
                        parsed = parse_pdf_name(f.name)
                        # parse_pdf_name 도 kind 추출하지만 파일명에 키워드 없으면 None — 그땐 dir_kind 사용
                        if parsed:
                            raw_sub, parsed_kind = parsed
                            kind = dir_kind if dir_kind in ('q','a','sol','listen') else parsed_kind
                        else:
                            # 파일명 자체가 subSubject (예: '01 독일어Ⅰ.pdf')
                            stem = re.sub(r'\.pdf$', '', f.name, flags=re.IGNORECASE).strip()
                            stem = re.sub(r'^\d+\s*', '', stem).strip()
                            stem = re.sub(r'^(?:직탐|직업탐구)[\s_\-\(]*', '', stem).strip()
                            stem = stem.rstrip(')').strip()
                            stem = re.sub(r'[①②③④⑤]+', '', stem).strip()
                            raw_sub = stem
                            kind = dir_kind if dir_kind in ('q','a','sol','listen') else 'q'
                        sub_norm = normalize_sub(subj_name, raw_sub)
                        if not sub_norm: continue
                        bucket.setdefault(sub_norm, {})[kind] = f
                for sub_norm, kinds in bucket.items():
                    rec = {'gradeYear': gy, 'type': type_, 'subject': subject, 'subSubject': sub_norm}
                    for k, p in kinds.items():
                        rec[f'{k}_pdf_local'] = str(p)
                    records.append(rec)

print(f'▣ records: {len(records)}건')

# rename → DST
ROUND_KEY = {'csat':'csat', 'june':'06', 'sept':'09', 'prelim':'prelim'}
seen = set()
def safe_name(gy, t, subject, sub, kind):
    base = '_'.join([str(gy), ROUND_KEY.get(t,t), asciify(subject), asciify(sub), kind]) + '.pdf'
    name = base
    cnt = 1
    while name in seen:
        cnt += 1
        name = base.replace('.pdf', f'_{cnt}.pdf')
    seen.add(name)
    return name


out_records = []
for r in records:
    new_rec = dict(r)
    for k in ('q', 'a', 'sol'):
        local_key = f'{k}_pdf_local'
        if local_key not in r: continue
        src = Path(r[local_key])
        if not src.exists(): continue
        new_name = safe_name(r['gradeYear'], r['type'], r['subject'], r['subSubject'], k)
        target = DST / new_name
        shutil.copy2(src, target)
        new_rec[f'{k}_pdf_renamed'] = new_name
        new_rec[f'{k}_pdf_url'] = REL_BASE + new_name
    out_records.append(new_rec)

# data/kice-lang2-voca-items.json — build-data 통합용 형태로 정리
# 실제 exam item schema: {curriculum, gradeYear, examYear, month, typeGroup, type, studentGrade, subject, subSubject, questionUrl, answerUrl, solutionUrl, ...}
TYPE_MONTH = {'csat': 11, 'june': 6, 'sept': 9, 'prelim': 0}
final_items = []
for r in out_records:
    gy = r['gradeYear']
    t = r['type']
    # curriculum: 2014~2021 = 2009, 2022~ = 2015
    if 2014 <= gy <= 2021: curr = '2009'
    elif gy >= 2022: curr = '2015'
    else: curr = 'pre2009'
    month = TYPE_MONTH.get(t, 0)
    examYear = gy - 1 if t == 'csat' else gy - 1   # 시행연도 = 학년도 - 1
    item = {
        'curriculum': curr,
        'gradeYear': gy,
        'examYear': examYear,
        'month': month,
        'studentGrade': 3,
        'typeGroup': 'suneung',
        'type': t,
        'subject': r['subject'],
        'subSubject': r['subSubject'],
        'questionUrl': r.get('q_pdf_url'),
        'answerUrl': r.get('a_pdf_url'),
        'solutionUrl': r.get('sol_pdf_url'),
        'questionDownload': f"{gy}학년도_{t}_{r['subject']}_{r['subSubject']}_문제지.pdf" if r.get('q_pdf_url') else None,
        'answerDownload':   f"{gy}학년도_{t}_{r['subject']}_{r['subSubject']}_정답표.pdf" if r.get('a_pdf_url') else None,
        'listenUrl': None,
        'scriptUrl': None,
        'source': 'kice-archive',
    }
    final_items.append(item)

OUT.write_text(json.dumps(final_items, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'✓ 영문화: {len(list(DST.iterdir()))}개 PDF → {DST}')
print(f'✓ 매핑 저장: {OUT} ({len(final_items)} items)')
