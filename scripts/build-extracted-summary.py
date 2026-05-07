#!/usr/bin/env python3
"""모든 자동 추출 데이터 + universities.json source URL 통합.

input:
- data/universities.json (학교 마스터 list)
- data/admissions/english_grades.json (영어 등급 자동 추출)
- data/admissions/ratios/{slug}/{year}.json (반영비율 자동 추출, SNU 등)

output:
- data/admissions/extracted-summary.json
  학교별 통합 status: pdf 보유 연도, 추출 진행도, fail 사유
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNIV = ROOT / 'data' / 'universities.json'
PDF_ROOT = ROOT / 'data' / 'admissions' / 'pdfs'
PARSED_ROOT = ROOT / 'data' / 'admissions' / 'parsed'
RATIO_ROOT = ROOT / 'data' / 'admissions' / 'ratios'
ENG = ROOT / 'data' / 'admissions' / 'english_grades.json'
OUT = ROOT / 'data' / 'admissions' / 'extracted-summary.json'

# slug 매핑 (universities.json → pdf 디렉토리)
SLUG_MAP = {
    "서울대학교": "snu",
    "연세대학교": "yonsei",
    "고려대학교": "korea",
    "서강대학교": "sogang",
    "성균관대학교": "skku",
    "한양대학교": "hanyang",
    "중앙대학교": "cau",
    "경희대학교": "khu",
    "한국외국어대학교": "hufs",
    "서울시립대학교": "uos",
    "건국대학교": "konkuk",
    "동국대학교": "dongguk",
    "홍익대학교": "hongik",
    "국민대학교": "kookmin",
    "숭실대학교": "ssu",
    "세종대학교": "sejong",
    "단국대학교(죽전)": "dankook",
    "단국대학교(천안)": "dankook_cheonan",
    "고려대학교(세종)": "korea_sejong",
    "연세대학교(미래)": "yonsei_mirae",
    "광운대학교": "kw",
    "명지대학교": "mju",
    "상명대학교": "smu",
    "가톨릭대학교": "catholic",
    "이화여자대학교": "ewha",
    "숙명여자대학교": "sookmyung",
    "동덕여자대학교": "dongduk",
    "서울여자대학교": "swu",
    "서울과학기술대학교": "seoultech",
    "한성대학교": "hansung",
    "서경대학교": "skuniv",
    "인하대학교": "inha",
    "아주대학교": "ajou",
    "가천대학교": "gachon",
    "한양대학교(ERICA)": "hanyang_erica",
    "인천대학교": "inu",
    "한국항공대학교": "kau",
    "부산대학교": "pusan",
    "경북대학교": "knu",
    "전남대학교": "jnu",
    "충남대학교": "cnu",
    "충북대학교": "chungbuk",
    "전북대학교": "jbnu",
    "경상국립대학교": "gnu",
    "강원대학교": "kangwon",
    "제주대학교": "jejunu",
    "UNIST": "unist",
    "GIST": "gist",
    "DGIST": "dgist",
    "울산대학교": "ulsan",
    "원광대학교": "wku",
    "강릉원주대학교": "gwnu",
    "차의과학대학교": "cha",
    "을지대학교": "eulji",
    "영남대학교": "yu",
    "조선대학교": "chosun",
    "계명대학교": "kmu",
    "경기대학교": "kyonggi",
    "순천향대학교": "sch",
    "고신대학교": "kosin",
    "동아대학교": "donga",
}


def main():
    univs = json.loads(UNIV.read_text())['universities']
    eng_data = json.loads(ENG.read_text()) if ENG.exists() else {}
    summary = []
    stats = {'pdf_yes': 0, 'pdf_no': 0, 'eng_extracted': 0, 'ratio_extracted': 0}

    for u in univs:
        slug = SLUG_MAP.get(u['name'], None)
        if not slug:
            # name으로 fallback 추측 — 빈 슬러그
            entry = {
                'name': u['name'],
                'shortName': u.get('shortName'),
                'tier': u.get('tier'),
                'slug': None,
                'pdf_status': 'unknown_slug',
                'pdf_years': [],
                'eng_grades_extracted': False,
                'ratio_extracted': False,
            }
            summary.append(entry)
            continue

        pdf_dir = PDF_ROOT / slug
        years = []
        if pdf_dir.exists():
            for pdf in sorted(pdf_dir.glob('*.pdf')):
                # 2026_guide.pdf -> {year:2026, kind:'guide'}
                m = pdf.stem.split('_', 1)
                if len(m) == 2 and m[0].isdigit():
                    years.append({'year': int(m[0]), 'kind': m[1], 'size': pdf.stat().st_size})
        pdf_status = 'ok' if years else 'missing'
        if pdf_status == 'ok':
            stats['pdf_yes'] += 1
        else:
            stats['pdf_no'] += 1

        eng_yrs = list(eng_data.get(slug, {}).keys())
        if eng_yrs:
            stats['eng_extracted'] += 1

        # ratio 데이터
        ratio_dir = RATIO_ROOT / slug
        ratio_yrs = []
        if ratio_dir.exists():
            for jf in sorted(ratio_dir.glob('*.json')):
                rd = json.loads(jf.read_text())
                n_ratio = sum(1 for e in rd.get('entries', []) if 'ratio' in e)
                if n_ratio > 0:
                    ratio_yrs.append({'year': rd['year'], 'count': n_ratio})
        if ratio_yrs:
            stats['ratio_extracted'] += 1

        entry = {
            'name': u['name'],
            'shortName': u.get('shortName'),
            'tier': u.get('tier'),
            'slug': slug,
            'admissionUrl': u.get('admissionUrl'),
            'pdf_status': pdf_status,
            'pdf_years': years,
            'eng_grades_extracted': bool(eng_yrs),
            'eng_grades_years': eng_yrs,
            'ratio_extracted': bool(ratio_yrs),
            'ratio_data': ratio_yrs,
        }
        summary.append(entry)

    out = {
        'generated': '2026-05-06',
        'stats': stats,
        'total_universities': len(univs),
        'universities': summary,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))

    # CLI 요약
    print(f"=== 자동 수집·추출 요약 ===")
    print(f"전체 대학: {len(univs)}개")
    print(f"PDF 보유: {stats['pdf_yes']}개 / 미보유: {stats['pdf_no']}개")
    print(f"영어 등급 자동 추출: {stats['eng_extracted']}개")
    print(f"반영비율 자동 추출: {stats['ratio_extracted']}개")
    print()
    print("=== PDF 미보유 학교 (수동 다운로드 필요) ===")
    for e in summary:
        if e.get('pdf_status') == 'missing':
            print(f"  {e['name']:<20} ({e.get('admissionUrl', 'no URL')})")
    print()
    print(f"output: {OUT}")


if __name__ == '__main__':
    main()
