#!/usr/bin/env python3
"""SUITE 가변 글꼴을 사이트 글자 빈도순 조각으로 나눈다 (2026-10).

통째 파일(536KB)을 받으면 모바일 첫 화면이 글꼴 때문에 수 초 늦는다. 사이트에서 실제로 쓰는 한글은
1천 자 남짓이라, 자주 쓰는 순서로 조각을 나누고 style.css 의 @font-face unicode-range 로
페이지에 나오는 글자의 조각만 받게 한다. 가운뎃점(U+B7)은 SUITE 폭이 넓어 Pretendard 글리프 한 자만 따로 둔다.

실행(로컬, fonttools·brotli 필요):  python3 scripts/build-suite-subsets.py
  → lib/vendor/suite/subset/*.woff2 다시 만들고 style.css 의 suite-subsets 블록을 바꾼다.
새 글자가 많이 늘었을 때만 다시 돌리면 된다(안 돌려도 빠진 글자는 '나머지' 조각에서 받아진다).
"""
import collections
import glob
import re
import subprocess
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'lib/vendor/suite/SUITE-Variable-2.0.4.woff2'          # 원본(직접 쓰지 않음)
DOT_SRC = ROOT / 'lib/vendor/pretendard/woff2/PretendardVariable.subset.91.woff2'
OUT = ROOT / 'lib/vendor/suite/subset'
CSS = ROOT / 'style.css'
HANGUL = range(0xAC00, 0xD7A4)


def site_rank(font_hangul: set[int]) -> list[int]:
    """한글을 '몇 개 문서에 나오나' 순으로. 생성 HTML + 아카이브 목록 + 화면 JS."""
    cnt = collections.Counter()
    files = glob.glob(str(ROOT / '*.html')) + glob.glob(str(ROOT / 'data/archive/*.json')) + glob.glob(str(ROOT / '*.js')) + glob.glob(str(ROOT / 'lib/*.js'))
    for fn in files:
        text = Path(fn).read_text(encoding='utf-8', errors='ignore')
        text = re.sub(r'<script type="application/ld\+json">.*?</script>|<!--.*?-->', '', text, flags=re.S)   # 화면에 안 그려지는 글자 제외
        cnt.update({ord(ch) for ch in text if ord(ch) in font_hangul})
    return [c for c, _ in cnt.most_common()]


def ranges(cps: list[int]) -> str:
    cps = sorted(cps)
    out, start = [], cps[0]
    for a, b in zip(cps, cps[1:] + [None]):
        if b != a + 1:
            out.append(f'U+{start:X}' if start == a else f'U+{start:X}-{a:X}')
            start = b
    return ', '.join(out)


def subset(src: Path, cps: list[int], dest: Path) -> None:
    subprocess.run(['python3', '-m', 'fontTools.subset', str(src), '--unicodes=' + ','.join(f'U+{c:04X}' for c in cps),
                    '--flavor=woff2', '--layout-features=*', f'--output-file={dest}'], check=True)


def main() -> None:
    cmap = sorted(TTFont(SRC).getBestCmap())
    hangul = {c for c in cmap if c in HANGUL}
    ranked = site_rank(hangul)
    rest = [c for c in cmap if c in hangul and c not in set(ranked)]
    slices = {
        's0': [c for c in cmap if c not in hangul and c != 0xB7],      # 영문·숫자·기호·자모
        'h1': ranked[:250],                                            # 대부분 페이지가 여기까지
        'h2': ranked[250:500],
        'h3': ranked[500:],
        'h4': rest[:len(rest) // 2],                                   # 사이트에 아직 안 나온 글자(입력창 등)
        'h5': rest[len(rest) // 2:],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.woff2'):
        old.unlink()
    faces = []
    face = ("@font-face {{ font-family: 'SUITE Variable'; font-weight: 300 900; font-style: normal; font-display: swap;\n"
            "  src: url(lib/vendor/suite/subset/{file}) format('woff2-variations'), url(lib/vendor/suite/subset/{file}) format('woff2');\n"
            "  unicode-range: {range}; }}")
    for key, cps in slices.items():
        if not cps:
            continue
        subset(SRC, cps, OUT / f'SUITE-{key}.woff2')
        faces.append(face.format(file=f'SUITE-{key}.woff2', range=ranges(cps)))
    subset(DOT_SRC, [0xB7], OUT / 'middot.woff2')
    faces.append(face.format(file='middot.woff2', range='U+B7'))

    block = ('/* suite-subsets:start — scripts/build-suite-subsets.py 가 만든다(손으로 고치지 말 것) */\n'
             + '\n'.join(faces) + '\n/* suite-subsets:end */')
    css = CSS.read_text(encoding='utf-8')
    css, n = re.subn(r'/\* suite-subsets:start.*?suite-subsets:end \*/', lambda _: block, css, flags=re.S)
    if n != 1:
        raise SystemExit('style.css 에 suite-subsets 블록이 없다')
    CSS.write_text(css, encoding='utf-8')
    for f in sorted(OUT.glob('*.woff2')):
        print(f'{f.name:20} {f.stat().st_size // 1024:4} KB')


if __name__ == '__main__':
    main()
