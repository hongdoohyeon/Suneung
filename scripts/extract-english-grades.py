#!/usr/bin/env python3
"""모든 parsed PDF에서 영어 등급별 환산점수 표 추출.

대학 정시 모집요강은 거의 다 같은 형식의 영어 등급표를 가짐:
    1등급 2등급 3등급 ... 9등급
    100   95    90  ...   5

학교별로 점수 체계는 다양 (감점/환산/등급별 점수). 일단 raw 9-tuple로 추출.
output: data/admissions/english_grades.json — slug별 후보 환산표 list
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED = ROOT / 'data' / 'admissions' / 'parsed'
OUT = ROOT / 'data' / 'admissions' / 'english_grades.json'

# 패턴 1: "1등급 2등급 3등급 4등급 5등급 6등급 7등급 8등급 9등급\n점수 a b c d e f g h i"
PAT_HDR_LABEL = re.compile(
    r'(?:1등급)\s+(?:2등급)\s+(?:3등급)\s+(?:4등급)\s+(?:5등급)\s+(?:6등급)\s+(?:7등급)\s+(?:8등급)\s+(?:9등급)\s*\n?'
    r'(?:[가-힣\s]+|반영점수|환산점수|점수|감점|등급별\s*점수)?\s*([\d\.\-\s]{15,150})'
)

# 패턴 2: "등급 1 2 3 ... 9\n점수 a b c d e f g h i"
PAT_NUM_HDR = re.compile(
    r'등급\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s*\n?'
    r'(?:[가-힣\s]+|반영점수|환산점수|점수|감점|등급별\s*점수)?\s*([\d\.\-\s]{15,150})'
)


def parse_grades(values_str: str) -> list[float] | None:
    """문자열에서 9개 숫자 추출."""
    nums = re.findall(r'-?\d+(?:\.\d+)?', values_str)
    if len(nums) < 9:
        return None
    try:
        return [float(n) for n in nums[:9]]
    except ValueError:
        return None


def find_track_context(text_before: str) -> str | None:
    """앞 텍스트에서 전형명/계열 추출."""
    # 마지막 매칭이 가장 가까운 것
    matches = list(re.finditer(
        r'(일반전형|학생부종합전형|논술전형|지역균형(?:전형|선발전형)?|기회균형(?:특별전형)?'
        r'|수능(?:위주)?전형|논술우수자전형|특기자전형|실기(?:우수자)?전형'
        r'|인문계열|자연계열|예체능계열|상경계열|의예과)',
        text_before,
    ))
    return matches[-1].group(1) if matches else None


def extract_english_grades(slug: str, jf_path: Path) -> list[dict]:
    data = json.loads(jf_path.read_text())
    out = []
    for p in data['jeongsi_pages']:
        text = p['text']
        # 패턴 1
        for m in PAT_HDR_LABEL.finditer(text):
            grades = parse_grades(m.group(1))
            if grades:
                # 모두 0이면 거짓 매칭 가능
                if any(g != 0 for g in grades):
                    ctx = find_track_context(text[max(0, m.start()-500):m.start()])
                    out.append({
                        'page': p['page'],
                        'pattern': 'hdr_label',
                        'context': ctx,
                        'grades': grades,
                    })
        # 패턴 2
        for m in PAT_NUM_HDR.finditer(text):
            grades = parse_grades(m.group(1))
            if grades and any(g != 0 for g in grades):
                ctx = find_track_context(text[max(0, m.start()-500):m.start()])
                out.append({
                    'page': p['page'],
                    'pattern': 'num_hdr',
                    'context': ctx,
                    'grades': grades,
                })
    # 중복 제거 (같은 페이지 같은 grades)
    seen = set()
    unique = []
    for e in out:
        k = (e['page'], tuple(e['grades']))
        if k not in seen:
            seen.add(k)
            unique.append(e)
    return unique


def main():
    result = {}
    for slug_dir in sorted(PARSED.iterdir()):
        if not slug_dir.is_dir():
            continue
        slug = slug_dir.name
        per_year = {}
        for jf in sorted(slug_dir.glob('*.json')):
            entries = extract_english_grades(slug, jf)
            if entries:
                # 파일명에서 year 추출
                m = re.match(r'(\d{4})_', jf.stem)
                if m:
                    per_year[m.group(1)] = entries
        if per_year:
            result[slug] = per_year

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"학교 {len(result)}개 영어 등급 추출 완료")
    # 학교별 요약
    for slug, years in sorted(result.items()):
        n = sum(len(es) for es in years.values())
        n_yr = len(years)
        print(f"  {slug:<18} {n_yr}년치, 총 {n}건")


if __name__ == '__main__':
    main()
