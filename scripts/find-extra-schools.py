#!/usr/bin/env python3
"""bf 결과 PDF 중 universities.json에 없는 학교 식별.

universities.json에 등록된 60개 외에도 megastudy bf로 발견된 학교들
(약 80~100개) 중 인지도 있는 학교 후보 list 추출.

output: data/admissions/extra-schools.json
"""
from __future__ import annotations
import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
BF_DIRS = [Path('/tmp/megastudy_bf'), Path('/tmp/megastudy_bf2')]
OUT = ROOT / 'data' / 'admissions' / 'extra-schools.json'

# universities.json 학교명 (중복 캠퍼스 포함)
EXISTING_NAMES = set()


def detect_school_name(pdf_path: Path) -> str | None:
    """첫 페이지 텍스트에서 명시적 학교명 검출."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ''
            for page in pdf.pages[:2]:
                text += (page.extract_text() or '') + '\n'
                if len(text) > 2000:
                    break
    except Exception:
        return None
    # "OO대학교" 또는 "OO대" 패턴 — 가장 처음 등장 + 가장 길게
    matches = re.findall(r'([가-힣A-Z]{2,15}(?:대학교|대학|과학기술원|교육대학교))', text[:1000])
    if matches:
        # 빈도 + 길이 순
        from collections import Counter
        c = Counter(matches)
        # 빈도 높은 + 텍스트 시작 가까이
        sorted_m = sorted(c.items(), key=lambda x: (-x[1], -len(x[0])))
        return sorted_m[0][0]
    return None


def main():
    # universities.json 등록 학교
    univs = json.loads((ROOT / 'data' / 'universities.json').read_text())['universities']
    for u in univs:
        # name + shortName + 캠퍼스 표기 모두
        EXISTING_NAMES.add(u['name'])
        EXISTING_NAMES.add(u.get('shortName', ''))
        # 캠퍼스 표기 제거 변형
        clean = re.sub(r'\([^)]+\)', '', u['name']).strip()
        EXISTING_NAMES.add(clean)

    # bf 모든 PDF 검색
    code_to_school = {}
    for bf_dir in BF_DIRS:
        if not bf_dir.exists():
            continue
        for pdf in sorted(bf_dir.glob('X26E*.pdf')):
            m = re.match(r'X26E(\d{5})\.pdf', pdf.name)
            if not m: continue
            code = m.group(1)
            if code in code_to_school: continue
            name = detect_school_name(pdf)
            if not name: continue
            code_to_school[code] = name

    # universities.json에 없는 학교만
    extra = []
    for code, name in sorted(code_to_school.items()):
        if name in EXISTING_NAMES:
            continue
        # 또는 "OO대학교" 변형이 EXISTING에 있는지
        clean = name.replace('대학교', '').replace('대학', '').strip()
        if any(clean in n for n in EXISTING_NAMES if n):
            continue
        extra.append({'code': code, 'name': name})

    OUT.write_text(json.dumps({
        'description': 'megastudy bf로 발견된 universities.json 외 학교 후보',
        'total_bf_pdfs': len(code_to_school),
        'existing_in_univ_json': len(code_to_school) - len(extra),
        'extra_count': len(extra),
        'extra': extra,
    }, ensure_ascii=False, indent=2))

    print(f'bf PDF: {len(code_to_school)}개')
    print(f'universities.json 매칭: {len(code_to_school) - len(extra)}')
    print(f'추가 학교 후보: {len(extra)}')
    for e in extra[:30]:
        print(f'  X26E{e["code"]}: {e["name"]}')
    if len(extra) > 30:
        print(f'  ... ({len(extra)-30}개 더)')


if __name__ == '__main__':
    main()
