#!/usr/bin/env python3
"""KICE 카탈로그 vs 우리 보유 비교 — 추가 가능 자료 식별."""
import json
from collections import defaultdict
from pathlib import Path

ours = json.load(open('data/exams.json'))
kice = json.load(open('data/kice-catalog.json'))

# 우리 보유 set: (curr, gradeYear, type)  curr=2009/2015 둘 다 평가원, type=csat/jun/sept/prelim
ours_set = set()
for e in ours:
    if e['typeGroup'] != 'suneung': continue
    gy = e['gradeYear']
    t  = e['type']
    ours_set.add((gy, t))

# KICE 우리 식 (gradeYear, type) 변환
def kice_to_type(row):
    rd = row.get('round', '')
    if rd == '6월':  return 'jun'
    if rd == '9월':  return 'sept'
    if rd == '수능': return 'csat'
    if rd == '예비' or rd == '예시': return 'prelim'
    return None

# KICE 게시글 → (학년도, 회차) 학년도별 영역수 카운트
kice_keyed = defaultdict(list)
for board_name, rows in kice['boards'].items():
    for r in rows:
        gy_str = r.get('gradeYear', '')
        if not gy_str.isdigit(): continue
        gy = int(gy_str)
        t = kice_to_type(r)
        if not t: continue
        kice_keyed[(gy, t)].append(r)

print(f'▣ KICE 카탈로그 (학년도, 회차) 키: {len(kice_keyed)}개')
print(f'▣ 우리 보유 (학년도, 회차) 키:    {len(ours_set)}개\n')

# KICE에 있고 우리에게 없는 회차
kice_only = sorted(set(kice_keyed.keys()) - ours_set)
print(f'▣ 신규 추가 가능 회차: {len(kice_only)}개')
for (gy, t) in kice_only[:50]:
    rows = kice_keyed[(gy, t)]
    subjects = sorted({r['subject'] for r in rows})
    n_files = sum(len(r['files']) for r in rows)
    print(f'  {gy}학년도 {t:<6}  {len(rows):>2}게시글 / {n_files:>3}파일  영역: {", ".join(subjects[:8])}')
if len(kice_only) > 50:
    print(f'  ... 외 {len(kice_only)-50}개')

# 우리에게는 있고 KICE에 없는 — 학평일 가능성
ours_only = sorted(ours_set - set(kice_keyed.keys()))
print(f'\n▣ 우리에게만 있는 (학평·옛 학평 등): {len(ours_only)}개  (KICE는 평가원만이므로 정상)')

# 둘 다 있는 회차의 영역 비교
print(f'\n▣ 양쪽 보유 — 영역별 누락')
both = ours_set & set(kice_keyed.keys())
gap_count = 0
for (gy, t) in sorted(both):
    kice_subjects = {r['subject'] for r in kice_keyed[(gy, t)]}
    our_subjects  = {e['subject'] for e in ours if e['gradeYear']==gy and e.get('type')==t}
    # KICE 영역 명칭 → 우리 식 매핑
    SUBJ_MAP = {'국어':'국어','수학':'수학','영어':'영어','외국어':'영어',
                '한국사':'한국사','사회탐구':'사회탐구','과학탐구':'과학탐구',
                '직업탐구':'직업탐구','제2외국어/한문':'제2외국어',
                '언어':'국어','수리':'수학'}
    kice_mapped = {SUBJ_MAP.get(s, s) for s in kice_subjects}
    missing_in_ours = kice_mapped - our_subjects
    if missing_in_ours:
        gap_count += len(missing_in_ours)
        # print(f'  {gy} {t}: 우리 누락 {missing_in_ours}')

print(f'  영역 누락 합계: {gap_count}건')

# 다운로드 용량 추정
total_files = sum(len(r['files']) for rows in kice_keyed.values() for r in rows)
print(f'\n▣ KICE 전체 다운로드 용량 추정')
print(f'  총 파일 수: {total_files}건')
print(f'  평균 파일 크기 ~3MB 가정 시: {total_files * 3 / 1024:.1f} GB')
print(f'  새로 추가 가능 (회차+영역 포함): 추정 ~{len(kice_only) * 9 + gap_count}건')
