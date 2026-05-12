#!/usr/bin/env python3
"""tmp/kice-zips-area-fill/ 풀기 + cp949 fix → tmp/kice-extracted-area-fill/
fileSeq 기준 SEQ_KIND lookup 으로 q/a 디렉토리 분리."""
import json, zipfile
from pathlib import Path

SRC = Path('tmp/kice-zips-area-fill')
DST = Path('tmp/kice-extracted-area-fill')
DST.mkdir(parents=True, exist_ok=True)

cat = json.load(open('data/kice-catalog.json'))
SEQ_KIND = {}
for board, posts in cat['boards'].items():
    for p in posts:
        for f in p.get('files', []):
            fn = f.get('fileName','')
            seq = f.get('fileSeq','')[:8]
            if not seq: continue
            if '문제' in fn: SEQ_KIND[seq] = 'q'
            elif '정답' in fn: SEQ_KIND[seq] = 'a'
            elif '해설' in fn: SEQ_KIND[seq] = 'sol'
            elif '듣기' in fn: SEQ_KIND[seq] = 'listen'

def fix_name(raw):
    if isinstance(raw, str):
        try: return raw.encode('cp437').decode('cp949')
        except: return raw
    return raw

def parse(name):
    rest, h = name.rsplit('_', 1)
    parts = rest.split('_', 3)
    if len(parts) < 4: return None
    return parts[0], parts[1], parts[2], parts[3], h

zips = sorted(SRC.glob('*.zip'))
pdfs = sorted(SRC.glob('*.pdf'))
print(f'▣ ZIP {len(zips)} + PDF {len(pdfs)}')

for zp in zips:
    meta = parse(zp.stem)
    if not meta: continue
    gy, t, board, subj, h = meta
    kind = SEQ_KIND.get(h, 'misc')
    out_dir = DST / gy / t / board / subj / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zp, 'r') as zf:
            for info in zf.infolist():
                if info.is_dir(): continue
                fixed = fix_name(info.filename)
                target = out_dir / fixed
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(info))
    except Exception as e:
        print(f'  ✗ {zp.name}: {e}')

for p in pdfs:
    meta = parse(p.stem)
    if not meta: continue
    gy, t, board, subj, h = meta
    kind = SEQ_KIND.get(h, 'misc')
    out_dir = DST / gy / t / board / subj / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / p.name
    if not target.exists():
        target.write_bytes(p.read_bytes())

print('▣ 결과')
for gy in sorted(DST.iterdir()):
    if gy.is_dir():
        n = sum(1 for _ in gy.rglob('*') if _.is_file())
        print(f'  {gy.name}: {n}')
