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
        f'  <url><loc>{base}/sets.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>',
        f'  <url><loc>{base}/admissions.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
        f'  <url><loc>{base}/calendar.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
        '</urlset>',
    ]) + '\n', encoding='utf-8')
    print(f'  + sitemap (static 6 + sets {len(sets)} + exams {len(items)})')


def render_sets_directory(items: list[dict]) -> None:
    """sets.html — 전체 회차 정적 디렉토리. 크롤러의 정적 진입 허브:
    footer → sets.html → 회차 페이지(정적 카드) → 시험 페이지로 이어지는
    JS 없는 링크 그래프를 완성한다."""
    groups: dict[str, tuple] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        curr, year, t = str(it['curriculum']), str(it['gradeYear']), it['type']
        fname = bd.set_friendly_filename(curr, year, t, sg)
        groups.setdefault(fname, (curr, year, t, sg, []))[4].append(it)

    by_year: dict[str, list[tuple[str, str]]] = {}
    for fname, (curr, year, t, sg, exams) in groups.items():
        meta = bd.build_set_meta(curr, year, t, sg, exams)
        head = meta['head']
        short = meta.get('short') or ''
        if short and head.endswith('학년도') and head == f'{year}학년도':
            head = f'{head} {short}'
        by_year.setdefault(year, []).append((fname, head))

    sections = []
    for year in sorted(by_year, reverse=True):
        links = ''.join(
            f'<li><a href="{fname}">{bd.html_escape(head, quote=False)}</a></li>'
            for fname, head in sorted(by_year[year], key=lambda x: x[1]))
        label = f'{year}학년도' if year.isdigit() and int(year) < 9000 else '기타'
        sections.append(
            f'<section class="legal__section"><h2>{label}</h2>'
            f'<ul class="setsdir__list">{links}</ul></section>')

    item_list = []
    position = 1
    for year in sorted(by_year, reverse=True):
        for fname, head in sorted(by_year[year], key=lambda x: x[1]):
            item_list.append({
                '@type': 'ListItem',
                'position': position,
                'url': f'https://kicegg.com/{fname}',
                'name': head,
            })
            position += 1

    jsonld = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': 'https://kicegg.com/sets.html',
        'url': 'https://kicegg.com/sets.html',
        'name': '전체 회차 목록',
        'description': '수능·모의평가·학력평가·사관학교·경찰대·LEET·MEET 기출 회차를 학년도별로 탐색하는 정적 목록입니다.',
        'inLanguage': 'ko-KR',
        'isPartOf': {'@id': 'https://kicegg.com/#website'},
        'mainEntity': {
            '@type': 'ItemList',
            'numberOfItems': len(item_list),
            'itemListElement': item_list[:200],
        },
    }
    jsonld_block = json.dumps(jsonld, ensure_ascii=False, separators=(',', ':'))

    page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow" />
  <meta name="theme-color" content="#0a0a0a" />
  <meta name="description" content="수능·모의평가·학력평가·사관학교·경찰대·LEET·MEET 전체 회차 목록. 학년도별 기출 문제지·정답·해설·등급컷 회차로 바로 이동하세요." />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="canonical" href="https://kicegg.com/sets.html" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="기출해체분석기" />
  <meta property="og:title" content="전체 회차 목록 — 기출해체분석기" />
  <meta property="og:description" content="학년도별 수능·모의평가·학력평가·사관학교·경찰대·LEET·MEET 기출 회차 목록." />
  <meta property="og:url" content="https://kicegg.com/sets.html" />
  <meta property="og:image" content="https://kicegg.com/og-image.svg" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="전체 회차 목록 — 기출해체분석기" />
  <meta name="twitter:description" content="학년도별 기출 회차 목록에서 문제지·정답·해설·등급컷으로 바로 이동." />
  <meta name="twitter:image" content="https://kicegg.com/og-image.svg" />
  <script type="application/ld+json">{jsonld_block}</script>
  <link rel="stylesheet" href="lib/vendor/pretendard/pretendardvariable-dynamic-subset.css?v=20260612b" />
  <title>전체 회차 목록 — 기출해체분석기</title>
  <link rel="stylesheet" href="style.css?v=20260612b" />
  <style>.setsdir__list{{columns:3;column-gap:24px;list-style:none;padding:0;margin:0}}
.setsdir__list li{{margin:4px 0;break-inside:avoid}}
@media (max-width:800px){{.setsdir__list{{columns:2}}}}
@media (max-width:480px){{.setsdir__list{{columns:1}}}}</style>
</head>
<body class="page-default">
  <main class="container legal" style="padding:32px 20px;max-width:1080px;margin:0 auto;">
    <h1>전체 회차 목록</h1>
    <p>수능·평가원·교육청·사관학교·경찰대·LEET·MEET 기출 회차를 학년도별로 모았습니다. 각 회차에서 영역별 문제지, 정답, 해설지, 등급컷 자료로 이동할 수 있습니다.</p>
    <p><a href="./">홈</a> · <a href="archive.html">기출 검색</a></p>
    {''.join(sections)}
  </main>
  <footer class="site-footer">
    <div class="container">
      <p class="site-footer__legal">
        <a href="sets.html">전체 회차</a> · <a href="privacy.html">개인정보처리방침</a> · <a href="terms.html">이용약관</a>
      </p>
    </div>
  </footer>
</body>
</html>
'''
    (ROOT / 'sets.html').write_text(page, encoding='utf-8')
    print(f'  + sets.html 회차 디렉토리 ({len(groups)}개 링크)')


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
    render_sets_directory(items)
    render_sitemaps(items)
    render_splits(items)
    print('완료')


if __name__ == '__main__':
    main()
