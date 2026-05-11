#!/usr/bin/env python3
"""KICE 카탈로그에서 2014+ 제2외국어/한문·직업탐구 게시물만 골라 ZIP 다운.

기존 download-kice-archive.py 는 (gy, type) 단위로 '이미 보유' 체크하므로
같은 csat 안에 영역만 다른 자료를 받지 못함. 이 스크립트는 영역 화이트리스트
('제2외국어/한문', '직업탐구')만 골라 별도 디렉토리에 받는다.

usage:
    python3 scripts/download-kice-lang2-voca.py [csat|mock|both] [min_year] [max_year]
"""
from __future__ import annotations
import json, sys, time, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BOARD_FILTER = sys.argv[1] if len(sys.argv) > 1 else 'both'   # csat / mock / both
MIN_YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else 2014
MAX_YEAR = int(sys.argv[3]) if len(sys.argv) > 3 else 2026

OUT = Path('tmp/kice-zips-lang2-voca')
OUT.mkdir(parents=True, exist_ok=True)

cat = json.load(open('data/kice-catalog.json'))

ROUND_MAP = {'6월': 'june', '9월': 'sept', '수능': 'csat', '예비': 'prelim', '예시': 'prelim'}
SUBJECT_WHITELIST = {'제2외국어/한문', '직업탐구'}
BOARDS_BY_FILTER = {
    'csat': ['csat'],
    'mock': ['mock'],
    'both': ['csat', 'mock'],
}
boards = BOARDS_BY_FILTER[BOARD_FILTER]

UA = 'Mozilla/5.0 (compatible; KICE-archive/1.0)'
DL_URL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'

targets = []
for board in boards:
    for r in cat['boards'][board]:
        gy_str = r.get('gradeYear', '')
        if not gy_str.isdigit():
            continue
        gy = int(gy_str)
        if not (MIN_YEAR <= gy <= MAX_YEAR):
            continue
        if r.get('subject') not in SUBJECT_WHITELIST:
            continue
        t = ROUND_MAP.get(r.get('round'))
        if not t:
            continue
        for f in r.get('files', []):
            ext = f['fileName'].rsplit('.', 1)[-1].lower() if '.' in f['fileName'] else 'bin'
            safe_subject = r['subject'].replace('/', '_').replace(' ', '')
            local = OUT / f'{gy}_{t}_{board}_{safe_subject}_{f["fileSeq"][:8]}.{ext}'
            targets.append({
                'fileSeq': f['fileSeq'],
                'fileName': f['fileName'],
                'localPath': local,
                'gy': gy, 't': t, 'subject': r['subject'], 'board': board,
            })

print(f'▣ 다운로드 대상: {len(targets)} 파일 (board={BOARD_FILTER}, {MIN_YEAR}~{MAX_YEAR})')


def fetch(tg):
    if tg['localPath'].exists() and tg['localPath'].stat().st_size > 0:
        return tg, 'skip', tg['localPath'].stat().st_size
    url = DL_URL.format(tg['fileSeq'])
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        tg['localPath'].write_bytes(data)
        return tg, 'ok', len(data)
    except Exception as e:
        return tg, f'err:{e}', 0


ok = skip = err = 0
total_bytes = 0
with ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(fetch, tg): tg for tg in targets}
    for fut in as_completed(futs):
        tg, status, sz = fut.result()
        total_bytes += sz
        if status == 'ok':
            ok += 1
            print(f'  ✔ {tg["gy"]} {tg["subject"]} ({tg["board"]}) → {tg["localPath"].name} ({sz/1024:.0f}KB)')
        elif status == 'skip':
            skip += 1
        else:
            err += 1
            print(f'  ✘ {tg["fileName"]}: {status}')
        time.sleep(0.05)

print(f'\n결과: ok={ok}, skip={skip}, err={err}, total={total_bytes/1024/1024:.1f}MB')
