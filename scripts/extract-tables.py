#!/usr/bin/env python3
"""모든 학교 PDF의 정시 후보 페이지에서 표 추출 (pdfplumber.extract_tables).

표를 헤더 패턴으로 분류:
- 영어 등급 환산표: 헤더에 "1등급..9등급" 또는 "1...9"
- 반영비율 표: 헤더에 "국어 수학 영어 탐구" 또는 "국어 수학 탐구"
- 그 외: skip

output: data/admissions/tables/{slug}/{year}_{kind}.json
"""
from __future__ import annotations
import json
import re
from pathlib import Path
import pdfplumber

import os
ROOT = Path(__file__).resolve().parents[1]
SUFFIX = os.environ.get('EXTRACT_SUFFIX', '')  # '' or '-extra'
PDF_ROOT = ROOT / 'data' / 'admissions' / f'pdfs{SUFFIX}'
PARSED_ROOT = ROOT / 'data' / 'admissions' / f'parsed{SUFFIX}'
OUT_ROOT = ROOT / 'data' / 'admissions' / f'tables{SUFFIX}'


def is_eng_grade_header(row: list) -> bool:
    """헤더 row가 등급표 헤더인지 — '1등급'~'9등급' or '1'~'9' + '등급' nearby.
    영어/한국사 모두 같은 패턴이라 일괄 추출 후 컨텍스트로 분류."""
    if not row:
        return False
    s = ' '.join(str(c or '') for c in row)
    if re.search(r'1등급.*2등급.*3등급.*4등급', s):
        return True
    # 숫자만 1 2 3 4 5 6 7 8 9
    if re.search(r'\b1\b\s*\b2\b\s*\b3\b\s*\b4\b\s*\b5\b\s*\b6\b\s*\b7\b\s*\b8\b\s*\b9\b', s):
        return True
    return False


def is_ratio_header(row: list) -> bool:
    """반영비율 표 헤더 — '국어' '수학' '영어' or '탐구' 동시 존재."""
    if not row:
        return False
    s = ' '.join(str(c or '') for c in row)
    has_kor = '국어' in s
    has_math = '수학' in s
    has_tamgu = '탐구' in s or '사회' in s or '과학' in s
    has_eng = '영어' in s
    # 최소 3개 영역
    return sum([has_kor, has_math, has_tamgu, has_eng]) >= 3


def parse_eng_table(table: list) -> list[dict]:
    """영어 등급표 → [{label, grades: [9 floats]}]"""
    if len(table) < 2:
        return []
    header = table[0]
    # 등급 컬럼 위치 — '1등급' 또는 '1' 매칭
    grade_cols = []
    for i, c in enumerate(header):
        s = str(c or '')
        m = re.search(r'(\d+)등급|^(\d+)$', s.strip())
        if m:
            grade_cols.append((i, int(m.group(1) or m.group(2))))
    if len(grade_cols) < 7:  # 적어도 7등급은 잡혀야
        return []
    out = []
    for row in table[1:]:
        # 라벨 (등급 컬럼 외 첫 셀)
        labels = [str(row[i] or '') for i in range(len(row)) if i not in [c[0] for c in grade_cols]]
        label = ' '.join(l.strip() for l in labels if l).strip()[:60]
        # 등급별 점수
        scores = {}
        for col_idx, grade in grade_cols:
            if col_idx >= len(row):
                continue
            v = row[col_idx]
            if v is None:
                continue
            m = re.search(r'-?\d+(?:\.\d+)?', str(v))
            if m:
                scores[str(grade)] = float(m.group())
        if len(scores) >= 5:  # 의미 있는 데이터만
            out.append({'label': label, 'grades': scores})
    return out


def parse_ratio_table(table: list) -> list[dict]:
    """반영비율 표 → [{label, ratios: {국어, 수학, ...}}]"""
    if len(table) < 2:
        return []
    header = table[0]
    # 영역 컬럼 — 국어/수학/영어/탐구/한국사
    area_cols = {}
    for i, c in enumerate(header):
        s = str(c or '')
        if '국어' in s:
            area_cols['국어'] = i
        elif '수학' in s:
            area_cols['수학'] = i
        elif '영어' in s:
            area_cols['영어'] = i
        elif '탐구' in s or '사회' in s or '과학' in s:
            area_cols['탐구'] = i
        elif '한국사' in s:
            area_cols['한국사'] = i
    if len(area_cols) < 3:
        return []
    out = []
    for row in table[1:]:
        # 라벨 — 영역 컬럼 외
        labels = [str(row[i] or '') for i in range(len(row)) if i not in area_cols.values()]
        label = ' '.join(l.strip() for l in labels if l).strip()[:80]
        ratios = {}
        for area, col_idx in area_cols.items():
            if col_idx >= len(row):
                continue
            v = row[col_idx]
            if v is None:
                continue
            m = re.search(r'-?\d+(?:\.\d+)?', str(v))
            if m:
                ratios[area] = float(m.group())
        if len(ratios) >= 3:
            out.append({'label': label, 'ratios': ratios})
    return out


def process_pdf(pdf_path: Path, parsed_pages: list[int]) -> dict:
    """단일 PDF → 영어/비율 표 list."""
    out = {'eng_tables': [], 'ratio_tables': [], 'errors': []}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num in parsed_pages:
                if page_num < 1 or page_num > len(pdf.pages):
                    continue
                page = pdf.pages[page_num - 1]
                try:
                    tables = page.extract_tables()
                except Exception as e:
                    out['errors'].append(f'p{page_num}: {str(e)[:60]}')
                    continue
                for tbl in tables:
                    if not tbl or len(tbl) < 2:
                        continue
                    header = tbl[0]
                    if is_eng_grade_header(header):
                        eng = parse_eng_table(tbl)
                        for e in eng:
                            e['page'] = page_num
                            out['eng_tables'].append(e)
                    if is_ratio_header(header):
                        ratios = parse_ratio_table(tbl)
                        for r in ratios:
                            r['page'] = page_num
                            out['ratio_tables'].append(r)
    except Exception as e:
        out['errors'].append(f'open: {str(e)[:60]}')
    return out


def main():
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    summary = {}
    for parsed_dir in sorted(PARSED_ROOT.iterdir()):
        if not parsed_dir.is_dir():
            continue
        slug = parsed_dir.name
        pdf_dir = PDF_ROOT / slug
        if not pdf_dir.exists():
            continue
        out_slug = OUT_ROOT / slug
        out_slug.mkdir(exist_ok=True)
        slug_summary = {}
        print(f'=== {slug} ===', flush=True)
        for pjson in sorted(parsed_dir.glob('*.json')):
            stem = pjson.stem  # 2026_guide
            pdf = pdf_dir / f'{stem}.pdf'
            if not pdf.exists():
                continue
            parsed = json.loads(pjson.read_text())
            pages = [p['page'] for p in parsed.get('jeongsi_pages', [])]
            if not pages:
                continue
            data = process_pdf(pdf, pages)
            data['slug'] = slug
            data['source'] = str(pdf.relative_to(ROOT))
            data['stem'] = stem
            (out_slug / f'{stem}.json').write_text(
                json.dumps(data, ensure_ascii=False, indent=2)
            )
            n_eng = len(data['eng_tables'])
            n_ratio = len(data['ratio_tables'])
            print(f'  {stem}: 영어 {n_eng}건, 비율 {n_ratio}건', flush=True)
            slug_summary[stem] = {'eng': n_eng, 'ratio': n_ratio}
        if slug_summary:
            summary[slug] = slug_summary

    print('\n=== 학교별 요약 ===')
    n_with_eng = 0
    n_with_ratio = 0
    for slug, files in sorted(summary.items()):
        eng_total = sum(f['eng'] for f in files.values())
        ratio_total = sum(f['ratio'] for f in files.values())
        if eng_total: n_with_eng += 1
        if ratio_total: n_with_ratio += 1
        print(f'  {slug:<18} 영어 {eng_total:>3}건 비율 {ratio_total:>3}건')
    print(f'\n학교 {n_with_eng}/{len(summary)}개 영어 추출 OK')
    print(f'학교 {n_with_ratio}/{len(summary)}개 비율 추출 OK')


if __name__ == '__main__':
    main()
