#!/usr/bin/env python3
"""버전 토큰을 바꾸기 전에, 바뀐 자산이 라이브(GitHub Pages 원본)에서 새 내용으로 나오는지 기다린다 (2026-10).

왜: Cloudflare 는 `?v=토큰` 붙은 JS·CSS·JSON 을 1년(immutable) 캐시한다. 새 토큰을 단 HTML 이 먼저 퍼졌는데
GitHub Pages 가 배포 직후 잠깐 옛 파일을 내주면, 옛 내용이 새 토큰 주소에 1년 동안 붙박인다(2026-10-06 style.css 사고).
그래서 CI 는 ① 렌더 결과를 옛 토큰 그대로 먼저 올리고 ② 이 스크립트로 바뀐 자산이 라이브에서 저장소와 같은 내용인지
확인한 뒤 ③ 토큰을 바꿔 올린다. 확인용 요청은 매번 다른 쿼리를 붙여 Cloudflare 캐시를 건너뛴다.

  python3 scripts/wait-assets-live.py <비교 기준 커밋>      # 그 커밋 이후 바뀐 자산만 확인
시간 안에 다 안 맞으면 경고만 하고 0 으로 끝난다(배포를 막지 않는다).
"""
from __future__ import annotations

import fnmatch
import hashlib
import os
import random
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://kicegg.com/'
HASHED = ['*.js', '*.css', 'lib/*.js', 'data/*.json', 'data/**/*.json']   # version-assets.py 가 토큰 계산에 쓰는 자산
MAX_FILES = 60          # 데이터 대량 갱신 때는 표본만 본다(JS·CSS 는 전부)
TIMEOUT = int(os.environ.get('WAIT_TIMEOUT', 15 * 60))   # 시험용으로 환경변수로 줄일 수 있다
SETTLE = int(os.environ.get('WAIT_SETTLE', 120))           # 다 맞은 뒤에도 원본 서버들이 고르게 퍼지도록 더 기다린다


def changed_assets(base: str) -> list[str]:
    out = subprocess.run(['git', 'diff', '--name-only', f'{base}..HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    files = [f for f in out if (ROOT / f).is_file() and any(fnmatch.fnmatch(f, p) for p in HASHED)
             and not f.startswith(('tmp/', 'node_modules/', 'scripts/', 'cloudflare/'))]
    code = [f for f in files if not f.startswith('data/')]
    data = [f for f in files if f.startswith('data/')]
    random.shuffle(data)
    return code + data[:max(0, MAX_FILES - len(code))]


def live_digest(path: str) -> str | None:
    url = f'{SITE}{path}?live-check={random.randrange(1 << 48):x}'
    req = urllib.request.Request(url, headers={'User-Agent': 'kicegg-build-check'})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return hashlib.sha256(res.read()).hexdigest()
    except Exception:
        return None


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else 'HEAD~1'
    files = changed_assets(base)
    if not files:
        print('  wait-assets-live: 바뀐 자산 없음')
        return 0
    want = {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in files}
    print(f'  wait-assets-live: 자산 {len(files)}개가 라이브에 퍼지길 기다림')
    start = time.time()
    pending = set(files)
    while pending and time.time() - start < TIMEOUT:
        pending = {f for f in pending if live_digest(f) != want[f]}
        if pending:
            time.sleep(15)
    if pending:
        print(f'  ! wait-assets-live: {int(time.time() - start)}초 지나도 옛 내용 {len(pending)}개 — 그래도 진행: {sorted(pending)[:5]}')
        return 0
    print(f'  + 모두 새 내용({int(time.time() - start)}초). {SETTLE}초 더 기다린 뒤 토큰을 바꾼다')
    time.sleep(SETTLE)
    still = [f for f in files if live_digest(f) != want[f]]
    if still:
        print(f'  ! 다시 확인했더니 옛 내용 {len(still)}개: {still[:5]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
