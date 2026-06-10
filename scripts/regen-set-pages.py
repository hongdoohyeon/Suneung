#!/usr/bin/env python3
"""exam-set-*.html 회차 SSG + sitemap-sets.xml 을 data/exams.json 에서 재생성.

build-data.py 의 build_static_set_pages / set_friendly_filename 을 그대로
재사용하되, DB 재빌드 없이 현재 exams.json(머지 산출물)을 입력으로 쓴다.
surgical append 로 추가된 시험(옛 학평 2002~2013 등)의 회차 페이지가
누락되어 있던 문제를 해소한다.

sitemap-sets.xml 은 파일명 기준으로 dedupe 한다 — 서로 다른 curriculum
('예비' vs '2015')이 같은 slug(kice) 로 합쳐져 중복 <url> 이 생기던 버그 수정.
"""
import datetime
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location(
    'build_data', ROOT / 'scripts' / 'build-data.py')
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)


def set_priority(curr: str, year_str: str, t: str) -> str:
    """build-data.py main() 내부 _set_priority 와 동일 로직."""
    current_year = datetime.date.today().year + 1
    try:
        gy = int(year_str)
    except ValueError:
        gy = 0
    if t == 'prelim' or curr == 'reference':
        return '0.3'
    if gy and gy <= 2007:
        return '0.3'
    if t in ('csat', 'june', 'sept'):
        if gy >= current_year - 1: return '1.0'
        if gy >= current_year - 3: return '0.9'
        if gy >= 2014: return '0.7'
        return '0.5'
    if gy >= current_year - 1: return '0.8'
    if gy >= current_year - 3: return '0.6'
    return '0.5'


def main() -> None:
    items = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    before = len(list(ROOT.glob('exam-set-*.html')))
    bd.build_static_set_pages(items, ROOT / 'exam-set.html', ROOT)
    after = len(list(ROOT.glob('exam-set-*.html')))
    print(f'회차 SSG: {before} → {after}개')

    # sitemap-sets.xml — 파일명 기준 dedupe
    base = 'https://kicegg.com'
    today = datetime.date.today().isoformat()
    by_fname: dict[str, tuple] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        curr, year, t = it['curriculum'], str(it['gradeYear']), it['type']
        fname = bd.set_friendly_filename(curr, year, t, sg)
        by_fname.setdefault(fname, (curr, year, t))
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for fname in sorted(by_fname):
        curr, year, t = by_fname[fname]
        parts.append(
            f'  <url><loc>{base}/{fname}</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq>'
            f'<priority>{set_priority(curr, year, t)}</priority></url>')
    parts.append('</urlset>')
    (ROOT / 'sitemap-sets.xml').write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print(f'sitemap-sets.xml: {len(by_fname)}개 URL (dedupe 적용)')

    # 정합성: 사이트맵 URL 전부 디스크에 존재해야 함
    missing = [f for f in by_fname if not (ROOT / f).exists()]
    if missing:
        sys.exit(f'사이트맵에 있으나 디스크에 없음: {missing[:5]}')
    print('정합성 OK: sitemap-sets ↔ 디스크 일치')


if __name__ == '__main__':
    main()
