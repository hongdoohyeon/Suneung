#!/usr/bin/env python3
"""data/kice-archive-new-items.json 의 subSubject 정제.

KICE 자료마당 게시글 제목에서 추출한 subSubject 가
'200606사회탐구경제영역' 같은 YYYYMM+영역접미사 형태로 들어와 있음.
이를 표준화 — YYYYMM 제거, '영역' 접미사 제거, subject 중복 제거,
수학 '수리(가형)' → '가형' 등 정규화.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / 'data' / 'kice-archive-new-items.json'

PREFIX_YYMM = re.compile(r'^\d{6}')


def clean(sub: str | None, subject: str) -> str | None:
    if not sub:
        return None
    s = sub.strip()

    # 1) 앞쪽 YYYYMM 제거
    s = PREFIX_YYMM.sub('', s).strip()
    # 2) '영역' 접미사 제거 (중간/끝 모두)
    s = s.replace('영역', '').strip()

    # 3) subject별 정규화
    if subject == '수학':
        # '수리(가형)' '수리가형' '수리(나형)' '수리나' → '가형'/'나형'
        m = re.match(r'^수리\(?(가|나)형?\)?$', s)
        if m:
            s = m.group(1) + '형'
        elif s in ('수리', '수리가', '수리나'):
            s = {'수리': '', '수리가': '가형', '수리나': '나형'}[s]
    elif subject == '국어':
        # '언어' 단독 → 영역명이라 의미 없음. null
        if s == '언어':
            return None
    elif subject == '영어':
        if s in ('외국어',):
            return None
    elif subject == '제2외국어':
        # '제2외국어(독일어I)' → '독일어I'
        m = re.match(r'^제2외국어\(?([^)]+)\)?$', s)
        if m:
            s = m.group(1)

    # 4) subject 로 시작하는 접두 제거 ('사회탐구경제' → '경제')
    if s.startswith(subject) and len(s) > len(subject):
        s = s[len(subject):].strip()

    # 4-1) 약어 접두 제거 (사탐/과탐/직탐)
    SUBJ_ABBR = {
        '사회탐구': '사탐',
        '과학탐구': '과탐',
        '직업탐구': '직탐',
    }
    abbr = SUBJ_ABBR.get(subject)
    if abbr and s.startswith(abbr) and len(s) > len(abbr):
        s = s[len(abbr):].strip()

    # 4-2) 로마자(I/II) → 유니코드(Ⅰ/Ⅱ) 통일
    s = s.replace('II', 'Ⅱ').replace('I', 'Ⅰ')
    # 아라비아 숫자 뒤 (물리1, 화학2) → 로마 (Ⅰ/Ⅱ)
    s = re.sub(r'(물리|화학|생물|생명과학|지구과학)1$', r'\1Ⅰ', s)
    s = re.sub(r'(물리|화학|생물|생명과학|지구과학)2$', r'\1Ⅱ', s)
    # 생물 → 생명과학 통일 (옛 표기)
    s = re.sub(r'^생물(Ⅰ|Ⅱ)$', r'생명과학\1', s)
    # 제2외국어 표기 통일 (독일어1/독일어I → 독일어) — 옛 자료엔 Ⅰ만 존재했으므로 접미 제거
    if subject == '제2외국어':
        # 순수 숫자(연도 등) 제거
        if re.fullmatch(r'\d+', s):
            return None
        # '독일어1' → '독일어'
        s = re.sub(r'^(.+?)[1IⅠ]$', r'\1', s)

    # 5) subject 와 같거나 빈 문자열이면 null
    if not s or s == subject:
        return None

    return s


def main():
    items = json.loads(SRC.read_text(encoding='utf-8'))
    changed = 0
    for it in items:
        old = it.get('subSubject')
        new = clean(old, it.get('subject', ''))
        if new != old:
            it['subSubject'] = new
            changed += 1

    SRC.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'정제 완료: {changed}/{len(items)}건 subSubject 갱신')

    # 정제 후 unique 값 (config 보강 참고용)
    by = {}
    for i in items:
        by.setdefault(i['subject'], set()).add(i.get('subSubject'))
    print('\n정제 후 subject별 subSubject (config.js 반영 참고):')
    for sub in sorted(by):
        vals = sorted(s for s in by[sub] if s)
        print(f"  {sub}: {vals}")


if __name__ == '__main__':
    main()
