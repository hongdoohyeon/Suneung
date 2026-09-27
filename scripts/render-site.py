#!/usr/bin/env python3
"""data/exams.json → 사이트 산출물 전체 재렌더 (안전한 표준 경로).

build-data.py(DB 인제스트, 단독 실행 금지)와 달리 이 스크립트는 데이터를
만들지 않는다 — 현재 exams.json(머지 산출물)을 유일한 입력으로:
  1. exam-{id}.html SSG + og/exam-{id}.jpg  (build_static_exam_pages)
  2. exam-set-*.html 회차 SSG               (build_static_set_pages)
  3. sitemap 4종 (index/static/sets/exams — sets 는 파일명 dedupe)
  4. data/exam/{id}.json 단건 split (+고아 split 제거)
  5. data/archive/{tab}.json 검색 탭 split

exams.json 을 수정했으면 이 스크립트 한 번으로 사이트 전체가 동기화된다.
"""
import datetime
import importlib.util
import json
import re
import hashlib
import subprocess
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location(
    'build_data', ROOT / 'scripts' / 'build-data.py')
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)

# 사이트맵 lastmod 안정값 — exam/회차 페이지 *콘텐츠*(렌더 로직·구조)가 실질적으로
# 바뀔 때만 갱신한다. 매 빌드 today 로 두면 8824건 lastmod 가 동시에 흔들려 변경
# 신호가 희석되므로 고정값으로 둔다(데이터 추가만으로는 올리지 않음).
CONTENT_VERSION = '2026-07-13'
# 상세 페이지 틀(build-data SSG)이 바뀌어 모든 페이지 내용이 달라졌을 때 올린다 → 사이트맵 lastmod 가 전부 갱신
TEMPLATE_REV = '2026-09-28'

ARCHIVE_TAB_RULES = {
    'senior':     {'curriculums': {'2015', '2009', '2007개정', '7차', '6차', '예비'}, 'education_grade': 3},
    'junior':     {'curriculums': {'2015', '2009', '2007개정', '7차'}, 'education_grade': 2, 'education_only': True},
    'freshman':   {'curriculums': {'2015', '2009', '2007개정', '7차'}, 'education_grade': 1, 'education_only': True},
    'mp':         {'curriculums': {'사관', '경찰대'}},
    'gradschool': {'curriculums': {'LEET', 'MEET'}},
    'essay':      {'curriculums': {'논술'}},
    'gedhigh':    {'curriculums': {'고졸'}},
    'gedmid':     {'curriculums': {'중졸'}},
    'gedelem':    {'curriculums': {'초졸'}},
}


def render_sitemaps(items: list[dict], hubs=None) -> None:
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

    # 시험별 실제 수정일 — 항목 내용(+틀 버전) 해시가 바뀐 날을 data/sitemap-lastmod.json 에 기억
    import hashlib
    state_path = ROOT / 'data' / 'sitemap-lastmod.json'
    try:
        state = json.loads(state_path.read_text(encoding='utf-8'))
    except Exception:
        state = {}
    lastmod = {}
    raw = {e['id']: e for e in json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))}   # 빌드 중 가공 전 원본으로 해시
    for it in items:
        h = hashlib.sha1((json.dumps(raw.get(it['id'], it), ensure_ascii=False, sort_keys=True) + TEMPLATE_REV).encode()).hexdigest()[:12]
        prev = state.get(str(it['id']))
        lastmod[it['id']] = prev[1] if prev and prev[0] == h else today
        state[str(it['id'])] = [h, lastmod[it['id']]]
    live = {str(it['id']) for it in items}
    state = {k: v for k, v in sorted(state.items(), key=lambda kv: int(kv[0])) if k in live}
    state_path.write_text(json.dumps(state, separators=(',', ':')) + '\n', encoding='utf-8')

    # sets — 파일명 dedupe
    sets: dict[str, tuple] = {}
    set_mod: dict[str, str] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        curr, year, t = it['curriculum'], str(it['gradeYear']), it['type']
        fn = bd.set_friendly_filename(curr, year, t, sg)
        sets.setdefault(fn, (curr, year, t))
        set_mod[fn] = max(set_mod.get(fn, ''), lastmod[it['id']])
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for fname in sorted(sets):
        curr, year, t = sets[fname]
        parts.append(f'  <url><loc>{base}/{fname}</loc><lastmod>{set_mod[fname]}</lastmod>'
                     f'<changefreq>monthly</changefreq><priority>{set_priority(curr, year, t)}</priority></url>')
    parts.append('</urlset>')
    (ROOT / 'sitemap-sets.xml').write_text('\n'.join(parts) + '\n', encoding='utf-8')

    # exams
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for it in items:
        parts.append(f'  <url><loc>{base}/exam-{it["id"]}.html</loc><lastmod>{lastmod[it["id"]]}</lastmod>'
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
    static_rows = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{base}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>',
        f'  <url><loc>{base}/sets.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>',
        f'  <url><loc>{base}/essay.html</loc><lastmod>{CONTENT_VERSION}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>',
        f'  <url><loc>{base}/ged.html</loc><lastmod>{CONTENT_VERSION}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>',
        f'  <url><loc>{base}/about.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>',
        f'  <url><loc>{base}/calendar.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
    ]
    for h in (hubs or []):
        hub_mod = max((lastmod.get(e['id'], CONTENT_VERSION) for e in h.get('exams', [])), default=CONTENT_VERSION)
        static_rows.append(f'  <url><loc>{base}/{h["fname"]}</loc><lastmod>{hub_mod}</lastmod>'
                           f'<changefreq>monthly</changefreq><priority>0.7</priority></url>')
    static_rows.append('</urlset>')
    (ROOT / 'sitemap-static.xml').write_text('\n'.join(static_rows) + '\n', encoding='utf-8')
    print(f'  + sitemap (static {6 + len(hubs or [])} + sets {len(sets)} + exams {len(items)})')


def _essay_label(it: dict) -> str:
    lbl = '모의논술' if it.get('type') == 'essay_mock' else '논술'
    track = it.get('subSubject') or ''
    return f'{it.get("gradeYear")}학년도 {lbl}' + (f' · {track}' if track else '')


def essay_hub_list(items: list[dict]) -> list[dict]:
    """대학별 논술 허브 데이터 — subject(대학)별로 essay 엔트리를 모은다."""
    missing = sorted({it.get('subject') for it in items
                      if it.get('typeGroup') == 'essay'
                      and not bd.essay_hub_filename(it.get('subject'))})
    if missing:
        raise ValueError(f'ESSAY_SCHOOL_SLUG 매핑 누락: {", ".join(missing)}')

    by_school: dict[str, list] = {}
    for it in items:
        if it.get('typeGroup') != 'essay':
            continue
        by_school.setdefault(it['subject'], []).append(it)
    hubs = []
    for school, exams in by_school.items():
        years = [e.get('gradeYear') for e in exams if e.get('gradeYear')]
        hubs.append({'fname': bd.essay_hub_filename(school), 'school': school,
                     'exams': exams, 'count': len(exams),
                     'ymin': min(years) if years else None, 'ymax': max(years) if years else None})
    hubs.sort(key=lambda h: -h['count'])
    return hubs


def _hub_page(fname: str, h1: str, title: str, desc: str, intro: str,
              stat: str, sections: list, breadcrumb_name: str, item_list: list) -> None:
    """허브 페이지(논술·과목 공용) HTML 생성·기록. legal 페이지 골격 재사용."""
    base = 'https://kicegg.com'
    canonical = f'{base}/{fname}'
    jsonld = {'@context': 'https://schema.org', '@type': 'CollectionPage', '@id': canonical,
              'url': canonical, 'name': h1, 'description': desc, 'inLanguage': 'ko-KR',
              'isPartOf': {'@id': 'https://kicegg.com/#website'},
              'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(item_list),
                             'itemListElement': item_list[:200]}}
    breadcrumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': '홈', 'item': base + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': '전체 회차', 'item': base + '/sets.html'},
        {'@type': 'ListItem', 'position': 3, 'name': breadcrumb_name, 'item': canonical}]}
    ld = (json.dumps(jsonld, ensure_ascii=False, separators=(',', ':'))
          + '</script>\n  <script type="application/ld+json">'
          + json.dumps(breadcrumb, ensure_ascii=False, separators=(',', ':')))

    page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f4f4f5" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https://suneung-files.hdh061224.workers.dev https://wdown.ebsi.co.kr https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.google.com; media-src 'self' https://suneung-files.hdh061224.workers.dev; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta name="naver-site-verification" content="b3138c38039611bed2ce955aa7102ab33011cf14" />
  <meta name="description" content="{bd.html_escape(desc, quote=True)}" />
  <meta name="robots" content="index,follow" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="기출해체분석기" />
  <meta property="og:title" content="{bd.html_escape(title, quote=True)}" />
  <meta property="og:description" content="{bd.html_escape(desc, quote=True)}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="https://kicegg.com/og-image.png" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{bd.html_escape(title, quote=True)}" />
  <meta name="twitter:description" content="{bd.html_escape(desc, quote=True)}" />
  <meta name="twitter:image" content="https://kicegg.com/og-image.png" />
  <script type="application/ld+json">{ld}</script>
  <title>{bd.html_escape(title, quote=True)}</title>
  <link rel="stylesheet" href="lib/vendor/pretendard/pretendardvariable-dynamic-subset.css" />
  <link rel="stylesheet" href="style.css?v=20260727a" />
  <script src="lib/site-prefs.js"></script>
</head>
<body class="page-legal">
  <a href="#main" class="skip-link">본문 건너뛰기</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a href="index.html" class="brand" aria-label="기출해체분석기 홈">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
            <rect width="32" height="32" rx="8" fill="currentColor"/>
            <rect class="brand__bar" x="8"  y="15" width="3.2" height="10" rx="1" opacity=".55"/>
            <rect class="brand__bar" x="14.4" y="10" width="3.2" height="15" rx="1" opacity=".8"/>
            <rect class="brand__bar" x="20.8" y="6"  width="3.2" height="19" rx="1"/>
          </svg>
        </span>
        <span class="brand__name">기출해체분석기</span>
        <span class="brand__sub">kicegg</span>
      </a>
      <nav class="header-nav" aria-label="주요 메뉴">
        <a href="archive.html">기출검색</a>
        <a href="calendar.html">학사 일정</a>
      </nav>
      <div class="header-tools">
        <form class="header-search" action="./" method="get" role="search">
          <button type="submit" class="header-search__btn" aria-label="기출 검색"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
          <input type="search" name="q" placeholder="기출 검색" aria-label="기출 검색어" autocomplete="off" enterkeyhint="search" />
        </form>
        <a class="icon-btn header-search--icon" href="./?focus=search" aria-label="기출 검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </a>
        <button type="button" class="icon-btn theme-toggle" aria-label="다크 모드로 전환">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <button type="button" class="icon-btn menu-toggle" aria-label="메뉴" aria-expanded="false" aria-controls="mobileNav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="모바일 메뉴" hidden>
      <div class="container">
        <a href="archive.html">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="about.html">소개</a>
      </div>
    </nav>
  </header>
  <main id="main" class="legal legal--wide">
    <h1>{bd.html_escape(h1, quote=False)}</h1>
    <p>{bd.html_escape(intro, quote=False)}</p>
    <p class="legal__sub">{bd.html_escape(stat, quote=False)}</p>
    <p class="hub-crumb"><a href="./">기출검색</a> · <a href="sets.html">전체 회차</a></p>
    {''.join(sections)}
  </main>
  <footer class="site-footer">
    <div class="container">
      <nav class="site-footer__links" aria-label="사이트 정보">
        <a href="about.html">소개</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a><a href="sets.html">전체 회차</a><a href="about.html#contact">문의</a>
      </nav>
      <p class="site-footer__sub">출처 · 한국교육과정평가원 · 17개 시도교육청 · 각 대학 입학처 외. 저작권은 각 발행기관에 있으며 교육 목적으로만 이용할 수 있습니다.</p>
    </div>
  </footer>
  <script type="module" src="lib/dday-mount.js?v=20260718a"></script>
  <script src="lib/measure.js?v=20260713c" defer></script>
</body>
</html>
'''
    (ROOT / fname).write_text(page, encoding='utf-8')


def _dl_buttons(it: dict) -> str:
    """허브 목록 행의 자료 버튼 — 실제 있는 것만."""
    out = []
    for field, label in (('questionUrl', '문제지'), ('answerUrl', bd.answer_label_for(it)), ('solutionUrl', '해설')):
        u = it.get(field)
        if not u or (field == 'solutionUrl' and u == it.get('questionUrl')):
            continue
        out.append(f'<a class="hub-dl" href="{bd.html_escape(u, quote=True)}" rel="nofollow">{bd.html_escape(label, quote=False)}</a>')
    return f'<span class="hub-row__dl">{"".join(out)}</span>' if out else ''


def _exam_row(it: dict, label: str) -> str:
    return (f'<li class="hub-row"><a class="hub-row__title" href="exam-{it["id"]}.html">{bd.html_escape(label, quote=False)}</a>'
            f'{_dl_buttons(it)}</li>')


def _write_essay_hub(h: dict) -> None:
    base = 'https://kicegg.com'
    school, fname, count = h['school'], h['fname'], h['count']
    n_mock = sum(1 for e in h['exams'] if e.get('type') == 'essay_mock')
    n_annual = count - n_mock
    yr = ''
    if h['ymin'] and h['ymax']:
        yr = f'{h["ymax"]}학년도' if h['ymin'] == h['ymax'] else f'{h["ymin"]}~{h["ymax"]}학년도'

    years: dict = {}
    for it in h['exams']:
        years.setdefault(it.get('gradeYear'), []).append(it)
    sections, item_list, pos = [], [], 1
    for gy in sorted(years, key=lambda y: (y is None, -(y or 0))):
        lis = []
        for it in sorted(years[gy], key=lambda x: (0 if x.get('type') == 'essay_annual' else 1,
                                                   str(x.get('subSubject') or ''))):
            lab = _essay_label(it)
            lis.append(_exam_row(it, lab))
            item_list.append({'@type': 'ListItem', 'position': pos,
                              'url': f'{base}/exam-{it["id"]}.html', 'name': lab})
            pos += 1
        label = f'{gy}학년도' if gy else '기타'
        sections.append(f'<section class="legal__section"><h2>{label}</h2>'
                        f'<ul class="hub-list">{"".join(lis)}</ul></section>')

    yr_sp = (yr + ' ') if yr else ''
    intro = (f'{school} 수시 논술전형 기출 {count}건을 한곳에 모았습니다. '
             f'{yr_sp}논술·모의논술 기출 문제지와 (제공되는 경우) 예시답안·해설을 '
             f'연도별로 정리했으니, 필요한 회차를 골라 PDF로 내려받아 확인하세요.')
    stat = f'본논술 {n_annual}건 · 모의논술 {n_mock}건'
    title = f'{school} 논술 기출 전체{(" (" + yr + ")") if yr else ""} — 기출해체분석기'
    desc = (f'{school} 수시 논술전형 기출 {count}건 — {yr_sp}'
            f'논술·모의논술 문제지·예시답안·해설을 연도별로 한곳에서 확인하고 PDF로 내려받으세요.')
    _hub_page(fname, f'{school} 논술 기출 전체', title, desc, intro, stat,
              sections, f'{school} 논술', item_list)


def render_essay_school_hubs(items: list[dict]) -> list[dict]:
    """대학별 논술 허브 nonsul-{slug}.html 생성. 옛 허브 정리 후 재생성."""
    for old in ROOT.glob('nonsul-*.html'):
        old.unlink()
    hubs = essay_hub_list(items)
    for h in hubs:
        _write_essay_hub(h)
    print(f'  + 대학별 논술 허브 {len(hubs)}개')
    return hubs


# ── 과목별 기출 허브 (수능/학평) ──
_TG_HUB_LABEL = {'suneung': '수능·평가원', 'education': '고등 학력평가'}


def subject_hub_list(items: list[dict]) -> list[dict]:
    """과목별 허브 데이터 — (typeGroup·상위과목)별로 묶는다."""
    by_key: dict = {}
    for it in items:
        fn = bd.subject_hub_filename(it)
        if not fn:
            continue
        h = by_key.setdefault(fn, {'fname': fn, 'tg': it['typeGroup'],
                                   'subject': it['subject'], 'exams': []})
        h['exams'].append(it)
    hubs = []
    for h in by_key.values():
        years = [e.get('gradeYear') for e in h['exams'] if e.get('gradeYear')]
        h['count'] = len(h['exams'])
        h['ymin'] = min(years) if years else None
        h['ymax'] = max(years) if years else None
        hubs.append(h)
    hubs.sort(key=lambda h: -h['count'])
    return hubs


def _write_subject_hub(h: dict) -> None:
    base = 'https://kicegg.com'
    tl = _TG_HUB_LABEL[h['tg']]
    subject, fname, count = h['subject'], h['fname'], h['count']
    topic = f'{tl} {subject}'
    yr = ''
    if h['ymin'] and h['ymax']:
        yr = f'{h["ymax"]}학년도' if h['ymin'] == h['ymax'] else f'{h["ymin"]}~{h["ymax"]}학년도'

    years: dict = {}
    for it in h['exams']:
        years.setdefault(it.get('gradeYear'), []).append(it)
    sections, item_list, pos = [], [], 1
    for gy in sorted(years, key=lambda y: (y is None, -(y or 0))):
        lis = []
        for it in sorted(years[gy], key=lambda x: (str(x.get('type') or ''), bd._subject_sort_key(x))):
            lab = bd.build_exam_meta(it)['head']
            lis.append(_exam_row(it, lab))
            item_list.append({'@type': 'ListItem', 'position': pos,
                              'url': f'{base}/exam-{it["id"]}.html', 'name': lab})
            pos += 1
        label = f'{gy}학년도' if gy else '기타'
        sections.append(f'<section class="legal__section"><h2>{label}</h2>'
                        f'<ul class="hub-list">{"".join(lis)}</ul></section>')

    yr_sp = (yr + ' ') if yr else ''
    intro = (f'{topic} 기출 {count}건을 한곳에 모았습니다. '
             f'{yr_sp}연도별 문제지·정답·해설지와 등급컷을 한 번에 확인하고 PDF로 내려받으세요. '
             f'선택과목·회차별 자료가 모두 포함됩니다.')
    stat = f'{topic} 기출 {count}건' + (f' · {yr}' if yr else '')
    title = f'{topic} 기출 전체{(" (" + yr + ")") if yr else ""} — 기출해체분석기'
    desc = (f'{topic} 기출 {count}건 — {yr_sp}'
            f'연도별 문제지·정답·해설지·등급컷을 한곳에서 확인하고 PDF로 내려받으세요.')
    _hub_page(fname, f'{topic} 기출 전체', title, desc, intro, stat, sections, topic, item_list)


def render_subject_hubs(items: list[dict]) -> list[dict]:
    """과목별 기출 허브 suneung-{slug}.html / hakpyeong-{slug}.html 생성."""
    for pat in ('suneung-*.html', 'hakpyeong-*.html'):
        for old in ROOT.glob(pat):
            old.unlink()
    hubs = subject_hub_list(items)
    for h in hubs:
        _write_subject_hub(h)
    print(f'  + 과목별 기출 허브 {len(hubs)}개')
    return hubs


def render_category_landings(items: list[dict]) -> None:
    """카테고리 전용 SEO 랜딩 — 대학별 논술(essay.html)·검정고시(ged.html).
    경쟁 통합처가 약한 블루오션 키워드('대학별 논술 기출', '검정고시 기출 다운')를
    잡는 상위 진입점. 기존 허브/시험 페이지로의 내부링크 허브 역할도."""
    base = 'https://kicegg.com'

    # ── 대학별 논술 랜딩: 학교별 허브로 링크 ──
    essays = [e for e in items if e.get('typeGroup') == 'essay']
    if essays:
        counts: dict = {}
        for e in essays:
            counts[e['subject']] = counts.get(e['subject'], 0) + 1
        lis, item_list, pos = [], [], 1
        for school, cnt in sorted(counts.items(), key=lambda x: -x[1]):
            hub = bd.essay_hub_filename(school)
            if not hub:
                continue
            lab = f'{school} 논술 기출 ({cnt}건)'
            lis.append(f'<li><a href="{hub}">{bd.html_escape(lab, quote=False)}</a></li>')
            item_list.append({'@type': 'ListItem', 'position': pos,
                              'url': f'{base}/{hub}', 'name': lab})
            pos += 1
        n_school = len(lis)
        sections = [f'<section class="legal__section"><h2>대학별 논술 기출 ({n_school}개교)</h2>'
                    f'<ul class="setsdir__list">{"".join(lis)}</ul></section>']
        intro = (f'전국 {n_school}개 대학의 수시 논술전형 기출 {len(essays)}건을 한곳에 모았습니다. '
                 f'회원가입 없이 대학을 골라 본논술·모의논술 문제지와 (제공되는 경우) 예시답안·해설을 '
                 f'연도별로 확인하고 PDF로 바로 내려받으세요.')
        stat = f'{n_school}개교 · 논술 기출 {len(essays)}건'
        title = f'대학별 논술 기출 — {n_school}개교 {len(essays)}건 한곳에 | 기출해체분석기'
        desc = (f'가입 없이 대학별 논술 기출 한곳에서. 고려대·연세대·성균관대 등 {n_school}개교 '
                f'수시 논술전형 본논술·모의논술 기출 {len(essays)}건을 문제지·예시답안·해설 PDF로 무료 다운로드.')
        _hub_page('essay.html', '대학별 논술 기출', title, desc, intro, stat,
                  sections, '대학별 논술', item_list)
        print('  + 논술 랜딩 essay.html')

    # ── 검정고시 랜딩: 학력(고·중·초졸)별 연도 목록 ──
    geds = [e for e in items if e.get('typeGroup') == 'ged']
    if geds:
        sections, item_list, pos = [], [], 1
        for lvl in ('고졸', '중졸', '초졸'):
            lvl_items = [e for e in geds if e.get('curriculum') == lvl]
            if not lvl_items:
                continue
            years: dict = {}
            for it in lvl_items:
                years.setdefault(it.get('examYear'), []).append(it)
            lis = []
            for y in sorted(years, key=lambda v: -(v or 0)):
                for it in sorted(years[y], key=lambda x: (str(x.get('type') or ''), str(x.get('subject') or ''))):
                    lab = bd.build_exam_meta(it)['head']
                    lis.append(_exam_row(it, lab))
                    item_list.append({'@type': 'ListItem', 'position': pos,
                                      'url': f'{base}/exam-{it["id"]}.html', 'name': lab})
                    pos += 1
            sections.append(f'<section class="legal__section"><h2>{lvl} 검정고시 ({len(lvl_items)}건)</h2>'
                            f'<ul class="hub-list">{"".join(lis)}</ul></section>')
        yrs = [e.get('examYear') for e in geds if e.get('examYear')]
        span = f'{min(yrs)}~{max(yrs)}' if yrs else ''
        intro = (f'고졸·중졸·초졸 검정고시 기출 {len(geds)}건을 한곳에 모았습니다. '
                 f'회원가입·앱 설치 없이 회차별 문제지와 정답(확정안)을 바로 PDF로 내려받으세요. '
                 f'출처는 한국교육과정평가원·시도교육청 공식 자료입니다.')
        stat = f'검정고시 기출 {len(geds)}건 · 초·중·고졸' + (f' {span}' if span else '')
        title = f'검정고시 기출 — 고졸·중졸·초졸 {len(geds)}건 한곳에 | 기출해체분석기'
        desc = (f'가입 없이 검정고시 기출 한곳에서. 고졸·중졸·초졸 회차별 문제지·정답 {len(geds)}건을 '
                f'PDF로 무료 다운로드. 한국교육과정평가원 공식 기출({span}).')
        _hub_page('ged.html', '검정고시 기출', title, desc, intro, stat,
                  sections, '검정고시', item_list)
        print('  + 검정고시 랜딩 ged.html')


def render_sets_directory(items: list[dict], essay_hubs=None, subject_hubs=None) -> None:
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

    # 과목별 / 대학별 허브 인덱스 — 상단 노출(집계 페이지 발견 경로)
    if essay_hubs:
        hub_links = ''.join(
            f'<li><a href="{h["fname"]}">{bd.html_escape(h["school"], quote=False)} ({h["count"]})</a></li>'
            for h in sorted(essay_hubs, key=lambda x: x['school']))
        sections.insert(0, '<section class="legal__section"><h2>대학별 논술</h2>'
                           f'<ul class="setsdir__list">{hub_links}</ul></section>')
    if subject_hubs:
        sub_links = ''.join(
            f'<li><a href="{h["fname"]}">'
            f'{bd.html_escape(_TG_HUB_LABEL[h["tg"]] + " " + h["subject"], quote=False)} ({h["count"]})</a></li>'
            for h in sorted(subject_hubs, key=lambda x: (x['tg'], -x['count'])))
        sections.insert(0, '<section class="legal__section"><h2>과목별 기출</h2>'
                           f'<ul class="setsdir__list">{sub_links}</ul></section>')

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
  <meta name="naver-site-verification" content="b3138c38039611bed2ce955aa7102ab33011cf14" />
  <meta name="theme-color" content="#f4f4f5" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https://suneung-files.hdh061224.workers.dev https://wdown.ebsi.co.kr https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.google.com; media-src 'self' https://suneung-files.hdh061224.workers.dev; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'" />
  <meta name="description" content="수능·모의평가·학력평가·사관학교·경찰대·LEET·MEET 전체 회차 목록. 학년도별 기출 문제지·정답·해설·등급컷 회차로 바로 이동하세요." />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="canonical" href="https://kicegg.com/sets.html" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="기출해체분석기" />
  <meta property="og:title" content="전체 회차 목록 — 기출해체분석기" />
  <meta property="og:description" content="학년도별 수능·모의평가·학력평가·사관학교·경찰대·LEET·MEET 기출 회차 목록." />
  <meta property="og:url" content="https://kicegg.com/sets.html" />
  <meta property="og:image" content="https://kicegg.com/og-image.png" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="전체 회차 목록 — 기출해체분석기" />
  <meta name="twitter:description" content="학년도별 기출 회차 목록에서 문제지·정답·해설·등급컷으로 바로 이동." />
  <meta name="twitter:image" content="https://kicegg.com/og-image.png" />
  <script type="application/ld+json">{jsonld_block}</script>
  <title>전체 회차 목록 — 기출해체분석기</title>
  <link rel="stylesheet" href="lib/vendor/pretendard/pretendardvariable-dynamic-subset.css" />
  <link rel="stylesheet" href="style.css?v=20260727a" />
  <script src="lib/site-prefs.js"></script>
</head>
<body class="page-default">
  <a href="#main" class="skip-link">본문 건너뛰기</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a href="index.html" class="brand" aria-label="기출해체분석기 홈">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
            <rect width="32" height="32" rx="8" fill="currentColor"/>
            <rect class="brand__bar" x="8"  y="15" width="3.2" height="10" rx="1" opacity=".55"/>
            <rect class="brand__bar" x="14.4" y="10" width="3.2" height="15" rx="1" opacity=".8"/>
            <rect class="brand__bar" x="20.8" y="6"  width="3.2" height="19" rx="1"/>
          </svg>
        </span>
        <span class="brand__name">기출해체분석기</span>
        <span class="brand__sub">kicegg</span>
      </a>
      <nav class="header-nav" aria-label="주요 메뉴">
        <a href="archive.html">기출검색</a>
        <a href="calendar.html">학사 일정</a>
      </nav>
      <div class="header-tools">
        <form class="header-search" action="./" method="get" role="search">
          <button type="submit" class="header-search__btn" aria-label="기출 검색"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
          <input type="search" name="q" placeholder="기출 검색" aria-label="기출 검색어" autocomplete="off" enterkeyhint="search" />
        </form>
        <a class="icon-btn header-search--icon" href="./?focus=search" aria-label="기출 검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </a>
        <button type="button" class="icon-btn theme-toggle" aria-label="다크 모드로 전환">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <button type="button" class="icon-btn menu-toggle" aria-label="메뉴" aria-expanded="false" aria-controls="mobileNav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="모바일 메뉴" hidden>
      <div class="container">
        <a href="archive.html">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="about.html">소개</a>
      </div>
    </nav>
  </header>
  <main id="main" class="legal legal--wide">
    <h1>전체 회차 목록</h1>
    <p>수능·평가원·교육청·사관학교·경찰대·LEET·MEET 기출 회차를 학년도별로 모았습니다. 각 회차에서 영역별 문제지, 정답, 해설지, 등급컷 자료로 이동할 수 있습니다.</p>
    <p class="hub-crumb"><a href="./">기출검색</a> · <a href="calendar.html">학사 일정</a></p>
    {''.join(sections)}
  </main>
  <footer class="site-footer">
    <div class="container">
      <nav class="site-footer__links" aria-label="사이트 정보">
        <a href="about.html">소개</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a><a href="sets.html">전체 회차</a><a href="about.html#contact">문의</a>
      </nav>
      <p class="site-footer__sub">출처 · 한국교육과정평가원 · 17개 시도교육청 · 각 대학 입학처 외. 저작권은 각 발행기관에 있으며 교육 목적으로만 이용할 수 있습니다.</p>
    </div>
  </footer>
  <script type="module" src="lib/dday-mount.js?v=20260718a"></script>
  <script src="lib/measure.js?v=20260713c" defer></script>
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


def render_archive_splits(items: list[dict]) -> None:
    """검색 아카이브가 현재 탭에 필요한 데이터만 받도록 탭별 JSON을 만든다."""
    out_dir = ROOT / 'data' / 'archive'
    out_dir.mkdir(parents=True, exist_ok=True)
    assigned: dict[int, str] = {}
    expected_ids = {it['id'] for it in items if it.get('typeGroup') != 'reference'}
    written = 0

    def archive_item(it: dict) -> dict:
        compact = dict(it)
        for url_key, download_key in (
            ('questionUrl', 'questionDownload'),
            ('answerUrl', 'answerDownload'),
            ('solutionUrl', 'solutionDownload'),
        ):
            url = compact.get(url_key)
            if url and dict(parse_qsl(urlsplit(url).query)).get('name'):
                compact.pop(download_key, None)
        return compact

    for tab, rule in ARCHIVE_TAB_RULES.items():
        selected = []
        for it in items:
            if it.get('curriculum') not in rule['curriculums']:
                continue
            if rule.get('education_only') and it.get('typeGroup') != 'education':
                continue
            if it.get('typeGroup') == 'education' and it.get('studentGrade') != rule.get('education_grade'):
                continue
            selected.append(archive_item(it))
            previous = assigned.setdefault(it['id'], tab)
            if previous != tab:
                raise RuntimeError(f'archive split 중복 id={it["id"]}: {previous}, {tab}')

        body = json.dumps(selected, ensure_ascii=False, separators=(',', ':')) + '\n'
        path = out_dir / f'{tab}.json'
        if not path.exists() or path.read_text(encoding='utf-8') != body:
            path.write_text(body, encoding='utf-8')
            written += 1

    missing = sorted(expected_ids - set(assigned))
    unexpected = sorted(set(assigned) - expected_ids)
    if missing or unexpected:
        raise RuntimeError(
            f'archive split 불완전: 누락 {len(missing)}건 / 예상 밖 {len(unexpected)}건 '
            f'(누락 sample={missing[:10]})'
        )

    # 전체 검색은 긴 다운로드 URL과 상세 데이터를 받지 않고 검색용 필드만 읽는다.
    search_fields = {'id', 'curriculum', 'gradeYear', 'examYear', 'month', 'typeGroup',
                     'type', 'subject', 'subSubject', 'studentGrade'}
    index = []
    for item in items:
        if item.get('typeGroup') == 'reference':
            continue
        entry = {k: v for k, v in item.items() if k in search_fields}
        entry['searchOnly'] = True
        entry['hasFiles'] = any(item.get(k) for k in ('questionUrl', 'answerUrl', 'solutionUrl'))
        entry['hasListening'] = bool(item.get('listenUrl') or item.get('scriptUrl'))
        if item.get('questionUrl'):
            entry['questionKey'] = hashlib.sha256(item['questionUrl'].encode()).hexdigest()[:24]
        index.append(entry)
    (out_dir / 'all.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    # 기출검색 표의 1등급컷·난이도 열 — id → [원점수 1컷, 표점 1컷, 난이도(1~5|null), 절대평가 0/1, 영어 1등급 비율|null]
    scores = bd.compute_exam_scores(items)
    cuts_index = {str(i): [r['raw'], r['std'], r['tier'], 1 if r['abs'] else 0, r.get('ratio')]
                  for i, r in sorted(scores.items()) if r['raw'] is not None}
    (out_dir / 'cuts.json').write_text(json.dumps(cuts_index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    valid_names = {f'{tab}.json' for tab in ARCHIVE_TAB_RULES} | {'all.json', 'cuts.json'}
    pruned = 0
    for path in out_dir.glob('*.json'):
        if path.name not in valid_names:
            path.unlink()
            pruned += 1
    print(f'  + archive split {len(assigned)}건 / 갱신 {written}파일 / 고아 제거 {pruned}파일')


def render_set_splits(items: list[dict]) -> None:
    """회차 페이지용 경량 split. exam-set.js가 9MB exams.json 대신 이 파일만 읽는다."""
    out = ROOT / 'data' / 'set'
    out.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[dict]] = {}
    for it in items:
        if not (it.get('curriculum') and it.get('gradeYear') and it.get('type')):
            continue
        sg = it.get('studentGrade') if it.get('typeGroup') == 'education' else None
        fname = bd.set_friendly_filename(str(it['curriculum']), str(it['gradeYear']), it['type'], sg)
        groups.setdefault(Path(fname).stem, []).append(it)

    written = 0
    for stem, exams in groups.items():
        p = out / f'{stem}.json'
        body = json.dumps(exams, ensure_ascii=False, separators=(',', ':'))
        if not p.exists() or p.read_text(encoding='utf-8') != body:
            p.write_text(body, encoding='utf-8')
            written += 1

    pruned = 0
    for p in out.glob('exam-set-*.json'):
        if p.stem not in groups:
            p.unlink()
            pruned += 1
    print(f'  + set split {written}건 / 고아 제거 {pruned}건')


def render_gradecut_splits(items: list[dict]) -> None:
    """data/gradecuts.json → data/gradecut/{exam_id}.json 단건 분할.

    exam.js는 시험 id로 data/gradecut/{id}.json 을 요청한다. 따라서 split 파일명은
    gradecut record의 자체 id가 아니라 exams.json의 exam id여야 한다.
    """
    gc_path = ROOT / 'data' / 'gradecuts.json'
    if not gc_path.exists():
        print('  + gradecut split: gradecuts.json 없음, 스킵')
        return
    cuts = json.loads(gc_path.read_text(encoding='utf-8'))
    out_dir = ROOT / 'data' / 'gradecut'
    out_dir.mkdir(exist_ok=True)

    def cut_key(d: dict):
        return (d.get('curriculum'), str(d.get('gradeYear')), d.get('type'),
                d.get('subject'), d.get('subSubject'))

    by_key: dict[tuple, list[dict]] = {}
    by_key_grade: dict[tuple, dict] = {}
    by_key_none: dict[tuple, dict] = {}
    for c in cuts:
        k = cut_key(c)
        by_key.setdefault(k, []).append(c)
        if c.get('studentGrade') is None:
            by_key_none.setdefault(k, c)
        else:
            by_key_grade.setdefault(k + (c.get('studentGrade'),), c)

    written = 0
    seen_ids: set[int] = set()
    for it in items:
        eid = it.get('id')
        if eid is None:
            continue
        k = cut_key(it)
        if it.get('typeGroup') == 'education':
            c = by_key_grade.get(k + (it.get('studentGrade'),)) or by_key_none.get(k)
        else:
            c = by_key.get(k, [None])[0]
        if not c:
            continue
        seen_ids.add(eid)
        p = out_dir / f'{eid}.json'
        body = json.dumps(c, ensure_ascii=False, separators=(',', ':'))
        if not p.exists() or p.read_text(encoding='utf-8') != body:
            p.write_text(body, encoding='utf-8')
            written += 1

    # 고아/옛 잘못 split 제거
    pruned = 0
    for p in out_dir.glob('*.json'):
        if p.stem.isdigit() and int(p.stem) not in seen_ids:
            p.unlink()
            pruned += 1
    print(f'  + gradecut split {written}건 / 고아 제거 {pruned}건')


def _summary_sub_from_exam(e: dict) -> str:
    if e.get('typeGroup') == 'education':
        sg = f"고{e.get('studentGrade')}" if e.get('studentGrade') else ''
        return f"{e.get('examYear')}년 {e.get('month')}월 {sg} 학평".strip()
    if e.get('typeGroup') == 'suneung':
        t = {'csat': '수능', 'sept': '9모', 'june': '6모', 'prelim': '예비'}.get(str(e.get('type') or ''), '')
        return f"{e.get('gradeYear')}학년도 {t}".strip()
    if e.get('typeGroup') == 'military': return f"{e.get('gradeYear')}학년도 사관학교"
    if e.get('typeGroup') == 'police':   return f"{e.get('gradeYear')}학년도 경찰대"
    if e.get('typeGroup') == 'leet':     return f"{e.get('gradeYear')}학년도 LEET"
    if e.get('typeGroup') == 'meet':     return f"{e.get('gradeYear')}학년도 MEET"
    return ''


def _summary_update_label(items: list[dict]) -> str | None:
    def ts_key(e: dict) -> int:
        if e.get('typeGroup') == 'reference': return -1
        if e.get('gradeYear') == 'preliminary' or e.get('type') == 'prelim': return -1
        raw_ey = e.get('examYear')
        raw_gy = e.get('gradeYear')
        raw_m = e.get('month')
        ey = raw_ey if isinstance(raw_ey, int) and raw_ey > 1990 else None
        if ey is None:
            ey = raw_gy - 1 if isinstance(raw_gy, int) else 0
        m = raw_m if isinstance(raw_m, int) and raw_m > 0 else 0
        return ey * 100 + m
    latest = max(items, key=ts_key, default=None)
    if not latest: return None
    if latest.get('typeGroup') == 'education' and latest.get('examYear') and latest.get('month'):
        sg = f"고{latest.get('studentGrade')}" if latest.get('studentGrade') else ''
        return f"{latest.get('examYear')}.{str(latest.get('month')).zfill(2)} {sg} 학평".strip()
    if latest.get('typeGroup') == 'suneung':
        t = {'csat': '수능', 'sept': '9모', 'june': '6모'}.get(str(latest.get('type') or ''), '')
        return f"{latest.get('gradeYear')}학년도 {t}".strip()
    if latest.get('gradeYear'):
        return f"{latest.get('gradeYear')}학년도"
    return None


def render_site_summary(items: list[dict]) -> None:
    """홈 landing용 경량 summary. data/exams.json 전체 fetch를 피한다."""
    recent = []
    for e in sorted(items, key=lambda x: x.get('id', 0), reverse=True)[:12]:
        title = (e.get('subject') or '') + (f" {e.get('subSubject')}" if e.get('subSubject') else '')
        sub = _summary_sub_from_exam(e)
        recent.append({
            'id': e.get('id'),
            'title': title,
            'sub': sub,
            'label': f'{sub} {title}'.strip() if sub else title,
        })
    archive_items = [e for e in items if e.get('typeGroup') != 'reference']
    updated_at = subprocess.check_output(
        ['git', 'log', '-1', '--format=%cs', '--', 'data/exams.json'], cwd=ROOT, text=True).strip()
    if not updated_at:
        raise RuntimeError('exams.json 갱신일을 Git 기록에서 확인할 수 없습니다.')
    payload = {
        'count': len(items),
        'archiveCount': len(archive_items),
        'updatedAt': updated_at,
        'updateLabel': _summary_update_label(items),
        'recentUpdates': recent,
    }
    out = ROOT / 'data' / 'site-summary.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'  + data/site-summary.json ({len(recent)}건 최신 요약)')


def _loading_previews() -> dict:
    """lib/loading-previews.js 의 과목별 흐림 대표 이미지 맵."""
    src = (ROOT / 'lib' / 'loading-previews.js').read_text(encoding='utf-8')
    return json.loads(src[src.index('{'):src.rindex('}') + 1])


def _replace_block(html: str, name: str, body: str) -> str:
    start, end = f'<!-- {name}:start', f'<!-- {name}:end -->'
    a = html.index(start)
    a = html.index('-->', a) + 3
    b = html.index(end)
    return html[:a] + '\n' + body + '\n      ' + html[b:]


_HOME_SUBJECTS = ('국어', '수학', '영어', '한국사')


def render_home(items: list[dict]) -> None:
    """index.html 의 '최근 시험'·'시험 종류' 블록을 정적으로 채운다 (JS 없이도 크롤·표시)."""
    esc = bd.html_escape
    previews = _loading_previews()

    # 최근 시험: 평가원 + 고3 학평 회차 중 시행 시점 최신 4개
    sets: dict = {}
    for it in items:
        tg = it.get('typeGroup')
        if tg == 'suneung' and it.get('type') in ('csat', 'june', 'sept'):
            gy = it['gradeYear']
            month = {'csat': 11, 'june': 6, 'sept': 9}[it['type']]
            when = ((gy - 1) * 100 + month, 1)
            key = ('suneung', it['curriculum'], gy, it['type'], None)
        elif tg == 'education' and it.get('studentGrade') == 3 and it.get('examYear') and it.get('month'):
            when = (it['examYear'] * 100 + it['month'], 0)
            key = ('education', it['curriculum'], it['gradeYear'], it['type'], 3)
        else:
            continue
        sets.setdefault(key, {'when': when, 'exams': []})['exams'].append(it)
    latest = sorted((v for v in sets.values() if any(e['subject'] == '국어' for e in v['exams'])),
                    key=lambda v: v['when'], reverse=True)[:4]

    cards = []
    for s in latest:
        ex = s['exams']
        first = ex[0]
        tg, gy, t = first['typeGroup'], first['gradeYear'], first['type']
        if tg == 'suneung':
            badge = bd.KOREAN_TYPE_LABEL.get(t, t)
            title = f'{gy}학년도 {bd.FULL_TYPE_LABEL.get(t, badge)}'
            meta = f'평가원 · {gy - 1}년 {({"csat": 11, "june": 6, "sept": 9})[t]}월'
            img = previews.get('suneung||국어', {}).get('image', '')
            sg = None
        else:
            badge = f'{first["month"]}월 학평'
            title = f'{first["examYear"]}년 {first["month"]}월 고3 학력평가'
            meta = f'교육청 · {first["examYear"]}년 {first["month"]}월'
            img = previews.get('education|3|국어', {}).get('image', '')
            sg = 3
        set_href = bd.set_friendly_filename(str(first['curriculum']), str(gy), t, sg)
        links = []
        for subj in _HOME_SUBJECTS:
            hit = sorted((e for e in ex if e['subject'] == subj), key=lambda e: e['id'])
            if hit:
                links.append(f'<a href="exam-{hit[0]["id"]}.html">{subj}</a>')
        if any(e['subject'] in ('사회탐구', '과학탐구', '직업탐구') for e in ex):
            links.append(f'<a href="{set_href}">탐구</a>')
        cover = (f'<img src="{esc(img, quote=True)}" alt="" loading="lazy" decoding="async" />' if img else '')
        cards.append(
            '        <article class="card-box latest-card">\n'
            f'          <div class="cover">{cover}<span class="type-badge tg-{tg}">{esc(badge, quote=False)}</span></div>\n'
            f'          <h3 class="latest-card__title"><a href="{set_href}">{esc(title, quote=False)}</a></h3>\n'
            f'          <p class="latest-card__meta">{esc(meta, quote=False)}</p>\n'
            f'          <nav class="subj-links" aria-label="{esc(title, quote=True)} 과목">{"".join(links)}</nav>\n'
            '        </article>')
    latest_html = '      <div class="latest-rail">\n' + '\n'.join(cards) + '\n      </div>'

    def count(pred) -> str:
        return f'{sum(1 for e in items if pred(e)):,}'
    cats = [
        ('archive.html?tab=senior', count(lambda e: e.get('typeGroup') == 'suneung'), '수능·평가원', '수능 · 6모 · 9모 · 예비시험'),
        ('archive.html?tab=senior&amp;typeGroup=education', count(lambda e: e.get('typeGroup') == 'education'), '학력평가', '고1 · 고2 · 고3 교육청'),
        ('archive.html?tab=essay', count(lambda e: e.get('typeGroup') == 'essay'), '대학별 논술', '대학별 본논술 · 모의논술'),
        ('archive.html?tab=mp', count(lambda e: e.get('typeGroup') in ('military', 'police')), '사관·경찰대', '1차 시험'),
        ('archive.html?tab=gradschool', count(lambda e: e.get('typeGroup') in ('leet', 'meet')), 'LEET·MEET', '전문대학원 적성시험'),
        ('archive.html?tab=gedhigh', count(lambda e: e.get('typeGroup') == 'ged'), '검정고시', '초졸 · 중졸 · 고졸'),
    ]
    arrow = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>')
    cat_html = '      <div class="cat-grid">\n' + '\n'.join(
        f'        <a class="card-box cat-card" href="{href}"><span class="cat-card__n">{n}</span>'
        f'<span><span class="cat-card__name">{name}</span><span class="cat-card__sub">{sub}</span></span>{arrow}</a>'
        for href, n, name, sub in cats) + '\n      </div>'

    path = ROOT / 'index.html'
    html = _compose_index(path.read_text(encoding='utf-8'), (ROOT / 'archive.html').read_text(encoding='utf-8'))
    html = _replace_block(html, 'latest-sets', latest_html)
    html = _replace_block(html, 'categories', cat_html)
    path.write_text(html, encoding='utf-8')
    print(f'  + index.html (기출검색 + 최근 시험 {len(cards)}개 · 시험 종류 {len(cats)}개)')


# 첫 화면(/) = 기출검색. index.html 은 archive.html 을 그대로 쓰되
# 검색엔진용 머리글(제목·설명·canonical·구조화 데이터)은 index.html 에 있던 것을 유지하고,
# 결과 아래에 정적 '최근 시험'·'시험 종류'(JS 없이도 크롤되는 링크)를 붙인다.
_HOME_HEAD_TAGS = (
    r'<meta name="description"[^>]*>', r'<link rel="canonical"[^>]*>',
    r'<meta property="og:title"[^>]*>', r'<meta property="og:description"[^>]*>', r'<meta property="og:url"[^>]*>',
    r'<meta name="twitter:title"[^>]*>', r'<meta name="twitter:description"[^>]*>', r'<meta name="twitter:image:alt"[^>]*>',
    r'<script type="application/ld\+json">.*?</script>', r'<title>.*?</title>',
)
_HOME_MORE = """  <section class="container home-more" aria-label="최근 시험과 시험 종류">
    <div class="home-sec">
      <div class="sec-head"><h2 id="latestTitle">최근 시험</h2><a class="sec-head__more" href="sets.html">전체 회차 →</a></div>
      <!-- latest-sets:start (render-site.py 가 채움) -->
      <!-- latest-sets:end -->
    </div>
    <div class="home-sec">
      <div class="sec-head"><h2 id="catTitle">시험 종류</h2></div>
      <!-- categories:start (render-site.py 가 채움) -->
      <!-- categories:end -->
    </div>
  </section>

"""


def _compose_index(home: str, archive: str) -> str:
    html = archive
    for pat in _HOME_HEAD_TAGS:
        m = re.search(pat, home, re.S)
        if m:
            html = re.sub(pat, lambda _m, v=m.group(0): v, html, count=1, flags=re.S)
    footer = html.index('  <footer class="site-footer">')
    return html[:footer] + _HOME_MORE + html[footer:]


def render_rss(items: list[dict]) -> None:
    """최신 추가 자료 RSS 피드(feed.xml). 네이버는 RSS를 사이트맵과 별개의
    freshness(최신성) 신호로 취급 — 전수가 아니라 '최근 추가 N개'만 담는다.
    pubDate는 시험 시행 시점(examYear·month) 기준으로 안정적(신규 시험만 최신 신호)."""
    import calendar
    from email.utils import formatdate
    base = 'https://kicegg.com'
    recent = sorted(items, key=lambda x: x.get('id', 0), reverse=True)[:40]
    today_rfc = formatdate(calendar.timegm(datetime.date.today().timetuple()))
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
            '<channel>',
            '<title>기출해체분석기 — 최신 기출 자료</title>',
            f'<link>{base}/</link>',
            '<description>수능·평가원·학력평가·논술·검정고시 등 최근 추가된 기출 문제지·정답·해설·등급컷</description>',
            '<language>ko</language>',
            f'<atom:link href="{base}/feed.xml" rel="self" type="application/rss+xml" />',
            f'<lastBuildDate>{today_rfc}</lastBuildDate>']
    for it in recent:
        meta = bd.build_exam_meta(it)
        url = f'{base}/exam-{it["id"]}.html'
        ey = it.get('examYear') or it.get('gradeYear') or datetime.date.today().year
        mo = it.get('month') or 1
        try:
            pub = formatdate(calendar.timegm(datetime.date(int(ey), int(mo), 1).timetuple()))
        except (ValueError, TypeError):
            pub = today_rfc
        title = bd.html_escape(meta['head'], quote=False)
        desc = bd.html_escape(meta['description'], quote=False)
        rows.append(f'<item><title>{title}</title><link>{url}</link>'
                    f'<guid isPermaLink="true">{url}</guid><pubDate>{pub}</pubDate>'
                    f'<description>{desc}</description></item>')
    rows.append('</channel></rss>')
    (ROOT / 'feed.xml').write_text('\n'.join(rows) + '\n', encoding='utf-8')
    print(f'  + feed.xml RSS ({len(recent)}건 최신 자료)')


def main() -> None:
    items = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    print(f'exams.json {len(items)}건 → 전체 재렌더')
    bd.build_static_exam_pages(items, ROOT / 'exam.html', ROOT)
    bd.build_static_set_pages(items, ROOT / 'exam-set.html', ROOT)
    essay_hubs = render_essay_school_hubs(items)
    subject_hubs = render_subject_hubs(items)
    render_category_landings(items)
    render_sets_directory(items, essay_hubs, subject_hubs)
    render_sitemaps(items, essay_hubs + subject_hubs)
    render_site_summary(items)
    render_home(items)
    render_rss(items)
    render_splits(items)
    render_archive_splits(items)
    render_set_splits(items)
    render_gradecut_splits(items)
    print('완료')


if __name__ == '__main__':
    main()
