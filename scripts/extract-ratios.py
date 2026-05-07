#!/usr/bin/env python3
"""parsed JSON → 정시 반영비율 구조화 데이터 추출.

각 PDF 파싱 결과(jeongsi_pages)에서 다음 정보를 뽑아 JSON 출력:
- 전형명 (지역균형전형/일반전형/...)
- 모집단위 (인문대학 인문계열/...)
- 수능 영역별 반영비율 (국어/수학/영어/탐구 비율)
- 영어 등급별 감점/환산
- 탐구 가산점

추출 로직은 학교마다 다르므로 slug별로 다른 매처 함수를 쓴다.
일단 SNU 패턴 한정.

실행:
    python3 scripts/extract-ratios.py snu
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED_ROOT = ROOT / 'data' / 'admissions' / 'parsed'
OUT_ROOT = ROOT / 'data' / 'admissions' / 'ratios'

# "영역별 상대 반영비율" + 다음 헤더 + 비율 라인
RATIO_PATTERN = re.compile(
    r'영역별 ?[가-힣]*\s*반영\s*비율'
    r'.*?'
    r'영역\s+([^\n]+)\n'
    r'[가-힣\s]*반영\s*비율\s+([\d\s\.]+)',
    re.DOTALL,
)

# 영어 등급 환산표 — "등급 1 2 ... 9" 다음 줄 "감점 ..."
ENGLISH_PATTERN = re.compile(
    r'등급\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s*\n'
    r'(?:감점|점수|환산점수|반영점수)\s+([\d\s\.\-]+)'
)


def parse_ratio_line(header: str, values: str) -> dict | None:
    """'영역 국어 수학 사회/과학...' + '100 120 80' → dict."""
    cols = re.split(r'\s+', header.strip())
    nums = re.split(r'\s+', values.strip())
    if len(cols) != len(nums):
        return None
    out = {}
    for c, n in zip(cols, nums):
        try:
            v = float(n)
        except ValueError:
            return None
        # 표준 키 매핑
        if '국어' in c:
            out['korean'] = v
        elif '수학' in c:
            out['math'] = v
        elif '영어' in c:
            out['english'] = v
        elif '탐구' in c:
            out['tamgu'] = v
        elif '한국사' in c:
            out['hanguksa'] = v
        else:
            out[c] = v
    return out


def extract_year_data(slug: str, year: int, parsed: dict) -> dict:
    """단일 PDF parsed JSON → ratio entries."""
    entries = []
    cur_track = None  # 현재 전형(Ⅰ 지역균형/Ⅱ 일반/...) 추적
    for p in parsed['jeongsi_pages']:
        text = p['text']
        # 페이지 시작 부근에 전형명이 있으면 갱신
        head = text[:300]
        m = re.search(r'(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|1\.|2\.|3\.)\s*수능위주전형\s*\(([^)]+)\)', head)
        if m:
            cur_track = m.group(2).strip()

        # 반영비율 매칭
        for m in RATIO_PATTERN.finditer(text):
            header, values = m.group(1), m.group(2)
            ratio = parse_ratio_line(header, values)
            if ratio:
                # 이 매칭 앞쪽 200자에서 모집단위 추출 시도
                start = max(0, m.start() - 800)
                preceding = text[start:m.start()]
                # 모집단위는 보통 "전형요소 및 배점" 표 또는 "자연계열/인문계열" 라벨
                unit = extract_admission_unit(preceding)
                entries.append({
                    'page': p['page'],
                    'track': cur_track,
                    'unit': unit,
                    'ratio': ratio,
                })

        # 영어 등급별 점수
        for m in ENGLISH_PATTERN.finditer(text):
            grades = re.split(r'\s+', m.group(1).strip())
            if len(grades) == 9:
                try:
                    eng = [float(g) for g in grades]
                    entries.append({
                        'page': p['page'],
                        'track': cur_track,
                        'english_grades': eng,
                    })
                except ValueError:
                    pass

    return {
        'slug': slug,
        'year': year,
        'kind': parsed.get('kind'),
        'entries': entries,
    }


def extract_admission_unit(preceding: str) -> str | None:
    """앞 텍스트에서 모집단위/계열 추출."""
    # 마지막 "인문계열|자연계열|예체능계열" 또는 "OO대학 OO계열" 매칭
    m_list = list(re.finditer(
        r'([가-힣]+대학(?:\s*[가-힣]+(?:계열|학부|학과))?'
        r'|인문계열|자연계열|예체능계열|일반계열|광역)',
        preceding,
    ))
    if m_list:
        return m_list[-1].group(1)
    return None


def main():
    args = sys.argv[1:]
    if args:
        slugs = args
    else:
        slugs = [d.name for d in sorted(PARSED_ROOT.iterdir()) if d.is_dir()]
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        slug_dir = PARSED_ROOT / slug
        if not slug_dir.exists():
            print(f'  {slug}: parsed 없음, skip')
            continue
        print(f'=== {slug} ===')
        out_slug = OUT_ROOT / slug
        out_slug.mkdir(parents=True, exist_ok=True)
        for jf in sorted(slug_dir.glob('*.json')):
            parsed = json.loads(jf.read_text())
            year = parsed['year']
            data = extract_year_data(slug, year, parsed)
            (out_slug / f'{year}.json').write_text(
                json.dumps(data, ensure_ascii=False, indent=2)
            )
            n_ratio = sum(1 for e in data['entries'] if 'ratio' in e)
            n_eng = sum(1 for e in data['entries'] if 'english_grades' in e)
            print(f'  {year}: ratio {n_ratio}건, 영어 {n_eng}건')


if __name__ == '__main__':
    main()
