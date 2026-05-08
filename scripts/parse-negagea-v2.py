#!/usr/bin/env python3
"""negagea PDF 텍스트 기반 robust 파서 — 학과명 + 백분위 추출.

- 학교마다 표 컬럼이 달라 extract_tables 가 잘 안 됨
- 텍스트 line 단위 — 라인에 한글 학과명 + 7~12개 숫자 + 정시/가군/나군/다군 같은 키워드
- 라인 안의 숫자 중 60~99 범위 + 첫 번째 등장하는 백분위 후보 사용
- 다중 백분위 후보 시 가장 그럴듯한 것: 일반적으로 등급(2~5) 뒤·표점(60~140) 앞이 백분위
"""
import json, re, sys
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / 'data' / 'admissions' / 'negagea-pdfs'
OUT_FILE = ROOT / 'data' / 'admissions' / 'manual-results.json'

NUM_RE = re.compile(r'\d+(?:\.\d+)?')
KOR_RE = re.compile(r'[가-힣]')

# 백분위로 가능한 값 — 보통 60~99
def is_pct_val(v):
    try:
        f = float(v)
        return 60 <= f <= 99.99
    except: return False

# 등급으로 가능한 값 — 1.5~6 정도
def is_grade_val(v):
    try:
        f = float(v)
        return 1.0 <= f <= 6.5 and len(str(v)) <= 4
    except: return False

# 표점 평균 — 보통 600~750 (수능 환산점 합) 또는 백분위 환산 다름
def is_envscore(v):
    try:
        f = float(v)
        return 90 <= f <= 800
    except: return False

# 한 라인에서 학과명·백분위 추출
DEPT_KEYWORDS = ('학과','학부','전공','계열','과')
SKIP_LINE_RE = re.compile(r'(소계|합계|총계|평균|구분|모집단위|성적 관련|충원|관련 안내|비고|일자|발표일)')
TRACK_HINT_RE = re.compile(r'(정시|가군|나군|다군|일반|기회균형|기회|특성|농어촌|특기|실기|예체능)')

def extract_units_from_line(line):
    """한 줄에서 (학과명, 백분위) 추출. 없으면 None."""
    if SKIP_LINE_RE.search(line): return None
    if not KOR_RE.search(line): return None
    if not any(k in line for k in DEPT_KEYWORDS): return None

    nums = [m.group() for m in NUM_RE.finditer(line)]
    if len(nums) < 4: return None  # 너무 적으면 데이터 라인 아님

    # 학과명 — 라인 시작부터 첫 숫자 직전까지
    first_num_pos = None
    for m in NUM_RE.finditer(line):
        first_num_pos = m.start()
        break
    if first_num_pos is None: return None
    unit = line[:first_num_pos].strip()
    # 계열 prefix 제거 ("자연 전자공학과" → "전자공학과")
    unit = re.sub(r'^(자연|인문|예체|예능|체육|상경|이공|자연계열|인문계열|자연계|인문계)\s+', '', unit)
    unit = re.sub(r'\s+', ' ', unit)
    if len(unit) < 2 or len(unit) > 50: return None
    if not any(k in unit for k in DEPT_KEYWORDS): return None

    # 백분위 후보 — is_pct_val 만족하고 환산점/표점 근처에 있는 숫자
    pct_candidates = []
    for i, n in enumerate(nums):
        if is_pct_val(n):
            pct_candidates.append((i, float(n)))

    if not pct_candidates: return None

    # 휴리스틱: 등급(2~5)이 한 번 나오고 그 다음 첫 백분위가 70%컷
    grade_idx = None
    for i, n in enumerate(nums):
        if is_grade_val(n):
            grade_idx = i; break

    if grade_idx is not None:
        for i, val in pct_candidates:
            if i > grade_idx:
                return (unit, val)

    # fallback: 첫 백분위 후보
    return (unit, pct_candidates[0][1])

def parse_pdf_text(pdf_path):
    units = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            for line in text.split('\n'):
                line = line.strip()
                if not line: continue
                # 일반 정시 전형만 (기회균형·농어촌·특기 등 제외) — 페이지 전체 단위로 처리하되 키워드로 보존
                if re.search(r'(기회균형|농어촌|특성화|특기|기초생활|재외국민|장애|북한이탈|체육|실기)', line):
                    continue
                r = extract_units_from_line(line)
                if r:
                    units.append(r)
    # 중복 제거 (학과명 유일하게)
    seen = {}
    for unit, pct in units:
        if unit not in seen:
            seen[unit] = pct
    return [{'unit': u, 'pct70': p} for u, p in seen.items()]

# ── 광운대: 베리타스알파 + PDF 검증 데이터 직접 시드 ──
KW_2025 = [
    ('전자공학과', 84.33), ('전자통신공학과', 82.67), ('전자융합공학과', 83.17),
    ('전기공학과', 88.33), ('전자재료공학과', 80.50),
    ('반도체시스템공학부 반도체시스템공학전공', 82.33),
    ('컴퓨터정보공학부', 82.50), ('소프트웨어학부', 78.67), ('정보융합학부', 84.17),
    ('로봇학부 AI로봇전공', 80.67), ('로봇학부 정보제어·지능시스템전공', 80.00),
    ('건축학과', 81.00), ('건축공학과', 81.17), ('화학공학과', 81.00), ('환경공학과', 80.50),
    ('수학과', 76.17), ('전자바이오물리학과', 72.67), ('화학과', 79.33),
    ('국어국문학과', 79.33), ('영어산업학과', 78.00), ('미디어커뮤니케이션학부', 79.67),
    ('산업심리학과', 78.67), ('동북아문화산업학부', 77.67), ('행정학과', 79.17),
    ('법학부', 80.67), ('국제학부', 77.50),
    ('경영학부 경영학전공', 83.00), ('경영학부 빅데이터경영전공', 84.67),
    ('국제통상학부', 81.50),
    ('자율전공학부(자연)', 80.50), ('자율전공학부(인문)', 80.50),
]

# ── 실행 ──
existing = json.loads(OUT_FILE.read_text(encoding='utf-8'))
backup = OUT_FILE.with_suffix('.backup.json')
if not backup.exists():
    backup.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')

pdfs = sorted(PDF_DIR.glob('*.pdf'))
print(f'{len(pdfs)}개 PDF 텍스트 파싱\n')
parsed = {}
for pdf in pdfs:
    slug = pdf.stem
    try:
        units = parse_pdf_text(pdf)
    except Exception as e:
        print(f'  ✗ {slug}: error — {e}')
        continue
    if len(units) < 2:
        print(f'  ✗ {slug}: 추출 {len(units)}건 (스킵)')
        continue
    parsed[slug] = units
    print(f'  ✓ {slug:<14} → {len(units)}개 학과')

# 광운대 직접 시드 (PDF 추출 부정확)
parsed['kw'] = [{'unit': u, 'pct70': p} for u, p in KW_2025]
print(f'  ✓ kw            → {len(KW_2025)}개 학과 (manual seed)')

print(f'\n총 {len(parsed)}개 학교 데이터')

# manual-results 갱신
updated = dict(existing)
m = updated.get('_meta', {}).copy()
m['lastUpdated'] = '2026-05-08'
m['source'] = '각 대학 입학처 공식 PDF (negagea CDN) + 일부 보조 데이터'
updated['_meta'] = m

for slug, units in parsed.items():
    if slug not in updated or not isinstance(updated[slug], dict):
        updated[slug] = {}
    updated[slug]['2025'] = units

OUT_FILE.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n갱신 완료')
