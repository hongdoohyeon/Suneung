#!/usr/bin/env python3
"""1999~2004 인문계/자연계/예체능계 통합 합본 PDF 를 영역별 5장으로 expand.

원본: subject='인문계' 1건 (PDF 안에 언어/수리/외국어/사탐 모두)
변환: subject='국어'/'수학'/'영어'/'사회탐구' 4~5건 (같은 PDF url, subSubject='인문계')

이렇게 하면 영역별 필터·검색·카드에 정상 노출되고, 다운로드는 통합 시험지.
"""
import json, copy
from pathlib import Path

SRC = Path('data/kice-archive-new-items.json')
items = json.loads(SRC.read_text(encoding='utf-8'))

# 옛 수능 (~2004) 영역 매핑 — 계열별 응시 영역
AREA_BY_TRACK = {
    '인문계':   ['국어', '수학', '영어', '사회탐구'],
    '자연계':   ['국어', '수학', '영어', '과학탐구'],
    '예체능계': ['국어', '수학', '영어'],
}

# 전수 expand 대상 — subject 가 계열명인 항목
TARGET_SUBJECTS = set(AREA_BY_TRACK.keys())

new_items = []
expanded = 0
skipped = 0
for it in items:
    sub = it.get('subject')
    gy = it.get('gradeYear', 0)
    # 1995~2004 까지의 통합 시험지만 expand (5차/6차)
    if sub in TARGET_SUBJECTS and isinstance(gy, int) and 1995 <= gy <= 2004:
        track = sub
        for area in AREA_BY_TRACK[track]:
            new = copy.deepcopy(it)
            new['subject'] = area
            new['subSubject'] = track
            # download 파일명 갱신 — 영역명 + 계열명
            ext = '.pdf'
            new['questionDownload'] = f"{gy}학년도_csat_{area}_{track}_문제지(통합본){ext}" if it.get('questionUrl') else None
            new['answerDownload']   = f"{gy}학년도_csat_{area}_{track}_정답표{ext}" if it.get('answerUrl') else None
            new_items.append(new)
            expanded += 1
        continue
    new_items.append(it)
    skipped += 1

print(f'▣ 원본 {len(items)} → expand 결과 {len(new_items)}')
print(f'  expand 항목 (1999~2004 통합 시험지): {expanded}건')
print(f'  보존: {skipped}건')

SRC.write_text(json.dumps(new_items, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'✓ {SRC} 갱신')
