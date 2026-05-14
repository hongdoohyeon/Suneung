#!/usr/bin/env python3
"""kice-extracted-area-fill/ 에서 csat 본영역 짝수 PDF 를 찾아
   매칭 item 의 questionUrlEven (또는 answerUrlEven) 으로 attach.

산출:
  tmp/kice-final-csat-even/ — rename 된 PDF
  data/even-form-overrides.json (append) — overrides 추가
"""
from __future__ import annotations
import json, re, shutil, hashlib
from pathlib import Path

SRC = Path('tmp/kice-extracted-area-fill')
DST = Path('tmp/kice-final-csat-even')
DST.mkdir(parents=True, exist_ok=True)
REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v6/'

EVEN_PAT  = re.compile(r'_짝(\.|_|$)|짝수|짝형|\(짝\)')

# 파일명에서 subSubject 추정 — 09개정 A형/B형, 가형/나형
def infer_sub(fname: str, subject: str):
    n = fname.lower()
    # 수학 가형/나형
    if subject == '수학':
        if '가형' in fname or '_가_' in n or '(가)' in fname: return '가형'
        if '나형' in fname or '_나_' in n or '(나)' in fname: return '나형'
        if 'a형' in n: return 'A형'
        if 'b형' in n: return 'B형'
    # 국어 A형/B형 (~2016)
    if subject == '국어':
        if 'a형' in n: return 'A형'
        if 'b형' in n: return 'B형'
    # 영어 A형/B형 (2014)
    if subject == '영어':
        if 'a형' in n: return 'A형'
        if 'b형' in n: return 'B형'
    return None


# (kind: q/a) 추출
def infer_kind(fname: str):
    n = fname
    if '정답' in n: return 'a'
    if '해설' in n: return 'sol'
    return 'q'   # 기본 — 문제지


HANGUL_RE = re.compile(r'[가-힣]')
def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s): return re.sub(r'[^A-Za-z0-9_\-]', '', s)
    return 'k' + hashlib.md5(s.encode('utf-8')).hexdigest()[:8]


# 트리 순회 — csat 본 영역 (국어/수학/영어/한국사) + prelim 도 포함
even_records = []
for gy_dir in sorted(SRC.iterdir()):
    if not gy_dir.is_dir(): continue
    try: gy = int(gy_dir.name)
    except: continue
    for type_dir in gy_dir.iterdir():
        t = type_dir.name
        for board_dir in type_dir.iterdir():
            for subj_dir in board_dir.iterdir():
                subj = subj_dir.name
                if subj not in ('국어','수학','영어','한국사'): continue
                for pdf in subj_dir.rglob('*.pdf'):
                    nm = pdf.name
                    if not EVEN_PAT.search(nm): continue
                    sub = infer_sub(nm, subj)
                    kind = infer_kind(nm)
                    even_records.append({
                        'gy': gy, 't': t, 'subject': subj, 'subSubject': sub,
                        'kind': kind, 'localPath': pdf,
                    })

print(f'▣ 짝수 PDF: {len(even_records)}건')
from collections import Counter
print('  (gy, subject, sub, kind):')
for k, v in Counter((r['gy'], r['subject'], r['subSubject'], r['kind']) for r in even_records).most_common():
    print(f'    {k}: {v}')


# rename + DST 로 복사
seen = set()
def safe_name(r):
    base = f"{r['gy']}_{r['t']}_{asciify(r['subject'])}"
    if r['subSubject']: base += f"_{asciify(r['subSubject'])}"
    base += f"_{r['kind']}_even.pdf"
    name = base; cnt = 1
    while name in seen:
        cnt += 1; name = base.replace('.pdf', f'_{cnt}.pdf')
    seen.add(name); return name


# 같은 (gy, t, subject, sub, kind) 가 여러 PDF — 한 개만 keep (첫 매칭)
unique = {}
for r in even_records:
    k = (r['gy'], r['t'], r['subject'], r['subSubject'], r['kind'])
    if k not in unique:
        unique[k] = r
print(f'  unique: {len(unique)}')

# overrides 추가
OV_PATH = Path('data/even-form-overrides.json')
existing = json.loads(OV_PATH.read_text(encoding='utf-8'))
copied = 0
new_count = 0
for k, r in unique.items():
    nm = safe_name(r)
    target = DST / nm
    shutil.copy2(r['localPath'], target)
    copied += 1
    qDL_even = f"{r['gy']}학년도_{r['t']}_{r['subject']}_{r['subSubject'] or ''}_{'문제지' if r['kind']=='q' else '정답표'}(짝수형).pdf".replace('__','_')
    # 이미 overrides 에 같은 키 있는지 확인 — 있으면 갱신
    matched = False
    for ov in existing:
        m = ov.get('match', {})
        if (m.get('gradeYear'), m.get('type'), m.get('subject'), m.get('subSubject')) == (r['gy'], r['t'], r['subject'], r['subSubject']):
            if r['kind']=='q':
                ov['questionUrlEven'] = REL_BASE + nm
                ov['questionDownloadEven'] = qDL_even
            elif r['kind']=='a':
                ov['answerUrlEven'] = REL_BASE + nm
                ov['answerDownloadEven'] = qDL_even
            matched = True
            break
    if not matched:
        entry = {'match': {'gradeYear': r['gy'], 'type': r['t'], 'subject': r['subject'], 'subSubject': r['subSubject']}}
        if r['kind']=='q':
            entry['questionUrlEven'] = REL_BASE + nm
            entry['questionDownloadEven'] = qDL_even
        elif r['kind']=='a':
            entry['answerUrlEven'] = REL_BASE + nm
            entry['answerDownloadEven'] = qDL_even
        existing.append(entry)
        new_count += 1

OV_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'✓ {copied} PDF 복사 / overrides 신규 {new_count}, 총 {len(existing)}')
print(f'  → {DST}')
