#!/usr/bin/env python3
"""수능·평가원 모의 자료 보유 현황 보고서.

각 (학년도, 영역, 선택과목) 단위로 문제지/정답표 보유 여부를 표시.
홀수·짝수 분리된 자료는 별도 표기.

산출:
  REPORT_KICE_COVERAGE.md
"""
from __future__ import annotations
import json
from collections import defaultdict
from pathlib import Path

ITEMS = json.load(open('data/exams.json'))

# 수능·평가원 모의만
suneung = [i for i in ITEMS if i.get('typeGroup') == 'suneung']

TYPE_LABEL = {'csat': '수능', 'june': '6모', 'sept': '9모', 'prelim': '예비/예시'}
TYPE_ORDER = ['csat', 'sept', 'june', 'prelim']

# 영역 표준 순서
SUBJ_ORDER = [
    '국어', '수학', '영어', '한국사',
    '사회탐구', '과학탐구', '직업탐구',
    '제2외국어',
    # 옛 영역
    '인문계', '자연계', '예체능계',
]
def subj_key(s): return SUBJ_ORDER.index(s) if s in SUBJ_ORDER else 99

# 보유 표시 4종
def status(it):
    has_q  = bool(it.get('questionUrl'))
    has_qe = bool(it.get('questionUrlEven'))
    has_a  = bool(it.get('answerUrl'))
    has_ae = bool(it.get('answerUrlEven'))
    sym = []
    sym.append('●' if has_q else '○')
    sym.append('▣' if has_qe else '·')   # 짝수 분리
    sym.append('●' if has_a else '○')
    sym.append('▣' if has_ae else '·')
    # 표기: q/qE/a/aE → '●▣●▣' (홀+짝 모두)
    return ''.join(sym)

# 학년도별 그룹핑
by_year_type = defaultdict(lambda: defaultdict(list))
for it in suneung:
    by_year_type[it['gradeYear']][it['type']].append(it)

# ─ 보고서 작성 ─
lines = []
lines.append('# 수능·평가원 자료 보유 현황 보고서')
lines.append('')
lines.append(f'생성: 자동 (`scripts/coverage-report.py`)')
lines.append(f'대상: typeGroup=suneung 자료 {len(suneung)}건')
lines.append('')
lines.append('## 표기')
lines.append('')
lines.append('각 셀 4문자: `[문제지홀][문제지짝][정답홀][정답짝]`')
lines.append('- `●` = 보유, `○` = 누락 (홀수형)')
lines.append('- `▣` = 별도 분리 보유, `·` = 분리본 없음 (짝수형)')
lines.append('')
lines.append('짝수형 분리본이 없는 경우 = 평가원이 짝수형을 별도 공개하지 않음 (문제지/정답표 PDF 안에 짝수가 함께 들어있거나 홀수 기준 단일).')
lines.append('')
lines.append('---')
lines.append('')

# ── 섹션 1: 수능 (csat) ──
lines.append('## 수능 (csat)')
lines.append('')
lines.append('| 학년도 | 영역 | 선택과목 | 상태 | 자료 |')
lines.append('|---|---|---|---|---|')
csat_rows = []
csat_missing_q = 0
csat_missing_a = 0
for gy in sorted(by_year_type.keys(), reverse=True):
    items = sorted(by_year_type[gy].get('csat', []),
                   key=lambda i: (subj_key(i['subject']), i.get('subSubject') or ''))
    for it in items:
        st = status(it)
        if not it.get('questionUrl'): csat_missing_q += 1
        if not it.get('answerUrl'):   csat_missing_a += 1
        sub = it.get('subSubject') or '–'
        # 홀짝 별도 분리 자료 유무 — 표시 강조
        even_note = []
        if it.get('questionUrlEven'): even_note.append('문제지 짝수 분리')
        if it.get('answerUrlEven'):   even_note.append('정답 짝수 분리')
        note = ', '.join(even_note) if even_note else ''
        lines.append(f'| {gy} | {it["subject"]} | {sub} | `{st}` | {note} |')

# ── 섹션 2: 평가원 6월 모의 ──
lines.append('')
lines.append('## 평가원 6월 모의 (june)')
lines.append('')
lines.append('| 학년도 | 영역 | 선택과목 | 상태 |')
lines.append('|---|---|---|---|')
june_missing_q = june_missing_a = 0
for gy in sorted(by_year_type.keys(), reverse=True):
    items = sorted(by_year_type[gy].get('june', []),
                   key=lambda i: (subj_key(i['subject']), i.get('subSubject') or ''))
    for it in items:
        st = status(it)
        if not it.get('questionUrl'): june_missing_q += 1
        if not it.get('answerUrl'):   june_missing_a += 1
        sub = it.get('subSubject') or '–'
        lines.append(f'| {gy} | {it["subject"]} | {sub} | `{st}` |')

# ── 섹션 3: 평가원 9월 모의 ──
lines.append('')
lines.append('## 평가원 9월 모의 (sept)')
lines.append('')
lines.append('| 학년도 | 영역 | 선택과목 | 상태 |')
lines.append('|---|---|---|---|')
sept_missing_q = sept_missing_a = 0
for gy in sorted(by_year_type.keys(), reverse=True):
    items = sorted(by_year_type[gy].get('sept', []),
                   key=lambda i: (subj_key(i['subject']), i.get('subSubject') or ''))
    for it in items:
        st = status(it)
        if not it.get('questionUrl'): sept_missing_q += 1
        if not it.get('answerUrl'):   sept_missing_a += 1
        sub = it.get('subSubject') or '–'
        lines.append(f'| {gy} | {it["subject"]} | {sub} | `{st}` |')

# ── 섹션 4: 예비/예시 (prelim) ──
prelim_items = [i for items in by_year_type.values() for i in items.get('prelim', [])]
prelim_missing_q = prelim_missing_a = 0
if prelim_items:
    lines.append('')
    lines.append('## 예비·예시 (prelim)')
    lines.append('')
    lines.append('| 학년도 | 영역 | 선택과목 | 상태 |')
    lines.append('|---|---|---|---|')
    for gy in sorted(by_year_type.keys(), reverse=True):
        items = sorted(by_year_type[gy].get('prelim', []),
                       key=lambda i: (subj_key(i['subject']), i.get('subSubject') or ''))
        for it in items:
            st = status(it)
            if not it.get('questionUrl'): prelim_missing_q += 1
            if not it.get('answerUrl'):   prelim_missing_a += 1
            sub = it.get('subSubject') or '–'
            lines.append(f'| {gy} | {it["subject"]} | {sub} | `{st}` |')

# ── 요약 ──
lines.insert(0, '<!-- AUTO-GENERATED — do not edit by hand -->')
summary = [
    '',
    '## 요약',
    '',
    f'- **총 자료**: {len(suneung):,}건',
    f'- **수능(csat)**: {sum(len(t.get("csat",[])) for t in by_year_type.values())}건 — 문제지 누락 {csat_missing_q}, 정답표 누락 {csat_missing_a}',
    f'- **6월 모의(june)**: {sum(len(t.get("june",[])) for t in by_year_type.values())}건 — 문제지 누락 {june_missing_q}, 정답표 누락 {june_missing_a}',
    f'- **9월 모의(sept)**: {sum(len(t.get("sept",[])) for t in by_year_type.values())}건 — 문제지 누락 {sept_missing_q}, 정답표 누락 {sept_missing_a}',
    f'- **예비/예시(prelim)**: {len(prelim_items)}건 — 문제지 누락 {prelim_missing_q}, 정답표 누락 {prelim_missing_a}',
    f'- **짝수 문제지 분리 보유**: {sum(1 for i in suneung if i.get("questionUrlEven"))}건',
    f'- **짝수 정답표 분리 보유**: {sum(1 for i in suneung if i.get("answerUrlEven"))}건',
    '',
    '---',
    '',
]
# 요약을 표기 설명 다음(첫 ---가 위치) 에 끼움
out_lines = lines[:lines.index('---') + 1] + summary[1:] + lines[lines.index('---') + 1:]

OUT = Path('REPORT_KICE_COVERAGE.md')
OUT.write_text('\n'.join(out_lines), encoding='utf-8')
print(f'✓ {OUT} ({len(out_lines)} lines)')

# 콘솔에 요약 출력
for s in summary[1:]: print(s)
