#!/usr/bin/env python3
"""KICE 카탈로그 → exams.json 신규 항목 추가.
옛 평가원·수능 자료를 외부 다운 링크 방식으로 메타 등록.
"""
import json, re
from pathlib import Path

EXAMS_PATH = Path('data/exams.json')
KICE_PATH  = Path('data/kice-catalog.json')

ROUND_MAP = {'6월':'june','9월':'sept','수능':'csat','예비':'prelim','예시':'prelim'}

# KICE 영역 → 우리 subject 매핑
SUBJ_MAP = {
    '국어': '국어',
    '언어': '국어',
    '수학': '수학',
    '수리': '수학',
    '영어': '영어',
    '외국어': '영어',
    '한국사': '한국사',
    '사회탐구': '사회탐구',
    '과학탐구': '과학탐구',
    '직업탐구': '직업탐구',
    '제2외국어': '제2외국어',
    '제2외국어/한문': '제2외국어',
    '인문계': '인문계',
    '자연계': '자연계',
    '예체능계': '예체능계',
}

KICE_DL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq='

# 학년도별 가형/나형(수학) 처리 — 옛 자료에는 가/나 분리
def derive_subsubject(kice_subject, files):
    # 파일명에서 가형/나형 등 단서
    fnames = ' '.join(f['fileName'] for f in files)
    if '가형' in fnames or '_가_' in fnames or '_가.' in fnames:
        return '가형'
    if '나형' in fnames or '_나_' in fnames or '_나.' in fnames:
        return '나형'
    return None

def main():
    exams  = json.loads(EXAMS_PATH.read_text(encoding='utf-8'))
    kice   = json.loads(KICE_PATH.read_text(encoding='utf-8'))

    # 우리 보유 회차 셋
    have = {(e['gradeYear'], e['type']) for e in exams if e['typeGroup']=='suneung'}
    # 우리 보유 (학년도, 회차, 영역, 소과목) 셋 — 중복 방지
    have_full = {(e['gradeYear'], e['type'], e['subject'], e.get('subSubject'))
                 for e in exams if e['typeGroup']=='suneung'}

    # 다음 ID
    next_id = max(e['id'] for e in exams) + 1

    new_items = []
    for board, rows in kice['boards'].items():
        for r in rows:
            gy_str = r.get('gradeYear', '')
            if not gy_str.isdigit(): continue
            gy = int(gy_str)
            t = ROUND_MAP.get(r.get('round'))
            if not t: continue

            # 우리 보유 회차면 skip (영역 보강은 별도 작업)
            if (gy, t) in have: continue

            kice_sub = r['subject'].strip()
            our_subj = SUBJ_MAP.get(kice_sub, kice_sub)
            sub_sub  = derive_subsubject(kice_sub, r['files'])

            if (gy, t, our_subj, sub_sub) in have_full: continue

            files = r['files']
            if not files: continue

            # 첫 PDF 또는 ZIP — 문제지/통합본 가정
            q_file = files[0]
            a_file = files[1] if len(files) > 1 else None

            # 옛 수능 1999~2003: 인문/자연/예체능계 수능 (한 게시글에 한 영역 묶음)
            curriculum = ('2009' if gy >= 2014 else ('2007개정' if gy >= 2012 else ('7차' if gy >= 2005 else '6차')))

            item = {
                'id': next_id,
                'curriculum': curriculum,
                'gradeYear':  gy,
                'examYear':   gy - 1,
                'month':      {'june': 6, 'sept': 9, 'csat': 11, 'prelim': 0}.get(t, 0),
                'studentGrade': 3,
                'typeGroup':  'suneung',
                'type':       t,
                'subject':    our_subj,
                'subSubject': sub_sub,
                'questionUrl': KICE_DL + q_file['fileSeq'],
                'questionDownload': q_file['fileName'],
                'answerUrl':       KICE_DL + a_file['fileSeq'] if a_file else None,
                'answerDownload':  a_file['fileName'] if a_file else None,
                'solutionUrl': None,
                'source':      'kice-archive',
                '_kice':       {'postId': r['postId'], 'date': r['date']},
            }
            new_items.append(item)
            next_id += 1

    # exams.json에 append
    print(f'▣ 추가 가능: {len(new_items)}건')
    by_year = {}
    for it in new_items:
        by_year.setdefault(it['gradeYear'], 0)
        by_year[it['gradeYear']] += 1
    for y in sorted(by_year):
        print(f'  {y}학년도: {by_year[y]}건')

    # 임시 dry-run — 실제 저장은 OK 확인 후
    out = Path('data/kice-archive-new-items.json')
    out.write_text(json.dumps(new_items, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n✓ dry-run: {out}')
    print(f'  이 데이터를 exams.json 에 합치려면 두 번째 인자 --apply')

    if '--apply' in __import__('sys').argv:
        merged = exams + new_items
        # ID 재정렬·정렬
        merged.sort(key=lambda i: (-i['gradeYear'], -(i.get('month') or 0), i.get('subject',''), i.get('subSubject') or ''))
        EXAMS_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'\n✓ exams.json 업데이트: {len(exams)} → {len(merged)}')

if __name__ == '__main__':
    main()
