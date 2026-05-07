#!/usr/bin/env python3
"""pdfs-extra (universities.json 외 50개 학교) 통합 빌더.

extra-schools.json + tables-extra → universities-extras-merged.json
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRAS = ROOT / 'data' / 'admissions' / 'extra-schools.json'
TABLES_EXTRA = ROOT / 'data' / 'admissions' / 'tables-extra'
PDFS_EXTRA = ROOT / 'data' / 'admissions' / 'pdfs-extra'
OUT = ROOT / 'data' / 'admissions' / 'universities-extras-merged.json'


def is_valid_ratio(ratios: dict) -> bool:
    vals = [v for v in ratios.values() if isinstance(v, (int, float))]
    if len(vals) < 3:
        return False
    total = sum(vals)
    if 80 <= total <= 120 or 800 <= total <= 1200:
        return True
    return False


def is_valid_eng_grades(grades: dict) -> bool:
    vals = list(grades.values())
    if len(vals) < 7:
        return False
    if all(v == 0 for v in vals):
        return False
    return True


def load_tables_dir(slug_dir: Path) -> dict:
    """학교 tables 디렉토리 → years dict."""
    out = {}
    for jf in sorted(slug_dir.glob('*.json')):
        m = jf.stem.split('_', 1)
        if not m or not m[0].isdigit():
            continue
        out[m[0]] = json.loads(jf.read_text())
    return out


def main():
    extras_data = json.loads(EXTRAS.read_text())
    extras_list = extras_data.get('extra', [])
    code_to_name = {e['code']: e['name'] for e in extras_list}

    out_universities = []
    n_eng = 0
    n_ratio = 0
    for slug_dir in sorted(PDFS_EXTRA.iterdir()):
        if not slug_dir.is_dir():
            continue
        slug = slug_dir.name
        # extract code from slug name (extra_NNNNN_xxx or fixed name)
        code = None
        if slug.startswith('extra_'):
            parts = slug.split('_', 2)
            if len(parts) >= 2:
                code = parts[1]
        # 학교명
        name = code_to_name.get(code) if code else None
        # 알려진 slug → 학교명 매핑
        FIXED_NAMES = {
            'duksung': '덕성여자대학교', 'snue': '서울교육대학교',
            'sungshin': '성신여자대학교', 'anyang': '안양대학교',
            'ktech': '한국공학대학교', 'hansei': '한세대학교',
            'kongju': '국립공주대학교', 'hanbat': '국립한밭대학교',
            'jnue': '전주교육대학교', 'gnue': '광주교육대학교',
            'kentech': '한국에너지공과대학교', 'kumoh': '국립금오공과대학교',
            'handong': '한동대학교', 'bnue': '부산교육대학교',
            'gnue_jinju': '진주교육대학교',
        }
        if not name:
            name = FIXED_NAMES.get(slug, slug)

        # tables-extra/{slug} 데이터
        tables_dir = TABLES_EXTRA / slug
        all_years = load_tables_dir(tables_dir) if tables_dir.exists() else {}

        # 추출 데이터 정리
        eng_list = []
        ratio_list = []
        by_year = {}
        for yr, ydata in all_years.items():
            ye = []
            yr_l = []
            for e in ydata.get('eng_tables', []):
                if not e.get('grades') or not is_valid_eng_grades(e['grades']):
                    continue
                ye.append({'label': e.get('label', '')[:60], 'grades': e['grades'], 'page': e.get('page')})
            for r in ydata.get('ratio_tables', []):
                if not r.get('ratios') or not is_valid_ratio(r['ratios']):
                    continue
                yr_l.append({'label': r.get('label', '')[:60], 'ratios': r['ratios'], 'page': r.get('page')})
            if ye or yr_l:
                by_year[yr] = {'eng': ye, 'ratio': yr_l}
            # 가장 최근 연도 추출 데이터를 엔트리로
            if not eng_list and ye:
                eng_list = ye
            if not ratio_list and yr_l:
                ratio_list = yr_l

        # PDF 보유 연도
        pdf_years = sorted(p.stem.split('_')[0] for p in slug_dir.glob('*.pdf') if p.stem.split('_')[0].isdigit())

        if eng_list: n_eng += 1
        if ratio_list: n_ratio += 1

        out_universities.append({
            'name': name,
            'slug': slug,
            'megastudy_code': code,
            'pdf_years': pdf_years,
            'extracted': {
                'english_grades': eng_list,
                'ratios': ratio_list,
                'by_year': by_year,
                'has_data': bool(eng_list or ratio_list),
            },
        })

    out = {
        '_meta': {
            'description': 'megastudy로 발견된 universities.json 외 추가 학교 데이터.',
            'generated': '2026-05-06',
            'stats': {
                'total': len(out_universities),
                'with_eng': n_eng,
                'with_ratio': n_ratio,
            },
            'note': 'universities.json에 등록된 60개 외 학교들. 사용자가 검토 후 universities.json에 추가 결정.',
        },
        'universities': out_universities,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f'OUT: {OUT}')
    print(f'  total: {len(out_universities)}')
    print(f'  with_eng: {n_eng}')
    print(f'  with_ratio: {n_ratio}')


if __name__ == '__main__':
    main()
