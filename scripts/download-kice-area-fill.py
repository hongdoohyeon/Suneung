#!/usr/bin/env python3
"""KICE 카탈로그에서 누락 영역의 mock(june/sept) ZIP/PDF 모두 다운.

대상 화이트리스트 영역 인자로 지정:
  python3 scripts/download-kice-area-fill.py 사회탐구 과학탐구

산출: tmp/kice-zips-area-fill/
"""
from __future__ import annotations
import json, sys, urllib.request, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

WANT = set(sys.argv[1:]) or {'사회탐구', '과학탐구'}

OUT = Path('tmp/kice-zips-area-fill')
OUT.mkdir(parents=True, exist_ok=True)
cat = json.load(open('data/kice-catalog.json'))
ROUND_MAP = {'6월':'june','9월':'sept','수능':'csat','예비':'prelim','예시':'prelim'}
UA = {'User-Agent':'Mozilla/5.0'}
DL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'

targets = []
for board, posts in cat['boards'].items():
    for p in posts:
        gy = p.get('gradeYear','')
        if not gy.isdigit(): continue
        subj = (p.get('subject') or '').replace('/', '')
        # 별칭 — '사회탐구' 그대로, '과학탐구' 그대로, '제2외국어한문' → '제2외국어'
        alias = {'제2외국어한문':'제2외국어'}.get(subj, subj)
        if alias not in WANT: continue
        t = ROUND_MAP.get(p.get('round'))
        if not t: continue
        for f in p.get('files', []):
            ext = f['fileName'].rsplit('.',1)[-1].lower() if '.' in f['fileName'] else 'bin'
            local = OUT / f"{gy}_{t}_{board}_{subj}_{f['fileSeq'][:8]}.{ext}"
            targets.append({'fileSeq':f['fileSeq'],'fileName':f['fileName'],'localPath':local,
                            'gy':int(gy),'t':t,'subject':subj,'board':board})

print(f'▣ 대상: {len(targets)}건')
def fetch(tg):
    if tg['localPath'].exists() and tg['localPath'].stat().st_size>0:
        return tg, 'skip', tg['localPath'].stat().st_size
    try:
        req = urllib.request.Request(DL.format(tg['fileSeq']), headers=UA)
        d = urllib.request.urlopen(req, timeout=60).read()
        tg['localPath'].write_bytes(d)
        return tg, 'ok', len(d)
    except Exception as e:
        return tg, f'err:{e}', 0

ok = skip = err = 0; total = 0
with ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(fetch, t): t for t in targets}
    for fut in as_completed(futs):
        tg, st, sz = fut.result(); total += sz
        if st=='ok': ok+=1; print(f'  ✔ {tg["gy"]} {tg["subject"]} ({tg["board"]}/{tg["t"]}) {tg["fileName"]} ({sz/1024:.0f}KB)')
        elif st=='skip': skip+=1
        else: err+=1; print(f'  ✘ {tg["fileName"]}: {st}')
        time.sleep(0.05)
print(f'\nok={ok} skip={skip} err={err} total={total/1024/1024:.1f}MB')
