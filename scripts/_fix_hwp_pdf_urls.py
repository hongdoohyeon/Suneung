#!/usr/bin/env python3
"""hwp-pdf-v1/v2 마이그레이션 URL 수정 (1회성).

문제: 마이그레이션이 GitHub 릴리즈 직링크를 썼는데
  1) 한글 자산명은 업로드 시 GitHub가 mangling(비ASCII 연속→'.')해서 1,140건이 404
  2) github.com은 exam 페이지 CSP connect-src에 없어 PDF 미리보기 차단
  3) 직링크는 download 속성이 무시돼 한글 파일명 손실

해결: 사이트 기존 규약대로 워커 프록시 URL로 통일.
  https://suneung-files.hdh061224.workers.dev/{tag}/{실제자산명}?name={한글파일명.pdf}

실행 전제: gh CLI 인증, 작업트리 클린(WIP 커밋 후 amend 용도).
"""
import json
import html
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = 'https://suneung-files.hdh061224.workers.dev'
GH_PREFIX = 'https://github.com/hongdoohyeon/Suneung/releases/download/'
URL_FIELDS = ('questionUrl', 'answerUrl', 'solutionUrl', 'scriptUrl', 'listenUrl')
DL_OF = {'questionUrl': 'questionDownload', 'answerUrl': 'answerDownload',
         'solutionUrl': 'solutionDownload', 'scriptUrl': 'scriptDownload',
         'listenUrl': 'listenDownload'}


def mangle(name: str) -> str:
    """GitHub 릴리즈 자산명 정규화 재현 (검증됨: 1,140건 1:1 전단사)."""
    s = re.sub(r'[^A-Za-z0-9_.@+-]+', '.', name)
    return re.sub(r'\.{2,}', '.', s)


def unescape_full(s: str) -> str:
    """&amp;amp;... 다중 이스케이프를 평문까지 완전 복원."""
    prev = None
    while prev != s:
        prev, s = s, html.unescape(s)
    return s


def release_assets(tag: str) -> set[str]:
    out = subprocess.run(
        ['gh', 'release', 'view', tag, '--repo', 'hongdoohyeon/Suneung',
         '--json', 'assets', '--jq', '.assets[].name'],
        capture_output=True, text=True, check=True)
    names = set(out.stdout.split())
    if not names:
        sys.exit(f'release {tag}: 자산 목록이 비어 있음 — 중단')
    return names


def main() -> None:
    assets = {t: release_assets(t) for t in ('hwp-pdf-v1', 'hwp-pdf-v2')}
    exams_path = ROOT / 'data' / 'exams.json'
    data = json.loads(exams_path.read_text(encoding='utf-8'))

    url_map: dict[str, str] = {}  # 옛 github URL -> 새 워커 URL
    misses: list[str] = []
    for e in data:
        for f in URL_FIELDS:
            u = e.get(f)
            if not u or not u.startswith(GH_PREFIX):
                continue
            tag, _, fname = u[len(GH_PREFIX):].partition('/')
            if tag not in assets:
                continue  # military-v1 등 다른 릴리즈는 대상 아님
            decoded = urllib.parse.unquote(fname)
            actual = decoded if decoded in assets[tag] else mangle(decoded)
            if actual not in assets[tag]:
                misses.append(u)
                continue
            dl = unescape_full(e.get(DL_OF[f]) or decoded)
            if not dl.lower().endswith('.pdf'):
                dl = re.sub(r'\.\w+$', '', dl) + '.pdf'
            new = (f'{WORKER}/{tag}/{urllib.parse.quote(actual)}'
                   f'?name={urllib.parse.quote(dl)}')
            url_map[u] = new
            e[f] = new
            if e.get(DL_OF[f]):
                e[DL_OF[f]] = dl

    if misses:
        sys.exit(f'자산 매칭 실패 {len(misses)}건 — 중단:\n' + '\n'.join(misses[:10]))

    # Download 필드 전반의 다중 이스케이프 정리(마이그레이션 외 entry 포함)
    dl_fixed = 0
    for e in data:
        for df in DL_OF.values():
            v = e.get(df)
            if v and '&amp;' in v:
                e[df] = unescape_full(v)
                dl_fixed += 1

    exams_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # HTML 패치: 옛 URL 치환 + download 속성 다중 이스케이프 축약
    html_files = subprocess.run(
        ['git', 'show', '--name-only', '--format=', 'HEAD'],
        capture_output=True, text=True, cwd=ROOT, check=True).stdout.split()
    patched = 0
    for rel in html_files:
        p = ROOT / rel
        if p.suffix != '.html' or not p.exists():
            continue
        s = orig = p.read_text(encoding='utf-8')
        for old, new in url_map.items():
            esc_old = html.escape(old, quote=False)  # &가 &amp;로 들어간 형태 대비
            if esc_old != old:
                s = s.replace(esc_old, new)
            s = s.replace(old, new)
        while '&amp;amp;' in s:
            s = s.replace('&amp;amp;', '&amp;')
        if s != orig:
            p.write_text(s, encoding='utf-8')
            patched += 1

    print(f'URL 치환 {len(url_map)}건 / Download 정리 {dl_fixed}건 / HTML 패치 {patched}파일')


if __name__ == '__main__':
    main()
