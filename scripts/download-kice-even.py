#!/usr/bin/env python3
"""KICE 카탈로그에서 fileName 에 '짝수' 들어간 PDF만 골라 다운.
짝수형 문제지/정답표 → tmp/kice-zips-even/.
"""
import json, urllib.request, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = Path('tmp/kice-zips-even')
OUT.mkdir(parents=True, exist_ok=True)

cat = json.load(open('data/kice-catalog.json'))

ROUND_MAP = {'6월': 'june', '9월': 'sept', '수능': 'csat', '예비': 'prelim', '예시': 'prelim'}
UA = 'Mozilla/5.0 (compatible; KICE-archive/1.0)'
DL_URL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'

targets = []
for board, posts in cat['boards'].items():
    for p in posts:
        gy = p.get('gradeYear', '')
        try: gy_int = int(gy)
        except: continue
        t = ROUND_MAP.get(p.get('round'))
        if not t: continue
        for f in p.get('files', []):
            fn = f.get('fileName', '')
            if '짝수' not in fn: continue
            ext = fn.rsplit('.', 1)[-1].lower() if '.' in fn else 'bin'
            safe_subject = (p.get('subject') or '').replace('/', '_').replace(' ', '')
            local = OUT / f"{gy}_{t}_{board}_{safe_subject}_{f['fileSeq'][:8]}.{ext}"
            targets.append({
                'fileSeq': f['fileSeq'], 'fileName': fn, 'localPath': local,
                'gy': gy_int, 't': t, 'subject': p.get('subject'), 'board': board,
            })

print(f'▣ 다운 대상: {len(targets)}건')

def fetch(tg):
    if tg['localPath'].exists() and tg['localPath'].stat().st_size > 0:
        return tg, 'skip', tg['localPath'].stat().st_size
    req = urllib.request.Request(DL_URL.format(tg['fileSeq']), headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        tg['localPath'].write_bytes(data)
        return tg, 'ok', len(data)
    except Exception as e:
        return tg, f'err:{e}', 0

ok = skip = err = 0
total = 0
with ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(fetch, t): t for t in targets}
    for fut in as_completed(futs):
        tg, st, sz = fut.result()
        total += sz
        if st == 'ok': ok += 1; print(f'  ✔ {tg["gy"]} {tg["subject"]} ({tg["board"]}/{tg["t"]}) {tg["fileName"]} ({sz/1024:.0f}KB)')
        elif st == 'skip': skip += 1
        else: err += 1; print(f'  ✘ {tg["fileName"]}: {st}')
        time.sleep(0.05)
print(f'\nok={ok} skip={skip} err={err} total={total/1024/1024:.1f}MB')
