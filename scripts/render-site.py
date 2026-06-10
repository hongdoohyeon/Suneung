#!/usr/bin/env python3
"""data/exams.json → 사이트 산출물 전체 재렌더 (안전한 표준 경로).

build-data.py(DB 인제스트, 단독 실행 금지)와 달리 이 스크립트는 데이터를
만들지 않는다 — 현재 exams.json(머지 산출물)을 유일한 입력으로:
  1. exam-{id}.html SSG + og/exam-{id}.jpg  (build_static_exam_pages)
  2. exam-set-*.html 회차 SSG               (build_static_set_pages)
  3. sitemap 4종 (index/static/sets/exams — sets 는 파일명 dedupe)
  4. data/exam/{id}.json 단건 split (+고아 split 제거)

exams.json 을 수정했으면 이 스크립트 한 번으로 사이트 전체가 동기화된다.
"""
import datetime
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location(
    'build_data', ROOT / 'scripts' / 'build-data.py')
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)


def render_sitemaps(items: list[dict]) -> None:
    base = 'https://kicegg.com'
    today = datetime.date.today().isoformat()
    current_year = datetime.date.today().year + 1  # 학년도 cohort

    def exam_priority(it):
        gy = it.get('gradeYear', 0) or 0
        tp = it.get('type', '')
        tg = it.get('typeGroup', '')
        is_english = (it.get('subject') == '영어')
        has_listen = bool(it.get('listenUrl') or it.get('scriptUrl'))
        if tg == 'reference' or tp == 'prelim': return '0.2'
        if gy and gy <= 2007: return '0.2'
        if tg == 'suneung' and tp in ('csat', 'june', 'sept'):
            if gy >= current_year - 1: return '0.9'
            if gy >= current_year - 3: return '0.7'
            if gy >= 2014: return '0.5'
            return '0.3'
        if gy >= current_year - 1: return '0.7' if (is_english and has_listen) else '0.6'
        if gy >= current_year - 3: return '0.5' if (is_english and has_listen) else '0.4'
        return '0.4' if (is_english and has_listen) else '0.3'

    def set_priority(curr, year_str, t):
        try: gy = int(year_str)
        except ValueError: gy = 0
        if t == 'prelim' or curr == 'reference': return '0.3'
        if gy and gy <= 2007: return '0.3'
        if t in ('csat', 'june', 'sept'):
            if gy >= current_year - 1: return '1.0'
            if gy >= current_year - 3: return '0.9'
            if gy >= 2014: return '0.7'
            return '0.5'
        if gy >= current_year - 1: return '0.8'
        if gy >= current_year - 3: return '0.6'
        return '0.5'

    # sets — 파일명 dedupe
    sets: dict[str, tuple] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        curr, year, t = it['curriculum'], str(it['gradeYear']), it['type']
        sets.setdefault(bd.set_friendly_filename(curr, year, t, sg), (curr, year, t))
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for fname in sorted(sets):
        curr, year, t = sets[fname]
        parts.append(f'  <url><loc>{base}/{fname}</loc><lastmod>{today}</lastmod>'
                     f'<changefreq>monthly</changefreq><priority>{set_priority(curr, year, t)}</priority></url>')
    parts.append('</urlset>')
    (ROOT / 'sitemap-sets.xml').write_text('\n'.join(parts) + '\n', encoding='utf-8')

    # exams
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for it in items:
        parts.append(f'  <url><loc>{base}/exam-{it["id"]}.html</loc><lastmod>{today}</lastmod>'
                     f'<changefreq>monthly</changefreq><priority>{exam_priority(it)}</priority></url>')
    parts.append('</urlset>')
    (ROOT / 'sitemap-exams.xml').write_text('\n'.join(parts) + '\n', encoding='utf-8')

    # index + static
    (ROOT / 'sitemap.xml').write_text('\n'.join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <sitemap><loc>{base}/sitemap-static.xml</loc></sitemap>',
        f'  <sitemap><loc>{base}/sitemap-sets.xml</loc></sitemap>',
        f'  <sitemap><loc>{base}/sitemap-exams.xml</loc></sitemap>',
        '</sitemapindex>',
    ]) + '\n', encoding='utf-8')
    (ROOT / 'sitemap-static.xml').write_text('\n'.join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{base}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>',
        f'  <url><loc>{base}/archive.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>',
        f'  <url><loc>{base}/gradecut.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>',
        f'  <url><loc>{base}/admissions.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
        f'  <url><loc>{base}/calendar.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
        '</urlset>',
    ]) + '\n', encoding='utf-8')
    print(f'  + sitemap (static 5 + sets {len(sets)} + exams {len(items)})')


def render_splits(items: list[dict]) -> None:
    out = ROOT / 'data' / 'exam'
    out.mkdir(exist_ok=True)
    ids = {it['id'] for it in items}
    written = 0
    for it in items:
        p = out / f"{it['id']}.json"
        body = json.dumps(it, ensure_ascii=False)
        if not p.exists() or p.read_text(encoding='utf-8') != body:
            p.write_text(body, encoding='utf-8')
            written += 1
    pruned = 0
    for p in out.glob('*.json'):
        if p.stem.isdigit() and int(p.stem) not in ids:
            p.unlink()
            pruned += 1
    print(f'  + split 동기화 {written}건 / 고아 제거 {pruned}건')


def main() -> None:
    items = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    print(f'exams.json {len(items)}건 → 전체 재렌더')
    bd.build_static_exam_pages(items, ROOT / 'exam.html', ROOT)
    bd.build_static_set_pages(items, ROOT / 'exam-set.html', ROOT)
    render_sitemaps(items)
    render_splits(items)
    print('완료')


if __name__ == '__main__':
    main()
