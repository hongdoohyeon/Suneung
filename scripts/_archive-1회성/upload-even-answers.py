#!/usr/bin/env python3
"""tmp/even-answers/ 의 분리된 PDF 를 _target_name 으로 rename → kice-final-even/.
이후 gh release upload 로 v3 에 올림."""
import json, shutil
from pathlib import Path

OV = json.load(open('data/even-form-overrides.json'))
DST = Path('tmp/kice-final-even')

copied = 0
for o in OV:
    src = o.get('_split_local')
    tgt_name = o.get('_target_name')
    if not (src and tgt_name): continue
    src_p = Path(src)
    if not src_p.exists(): continue
    target = DST / tgt_name
    if target.exists(): continue
    shutil.copy2(src_p, target)
    copied += 1

print(f'▣ kice-final-even/ 로 복사: {copied}건')
print(f'  총 파일: {len(list(DST.glob("*.pdf")))}')
