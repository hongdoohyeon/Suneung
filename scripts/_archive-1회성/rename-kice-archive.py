#!/usr/bin/env python3
"""kice-archive-mapping.json 기반으로 파일명 영문화 → tmp/kice-final/.
URL 안전한 영문 파일명. 업로드 가능한 형태로 평탄화."""
import json, shutil, hashlib, re
from pathlib import Path

MAP = Path('data/kice-archive-mapping.json')
DST = Path('tmp/kice-final')
DST.mkdir(parents=True, exist_ok=True)

records = json.loads(MAP.read_text(encoding='utf-8'))

ROUND_KEY = {'csat':'csat', 'june':'06', 'sept':'09', 'prelim':'prelim'}

# 한글 sub → 영문 hash (GitHub release 한글 파일명 거부)
HANGUL_RE = re.compile(r'[가-힣]')
def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s):
        return re.sub(r'[^A-Za-z0-9_\-]', '', s)
    h = hashlib.md5(s.encode('utf-8')).hexdigest()[:6]
    return f'k{h}'

uploaded_records = []
seen = set()  # 동일 파일명 충돌 회피

def safe_name(year, round_, subject, sub, kind):
    rk = ROUND_KEY.get(round_, round_)
    # subject 도 sub 도 ASCII 보장
    parts = [str(year), rk, asciify(subject) or 'unk']
    sub_a = asciify(sub) if sub else None
    if sub_a: parts.append(sub_a)
    parts.append(kind)
    base = '_'.join(parts) + '.pdf'
    # 중복 방지
    name = base
    cnt = 1
    while name in seen:
        cnt += 1
        name = base.replace('.pdf', f'_{cnt}.pdf')
    seen.add(name)
    return name

stats = {'ok': 0, 'skip': 0, 'mp3_zip': 0}
for r in records:
    new_rec = dict(r)  # 복사

    # q_pdf, a_pdf, script_pdf 각각
    for kind_key, kind_label in [('q_pdf','q'), ('a_pdf','a'), ('script_pdf','script')]:
        src = r.get(kind_key)
        if not src: continue
        src = Path(src)
        if not src.exists(): continue
        new_name = safe_name(r['year'], r['round'], r['subject'], r.get('sub'), kind_label)
        target = DST / new_name
        shutil.copy2(src, target)
        new_rec[kind_key + '_renamed'] = new_name
        stats['ok'] += 1

    # listen_zip — 영어 듣기 (mp3들 묶음)
    if r.get('listen_zip'):
        src = Path(r['listen_zip'])
        if src.exists():
            sub_part = ('_' + asciify(r['sub'])) if r.get('sub') else ''
            zip_name = f"{r['year']}_{ROUND_KEY.get(r['round'],r['round'])}_{asciify(r['subject']) or 'unk'}{sub_part}_listen.zip"
            target = DST / zip_name
            if not target.exists():
                shutil.copy2(src, target)
            new_rec['listen_zip_renamed'] = zip_name
            stats['mp3_zip'] += 1

    uploaded_records.append(new_rec)

print(f'▣ 영문화 완료')
print(f'  PDF: {stats["ok"]}개')
print(f'  영어 듣기 zip: {stats["mp3_zip"]}개')
print(f'  최종 파일 수: {len(list(DST.iterdir()))}')

import subprocess
size = subprocess.run(['du','-sh',str(DST)], capture_output=True, text=True).stdout.strip()
print(f'  용량: {size}')

# 업로드용 매핑 저장
out = Path('data/kice-archive-mapping-final.json')
out.write_text(json.dumps(uploaded_records, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
print(f'\n✓ 매핑 저장: {out}')
