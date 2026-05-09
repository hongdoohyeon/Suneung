#!/usr/bin/env python3
"""KICE 자료마당 4개 게시판에서 메타 자동 수집.
게시판마다 컬럼 구조가 달라 유연 파서 사용 — tbody의 tr 단위 + td 추출 + onclick.
"""
import re, json, time, sys
from urllib.request import urlopen, Request
from pathlib import Path

OUT = Path('data/kice-catalog.json')
BOARDS = {
    'csat':     1500234,   # 대학수학능력시험 (수능 1회/년)
    'csat_old': 1500235,   # 수능 (2004 이전)
    'mock':     1500236,   # 모의평가 (6/9월)
    'preview':  1500237,   # 2028 예시문항
}
UA = 'Mozilla/5.0 (compatible; KICE-archive/1.0)'

TR_RE      = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
TD_RE      = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
GOVIEW_RE  = re.compile(r"goView\('(\d+)','(\d+)'")
FILE_RE    = re.compile(r"fn_fileDown\('([0-9a-f]+)'\)[^>]*title='([^']+)'")
TAG_RE     = re.compile(r"<[^>]+>")

def clean(s):
    return TAG_RE.sub('', s).strip()

def fetch(url):
    req = Request(url, headers={'User-Agent': UA})
    return urlopen(req, timeout=30).read().decode('utf-8', errors='replace')

def parse_page(html):
    rows = []
    body_match = re.search(r'<tbody[^>]*>(.*?)</tbody>', html, re.DOTALL)
    if not body_match: return rows
    for tr_html in TR_RE.findall(body_match.group(1)):
        if 'goView' not in tr_html: continue
        tds = [clean(td) for td in TD_RE.findall(tr_html)]
        if len(tds) < 5: continue
        gv = GOVIEW_RE.search(tr_html)
        files = [{'fileSeq': fs, 'fileName': fn} for fs, fn in FILE_RE.findall(tr_html)]
        # csat / csat_old / preview: [번호, 학년도, 영역, 제목, 등록일, 조회수, 첨부]
        # mock:                       [번호, 학년도, 회차, 영역, 제목, 등록일, 첨부, 조회수]
        # 분기: 7~8 컬럼, 학년도/회차 위치 추정
        gy = tds[1] if tds[1].isdigit() else ''
        if len(tds) >= 8 and tds[2] in ('6월', '9월', '예비', '예시'):
            row = {'gradeYear': gy, 'round': tds[2], 'subject': tds[3]}
        else:
            row = {'gradeYear': gy, 'round': '수능', 'subject': tds[2]}
        row.update({
            'no': tds[0],
            'postId': gv.group(2) if gv else '',
            'date': next((t for t in tds if re.fullmatch(r'\d{4}-\d{2}-\d{2}', t)), ''),
            'files': files,
        })
        rows.append(row)
    return rows

def fetch_board(name, board_id):
    print(f'\n▣ {name} (boardID={board_id})')
    base = f'https://www.suneung.re.kr/boardCnts/list.do?boardID={board_id}&m=0403&s=suneung'
    all_rows, page = [], 1
    while True:
        url = f'{base}&page={page}'
        html = fetch(url)
        rows = parse_page(html)
        if not rows: break
        all_rows.extend(rows)
        if page == 1 or page % 5 == 0:
            print(f'  page {page:2}: +{len(rows)} (총 {len(all_rows)})')
        page += 1
        time.sleep(0.25)
        if page > 60: break
    print(f'  → 총 {len(all_rows)}건')
    return all_rows

def main():
    catalog = {'_generated': time.strftime('%Y-%m-%d'), 'boards': {}}
    for name, bid in BOARDS.items():
        try:
            catalog['boards'][name] = fetch_board(name, bid)
        except Exception as e:
            print(f'  ! 실패: {e}', file=sys.stderr)
            catalog['boards'][name] = []

    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n✓ 카탈로그: {OUT}')

    print('\n▣ 결과 요약')
    for name, rows in catalog['boards'].items():
        years = sorted({int(r['gradeYear']) for r in rows if r['gradeYear'].isdigit()})
        if not years:
            print(f'  {name:<10} 0건')
        else:
            print(f'  {name:<10} {len(rows):>4}건  {years[0]}~{years[-1]} ({len(years)}년)')

if __name__ == '__main__':
    main()
