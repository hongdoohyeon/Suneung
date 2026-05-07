#!/usr/bin/env python3
"""대학 정시 모집요강 PDF → 반영비율 후보 페이지 JSON 추출.

각 PDF에서 '정시' + ('반영' or '비율' or '영역별' or '수능') 키워드가 있는 페이지만
data/admissions/parsed/{slug}/{year}.json 에 저장.

다음 단계(학교별 ratio/pick 추출)의 입력. 페이지 텍스트를 raw로 보존하므로
사람이 검토하거나 학교별 정규식 룰을 짜는 데 사용.

실행:
    python3 scripts/parse-admissions.py             # 전체
    python3 scripts/parse-admissions.py yonsei snu  # 특정 학교만
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
import pdfplumber

import os
ROOT = Path(__file__).resolve().parents[1]
PDF_SUBDIR = os.environ.get('PARSE_PDF_SUBDIR', 'pdfs')
OUT_SUBDIR = os.environ.get('PARSE_OUT_SUBDIR', 'parsed')
PDF_ROOT = ROOT / 'data' / 'admissions' / PDF_SUBDIR
OUT_ROOT = ROOT / 'data' / 'admissions' / OUT_SUBDIR

JEONGSI_RE = re.compile(r'정시|일반전형|수능전형|수능 ?위주')
RATIO_RE = re.compile(r'반영|비율|영역별|수능 ?100|국어|수학|영어|탐구|등급')
EXCLUDE_RE = re.compile(r'편입|재외국민|수시|학생부종합|학생부교과|논술전형')


def extract_jeongsi_pages(pdf_path: Path) -> dict:
    """PDF에서 정시 반영 후보 페이지 추출."""
    result = {
        'source': str(pdf_path.relative_to(ROOT)),
        'total_pages': 0,
        'jeongsi_pages': [],
        'errors': [],
    }
    try:
        with pdfplumber.open(pdf_path) as pdf:
            result['total_pages'] = len(pdf.pages)
            for i, page in enumerate(pdf.pages, 1):
                try:
                    text = page.extract_text() or ''
                except Exception as e:
                    result['errors'].append(f'p{i}: {str(e)[:50]}')
                    continue
                if not text.strip():
                    continue
                # 정시 + 반영/비율/영역별 키워드 둘 다 있어야 후보
                if JEONGSI_RE.search(text) and RATIO_RE.search(text):
                    if EXCLUDE_RE.search(text) and not JEONGSI_RE.search(text[:200]):
                        # 첫 200자에 정시 없으면 다른 전형 페이지로 간주
                        continue
                    result['jeongsi_pages'].append({
                        'page': i,
                        'text': text[:3500],
                    })
    except Exception as e:
        result['errors'].append(f'open: {str(e)[:80]}')
    return result


def parse_slug(slug: str) -> dict | None:
    """학교 폴더 안 모든 PDF 파싱."""
    slug_dir = PDF_ROOT / slug
    if not slug_dir.exists():
        return None
    out_dir = OUT_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {}
    for pdf in sorted(slug_dir.glob('*.pdf')):
        # 파일명: 2026_guide.pdf | 2027_plan.pdf
        m = re.match(r'(\d{4})_(\w+)\.pdf', pdf.name)
        if not m:
            continue
        year, kind = m.group(1), m.group(2)
        out_file = out_dir / f'{year}_{kind}.json'
        print(f'  parsing {slug}/{pdf.name}...', end=' ', flush=True)
        data = extract_jeongsi_pages(pdf)
        data['slug'] = slug
        data['year'] = int(year)
        data['kind'] = kind
        out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        n = len(data['jeongsi_pages'])
        print(f'{data["total_pages"]}p → 후보 {n}p')
        summary[f'{year}_{kind}'] = {'total': data['total_pages'], 'matched': n}
    return summary


def main():
    args = sys.argv[1:]
    if args:
        slugs = args
    else:
        slugs = [d.name for d in sorted(PDF_ROOT.iterdir()) if d.is_dir()]
    print(f'대상: {slugs}')
    print()
    grand = {}
    for slug in slugs:
        print(f'=== {slug} ===')
        s = parse_slug(slug)
        if s:
            grand[slug] = s
        else:
            print(f'  (no PDFs)')
    print('\n=== 요약 ===')
    for slug, files in grand.items():
        for k, v in files.items():
            print(f'  {slug:<10} {k:<14} {v["total"]:>4}p → {v["matched"]:>3}p')


if __name__ == '__main__':
    main()
