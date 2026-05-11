#!/usr/bin/env python3
"""짝수형 PDF 매핑 → kice-archive-new-items.json 업데이트 + tmp 파일 영문화.

다운된 짝수 PDF 9개:
  2025 csat 국어/수학/영어/한국사 → subSubject 매칭 시 그대로
  2016 csat 국어 A형/B형, 수학 A/B, 영어 → subSubject 매칭 ('A형','B형')
"""
import json, hashlib, re, shutil
from pathlib import Path

SRC = Path('tmp/kice-zips-even')
DST = Path('tmp/kice-final-even')
DST.mkdir(parents=True, exist_ok=True)

# 매핑 룰: (학년도, type, subject) → (sub_filter, target_filename)
HANGUL_RE = re.compile(r'[가-힣]')

def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s):
        return re.sub(r'[^A-Za-z0-9_\-]', '', s)
    return 'k' + hashlib.md5(s.encode('utf-8')).hexdigest()[:8]


def parse_local(name):
    """2016_csat_csat_국어_a3b27e54.pdf → (gy, type, subject, hash)"""
    stem = name.rsplit('.', 1)[0]
    rest, h = stem.rsplit('_', 1)
    parts = rest.split('_', 3)
    if len(parts) < 4: return None
    gy, t, board, subject = parts
    return int(gy), t, subject.replace('_', '/'), h


# 매핑 records
records = []
for f in sorted(SRC.glob('*.pdf')):
    info = parse_local(f.name)
    if not info: continue
    gy, t, subject, _ = info
    fn = f.stem
    sub = None
    # 2016 국어 A형/B형
    m = re.search(r'국어_([AB])형', f.name) if False else None  # 우리 파일명에 없음
    # 카탈로그 fileSeq 기준으로 다운된 파일이라 fileName이 hash로 바뀌어 있음
    # → fileSeq 다시 lookup
    # 빠른 방법: 다운된 hash로 카탈로그에서 fileName 찾기
    records.append({'gy': gy, 't': t, 'subject': subject, 'localPath': f, 'hash': info[3]})

# 카탈로그에서 fileSeq[:8] → fileName lookup
cat = json.load(open('data/kice-catalog.json'))
SEQ_FN = {}
for board, posts in cat['boards'].items():
    for p in posts:
        for fl in p.get('files', []):
            SEQ_FN[fl['fileSeq'][:8]] = fl['fileName']

for r in records:
    r['fileName'] = SEQ_FN.get(r['hash'], '')

# subSubject 추론
def infer_sub(r):
    fn = r['fileName']
    # 2016 국어/수학 A/B형
    if r['gy'] == 2016 and r['subject'] == '국어':
        if 'A형' in fn or '_A_' in fn or '국어_A' in fn: return 'A형'
        if 'B형' in fn or '_B_' in fn or '국어_B' in fn: return 'B형'
    if r['gy'] == 2016 and r['subject'] == '수학':
        if '수학A' in fn or 'A_짝수' in fn: return 'A형'
        if '수학B' in fn or 'B_짝수' in fn: return 'B형'
    return None  # subSubject 없는 경우 (2025 단일 시험지)

for r in records:
    r['subSubject'] = infer_sub(r)

# rename + copy
REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v3/'
out_records = []
for r in records:
    sub_part = ('_' + asciify(r['subSubject'])) if r['subSubject'] else ''
    new_name = f"{r['gy']}_{r['t']}_{asciify(r['subject'])}{sub_part}_q_even.pdf"
    target = DST / new_name
    shutil.copy2(r['localPath'], target)
    r['url_even'] = REL_BASE + new_name
    out_records.append(r)

# overrides 파일 생성 — build-data.py 후처리에서 적용
overrides = []
for r in out_records:
    overrides.append({
        'match': {
            'gradeYear': r['gy'], 'type': r['t'],
            'subject': r['subject'], 'subSubject': r['subSubject'],
        },
        'questionUrlEven': r['url_even'],
        'questionDownloadEven': f"{r['gy']}학년도_{r['t']}_{r['subject']}{('_' + r['subSubject']) if r['subSubject'] else ''}_문제지(짝수형).pdf",
    })

OUT_OV = Path('data/even-form-overrides.json')
OUT_OV.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'▣ 짝수 PDF {len(out_records)}개 처리 → {OUT_OV} ({len(overrides)} overrides)')
print(f'  업로드 대상: {DST}')
for r in out_records:
    print(f"  {r['gy']} {r['t']} {r['subject']} {r['subSubject'] or ''}: {r['url_even']}")
