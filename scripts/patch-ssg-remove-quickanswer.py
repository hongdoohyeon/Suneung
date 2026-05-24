#!/usr/bin/env python3
"""SSG (exam-N.html / exam-set-*.html) 에서 빠답 카드 + '빠답·통계' 탭 라벨 제거.

build 를 새로 돌리지 않고도 즉시 반영하기 위한 일회성 patch.
다음 build-data.py 실행 시에도 동일 결과가 나오므로 멱등.
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 1) 탭 라벨: "빠답 · 통계" → "등급컷"
PAT_TAB = re.compile(r'aria-controls="paneI">빠답 · 통계</button>')
SUB_TAB = 'aria-controls="paneI">등급컷</button>'

# 2) 탭 힌트 줄 통째로 제거 (앞뒤 공백 라인 포함)
PAT_HINT = re.compile(
    r'\n\s*<p class="exam__tabs-hint">\'빠답 · 통계\' 탭에는 정답이 포함돼요</p>\n'
)

# 3) quickAnswers section 통째로 제거 (head + body + 빈 줄)
PAT_QA = re.compile(
    r'\n\s*<section class="exam-card" id="quickAnswers">'
    r'.*?</section>\n\s*\n',
    re.DOTALL,
)

# 4) "등급 분포" 카드 제목 → "등급컷"
PAT_TITLE = re.compile(
    r'(<section class="exam-card" id="gradeDist">\s*<header class="exam-card__head">\s*<h3 class="exam-card__title">)'
    r'등급 분포'
    r'(</h3>)'
)

# 5) JSON-LD keywords 배열에서 "빠른정답" 토큰 제거 (앞 콤마 함께)
PAT_KW = re.compile(r',"빠른정답"')


def patch(text: str) -> tuple[str, bool]:
    orig = text
    text = PAT_TAB.sub(SUB_TAB, text)
    text = PAT_HINT.sub('\n', text)
    text = PAT_QA.sub('\n        ', text)
    text = PAT_TITLE.sub(r'\1등급컷\2', text)
    text = PAT_KW.sub('', text)
    return text, text != orig


def main() -> int:
    write = '--write' in sys.argv
    targets = list(ROOT.glob('exam-*.html'))
    changed = 0
    for f in targets:
        try:
            text = f.read_text(encoding='utf-8')
        except Exception as e:
            print(f'  skip {f.name}: {e}', file=sys.stderr)
            continue
        new, did = patch(text)
        if did:
            changed += 1
            if write:
                f.write_text(new, encoding='utf-8')

    print(f'scanned: {len(targets)} files')
    print(f'changed: {changed} files')
    if not write:
        print('(dry-run — pass --write to apply)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
