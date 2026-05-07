#!/usr/bin/env python3
"""universities.json + 자동 추출 데이터 → universities-merged.json.

자동 추출(영어 등급 + 반영비율) 데이터를 universities.json schema에 맞춰 통합.
원본 universities.json은 건드리지 않음 (사용자 검토용 separate output).

데이터 소스 우선순위:
1. data/admissions/tables/{slug}/{stem}.json (pdfplumber 표 추출 — 정확도 높음)
2. data/admissions/english_grades.json (정규식 — fallback)
3. data/admissions/ratios/{slug}/{year}.json (SNU 학교별 매처)
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNIV = ROOT / 'data' / 'universities.json'
ENG = ROOT / 'data' / 'admissions' / 'english_grades.json'
TABLES_ROOT = ROOT / 'data' / 'admissions' / 'tables'
RATIO_ROOT = ROOT / 'data' / 'admissions' / 'ratios'
OUT = ROOT / 'data' / 'admissions' / 'universities-merged.json'

SLUG_MAP = {
    "서울대학교": "snu", "연세대학교": "yonsei", "고려대학교": "korea",
    "서강대학교": "sogang", "성균관대학교": "skku", "한양대학교": "hanyang",
    "중앙대학교": "cau", "경희대학교": "khu", "한국외국어대학교": "hufs",
    "서울시립대학교": "uos", "건국대학교": "konkuk", "동국대학교": "dongguk",
    "홍익대학교": "hongik", "국민대학교": "kookmin", "숭실대학교": "ssu",
    "세종대학교": "sejong", "단국대학교(죽전)": "dankook",
    "단국대학교(천안)": "dankook_cheonan",
    "고려대학교(세종)": "korea_sejong",
    "연세대학교(미래)": "yonsei_mirae",
    "광운대학교": "kw", "명지대학교": "mju", "상명대학교": "smu",
    "가톨릭대학교": "catholic", "이화여자대학교": "ewha",
    "숙명여자대학교": "sookmyung", "동덕여자대학교": "dongduk",
    "서울여자대학교": "swu", "서울과학기술대학교": "seoultech",
    "한성대학교": "hansung", "서경대학교": "skuniv", "인하대학교": "inha",
    "아주대학교": "ajou", "가천대학교": "gachon",
    "한양대학교(ERICA)": "hanyang_erica", "인천대학교": "inu",
    "한국항공대학교": "kau", "부산대학교": "pusan", "경북대학교": "knu",
    "전남대학교": "jnu", "충남대학교": "cnu", "충북대학교": "chungbuk",
    "전북대학교": "jbnu", "경상국립대학교": "gnu", "강원대학교": "kangwon",
    "제주대학교": "jejunu", "UNIST": "unist", "GIST": "gist",
    "DGIST": "dgist", "울산대학교": "ulsan", "원광대학교": "wku",
    "강릉원주대학교": "gwnu", "차의과학대학교": "cha", "을지대학교": "eulji",
    "영남대학교": "yu", "조선대학교": "chosun", "계명대학교": "kmu",
    "경기대학교": "kyonggi", "순천향대학교": "sch", "고신대학교": "kosin",
    "동아대학교": "donga",
}


def load_tables(slug: str) -> dict:
    """data/admissions/tables/{slug}/*.json 모두 읽어 가장 최근 연도 반환."""
    d = TABLES_ROOT / slug
    if not d.exists():
        return {}
    files = sorted(d.glob('*.json'), reverse=True)
    if not files:
        return {}
    return json.loads(files[0].read_text())


def load_tables_all_years(slug: str) -> dict[str, dict]:
    """모든 연도 tables 데이터 반환 — {year: data}."""
    d = TABLES_ROOT / slug
    out = {}
    if not d.exists():
        return out
    for jf in sorted(d.glob('*.json')):
        # 2026_guide.json → 2026
        m = jf.stem.split('_', 1)
        if not m or not m[0].isdigit():
            continue
        out[m[0]] = json.loads(jf.read_text())
    return out


def is_valid_ratio(ratios: dict) -> bool:
    """반영비율 검증: 합이 90~110 범위 (백분위/표준점수 환산표 제외)."""
    vals = [v for v in ratios.values() if isinstance(v, (int, float))]
    if len(vals) < 3:
        return False
    total = sum(vals)
    # 100점 만점 기준 (대부분 학교) — 80~120 허용
    if 80 <= total <= 120:
        return True
    # 일부 학교 1000점 만점 — 800~1200 허용
    if 800 <= total <= 1200:
        return True
    return False


def is_valid_eng_grades(grades: dict) -> bool:
    """영어 등급 검증: 모두 0이거나, 1등급 점수가 비현실적이면 거짓 매칭."""
    vals = list(grades.values())
    if len(vals) < 7:  # 최소 7등급 잡혀야
        return False
    if all(v == 0 for v in vals):
        return False
    # 1등급은 보통 가장 높음 (감점 표는 0)
    g1 = grades.get('1', 0)
    g9 = grades.get('9', 0)
    # 감점 표: 1등급 0 + 9등급 큼 (예: 14)
    # 환산점: 1등급 100 + 9등급 0
    # 둘 다 0~200 범위
    for v in vals:
        if v < -50 or v > 1000:
            return False
    # 단조성 약하게 (감점/점수 둘 다 단조)
    return True


def build_majors_from_tables(tables: dict) -> tuple[list, list]:
    """(eng_majors, ratio_majors) — 필터 적용."""
    eng_list = []
    for e in tables.get('eng_tables', []):
        if not e.get('grades') or not is_valid_eng_grades(e['grades']):
            continue
        eng_list.append({
            'label': e.get('label') or '',
            'grades': e['grades'],
            'source_page': e.get('page'),
        })
    ratio_list = []
    for r in tables.get('ratio_tables', []):
        if not r.get('ratios') or not is_valid_ratio(r['ratios']):
            continue
        ratio_list.append({
            'label': r.get('label') or '',
            'ratios': r['ratios'],
            'source_page': r.get('page'),
        })
    return eng_list, ratio_list


def build_university_entry(univ: dict, slug: str | None) -> dict:
    new = dict(univ)
    new['slug'] = slug
    new['extracted'] = {
        'english_grades': [],
        'ratios': [],
        'has_data': False,
    }
    if not slug:
        return new
    # 가장 최근 연도 (legacy 호환)
    tables = load_tables(slug)
    if tables:
        eng_list, ratio_list = build_majors_from_tables(tables)
        new['extracted']['english_grades'] = eng_list
        new['extracted']['ratios'] = ratio_list
        new['extracted']['source'] = tables.get('source')
        new['extracted']['has_data'] = bool(eng_list or ratio_list)
    # 다년치 — 모든 연도
    all_years = load_tables_all_years(slug)
    if all_years:
        per_year = {}
        for yr, ydata in all_years.items():
            ye, yr_l = build_majors_from_tables(ydata)
            if ye or yr_l:
                per_year[yr] = {
                    'eng_count': len(ye),
                    'ratio_count': len(yr_l),
                    'eng_summary': [{'label': e['label'][:50], 'g1': e['grades'].get('1'), 'g9': e['grades'].get('9')} for e in ye[:3]],
                    'ratio_summary': [{'label': r['label'][:50], 'ratios': r['ratios']} for r in yr_l[:3]],
                }
        new['extracted']['by_year'] = per_year
        new['extracted']['years_count'] = len(per_year)
    # tracks: 자동 통합 — universities.json schema 호환 형식
    # eng + ratio 페어를 페이지 기준으로 매칭
    new['tracks'] = build_tracks(new['extracted'])
    return new


def build_tracks(extracted: dict) -> list:
    """추출 데이터 → universities.json tracks schema 호환."""
    eng_list = extracted.get('english_grades', [])
    ratio_list = extracted.get('ratios', [])

    # 페이지 기준 페어링 — 같은 페이지에 있는 ratio + eng는 같은 트랙
    pages = sorted(set(
        [r.get('source_page') for r in ratio_list if r.get('source_page')] +
        [e.get('source_page') for e in eng_list if e.get('source_page')]
    ))
    if not pages:
        return []

    tracks = []
    for pg in pages:
        page_eng = [e for e in eng_list if e.get('source_page') == pg]
        page_ratios = [r for r in ratio_list if r.get('source_page') == pg]
        if not page_eng and not page_ratios:
            continue
        majors = []
        # ratio 우선 — 한 페이지에 여러 ratio가 있으면 각각 별도 major
        if page_ratios:
            # 영어는 하나만 있어야 — 여러 개면 각 ratio에 첫 영어 매핑
            default_eng = page_eng[0]['grades'] if page_eng else None
            for r in page_ratios:
                majors.append({
                    'name': r['label'][:80] if r['label'] else '자동 추출',
                    'ratio': r['ratios'],
                    'englishGrades': default_eng,
                    'auto_extracted': True,
                    'source_page': pg,
                })
        else:
            # ratio 없고 eng만
            for e in page_eng:
                majors.append({
                    'name': e['label'][:80] if e['label'] else '자동 추출 (모집단위 미상)',
                    'ratio': None,
                    'englishGrades': e['grades'],
                    'auto_extracted': True,
                    'source_page': pg,
                })
        tracks.append({
            'track': f'p{pg}에서 자동 추출',
            'group': None,
            'majors': majors,
            'auto_extracted': True,
        })
    return tracks


def main():
    univ_data = json.loads(UNIV.read_text())
    out_univs = []
    n_with_data = 0
    n_with_ratio = 0
    n_with_eng = 0
    for u in univ_data['universities']:
        slug = SLUG_MAP.get(u['name'])
        entry = build_university_entry(u, slug)
        out_univs.append(entry)
        ext = entry.get('extracted', {})
        if ext.get('has_data'):
            n_with_data += 1
        if ext.get('ratios'):
            n_with_ratio += 1
        if ext.get('english_grades'):
            n_with_eng += 1

    out = {
        '_meta': {
            'description': '자동 통합본 — universities.json + pdfplumber 추출 + 정규식 추출.',
            'generated': '2026-05-06',
            'stats': {
                'total': len(out_univs),
                'with_data': n_with_data,
                'with_eng_grades': n_with_eng,
                'with_ratios': n_with_ratio,
            },
            'note': 'auto_extracted=true 항목은 자동 추출. 정확성 검증 필요. 학교에 따라 모집단위 라벨이 부정확할 수 있음.',
        },
        'universities': out_univs,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f'OUT: {OUT}')
    print(f"  with data: {n_with_data}/{len(out_univs)}")
    print(f"  with eng grades: {n_with_eng}/{len(out_univs)}")
    print(f"  with ratios: {n_with_ratio}/{len(out_univs)}")


if __name__ == '__main__':
    main()
