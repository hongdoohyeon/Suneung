#!/usr/bin/env python3
"""results-pdfs/{slug}/{year}_results.pdf → 학과별 70%컷 백분위 추출.

학교마다 표 구조가 비슷 — 모집단위 + 70%컷 백분위 + 영어 등급.
output: data/admissions/results.json
"""
from __future__ import annotations
import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
RESULTS_PDFS = ROOT / 'data' / 'admissions' / 'results-pdfs'
OUT = ROOT / 'data' / 'admissions' / 'results.json'


def is_results_table(table: list) -> bool:
    """입시결과 표 — 헤더 또는 1-2번째 row까지 검사."""
    if not table or len(table) < 2:
        return False
    # 첫 3 row 합쳐서 검사 (헤더가 멀티라인일 수도)
    head_text = ' '.join(' '.join(str(c or '') for c in r) for r in table[:3])
    return any(k in head_text for k in [
        '70%', '백분위', '환산총점', '환산 총점', '컷', 'cut', 'Cut',
        '합격선', '평균', '환산점수', '수능 점수', '상위', '최저',
        '국어', '수학'  # ratio 표가 아닌 결과 표면 학과별 점수
    ])


def parse_results_table(table: list) -> list[dict]:
    """표 → [{학과명, 70%컷_백분위, 영어등급}]."""
    if len(table) < 2: return []
    header = [str(c or '') for c in table[0]]
    # 모집단위 컬럼 (보통 0번) + 백분위 + 영어 등급 컬럼 식별
    col_unit = 0
    col_70cut_pct = None
    col_70cut_eng = None
    col_total = None
    for i, c in enumerate(header):
        s = c.replace(' ', '').replace('\n', '')
        if '70%' in s or 'cut' in s.lower():
            # 70%컷 영역 시작
            if col_70cut_pct is None and ('백분위' in s or '백분율' in s):
                col_70cut_pct = i
            elif col_70cut_pct is None:
                col_70cut_pct = i  # 그냥 70% 컬럼
        if '영어' in s and '등급' in s:
            col_70cut_eng = i
        if '환산' in s and '총점' in s:
            col_total = i
    out = []
    for row in table[1:]:
        if not row or len(row) < 3:
            continue
        unit = str(row[col_unit] or '').strip().replace('\n', ' ')
        # 학과명 검증 — 한글 포함 + 일정 길이
        if not unit or len(unit) > 60 or not re.search(r'[가-힣]', unit):
            continue
        # 숫자 column 모두 추출
        nums = []
        for v in row[1:]:
            if v is None: continue
            m = re.search(r'-?\d+(?:\.\d+)?', str(v))
            if m:
                try:
                    nums.append(float(m.group()))
                except: pass
        if len(nums) < 2:
            continue
        out.append({
            'unit': unit[:50],
            'numbers': nums[:10],
            'header': [h[:30] for h in header[:8]],
        })
    return out


def extract_results(pdf_path: Path) -> dict:
    out = {'tables': [], 'units': []}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                try:
                    tables = page.extract_tables()
                except: continue
                for t in tables:
                    if is_results_table(t):
                        rows = parse_results_table(t)
                        if rows:
                            out['units'].extend(rows)
    except Exception as e:
        out['error'] = str(e)[:80]
    return out


def main():
    summary = {}
    for slug_dir in sorted(RESULTS_PDFS.iterdir()):
        if not slug_dir.is_dir(): continue
        slug = slug_dir.name
        per_year = {}
        for pdf in sorted(slug_dir.glob('*.pdf')):
            m = re.match(r'(\d{4})_', pdf.name)
            if not m: continue
            year = m.group(1)
            data = extract_results(pdf)
            if data.get('units'):
                per_year[year] = {
                    'unit_count': len(data['units']),
                    'units': data['units'][:60],  # 학과 60개 제한
                }
        if per_year:
            summary[slug] = per_year
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    total_units = sum(sum(y['unit_count'] for y in s.values()) for s in summary.values())
    print(f'wrote {OUT}')
    print(f'학교: {len(summary)}, 총 학과 entry: {total_units}')
    for slug, ys in sorted(summary.items())[:10]:
        n = sum(y['unit_count'] for y in ys.values())
        years = sorted(ys.keys())
        print(f'  {slug}: {years} 합계 {n}건')


if __name__ == '__main__':
    main()
