#!/usr/bin/env python3
"""KICE 자료마당에서 신규 추가 가능 자료 자동 다운.
data/kice-catalog.json 기반으로 우리 보유 외 회차 다운로드 → tmp/kice-zips/
"""
import json, time, sys, urllib.request, urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# 어디까지 받을지 — 학년도 범위
MIN_YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2010
MAX_YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else 2013

OUT = Path('tmp/kice-zips')
OUT.mkdir(parents=True, exist_ok=True)

ours = json.load(open('data/exams.json'))
kice = json.load(open('data/kice-catalog.json'))

ours_set = {(e['gradeYear'], e['type']) for e in ours if e['typeGroup']=='suneung'}

ROUND_MAP = {'6월':'june','9월':'sept','수능':'csat','예비':'prelim','예시':'prelim'}

UA = 'Mozilla/5.0 (compatible; KICE-archive/1.0)'
DL_URL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'

# 다운로드 대상 수집
targets = []
for board, rows in kice['boards'].items():
    for r in rows:
        gy_str = r.get('gradeYear', '')
        if not gy_str.isdigit(): continue
        gy = int(gy_str)
        if not (MIN_YEAR <= gy <= MAX_YEAR): continue
        t = ROUND_MAP.get(r.get('round'))
        if not t: continue
        if (gy, t) in ours_set: continue   # 이미 우리 보유
        for f in r['files']:
            # 파일명 한글 깨짐 방지: postId·subject·fileSeq 기반 안전 파일명
            ext = f['fileName'].rsplit('.', 1)[-1].lower() if '.' in f['fileName'] else 'bin'
            safe_subject = r['subject'].replace('/', '_').replace(' ', '')
            local = OUT / f'{gy}_{t}_{safe_subject}_{f["fileSeq"][:8]}.{ext}'
            targets.append({
                'fileSeq': f['fileSeq'],
                'fileName': f['fileName'],
                'localPath': local,
                'gy': gy, 't': t, 'subject': r['subject'],
            })

print(f'▣ 다운로드 대상: {len(targets)} 파일 ({MIN_YEAR}~{MAX_YEAR}학년도)')

def fetch_one(tgt):
    if tgt['localPath'].exists() and tgt['localPath'].stat().st_size > 1000:
        return tgt, 'cached', tgt['localPath'].stat().st_size
    url = DL_URL.format(tgt['fileSeq'])
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        tgt['localPath'].write_bytes(data)
        return tgt, 'ok', len(data)
    except Exception as e:
        return tgt, f'fail: {e}', 0

total_bytes = 0
ok = fail = cached = 0
with ThreadPoolExecutor(max_workers=4) as ex:
    futures = [ex.submit(fetch_one, t) for t in targets]
    for fut in as_completed(futures):
        tgt, status, sz = fut.result()
        total_bytes += sz
        if status == 'ok': ok += 1
        elif status == 'cached': cached += 1
        else: fail += 1
        if (ok + cached + fail) % 10 == 0:
            print(f'  {ok+cached+fail}/{len(targets)}  ({total_bytes/1024/1024:.1f} MB)')

print(f'\n✓ ok {ok} / cached {cached} / fail {fail}')
print(f'  total {total_bytes/1024/1024:.1f} MB → {OUT}')
