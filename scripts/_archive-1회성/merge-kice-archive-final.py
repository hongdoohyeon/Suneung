#!/usr/bin/env python3
"""kice-archive-mapping-final.json → exams.json 신규 항목 추가."""
import json
from pathlib import Path

MAP = Path('data/kice-archive-mapping-final.json')
EXAMS = Path('data/exams.json')

WORKER_BASE = 'https://suneung-files.hdh061224.workers.dev'

# v1/v2 자산 목록 — 어느 release에 있는지 분기
import subprocess
def _release_assets(tag):
    out = subprocess.check_output(['gh','release','view',tag,'--json','assets',
                                    '--jq','.assets[].name'], text=True)
    return set(out.strip().splitlines())
V1_ASSETS = _release_assets('kice-archive-v1')
V2_ASSETS = _release_assets('kice-archive-v2')
print(f'v1: {len(V1_ASSETS)}, v2: {len(V2_ASSETS)}')

# 우리 영문 subject → 한글
SUBJECT_KR = {
    'korean':'국어', 'math':'수학', 'english':'영어', 'khistory':'한국사',
    'social':'사회탐구', 'science':'과학탐구', 'voc':'직업탐구', 'second':'제2외국어',
}

# 우리 영문 sub → 한글 (라벨용)
SUB_KR = {
    'economics':'경제', 'econ-geo':'경제지리', 'history-old':'국사',
    'kor-geo':'한국지리', 'world-hist':'세계사', 'world-geo':'세계지리',
    'easia-hist':'동아시아사', 'ethics-life':'생활과윤리', 'ethics':'윤리',
    'ethics-thought':'윤리와사상', 'sociology':'사회·문화', 'law-society':'법과사회',
    'law-politics':'법과정치', 'politics':'정치', 'korean-modern':'한국근현대사',
    'phys':'물리', 'phys1':'물리Ⅰ', 'phys2':'물리Ⅱ',
    'chem':'화학', 'chem1':'화학Ⅰ', 'chem2':'화학Ⅱ',
    'bio':'생명과학', 'bio1':'생명과학Ⅰ', 'bio2':'생명과학Ⅱ',
    'earth':'지구과학', 'earth1':'지구과학Ⅰ', 'earth2':'지구과학Ⅱ',
    'a':'가형', 'b':'나형',
    'agriculture':'농업', 'commerce':'상업', 'industry':'공업',
    'fishery':'수산', 'home':'가사', 'info':'정보', 'computer':'컴퓨터', 'maritime':'해사',
    'humanities':'인문계', 'natural':'자연계', 'arts':'예체능계',
}

ROUND_MONTH = {'csat': 11, 'june': 6, 'sept': 9, 'prelim': 0}

def fileurl(name):
    if name in V1_ASSETS: return f'{WORKER_BASE}/kice-archive-v1/{name}'
    if name in V2_ASSETS: return f'{WORKER_BASE}/kice-archive-v2/{name}'
    return None  # 누락

def main():
    records = json.loads(MAP.read_text(encoding='utf-8'))
    exams   = json.loads(EXAMS.read_text(encoding='utf-8'))

    next_id = max(e['id'] for e in exams) + 1
    have_keys = {(e['gradeYear'], e['type'], e['subject'], e.get('subSubject'))
                 for e in exams if e['typeGroup']=='suneung'}

    new_items = []
    for r in records:
        # 우리 영문 → 한글 (subject)
        subject_kr = SUBJECT_KR.get(r['subject'], r['subject'])
        # sub: rename 단계에서 영문 hash 처리됨. 원본 mapping에서 sub는 한글일 수도, 영문 키일 수도.
        # 원본 매핑(rename 전)의 sub를 보존 위해 'sub'에 한글 또는 영문 키
        raw_sub = r.get('sub')
        if raw_sub and not isinstance(raw_sub, str): raw_sub = None
        sub_kr = SUB_KR.get(raw_sub, raw_sub) if raw_sub else None

        key = (r['year'], r['round'], subject_kr, sub_kr)
        if key in have_keys: continue  # 이미 보유

        q_url = fileurl(r['q_pdf_renamed']) if r.get('q_pdf_renamed') else None
        a_url = fileurl(r['a_pdf_renamed']) if r.get('a_pdf_renamed') else None
        s_url = fileurl(r['script_pdf_renamed']) if r.get('script_pdf_renamed') else None
        l_url = fileurl(r['listen_zip_renamed']) if r.get('listen_zip_renamed') else None

        if not q_url: continue   # 문제지 없으면 의미 없음

        item = {
            'id':         next_id,
            'curriculum': ('2009' if r['year'] >= 2014 else ('2007개정' if r['year'] >= 2012 else ('7차' if r['year'] >= 2005 else '6차'))),
            'gradeYear':  r['year'],
            'examYear':   r['year'] - 1,
            'month':      ROUND_MONTH.get(r['round'], 0),
            'studentGrade': 3,
            'typeGroup':  'suneung',
            'type':       r['round'],
            'subject':    subject_kr,
            'subSubject': sub_kr,
            'questionUrl':      q_url,
            'questionDownload': f"{r['year']}학년도_{r['round']}_{subject_kr}{('_'+sub_kr) if sub_kr else ''}_문제지.pdf",
            'answerUrl':        a_url,
            'answerDownload':   f"{r['year']}학년도_{r['round']}_{subject_kr}{('_'+sub_kr) if sub_kr else ''}_정답.pdf" if a_url else None,
            'solutionUrl':      None,
            'listenUrl':        l_url,
            'listenDownload':   f"{r['year']}학년도_{r['round']}_{subject_kr}_듣기.zip" if l_url else None,
            'scriptUrl':        s_url,
            'scriptDownload':   f"{r['year']}학년도_{r['round']}_{subject_kr}_듣기대본.pdf" if s_url else None,
            'source':           'kice-archive',
        }
        new_items.append(item)
        next_id += 1

    print(f'▣ 신규 추가 가능: {len(new_items)}건')
    from collections import Counter
    by_year = Counter(i['gradeYear'] for i in new_items)
    for y in sorted(by_year):
        print(f'  {y}학년도: {by_year[y]}건')

    out = Path('data/kice-archive-new-items.json')
    out.write_text(json.dumps(new_items, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n✓ dry-run: {out}')

    if '--apply' in __import__('sys').argv:
        merged = exams + new_items
        merged.sort(key=lambda i: (-i['gradeYear'], -(i.get('month') or 0),
                                    i.get('subject',''), i.get('subSubject') or ''))
        # ID 재할당
        for idx, it in enumerate(merged, 1):
            it['id'] = idx
        EXAMS.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'\n✓ exams.json 업데이트: {len(exams)} → {len(merged)}')

if __name__ == '__main__':
    main()
