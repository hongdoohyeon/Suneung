#!/usr/bin/env python3
"""negagea PDF에서 학과별 70%컷 백분위 추출 → manual-results 갱신.

학교마다 표 컬럼 순서가 다르므로 페이지별 표 추출 → 헤더에서 '백분위' 컬럼 찾기 → 각 행 파싱.
실패 시 텍스트 정규식 fallback.
"""
import json, re, sys
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / 'data' / 'admissions' / 'negagea-pdfs'
OUT_FILE = ROOT / 'data' / 'admissions' / 'manual-results.json'

# 기존 manual-results 로드 (백업 + 보존)
existing = json.loads(OUT_FILE.read_text(encoding='utf-8'))
backup = OUT_FILE.with_suffix('.backup.json')
if not backup.exists():
    backup.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')

PCT_HEADERS = ['백분위', '백 분 위', '백분위(국,수,탐)', '백분위(국,수,영,탐)']

def find_pct_col(header_row):
    """표 헤더에서 백분위 컬럼 인덱스 반환 (없으면 -1)."""
    for i, cell in enumerate(header_row):
        if cell is None: continue
        s = re.sub(r'\s+', '', str(cell))
        if s in [re.sub(r'\s+', '', h) for h in PCT_HEADERS]:
            return i
        if '백분위' in s:
            return i
    return -1

def find_unit_col(header_row):
    """모집단위 컬럼 — 보통 '모집단위' 또는 빈 셀(왼쪽 끝)."""
    for i, cell in enumerate(header_row):
        if cell is None: continue
        s = re.sub(r'\s+', '', str(cell))
        if '모집단위' in s or '학과' in s:
            return i
    return -1

NUM_RE = re.compile(r'^\d{1,3}(?:\.\d+)?$')
SKIP_UNITS = {'계', '소계', '합계', 'no', 'ㅁ'}

def is_pct(val):
    if val is None: return False
    s = str(val).strip()
    if not NUM_RE.match(s): return False
    f = float(s)
    return 50 <= f <= 100

def is_etype(val):
    """전형명 — 정시 일반전형 우선, 농어촌·기회균형·실기 제외."""
    if val is None: return True
    s = str(val)
    if any(k in s for k in ['기회균형', '농어촌', '특성화', '실기', '특기', '기초생활', '서해5도', '북한이탈',
                              '특성화고', '재외국민', '장애인', '체육', '실내체육', '예체능']):
        return False
    return True

def parse_pdf(pdf_path):
    units = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for tbl in tables:
                if not tbl or len(tbl) < 2: continue
                # 헤더 후보: 첫 1~3행 중 '백분위' 들어간 행
                header_idx = -1
                for hi in range(min(3, len(tbl))):
                    if find_pct_col(tbl[hi]) >= 0:
                        header_idx = hi
                        break
                if header_idx < 0: continue
                pct_col = find_pct_col(tbl[header_idx])
                # unit_col: 모집단위 헤더가 있으면 그것, 없으면 휴리스틱
                unit_col = find_unit_col(tbl[header_idx])
                if unit_col < 0:
                    # 보통 모집단위는 0~2번 컬럼 안. 한글 텍스트 + 숫자 아닌 컬럼 찾기
                    for i in range(min(4, len(tbl[header_idx+1]) if header_idx+1 < len(tbl) else 0)):
                        sample = tbl[header_idx+1][i] if header_idx+1 < len(tbl) else None
                        if sample and re.search(r'[가-힣]', str(sample)) and not NUM_RE.match(str(sample).strip()):
                            unit_col = i; break
                if unit_col < 0: continue

                for row in tbl[header_idx+1:]:
                    if pct_col >= len(row) or unit_col >= len(row): continue
                    unit_raw = row[unit_col]
                    pct_raw  = row[pct_col]
                    if not unit_raw: continue
                    unit = re.sub(r'\s+', ' ', str(unit_raw).replace('\n', ' ')).strip()
                    if not unit or unit.lower() in SKIP_UNITS: continue
                    if not re.search(r'[가-힣]', unit): continue
                    if not is_pct(pct_raw): continue
                    pct = float(str(pct_raw).strip())
                    units.append({'unit': unit, 'pct70': pct})
    # 중복 제거 (같은 학과 여러 행 — 가장 위 우선, 보통 일반전형)
    seen = {}
    for u in units:
        if u['unit'] not in seen:
            seen[u['unit']] = u
    return list(seen.values())

# ── 실행 ──
pdfs = sorted(PDF_DIR.glob('*.pdf'))
print(f'{len(pdfs)}개 PDF 처리\n')
parsed = {}
for pdf in pdfs:
    slug = pdf.stem
    try:
        units = parse_pdf(pdf)
    except Exception as e:
        print(f'  ✗ {slug}: parse error — {e}')
        continue
    if not units:
        print(f'  ✗ {slug}: 추출 0건')
        continue
    parsed[slug] = units
    print(f'  ✓ {slug:<14} → {len(units)}개 학과')

print(f'\n총 {len(parsed)}개 학교에서 데이터 추출')

# manual-results 갱신 — 기존 entry 백업 후 PDF 데이터로 교체
updated = dict(existing)
new_meta = updated.get('_meta', {}).copy()
new_meta['lastUpdated'] = '2026-05-08'
new_meta['source'] = 'negagea CDN 공식 PDF (입학처 발표)'
updated['_meta'] = new_meta

for slug, units in parsed.items():
    # 학과 list (2025 키 아래)
    formatted = [{'unit': u['unit'], 'pct70': u['pct70']} for u in units]
    if slug not in updated:
        updated[slug] = {}
    elif not isinstance(updated[slug], dict):
        updated[slug] = {}
    updated[slug]['2025'] = formatted

OUT_FILE.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\nmanual-results.json 갱신 완료 — {len(parsed)}개 학교')
