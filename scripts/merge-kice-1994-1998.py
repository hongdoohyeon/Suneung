#!/usr/bin/env python3
"""1994~1998 KICE 수능 자료를 exams.json 신규 항목으로 등록.
data/kice-1994-1998-meta.json 기반.
한 게시글 = 한 영역 단위 시험 (문제 + 정답 별도 file).
"""
import json
from pathlib import Path
from collections import defaultdict

META = Path('data/kice-1994-1998-meta.json')
OUT  = Path('data/kice-archive-new-items.json')   # build-data.py 에서 자동 merge
WORKER_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v2'

SUBJECT_KR = {
    'korean':'국어','math':'수학','english':'영어','khistory':'한국사',
    'social':'사회탐구','science':'과학탐구','voc':'직업탐구','second':'제2외국어',
    'humanities':'인문계','natural':'자연계','arts':'예체능계',
}

records = json.loads(META.read_text(encoding='utf-8'))
existing = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else []

# 게시글별 그룹: (year, postId, subject_eng, round) → {q, a, script}
groups = defaultdict(dict)
for r in records:
    key = (r['year'], r['postId'], r['subject_eng'], r['round'])
    groups[key][r['kind']] = r

new_items = []
next_id_offset = 0
for (year, post_id, subj, rd), files in groups.items():
    q = files.get('q')
    a = files.get('a')
    s = files.get('script')
    if not q: continue   # 문제지 없으면 의미 X

    # 1994는 1차·2차 분리. 우리 시스템에는 type=csat (수능). 1차/2차 라벨은 subSubject 또는 별도 메타로.
    sub_kr = SUBJECT_KR.get(subj, subj)
    sub_sub = None
    if rd == '1': sub_sub = '1차'
    elif rd == '2': sub_sub = '2차'

    # 옛 수능: 인문/자연/예체능계 카테고리도 subSubject로 보존
    cat_kr = q.get('category_kr', '').strip()
    if cat_kr and cat_kr != sub_kr:
        sub_sub = (cat_kr + (' ' + sub_sub if sub_sub else '')) if cat_kr else sub_sub

    item = {
        'id': -1,
        'curriculum': 'pre2009',
        'gradeYear': year,
        'examYear':  year - 1,
        'month':     11,
        'studentGrade': 3,
        'typeGroup': 'suneung',
        'type':      'csat',
        'subject':   sub_kr,
        'subSubject': sub_sub,
        'questionUrl':      f'{WORKER_BASE}/{q["new_filename"]}',
        'questionDownload': q['orig_filename'],
        'answerUrl':        f'{WORKER_BASE}/{a["new_filename"]}' if a else None,
        'answerDownload':   a['orig_filename'] if a else None,
        'solutionUrl':      None,
        'scriptUrl':        f'{WORKER_BASE}/{s["new_filename"]}' if s else None,
        'scriptDownload':   s['orig_filename'] if s else None,
        'source':           'kice-archive-1994-1998',
    }
    new_items.append(item)

print(f'▣ 1994~1998 신규: {len(new_items)}건')
from collections import Counter
for y, n in sorted(Counter(i['gradeYear'] for i in new_items).items()):
    print(f'  {y}학년도: {n}건')

# 기존 kice-archive-new-items.json 에 합치기 (build-data.py 가 한 번에 merge)
combined = existing + new_items
OUT.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n✓ 기존 {len(existing)} + 신규 {len(new_items)} = 총 {len(combined)}건')
print(f'  → {OUT}')
