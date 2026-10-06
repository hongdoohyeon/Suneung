#!/usr/bin/env python3
"""홈(index.html) 첫 화면을 빌드 때 미리 그려 넣는다 (2026-10, 모바일 첫 표시 속도).

기출검색 표는 app.js 가 데이터를 받아 그리므로, 느린 휴대폰에서는 HTML→JS→데이터→그리기를
다 기다려야 표가 뜬다(Lighthouse 모바일 LCP ~7s). 여기서 헤드리스 크롬으로 실제 사이트 코드를 돌려
완성된 화면을 받아(--dump-dom), index.html 의 <!-- prerender:NAME:start/end --> 구간만 바꿔 끼운다.
같은 코드가 그린 결과라 화면과 어긋나지 않는다. app.js 는 기본 화면으로 들어온 첫 로딩에선
미리 그린 표를 스켈레톤으로 가리지 않고, 데이터가 오면 같은 내용으로 다시 그린다.

render-site.py 다음에 실행(CI build.yml). 크롬이 없거나 실패하면 index.html 을 건드리지 않고 0 으로 끝난다.
  python3 scripts/prerender-home.py
"""
import functools
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
REGIONS = ('meta', 'filter', 'results')
CHROMES = [os.environ.get('CHROME', ''), '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
           '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
# 빌드 중 외부 분석 요청이 실제 방문으로 집계되지 않게 막는다
BLOCK = 'MAP www.googletagmanager.com 0.0.0.0, MAP *.google-analytics.com 0.0.0.0, MAP *.analytics.google.com 0.0.0.0, MAP static.cloudflareinsights.com 0.0.0.0'


def region(html: str, name: str) -> str | None:
    m = re.search(rf'<!-- prerender:{name}:start -->.*?<!-- prerender:{name}:end -->', html, re.S)
    return m.group(0) if m else None


def serve() -> tuple[socketserver.TCPServer, int]:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def dump_dom(chrome: str, url: str) -> str:
    out = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
                          '--window-size=1280,900', '--virtual-time-budget=20000', f'--host-resolver-rules={BLOCK}',
                          '--dump-dom', url], capture_output=True, text=True, timeout=120)
    return out.stdout


def main() -> int:
    chrome = next((c for c in CHROMES if c and (shutil.which(c) or Path(c).exists())), None)
    if not chrome:
        print('  ! prerender-home: 크롬 없음 — 건너뜀')
        return 0
    page = INDEX.read_text(encoding='utf-8')
    if not all(region(page, r) for r in REGIONS):
        print('  ! prerender-home: index.html 에 prerender 구간 표시가 없음 — 건너뜀')
        return 0
    httpd, port = serve()
    try:
        dom = dump_dom(chrome, f'http://127.0.0.1:{port}/index.html')
    except Exception as exc:                       # 크롬 실행 실패는 빌드를 막지 않는다
        print(f'  ! prerender-home: 크롬 실행 실패 — 건너뜀 ({exc})')
        return 0
    finally:
        httpd.shutdown()

    parts = {r: region(dom, r) for r in REGIONS}
    results = parts['results'] or ''
    rows = results.count('class="rrow ') + results.count('class="rrow"')
    if not all(parts.values()) or rows < 5 or 'id="archiveTotalCount">—' in (parts['meta'] or ''):
        print(f'  ! prerender-home: 화면이 덜 그려짐(행 {rows}) — 건너뜀')
        return 0
    # 표는 미리 그린 것임을 app.js 에 알린다(첫 로딩에 스켈레톤으로 가리지 않음)
    parts['results'] = re.sub(r'<div id="cardsGrid"', '<div id="cardsGrid" data-prerendered="1"', results, count=1)
    for name, html in parts.items():
        page = page.replace(region(page, name), html, 1)
    INDEX.write_text(page, encoding='utf-8')
    print(f'  + index.html 첫 화면 미리 그림 (표 {rows}행)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
