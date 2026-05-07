#!/usr/bin/env python3
"""정시 후보 페이지에서 가산/감점/한국사 정책 텍스트 추출.

학교마다 표현이 다양해서 — 라인 전체 추출 후 카테고리 분류.
output: data/admissions/policies.json
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED_ROOTS = [
    ROOT / 'data' / 'admissions' / 'parsed',
    ROOT / 'data' / 'admissions' / 'parsed-extra',
]
TABLES_ROOTS = [
    ROOT / 'data' / 'admissions' / 'tables',
    ROOT / 'data' / 'admissions' / 'tables-extra',
]
OUT = ROOT / 'data' / 'admissions' / 'policies.json'

# 카테고리 분류 키워드
CATEGORIES = [
    ('math_pick', re.compile(r'(미적분|기하|확률과\s?통계).*?(가산|필수|응시자)')),
    ('tamgu_bonus', re.compile(r'(과학\s?탐구|과탐|사회\s?탐구|사탐|직업\s?탐구).*?(가산|\d+\s*%|\+\s*\d)')),
    ('hanguksa_deduction', re.compile(r'한국사.*?(감점|등급|가산)')),
    ('english_deduction', re.compile(r'영어\s*영?역?.*?(감점|등급별|환산)')),
    ('foreign_deduction', re.compile(r'(제2외국어|제2\s?외국어|한문).*?(감점|등급)')),
    ('compulsory_subject', re.compile(r'(필수\s?응시|반영\s?과목|선택\s?제한)')),
]


def categorize(line: str) -> list[str]:
    cats = []
    for cat, pat in CATEGORIES:
        if pat.search(line):
            cats.append(cat)
    return cats


def is_relevant(line: str) -> bool:
    """가산/감점/필수/등급 키워드 들어간 의미 있는 라인."""
    line_strip = line.strip()
    if len(line_strip) < 8 or len(line_strip) > 250:
        return False
    has_kw = any(k in line for k in ['가산', '감점', '환산', '필수 응시', '필수응시', '응시자만'])
    has_subj = any(k in line for k in ['수학', '영어', '탐구', '한국사', '과학', '사회', '미적분', '기하', '제2외국어', '국어'])
    return has_kw and has_subj


def extract_policies_for_pdf(parsed_data: dict) -> dict:
    """parsed JSON 한 PDF → 정책 dict."""
    pages = parsed_data.get('jeongsi_pages', [])
    by_category = {}
    raw_lines = []  # 모든 라인 (debug)
    seen = set()
    for p in pages:
        text = p.get('text', '')
        for line in text.split('\n'):
            line = line.strip()
            if not is_relevant(line):
                continue
            cats = categorize(line)
            if not cats:
                continue
            # 중복 제거
            key = (line[:60], tuple(cats))
            if key in seen:
                continue
            seen.add(key)
            for cat in cats:
                by_category.setdefault(cat, []).append({
                    'page': p.get('page'),
                    'text': line,
                })
    # 각 카테고리 길이 제한
    for cat in by_category:
        by_category[cat] = by_category[cat][:10]
    return by_category


def find_hanguksa_table(tables_data: dict) -> list:
    """한국사 등급표."""
    out = []
    for e in tables_data.get('eng_tables', []):
        label = e.get('label', '')
        if '한국사' in label or '한국' in label:
            out.append(e)
    return out


def main():
    summary = {}
    # parsed → tables 매핑
    for parsed_root, tables_root in zip(PARSED_ROOTS, TABLES_ROOTS):
        if not parsed_root.exists():
            continue
        for slug_dir in sorted(parsed_root.iterdir()):
            if not slug_dir.is_dir():
                continue
            slug = slug_dir.name
            # 가장 최근 연도
            jf_list = sorted(slug_dir.glob('2026_*.json'), reverse=True) or sorted(slug_dir.glob('*.json'), reverse=True)
            if not jf_list:
                continue
            jf = jf_list[0]
            data = json.loads(jf.read_text())
            policies = extract_policies_for_pdf(data)
            # tables에서 한국사
            tf = tables_root / slug / f'{jf.stem}.json'
            if tf.exists():
                tdata = json.loads(tf.read_text())
                hk = find_hanguksa_table(tdata)
                if hk:
                    policies['hanguksa_table'] = hk
            if policies:
                summary[slug] = policies
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    cat_count = {}
    for slug, pols in summary.items():
        for k in pols:
            cat_count[k] = cat_count.get(k, 0) + 1
    print(f'wrote {OUT}')
    print(f'학교 수: {len(summary)}')
    for k, v in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {k}: {v}개 학교')


if __name__ == '__main__':
    main()
