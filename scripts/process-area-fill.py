#!/usr/bin/env python3
"""tmp/kice-extracted-area-fill/ → 영역·과목 매핑 + 우리 items 에 attach.

매칭 룰: (gradeYear, type, subject, subSubject_norm) — 정확 일치하면 url 부착.
없으면 새 item 추가 (data/kice-area-fill-items.json).
"""
from __future__ import annotations
import json, re, hashlib, shutil
from pathlib import Path
from collections import defaultdict

SRC = Path('tmp/kice-extracted-area-fill')
DST = Path('tmp/kice-final-area-fill')
DST.mkdir(parents=True, exist_ok=True)
REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v5/'

# 영역별 과목 정규화 사전
SOC_CANON = ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사',
             '경제','정치와법','사회·문화','법과정치','법과사회','윤리','정치',
             '한국근현대사','국사','한국사','경제지리']
SCI_CANON = ['물리학Ⅰ','물리학Ⅱ','물리Ⅰ','물리Ⅱ','화학Ⅰ','화학Ⅱ',
             '생명과학Ⅰ','생명과학Ⅱ','지구과학Ⅰ','지구과학Ⅱ',
             '생물Ⅰ','생물Ⅱ']

HANGUL_RE = re.compile(r'[가-힣]')
def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s):
        return re.sub(r'[^A-Za-z0-9_\-]', '', s)
    return 'k' + hashlib.md5(s.encode('utf-8')).hexdigest()[:8]


KIND_PAT = re.compile(r'(문제지|문제|정답표|정답|해설지|해설|듣기대본|대본)')
def parse_pdf(name: str):
    stem = re.sub(r'\.pdf$', '', name, flags=re.IGNORECASE).strip()
    m = KIND_PAT.search(stem)
    if m: stem = (stem[:m.start()] + stem[m.end():]).strip()
    stem = re.sub(r'^\d+\s*', '', stem).strip()
    stem = re.sub(r'^(?:사탐|과탐|사회탐구|과학탐구)[\s_\-\(]*', '', stem).strip()
    stem = stem.rstrip(')').strip()
    stem = re.sub(r'[_\-]+', ' ', stem).strip()
    stem = re.sub(r'\s+', ' ', stem)
    stem = re.sub(r'[①②③④⑤]+', '', stem).strip()
    # 로마자→유니코드
    stem = re.sub(r'(물리|화학|생물|생명과학|지구과학)II$', r'\1Ⅱ', stem)
    stem = re.sub(r'(물리|화학|생물|생명과학|지구과학)I$', r'\1Ⅰ', stem)
    stem = re.sub(r'(물리|화학|생물|생명과학|지구과학)1$', r'\1Ⅰ', stem)
    stem = re.sub(r'(물리|화학|생물|생명과학|지구과학)2$', r'\1Ⅱ', stem)
    stem = re.sub(r'^생물(Ⅰ|Ⅱ)$', r'생명과학\1', stem)
    return stem if stem else None


def normalize_sub(subject: str, raw: str):
    if not raw: return None
    if re.search(r'_[0-9a-f]{6,}', raw) or raw.startswith('_'): return None
    s = raw.strip()
    if subject == '사회탐구':
        # subject 자체로 끝나는 경우 (통합본) → None
        if s in ('사회탐구', '사탐'): return None
        for c in SOC_CANON:
            if s == c or s.replace(' ','') == c.replace(' ',''): return c
        return None  # 모르는 과목명은 버림 (가비지 방지)
    if subject == '과학탐구':
        if s in ('과학탐구', '과탐'): return None
        for c in SCI_CANON:
            if s == c or s.replace(' ','') == c.replace(' ',''): return c
        return None
    return None


# 1) 트리 순회 → records
records = []   # {gy, type, subject, subSubject, q_pdf, a_pdf}
for gy_dir in sorted(SRC.iterdir()):
    if not gy_dir.is_dir(): continue
    gy = int(gy_dir.name)
    for type_dir in gy_dir.iterdir():
        for board_dir in type_dir.iterdir():
            for subj_dir in board_dir.iterdir():
                subj_name = subj_dir.name
                subject = '사회탐구' if subj_name == '사회탐구' else '과학탐구' if subj_name == '과학탐구' else None
                if not subject: continue
                # 통합 정답표 fallback
                a_dir = subj_dir / 'a'
                a_pdfs = list(a_dir.rglob('*.pdf')) if a_dir.is_dir() else []
                fallback_a = a_pdfs[0] if len(a_pdfs)==1 else None
                bucket = {}
                for kind_dir in subj_dir.iterdir():
                    if not kind_dir.is_dir(): continue
                    dir_kind = kind_dir.name
                    for f in sorted(kind_dir.rglob('*.pdf')):
                        raw = parse_pdf(f.name)
                        if not raw: continue
                        sub_norm = normalize_sub(subject, raw)
                        if not sub_norm: continue
                        kind = dir_kind if dir_kind in ('q','a','sol','listen') else 'q'
                        bucket.setdefault(sub_norm, {})[kind] = f
                if fallback_a is not None:
                    for sub_norm, kinds in bucket.items():
                        if 'a' not in kinds:
                            kinds['a'] = fallback_a
                for sub_norm, kinds in bucket.items():
                    rec = {'gy':gy,'type':type_dir.name,'subject':subject,'subSubject':sub_norm}
                    for k,p in kinds.items(): rec[f'{k}_local']=p
                    records.append(rec)

print(f'▣ 영역 records: {len(records)}건')
sub_dist = defaultdict(int)
for r in records: sub_dist[(r['subject'], r['subSubject'])] += 1
print(f'  unique (subject, subSubject): {len(sub_dist)}')

# 2) rename + DST
ROUND_KEY = {'csat':'csat','june':'06','sept':'09','prelim':'prelim'}
seen = set()
def safe_name(gy, t, subj, sub, kind):
    base = '_'.join([str(gy), ROUND_KEY.get(t,t), asciify(subj), asciify(sub), kind]) + '.pdf'
    name = base; cnt = 1
    while name in seen:
        cnt += 1; name = base.replace('.pdf', f'_{cnt}.pdf')
    seen.add(name); return name

out_records = []
for r in records:
    new = dict(r)
    for k in ('q','a','sol'):
        loc = r.get(f'{k}_local')
        if not loc or not Path(loc).exists(): continue
        nm = safe_name(r['gy'], r['type'], r['subject'], r['subSubject'], k)
        shutil.copy2(loc, DST/nm)
        new[f'{k}_url'] = REL_BASE + nm
    out_records.append(new)

# 3) 매칭 + attach (주: 본 attach 는 build-data.py 에서 archive-new-items 로 합칠 때 자동)
TYPE_MONTH = {'csat':11,'june':6,'sept':9,'prelim':0}
final_items = []
for r in out_records:
    gy, t = r['gy'], r['type']
    if 2014<=gy<=2021: curr='2009'
    elif gy>=2022: curr='2015'
    else: curr='pre2009'
    final_items.append({
        'curriculum': curr, 'gradeYear': gy, 'examYear': gy-1,
        'month': TYPE_MONTH.get(t,0), 'studentGrade': 3,
        'typeGroup':'suneung', 'type': t,
        'subject': r['subject'], 'subSubject': r['subSubject'],
        'questionUrl': r.get('q_url'),
        'answerUrl':   r.get('a_url'),
        'solutionUrl': r.get('sol_url'),
        'questionDownload': f"{gy}학년도_{t}_{r['subject']}_{r['subSubject']}_문제지.pdf" if r.get('q_url') else None,
        'answerDownload':   f"{gy}학년도_{t}_{r['subject']}_{r['subSubject']}_정답표.pdf" if r.get('a_url') else None,
        'listenUrl':None, 'scriptUrl':None, 'source':'kice-archive',
    })

OUT = Path('data/kice-area-fill-items.json')
OUT.write_text(json.dumps(final_items, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'✓ {OUT} ({len(final_items)} items, {len(list(DST.iterdir()))} PDF)')
print(f'  q/a 보유: q={sum(1 for i in final_items if i.get("questionUrl"))}, a={sum(1 for i in final_items if i.get("answerUrl"))}')
