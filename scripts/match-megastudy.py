#!/usr/bin/env python3
"""/tmp/megastudy_bf/X26E*.pdf → 학교명 식별 → slug 매핑.

각 PDF 1페이지 텍스트에서 학교명 검출 후
1. 우리 universities.json에 있는 학교면 data/admissions/pdfs/{slug}/2026_guide.pdf 로 저장 (덮어쓰기 금지)
2. 다년치 X25E/X24E/X23E/X22E도 함께 다운로드
3. 없으면 별도 list로 출력 (universities.json 확장 후보)
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / 'data' / 'admissions' / 'pdfs'
BF_DIR = Path('/tmp/megastudy_bf')

# 학교명 → slug (universities.json 기반)
NAME_SLUG = {
    "서울대학교": "snu", "연세대학교": "yonsei", "고려대학교": "korea",
    "서강대학교": "sogang", "성균관대학교": "skku", "한양대학교": "hanyang",
    "중앙대학교": "cau", "경희대학교": "khu", "한국외국어대학교": "hufs",
    "외국어대학교": "hufs", "외대": "hufs",
    "서울시립대학교": "uos", "시립대학교": "uos",
    "건국대학교": "konkuk", "동국대학교": "dongguk",
    "홍익대학교": "hongik", "국민대학교": "kookmin", "숭실대학교": "ssu",
    "세종대학교": "sejong", "광운대학교": "kw", "명지대학교": "mju",
    "상명대학교": "smu", "가톨릭대학교": "catholic", "이화여자대학교": "ewha",
    "숙명여자대학교": "sookmyung", "동덕여자대학교": "dongduk",
    "서울여자대학교": "swu", "서울과학기술대학교": "seoultech",
    "한성대학교": "hansung", "서경대학교": "skuniv", "인하대학교": "inha",
    "아주대학교": "ajou", "가천대학교": "gachon",
    "인천대학교": "inu", "한국항공대학교": "kau",
    "부산대학교": "pusan", "경북대학교": "knu", "전남대학교": "jnu",
    "충남대학교": "cnu", "충북대학교": "chungbuk", "전북대학교": "jbnu",
    "경상국립대학교": "gnu", "경상대학교": "gnu",
    "강원대학교": "kangwon", "제주대학교": "jejunu",
    "울산과학기술원": "unist", "UNIST": "unist",
    "광주과학기술원": "gist", "GIST": "gist",
    "대구경북과학기술원": "dgist", "DGIST": "dgist",
    "울산대학교": "ulsan", "원광대학교": "wku",
    "강릉원주대학교": "gwnu", "차의과학대학교": "cha", "을지대학교": "eulji",
    "영남대학교": "yu", "조선대학교": "chosun", "계명대학교": "kmu",
    "경기대학교": "kyonggi", "순천향대학교": "sch", "고신대학교": "kosin",
    "동아대학교": "donga",
    "단국대학교": "dankook",  # 죽전·천안 둘 다
    "한양대학교(ERICA)": "hanyang_erica", "한양대학교 ERICA": "hanyang_erica",
    "ERICA": "hanyang_erica",
    "고려대학교(세종)": "korea_sejong", "고려대 세종": "korea_sejong",
    "연세대학교(미래)": "yonsei_mirae", "연세대 미래": "yonsei_mirae",
    "단국대학교(천안)": "dankook_cheonan",
    "단국대학교(죽전)": "dankook",
}


def detect_school(pdf_path: Path) -> str | None:
    """PDF 첫 1-2 페이지 텍스트에서 학교명 검출."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ''
            for i, page in enumerate(pdf.pages[:2]):
                t = page.extract_text() or ''
                text += t + '\n'
                if len(text) > 2000:
                    break
    except Exception:
        return None
    # NAME_SLUG 키들 중 텍스트에 가장 먼저 또는 가장 길게 매칭되는 것
    best = None
    best_pos = -1
    for name in sorted(NAME_SLUG.keys(), key=lambda x: -len(x)):
        idx = text.find(name)
        if idx >= 0:
            # 캠퍼스 표기 우선 — "단국대학교(천안)" > "단국대학교"
            if best is None or len(name) > len(best):
                best = name
                best_pos = idx
    return best


def main():
    code_to_name = {}
    matched = {}  # slug → code
    unmatched = []
    for pdf in sorted(BF_DIR.glob('X26E*.pdf')):
        m = re.match(r'X26E(\d{5})\.pdf', pdf.name)
        if not m:
            continue
        code = m.group(1)
        name = detect_school(pdf)
        code_to_name[code] = name
        if name:
            slug = NAME_SLUG[name]
            # 이미 매핑된 슬러그면 skip (첫 매칭 우선)
            if slug not in matched:
                matched[slug] = code
                print(f'  X26E{code} → {name} ({slug})')
            else:
                # 다른 캠퍼스/분교일 수도
                print(f'  X26E{code} → {name} (slug={slug}, 이미 {matched[slug]}로 매핑)')
        else:
            unmatched.append(code)

    print(f'\n=== 매핑 결과 ===')
    print(f'매핑 학교: {len(matched)}개')
    print(f'미식별: {len(unmatched)}개')

    # universities.json에 있는 학교 slug 중 매핑 안 된 것
    univs = json.loads((ROOT / 'data' / 'universities.json').read_text())
    all_slugs = set(NAME_SLUG.values())
    missing = all_slugs - set(matched.keys())
    print(f'\n=== universities.json에 있지만 megastudy 매칭 실패 ===')
    for s in sorted(missing):
        print(f'  {s}')

    # 매핑된 학교의 다년치 다운 시도
    print('\n=== 다년치 다운로드 시작 ===')
    saved_count = 0
    for slug, code in matched.items():
        slug_dir = PDF_ROOT / slug
        slug_dir.mkdir(parents=True, exist_ok=True)
        # 2026 (이미 받은 X26E)
        src = BF_DIR / f'X26E{code}.pdf'
        dst = slug_dir / '2026_guide.pdf'
        if not dst.exists() and src.exists():
            shutil.copy(src, dst)
            saved_count += 1
            print(f'  {slug} 2026: 새로 저장 ({src.stat().st_size}B)')
        # 다년치 25/24/23/22
        for yr in ['25', '24', '23', '22']:
            dst_yr = slug_dir / f'20{yr}_guide.pdf'
            if dst_yr.exists():
                continue
            url = f'https://file.megastudy.net/FileServer/UNI_HWP/non_file/{yr}jungsi/X{yr}E{code}.pdf'
            tmp = Path(f'/tmp/_dl_{slug}_{yr}.pdf')
            try:
                subprocess.run(
                    ['curl', '-sL', '--max-time', '15', '-A', 'Mozilla/5.0',
                     '-o', str(tmp), url],
                    timeout=20,
                )
                if tmp.exists():
                    head = tmp.read_bytes()[:4]
                    if head == b'%PDF' and tmp.stat().st_size > 50000:
                        shutil.copy(tmp, dst_yr)
                        saved_count += 1
                        print(f'  {slug} 20{yr}: OK ({tmp.stat().st_size}B)')
                    tmp.unlink(missing_ok=True)
            except Exception:
                pass

    print(f'\n총 새 PDF 저장: {saved_count}개')
    print(f'전체 PDF: {sum(1 for _ in PDF_ROOT.rglob("*.pdf"))}개')


if __name__ == '__main__':
    main()
