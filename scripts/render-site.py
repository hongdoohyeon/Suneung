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
import collections
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


_DIGEST_PARTS = re.compile(r'<title>.*?</title>|<script type="application/ld\+json">.*?</script>|<main\b.*?</main>', re.S)
_DIGEST_DROP = (re.compile(r'<!--.*?-->', re.S), re.compile(r'\?v=[0-9a-f]+'),
                re.compile(r'"dateModified":\s*"[^"]*"'))


def content_digest(page: str) -> str:
    """사이트맵 lastmod 판정용 본문 해시 — 제목·JSON-LD·<main> 만, 주석·캐시 토큰·수정일 제외."""
    t = '\n'.join(_DIGEST_PARTS.findall(page)) or page
    for r in _DIGEST_DROP:
        t = r.sub('', t)
    return hashlib.sha1(t.encode()).hexdigest()[:12]


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

    # 시험별 실제 수정일 — 페이지 *본문*(제목·JSON-LD·<main>, 날짜·캐시 토큰·HTML 주석 제외)의 해시가 바뀐 날을
    # data/sitemap-lastmod.json 에 기억. 등급컷·자료·링크가 바뀌면 잡히고, 머리글·바닥글·스크립트·주석 같은 틀만
    # 바뀐 빌드는 날짜를 올리지 않는다(2026-10-04 주석 한 줄로 10,822건이 한꺼번에 '수정'된 적 있음).
    # 페이지 안 수정일 메타도 이 날짜로 맞춘다 — 내용이 같으면 파일도 그대로라 매일 전 페이지가 커밋되지 않는다.
    import re as _re
    state_path = ROOT / 'data' / 'sitemap-lastmod.json'
    try:
        state = json.loads(state_path.read_text(encoding='utf-8'))
    except Exception:
        state = {}
    MOD_RE = (_re.compile(r'(<meta property="article:modified_time" content=")[^"]*(")'), _re.compile(r'("dateModified":\s*")[^"]*(")'))
    lastmod = {}
    for it in items:
        f = ROOT / f'exam-{it["id"]}.html'
        page = f.read_text(encoding='utf-8') if f.exists() else json.dumps(it, ensure_ascii=False, sort_keys=True)
        h = content_digest(page)
        prev = state.get(str(it['id']))
        d = prev[1] if prev and prev[0] == h else today
        lastmod[it['id']] = d
        state[str(it['id'])] = [h, d]
        if f.exists():
            fixed = page
            for r in MOD_RE: fixed = r.sub(lambda m: m.group(1) + d + m.group(2), fixed)
            if fixed != page: f.write_text(fixed, encoding='utf-8')
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
        f'  <url><loc>{base}/blog.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>',
        f'  <url><loc>{base}/methodology.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>',
        f'  <url><loc>{base}/privacy.html</loc><lastmod>2026-05-05</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>',
        f'  <url><loc>{base}/terms.html</loc><lastmod>2026-05-05</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>',
        f'  <url><loc>{base}/data-policy.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
        f'  <url><loc>{base}/calendar.html</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
    ]
    for p in _blog_posts():
        if p['file'].startswith('blog-'):
            static_rows.append(f'  <url><loc>{base}/{p["file"]}</loc><lastmod>{p["date"]}</lastmod>'
                               f'<changefreq>monthly</changefreq><priority>0.6</priority></url>')
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
  <meta name="theme-color" content="#f4f4f2" />
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
  <noscript><link rel="stylesheet" href="lib/vendor/pretendard/pretendardvariable-dynamic-subset.css" /></noscript>
  <link rel="stylesheet" href="style.css?v=20260727a" />
  <script src="lib/site-prefs.js"></script>
</head>
<body class="page-legal">
  <a href="#main" class="skip-link">본문 건너뛰기</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a href="/" class="brand" aria-label="기출해체분석기 홈">
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
        <a href="/">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="blog.html">블로그</a>
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
        <a href="/">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="blog.html">블로그</a>
        <a href="about.html">소개</a>
      </div>
    </nav>
  </header>
  <main id="main" class="legal legal--wide">
    <header class="legal__head">
      <h1 class="legal__title">{bd.html_escape(h1, quote=False)}</h1>
      <p class="legal__lead">{bd.html_escape(intro, quote=False)}</p>
      <p class="legal__sub">{bd.html_escape(stat, quote=False)}</p>
      <p class="hub-crumb"><a href="./">기출검색</a> · <a href="sets.html">전체 회차</a> · <a href="methodology.html">난이도 기준</a></p>
    </header>
    {''.join(sections)}
  </main>
  <footer class="site-footer">
    <div class="container">
      <nav class="site-footer__links" aria-label="사이트 정보">
        <a href="about.html">소개</a><a href="data-policy.html">데이터 원칙</a><a href="methodology.html">난이도 기준</a><a href="sets.html">전체 회차</a><a href="blog.html">블로그</a><a href="about.html#contact">문의</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a>
      </nav>
      <p class="site-footer__sub">자료 출처: 한국교육과정평가원, 17개 시·도교육청, 각 대학 입학처 등. 저작권은 각 발행 기관에 있으며, 개인 학습용으로만 이용해 주세요.</p>
    </div>
  </footer>
  <script type="module" src="lib/dday-mount.js?v=20260718a"></script>
  <script src="lib/measure.js?v=20260713c" defer></script>
</body>
</html>
'''
    (ROOT / fname).write_text(bd.public_files(page), encoding='utf-8')


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


def _eul(word: str) -> str:
    """받침 유무로 을/를."""
    return '을' if (ord(word[-1]) - 0xAC00) % 28 else '를'


def _school_short(school: str) -> str:
    """'성신여자대학교' → '성신여대', '연세대학교(미래)' → '연세대(미래)' — 검색어에 쓰는 통칭."""
    return school.replace('여자대학교', '여대').replace('대학교', '대')


def _write_essay_hub(h: dict, related: list = None) -> None:
    base = 'https://kicegg.com'
    school, fname, count = h['school'], h['fname'], h['count']
    short = _school_short(school)
    n_ans = sum(1 for e in h['exams'] if e.get('answerUrl'))
    n_sol = sum(1 for e in h['exams'] if e.get('solutionUrl') and e.get('solutionUrl') != e.get('questionUrl'))
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
    have = [t for t, n in (('예시답안', n_ans), ('해설', n_sol)) if n]
    have_txt = (' · '.join(f'{t} {n}건' for t, n in
                           (('예시답안', n_ans), ('해설', n_sol)) if n))
    named = school if school.replace('학교', '') == short or '(' in school else f'{school}({short})'
    kinds = '·'.join(['문제지'] + have)
    kinds_cnt = f'본논술 {n_annual}건' + (f'·모의논술 {n_mock}건' if n_mock else '')
    intro = (f'{named} 수시 논술전형 기출 {count}건을 한곳에 모았습니다. '
             f'{yr_sp}논술·모의논술 기출 문제지와 (제공되는 경우) 예시답안·해설을 '
             f'연도별로 정리했으니, 필요한 회차를 골라 PDF로 내려받아 확인하세요.')
    stat = f'본논술 {n_annual}건 · 모의논술 {n_mock}건' + (f' · {have_txt}' if have_txt else '')
    title = f'{short} 논술 기출문제 {yr_sp}문제지·{"예시답안·" if "예시답안" in have else ""}PDF — 기출해체분석기'
    desc = (f'{named} 논술 기출문제 {count}건 — {kinds_cnt}, {yr_sp}'
            f'{kinds}{_eul(kinds)} 연도별로 정리하고 PDF로 무료 다운로드하세요.')
    if related:
        rel = ''.join(f'<li><a href="{r["fname"]}">{bd.html_escape(_school_short(r["school"]), quote=False)} 논술 기출</a></li>'
                      for r in related)
        sections.append('<section class="legal__section"><h2>다른 대학 논술 기출</h2>'
                        f'<ul class="setsdir__list">{rel}</ul>'
                        '<p><a href="essay.html">대학별 논술 기출 전체 보기</a></p></section>')
    _hub_page(fname, f'{school} 논술 기출 전체', title, desc, intro, stat,
              sections, f'{school} 논술', item_list)


def render_essay_school_hubs(items: list[dict]) -> list[dict]:
    """대학별 논술 허브 nonsul-{slug}.html 생성. 옛 허브 정리 후 재생성."""
    for old in ROOT.glob('nonsul-*.html'):
        old.unlink()
    hubs = essay_hub_list(items)
    for h in hubs:
        # 인기순(건수) 상위 12개교로 서로 연결 — 자기 자신 제외
        rel = [r for r in hubs if r['fname'] != h['fname']][:12]
        _write_essay_hub(h, rel)
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
        # 학년도 안에서도 최근 시험부터 (수능 → 9모 → 6모, 학평은 월 역순) — 연도 역순 정렬과 같은 방향
        for it in sorted(years[gy], key=lambda x: (-(x.get('month') or 0), str(x.get('type') or ''), bd._subject_sort_key(x))):
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
  <meta name="theme-color" content="#f4f4f2" />
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
  <noscript><link rel="stylesheet" href="lib/vendor/pretendard/pretendardvariable-dynamic-subset.css" /></noscript>
  <link rel="stylesheet" href="style.css?v=20260727a" />
  <script src="lib/site-prefs.js"></script>
</head>
<body class="page-default">
  <a href="#main" class="skip-link">본문 건너뛰기</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a href="/" class="brand" aria-label="기출해체분석기 홈">
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
        <a href="/">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="blog.html">블로그</a>
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
        <a href="/">기출검색</a>
        <a href="calendar.html">학사 일정</a>
        <a href="blog.html">블로그</a>
        <a href="about.html">소개</a>
      </div>
    </nav>
  </header>
  <main id="main" class="legal legal--wide">
    <header class="legal__head">
      <h1 class="legal__title">전체 회차 목록</h1>
      <p class="legal__lead">수능·평가원·교육청·사관학교·경찰대·LEET·MEET 기출 회차를 학년도별로 모았습니다. 각 회차에서 영역별 문제지, 정답, 해설지, 등급컷 자료로 이동할 수 있습니다.</p>
      <p class="hub-crumb"><a href="./">기출검색</a> · <a href="calendar.html">학사 일정</a> · <a href="blog.html">블로그</a></p>
    </header>
    {''.join(sections)}
  </main>
  <footer class="site-footer">
    <div class="container">
      <nav class="site-footer__links" aria-label="사이트 정보">
        <a href="about.html">소개</a><a href="data-policy.html">데이터 원칙</a><a href="methodology.html">난이도 기준</a><a href="sets.html">전체 회차</a><a href="blog.html">블로그</a><a href="about.html#contact">문의</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a>
      </nav>
      <p class="site-footer__sub">자료 출처: 한국교육과정평가원, 17개 시·도교육청, 각 대학 입학처 등. 저작권은 각 발행 기관에 있으며, 개인 학습용으로만 이용해 주세요.</p>
    </div>
  </footer>
  <script type="module" src="lib/dday-mount.js?v=20260718a"></script>
  <script src="lib/measure.js?v=20260713c" defer></script>
</body>
</html>
'''
    (ROOT / 'sets.html').write_text(bd.public_files(page), encoding='utf-8')
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

    # 목록(첫 화면)에는 파일 주소를 싣지 않는다 — 긴 URL 이 용량의 대부분(압축 후 152KB → 35KB).
    # 있다는 표시(1)와 중복 판별용 questionKey 만 넣고, 실제 주소·내려받기 이름은 {tab}.urls.json 에서 첫 그리기 뒤에 받는다.
    url_keys = ('questionUrl', 'answerUrl', 'solutionUrl', 'listenUrl', 'scriptUrl', 'questionUrlEven')
    dl_keys = ('questionDownload', 'answerDownload', 'solutionDownload', 'listenDownload')
    keep = {'id', 'curriculum', 'gradeYear', 'examYear', 'month', 'studentGrade', 'typeGroup', 'type',
            'subject', 'subSubject', 'answerIncludesSolution'}
    urls_by_tab: dict[str, dict] = {}
    shared_q: dict = {}
    for it in items:
        if it.get('questionUrl'):
            shared_q[it['questionUrl']] = shared_q.get(it['questionUrl'], 0) + 1
    shared_q = collections.defaultdict(int, shared_q)

    def archive_item(it: dict, tab: str) -> dict:
        slim = {k: v for k, v in it.items() if k in keep}
        for k in url_keys:
            if it.get(k):
                slim[k] = 1
        if it.get('questionUrl') and shared_q[it['questionUrl']] > 1:   # 같은 시험지를 여러 영역이 공유하는 경우만(검색 결과 중복 제거용)
            slim['questionKey'] = hashlib.sha256(it['questionUrl'].encode()).hexdigest()[:12]
        row = [it.get(k) for k in url_keys]
        for url_key, dk in zip(('questionUrl', 'answerUrl', 'solutionUrl', 'listenUrl'), dl_keys):
            url = it.get(url_key)
            named = bool(url and dict(parse_qsl(urlsplit(url).query)).get('name'))
            row.append(None if named else it.get(dk))
        while row and row[-1] is None:
            row.pop()
        if row:
            urls_by_tab.setdefault(tab, {})[str(it['id'])] = row
        return slim

    for tab, rule in ARCHIVE_TAB_RULES.items():
        selected = []
        for it in items:
            if it.get('curriculum') not in rule['curriculums']:
                continue
            if rule.get('education_only') and it.get('typeGroup') != 'education':
                continue
            if it.get('typeGroup') == 'education' and it.get('studentGrade') != rule.get('education_grade'):
                continue
            selected.append(archive_item(it, tab))
            previous = assigned.setdefault(it['id'], tab)
            if previous != tab:
                raise RuntimeError(f'archive split 중복 id={it["id"]}: {previous}, {tab}')

        body = json.dumps(selected, ensure_ascii=False, separators=(',', ':')) + '\n'
        path = out_dir / f'{tab}.json'
        if not path.exists() or path.read_text(encoding='utf-8') != body:
            path.write_text(body, encoding='utf-8')
            written += 1
        ubody = json.dumps(urls_by_tab.get(tab, {}), ensure_ascii=False, separators=(',', ':')) + '\n'
        upath = out_dir / f'{tab}.urls.json'
        if not upath.exists() or upath.read_text(encoding='utf-8') != ubody:
            upath.write_text(ubody, encoding='utf-8')
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
        if item.get('questionUrl') and shared_q[item['questionUrl']] > 1:
            entry['questionKey'] = hashlib.sha256(item['questionUrl'].encode()).hexdigest()[:12]
        index.append(entry)
    (out_dir / 'all.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    # 기출검색 표의 1등급컷·난이도 열 — id → [원점수 1컷, 표준점수 최고점, 난이도(1~5|null), 절대평가 0/1, 영어 1등급 비율|null]
    scores = bd.compute_exam_scores(items)
    cuts_index = {str(i): [r['raw'], r['top'], r['tier'], 1 if r['abs'] else 0, r.get('ratio')]
                  for i, r in sorted(scores.items()) if r['raw'] is not None}
    (out_dir / 'cuts.json').write_text(json.dumps(cuts_index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    valid_names = ({f'{tab}.json' for tab in ARCHIVE_TAB_RULES} | {f'{tab}.urls.json' for tab in ARCHIVE_TAB_RULES}
                   | {'all.json', 'cuts.json'})
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


def _blog_posts() -> list[dict]:
    """data/blog-posts.json — 블로그·분석 글 목록(최신순). 홈 카드·블로그 목록·사이트맵이 함께 쓴다."""
    return json.loads((ROOT / 'data' / 'blog-posts.json').read_text(encoding='utf-8'))


def render_home(items: list[dict]) -> None:
    """index.html 의 '최근 시험'·'시험 종류' 블록을 정적으로 채운다 (JS 없이도 크롤·표시)."""
    esc = bd.html_escape
    previews = _loading_previews()

    # 최근 시험: 평가원 + 고3 학평 회차 중 시행 시점 최신 8개
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
                    key=lambda v: v['when'], reverse=True)[:8]

    cards, more = [], []
    for i, s in enumerate(latest):
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
        if i >= 4:   # 5~8번째는 표지 없는 줄 — 카드 8장이면 좁은 화면에서 너무 길다
            more.append(f'        <li><a class="latest-more__title" href="{set_href}">{esc(title, quote=False)}</a>'
                        f'<span class="latest-more__meta">{esc(meta, quote=False)}</span>'
                        f'<nav class="subj-links" aria-label="{esc(title, quote=True)} 과목">{"".join(links)}</nav></li>')
            continue
        cover = (f'<img src="{esc(img, quote=True)}" alt="" loading="lazy" decoding="async" />' if img else '')
        cards.append(
            '        <article class="card-box latest-card">\n'
            f'          <div class="cover">{cover}<span class="type-badge tg-{tg}">{esc(badge, quote=False)}</span></div>\n'
            f'          <h3 class="latest-card__title"><a href="{set_href}">{esc(title, quote=False)}</a></h3>\n'
            f'          <p class="latest-card__meta">{esc(meta, quote=False)}</p>\n'
            f'          <nav class="subj-links" aria-label="{esc(title, quote=True)} 과목">{"".join(links)}</nav>\n'
            '        </article>')
    latest_html = '      <div class="latest-rail">\n' + '\n'.join(cards) + '\n      </div>'
    if more:
        latest_html += '\n      <ul class="latest-more">\n' + '\n'.join(more) + '\n      </ul>'

    def count(pred) -> str:
        return f'{sum(1 for e in items if pred(e)):,}'
    cats = [
        ('/?tab=senior', count(lambda e: e.get('typeGroup') == 'suneung'), '수능·평가원', '수능 · 6모 · 9모 · 예비시험'),
        ('/?tab=senior&amp;typeGroup=education', count(lambda e: e.get('typeGroup') == 'education'), '학력평가', '고1 · 고2 · 고3 교육청'),
        ('/?tab=essay', count(lambda e: e.get('typeGroup') == 'essay'), '대학별 논술', '대학별 본논술 · 모의논술'),
        ('/?tab=mp', count(lambda e: e.get('typeGroup') in ('military', 'police')), '사관·경찰대', '1차 시험'),
        ('/?tab=gradschool', count(lambda e: e.get('typeGroup') in ('leet', 'meet')), 'LEET·MEET', '전문대학원 적성시험'),
        ('/?tab=gedhigh', count(lambda e: e.get('typeGroup') == 'ged'), '검정고시', '초졸 · 중졸 · 고졸'),
    ]
    arrow = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>')
    cat_html = '      <div class="cat-grid">\n' + '\n'.join(
        f'        <a class="card-box cat-card" href="{href}"><span class="cat-card__n">{n}</span>'
        f'<span><span class="cat-card__name">{name}</span><span class="cat-card__sub">{sub}</span></span>{arrow}</a>'
        for href, n, name, sub in cats) + '\n      </div>'

    # 과목별 기출 허브 — 홈에서 허브(시험 약 200개씩)로 바로 가는 크롤 경로
    hub_rows = [(label, ''.join(f'<a href="{prefix}-{slug}.html">{subj}</a>' for subj, slug in bd.SUBJECT_HUB_SLUG.items()))
                for prefix, label in (('suneung', '수능·평가원'), ('hakpyeong', '학력평가'))]
    hub_rows.append(('그 밖의 시험', '<a href="essay.html">대학별 논술</a><a href="ged.html">검정고시</a><a href="sets.html">전체 회차</a>'))
    hubs_html = '      <div class="hub-links">\n' + '\n'.join(
        f'        <div class="hub-links__row"><span class="hub-links__label">{label}</span>'
        f'<nav class="subj-links" aria-label="{label} 과목별 기출">{links}</nav></div>'
        for label, links in hub_rows) + '\n      </div>'

    posts = _blog_posts()
    home_posts = '      <div class="post-cards" aria-labelledby="postsTitle">\n' + '\n'.join(
        f'        <a class="card-box post-card" href="{p["file"]}"><span class="post-card__tag">{esc(p["tag"], quote=False)}</span>'
        f'<span class="post-card__title">{esc(p["title"], quote=False)}</span><span class="post-card__desc">{esc(p["desc"], quote=False)}</span></a>'
        for p in posts[:3]) + '\n      </div>'
    path = ROOT / 'index.html'
    html = _compose_index(path.read_text(encoding='utf-8'), (ROOT / 'archive.html').read_text(encoding='utf-8'))
    html = _replace_block(html, 'latest-sets', latest_html)
    html = _replace_block(html, 'categories', cat_html)
    html = _replace_block(html, 'subject-hubs', hubs_html)
    html = _replace_block(html, 'home-posts', home_posts)
    path.write_text(bd.public_files(html), encoding='utf-8')
    blog = ROOT / 'blog.html'
    blog.write_text(_replace_block(blog.read_text(encoding='utf-8'), 'blog-list', '\n'.join(
        f'      <li class="blog-card">\n        <a href="{p["file"]}">\n          <span class="blog-card__tag">{esc(p["tag"], quote=False)}</span>\n'
        f'          <h2 class="blog-card__title">{esc(p["title"], quote=False)}</h2>\n          <p class="blog-card__desc">{esc(p["desc"], quote=False)}</p>\n'
        f'          <time class="blog-card__date" datetime="{p["date"]}">{int(p["date"][:4])}년 {int(p["date"][5:7])}월 {int(p["date"][8:])}일</time>\n        </a>\n      </li>'
        for p in posts)), encoding='utf-8')
    print(f'  + index.html (기출검색 + 최근 시험 {len(cards) + len(more)}개 · 시험 종류 {len(cats)}개)')


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
    <div class="home-sec">
      <div class="sec-head"><h2 id="hubTitle">과목별 기출</h2></div>
      <!-- subject-hubs:start (render-site.py 가 채움) -->
      <!-- subject-hubs:end -->
    </div>
    <div class="home-posts">
      <div class="sec-head"><h2 id="postsTitle">블로그</h2><a class="sec-head__more" href="blog.html">전체 글</a></div>
      <!-- home-posts:start (render-site.py 가 채움) -->
      <!-- home-posts:end -->
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


def render_calendar() -> None:
    """calendar.html 에 data/calendar.json 전체 일정을 월별 정적 HTML 로 채운다 (JS 없이도 크롤)."""
    esc = bd.html_escape
    events = json.loads((ROOT / 'data' / 'calendar.json').read_text(encoding='utf-8'))['events']
    events.sort(key=lambda e: e.get('date') or e['dateRange'][0])

    def label(d: str) -> str:
        y, m, dd = d.split('-')
        return f'{y}년 {int(m)}월 {int(dd)}일'

    months: dict[str, list[dict]] = {}
    for ev in events:
        months.setdefault((ev.get('date') or ev['dateRange'][0])[:7], []).append(ev)
    parts = ['    <h2 class="cal-sec">전체 시험·입시 일정</h2>']
    for ym, evs in months.items():
        y, m = ym.split('-')
        parts.append(f'    <h3 class="cal-sec-month">{y}년 {int(m)}월</h3>\n    <ul class="cal-list">')
        for ev in evs:
            if ev.get('date'):
                when = f'<time datetime="{ev["date"]}">{label(ev["date"])}</time>'
            else:
                a, b = ev['dateRange']
                when = f'<time datetime="{a}">{label(a)}</time> ~ <time datetime="{b}">{label(b)}</time>'
            org = f'<div class="cal-item__sub">{esc(ev["org"], quote=False)}</div>' if ev.get('org') else ''
            parts.append(f'      <li class="cal-item"><div class="cal-item__date">{when}</div>'
                         f'<div class="cal-item__body"><div class="cal-item__title">{esc(ev["title"], quote=False)}</div>{org}</div></li>')
        parts.append('    </ul>')
    path = ROOT / 'calendar.html'
    path.write_text(_replace_block(path.read_text(encoding='utf-8'), 'calendar-all', '\n'.join(parts)), encoding='utf-8')
    print(f'  + calendar.html 정적 일정 {len(events)}건')


# ── methodology.html — 난이도 산정 기준 (그림은 실제 데이터로 인라인 SVG 생성) ──────────
def _svg(w: int, h: int, label: str, body: str) -> str:
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{bd.html_escape(label, quote=True)}" '
            f'xmlns="http://www.w3.org/2000/svg">{body}</svg>')


def _txt(x, y, t, cls='mf-txt', anchor='middle', extra='') -> str:
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{extra}>{bd.html_escape(str(t), quote=False)}</text>'


def _methodology_validation() -> dict:
    """2026학년도 수능·9모 실측 표점 분포와, 등급컷만으로 추정한 값을 비교."""
    import statistics as st
    dist = json.loads((ROOT / 'data' / 'score-distribution.json').read_text(encoding='utf-8'))
    cuts = json.loads((ROOT / 'data' / 'gradecuts.json').read_text(encoding='utf-8'))
    rows = []
    for x in dist:
        m = [c for c in cuts if c['gradeYear'] == x['year'] and c['type'] == x['type'] and c['subject'] == x['subject']
             and c.get('subSubject') == x['subSubject'] and c.get('typeGroup') == x['typeGroup']]
        if not m or not bd._full8(m[0].get('standardCuts')):
            continue
        sc = m[0]['standardCuts'][:8]
        cnt = {int(k): v['male'] + v['female'] for k, v in x['distribution'].items()}
        n = sum(cnt.values())
        mu = sum(k * c for k, c in cnt.items()) / n
        sd = (sum(c * (k - mu) ** 2 for k, c in cnt.items()) / n) ** 0.5
        sk = sum(c * ((k - mu) / sd) ** 3 for k, c in cnt.items()) / n
        hi = m[0].get('highestStandardScore')
        if not isinstance(hi, (int, float)) or hi < sc[0]:
            hi = sc[0] + (sc[0] - sc[1])
        emu, esd, esk = bd.grouped_moments(bd.relative_edges(sc, sc[7] - (hi - sc[0]), hi), bd.GRADE_RATIOS)
        rows.append({'x': x, 'cut': m[0], 'sc': sc, 'cnt': cnt, 'n': n, 'mu': mu, 'sd': sd, 'sk': sk,
                     'emu': emu, 'esd': esd, 'esk': esk, 'hi': hi})
    return {'rows': rows}


def _fig_bins(val: dict) -> str:
    row = next((r for r in val['rows'] if r['x']['subject'] == '국어' and r['x']['type'] == 'csat'), val['rows'][0])
    cnt, sc, hi = row['cnt'], row['sc'], row['hi']
    lo_t, hi_t = min(cnt), max(cnt)
    W, H, ml, mr, mt, mb = 680, 320, 46, 16, 40, 62
    pw, ph = W - ml - mr, H - mt - mb
    x0, x1 = lo_t - 2, hi_t + 2
    X = lambda v: ml + (v - x0) / (x1 - x0) * pw
    ymax = max(cnt.values())
    Y = lambda c: mt + ph - c / ymax * ph
    edges = [hi_t + .5] + [c - .5 for c in sc] + [lo_t - .5]
    b = []
    for i in range(9):
        a_, b_ = X(edges[i + 1]), X(edges[i])
        b.append(f'<rect class="{"mf-band-a" if i % 2 == 0 else "mf-band-b"}" x="{a_:.1f}" y="{mt}" width="{b_ - a_:.1f}" height="{ph}"/>')
    bw = max(pw / (x1 - x0) - 1, 1)
    for k, c in sorted(cnt.items()):
        g = next((i for i in range(8) if k >= sc[i]), 8)
        b.append(f'<rect class="{"mf-bar-a" if g % 2 == 0 else "mf-bar-b"}" x="{X(k) - bw / 2:.1f}" y="{Y(c):.1f}" width="{bw:.1f}" height="{mt + ph - Y(c):.1f}"/>')
    b.append(f'<line class="mf-axis" x1="{ml}" y1="{mt + ph}" x2="{ml + pw}" y2="{mt + ph}"/>')
    for t in range((lo_t // 20) * 20, hi_t + 1, 20):
        if x0 <= t <= x1:
            b.append(_txt(X(t), mt + ph + 14, t, 'mf-txt mf-txt--sm'))
    for c in sc:
        b.append(f'<line class="mf-cut" x1="{X(c - .5):.1f}" y1="{mt}" x2="{X(c - .5):.1f}" y2="{mt + ph}"/>')
    ratios = ['4%', '7%', '12%', '17%', '20%', '17%', '12%', '7%', '4%']
    for i in range(9):
        cx = (X(edges[i]) + X(edges[i + 1])) / 2
        b.append(_txt(cx, mt + ph + 30, f'{i + 1}등급', 'mf-txt mf-txt--strong mf-txt--sm'))
        b.append(_txt(cx, mt + ph + 43, ratios[i], 'mf-txt mf-txt--sm'))
    b.append(_txt(ml + pw / 2, H - 4, '표준점수 (막대는 응시자 수, 점선은 등급컷)', 'mf-txt mf-txt--sm'))
    b.append(f'<line class="mf-true" x1="{X(row["mu"]):.1f}" y1="{mt - 6}" x2="{X(row["mu"]):.1f}" y2="{mt + ph}"/>')
    b.append(f'<line class="mf-est" x1="{X(row["emu"]):.1f}" y1="{mt - 6}" x2="{X(row["emu"]):.1f}" y2="{mt + ph}"/>')
    b.append(_txt(X(row['mu']) + 6, mt - 22, f'실측 평균 {row["mu"]:.1f}', 'mf-txt mf-txt--strong', 'start'))
    b.append(_txt(X(row['emu']) - 6, mt - 8, f'등급컷만으로 추정 {row["emu"]:.1f}', 'mf-est-txt', 'end'))
    x = row['x']
    cap = (f'<figcaption>그림 1. {x["year"]}학년도 {bd.KOREAN_TYPE_LABEL.get(x["type"], x["type"])} {x["subject"]} 영역 표준점수 분포입니다(응시자 {row["n"]:,}명). '
           f'배경의 띠가 등급 구간이고 아래 숫자는 각 등급의 응시자 비율입니다. 1~8등급 컷과 최고점, 등급 비율만으로 계산한 평균은 {row["emu"]:.1f}(실제 {row["mu"]:.1f}), '
           f'표준편차는 {row["esd"]:.1f}(실제 {row["sd"]:.1f}), 왜도는 {row["esk"]:+.2f}(실제 {row["sk"]:+.2f})입니다. '
           f'표준점수는 평균 100, 표준편차 20이 되도록 정한 값이라 평균은 항상 100 근처이고, 난이도 정보는 원점수와의 대응과 분포의 쏠림에 있습니다.</figcaption>')
    label = x['subject'] + ' 표준점수 분포와 등급 구간, 실측 평균과 추정 평균'
    return f'<div>{_svg(W, H, label, "".join(b))}</div>{cap}'


def _fig_validate(val: dict) -> str:
    rows = val['rows']
    W, H = 320, 300
    # (a) 왜도 산점도
    lo, hi = -0.6, 1.2
    ml, mt, pw, ph = 40, 20, 260, 230
    X = lambda v: ml + (v - lo) / (hi - lo) * pw
    Y = lambda v: mt + ph - (v - lo) / (hi - lo) * ph
    a = [f'<line class="mf-axis" x1="{ml}" y1="{mt + ph}" x2="{ml + pw}" y2="{mt + ph}"/><line class="mf-axis" x1="{ml}" y1="{mt}" x2="{ml}" y2="{mt + ph}"/>',
         f'<line class="mf-diag" x1="{X(lo):.1f}" y1="{Y(lo):.1f}" x2="{X(hi):.1f}" y2="{Y(hi):.1f}"/>']
    for t in (-0.5, 0, 0.5, 1.0):
        a.append(_txt(X(t), mt + ph + 14, f'{t:g}', 'mf-txt mf-txt--sm'))
        a.append(_txt(ml - 6, Y(t) + 3, f'{t:g}', 'mf-txt mf-txt--sm', 'end'))
    for r in rows:
        a.append(f'<circle class="mf-pt" cx="{X(r["sk"]):.1f}" cy="{Y(r["esk"]):.1f}" r="3.4"/>')
    a.append(_txt(ml + pw / 2, H - 22, '실측 왜도', 'mf-txt'))
    a.append(f'<text class="mf-txt" transform="translate(11 {mt + ph / 2}) rotate(-90)" text-anchor="middle">등급컷으로 추정한 왜도</text>')
    import statistics as st
    r_sk = st.correlation([r['sk'] for r in rows], [r['esk'] for r in rows])
    a.append(_txt(ml + 8, mt + 14, f'상관계수 {r_sk:.3f}', 'mf-txt mf-txt--strong', 'start'))
    fa = _svg(W, H, '실측 왜도와 추정 왜도의 산점도', ''.join(a))
    # (b) 평균 오차 (σ 단위) 스트립
    errs = [(r['emu'] - r['mu']) / r['sd'] for r in rows]
    e_lo, e_hi = -0.15, 0.15
    Xe = lambda v: ml + (v - e_lo) / (e_hi - e_lo) * pw
    b = [f'<line class="mf-axis" x1="{ml}" y1="{mt + ph / 2 + 20}" x2="{ml + pw}" y2="{mt + ph / 2 + 20}"/>',
         f'<line class="mf-true" x1="{Xe(0):.1f}" y1="{mt + 20}" x2="{Xe(0):.1f}" y2="{mt + ph / 2 + 20}"/>']
    for t in (-0.1, -0.05, 0, 0.05, 0.1):
        b.append(_txt(Xe(t), mt + ph / 2 + 36, f'{t:+g}' if t else '0', 'mf-txt mf-txt--sm'))
    for i, e in enumerate(sorted(errs)):
        cy = mt + ph / 2 + 12 - (i % 6) * 12
        b.append(f'<circle class="mf-pt" cx="{Xe(e):.1f}" cy="{cy:.1f}" r="3.4"/>')
    b.append(_txt(ml + pw / 2, H - 22, '평균 추정 오차 (표준편차 대비 배수)', 'mf-txt'))
    b.append(_txt(ml + pw / 2, mt + 6, f'평균 오차 {sum(abs(e) for e in errs) / len(errs):.3f}배, 최대 {max(abs(e) for e in errs):.3f}배', 'mf-txt mf-txt--strong'))
    fb = _svg(W, H, '평균 추정 오차 분포', ''.join(b))
    cap = (f'<figcaption>그림 2. 국어, 수학, 사탐, 과탐의 수능과 9모 {len(rows)}개 영역 검증 결과입니다. 왼쪽은 등급컷으로 추정한 왜도와 실제 왜도로, 높을수록 어려운 분포입니다. '
           f'오른쪽은 평균 추정 오차를 표준편차로 나눈 값입니다. 전체적으로 조금 낮게 추정되는 편향이 있어 화면의 평균 점수율은 1점 안팎의 오차가 있습니다.</figcaption>')
    return f'<div class="mf-pair">{fa}{fb}</div>{cap}'


def _val_table(val: dict) -> str:
    import statistics as st
    rows = val['rows']
    errs = [(r['emu'] - r['mu']) / r['sd'] for r in rows]
    ratio = [r['esd'] / r['sd'] for r in rows]
    r_sk = st.correlation([r['sk'] for r in rows], [r['esk'] for r in rows])
    return (f'<p>{len(rows)}개 영역에서 평균 추정 오차는 표준편차의 평균 {sum(abs(e) for e in errs) / len(errs):.3f}배, 최대 {max(abs(e) for e in errs):.3f}배였습니다. '
            f'표준편차 추정값은 실제의 {min(ratio):.2f}배에서 {max(ratio):.2f}배 사이였고, 왜도의 상관계수는 {r_sk:.3f}였습니다.</p>'
            '<p>처음에는 등급컷에 정규분포를 맞추는 방법을 검토했으나, 수학은 점수가 한쪽으로 쏠리고 봉우리가 두 개여서 4점에서 7점씩 어긋나 채택하지 않았습니다. '
            '분포 모양을 가정하지 않는 현재 방식은 왜도가 -0.3에서 1.0까지인 분포에서도 안정적이었습니다.</p>')


def _dedupe_rounds(its: list[dict]) -> list[dict]:
    """같은 회차의 선택과목·영역 중복을 없앤다(시간순 유지)."""
    seen, out = set(), []
    for it in sorted(its, key=bd._exam_sort_key):
        sig = (it['gradeYear'], it['type'])
        if sig not in seen:
            seen.add(sig); out.append(it)
    return out


def _tier_dot_chart(pts: list[dict], vals: list[float], allv: list[float], scores: dict, ylabel: str, aria: str) -> tuple[str, bool]:
    """회차별 값(높을수록 쉬움)을 점으로 찍고, 부여된 난이도 색과 백분위 경계선을 겹친 그림. (svg, 5단계 여부) 반환."""
    n = len(vals)
    W, H, ml, mr, mt, mb = 680, 300, 46, 84, 16, 44
    pw, ph = W - ml - mr, H - mt - mb
    lo, hi = min(vals) - 3, max(vals) + 3
    X = lambda i: ml + (i + .5) / n * pw
    Y = lambda v: mt + ph - (v - lo) / (hi - lo) * ph
    b = [f'<line class="mf-axis" x1="{ml}" y1="{mt + ph}" x2="{ml + pw}" y2="{mt + ph}"/><line class="mf-axis" x1="{ml}" y1="{mt}" x2="{ml}" y2="{mt + ph}"/>']
    step = 5 if hi - lo > 12 else 2
    for t in range(int(lo) + 1, int(hi) + 1):
        if t % step == 0:
            b.append(f'<line class="mf-grid" x1="{ml}" y1="{Y(t):.1f}" x2="{ml + pw}" y2="{Y(t):.1f}"/>')
            b.append(_txt(ml - 6, Y(t) + 3, f'{t}%', 'mf-txt mf-txt--sm', 'end'))
    allv = sorted(allv)
    m = len(allv)

    def q(p):   # 백분위 경계 값
        idx = p * (m - 1)
        f = int(idx); c = min(f + 1, m - 1)
        return allv[f] + (allv[c] - allv[f]) * (idx - f)
    five = m >= bd.TIER_LOW_N
    edges = [.8, .6, .4, .2] if five else [2 / 3, 1 / 3]
    for p in edges:
        b.append(f'<line class="mf-thr" x1="{ml}" y1="{Y(q(p)):.1f}" x2="{ml + pw}" y2="{Y(q(p)):.1f}"/>')
    zones = ([('매우 쉬움', (1.0, .8)), ('쉬움', (.8, .6)), ('보통', (.6, .4)), ('어려움', (.4, .2)), ('매우 어려움', (.2, 0))] if five
             else [('쉬움', (1.0, 2 / 3)), ('보통', (2 / 3, 1 / 3)), ('어려움', (1 / 3, 0))])
    for lbl, (a_, b_) in zones:
        b.append(_txt(ml + pw + 8, Y((q(a_) + q(b_)) / 2) + 3, lbl, 'mf-txt mf-txt--sm', 'start'))
    for i, it in enumerate(pts):
        t = scores[it['id']]['tier']
        b.append(f'<circle class="mf-t{t}" cx="{X(i):.1f}" cy="{Y(vals[i]):.1f}" r="4.6"><title>{bd.html_escape(bd._short_round(it) + f" {vals[i]:.1f}%", quote=False)}</title></circle>')
    last = None
    for i, it in enumerate(pts):
        y = it['gradeYear']
        if y != last and isinstance(y, int) and i % max(1, n // 12) == 0:
            b.append(_txt(X(i), mt + ph + 14, y, 'mf-txt mf-txt--sm')); last = y
    b.append(_txt(ml + pw / 2, H - 6, '학년도 (왼쪽이 과거, 오른쪽이 최근 회차)', 'mf-txt mf-txt--sm'))
    b.append(f'<text class="mf-txt" transform="translate(12 {mt + ph / 2}) rotate(-90)" text-anchor="middle">{ylabel}</text>')
    return _svg(W, H, aria, ''.join(b)), five


def _fig_series(items: list[dict], scores: dict) -> str:
    import collections
    ser = collections.defaultdict(list)
    for it in items:
        r = scores.get(it['id'])
        k = bd.tier_series_key(it)
        if k and r and r['tierBasis'] == 'mean' and r['tier'] and k[0] == 'suneung' and k[2] == '국어':
            ser[k].append(it)
    if not ser:
        return ''
    key = max(ser, key=lambda k: len(ser[k]))
    pts = _dedupe_rounds(ser[key])
    svg, five = _tier_dot_chart(pts, [scores[it['id']]['mean'] * 100 for it in pts], [scores[it['id']]['mean'] * 100 for it in ser[key]],
                                scores, '추정 평균 점수율', '국어 역대 회차의 추정 평균 점수율과 난이도 등급')
    curr = key[1]
    cap = (f'<figcaption>그림 3. 수능과 모의평가 국어({bd._CURR_LABEL.get(str(curr), str(curr))} 교육과정) {len(ser[key])}개 회차의 추정 평균 점수율입니다. '
           f'점 색깔은 부여된 난이도이고 점선은 역대 값을 {"20, 40, 60, 80" if five else "33, 67"}퍼센트 지점에서 나눈 경계입니다. '
           f'점수율이 높을수록 쉬운 시험입니다. 점에 마우스를 올리면 회차와 값이 표시됩니다.</figcaption>')
    return f'<div>{svg}</div>{cap}'


def _fig_abs(items: list[dict], scores: dict) -> str:
    """영어(절대평가): 1등급 비율 추이와 부여된 난이도."""
    its = [it for it in items if it.get('subject') == '영어' and it.get('typeGroup') == 'suneung'
           and scores.get(it['id']) and scores[it['id']]['tierBasis'] == 'ratio' and scores[it['id']]['tier']]
    if not its:
        return ''
    pts = _dedupe_rounds(its)
    svg, five = _tier_dot_chart(pts, [scores[it['id']]['ratio'] for it in pts], [scores[it['id']]['ratio'] for it in its],
                                scores, '1등급 비율', '영어 역대 회차의 1등급 비율과 난이도 등급')
    cap = (f'<figcaption>그림 4. 수능과 모의평가 영어(절대평가) {len(its)}개 회차의 1등급 비율입니다. 점 색깔은 부여된 난이도입니다. '
           f'1등급 비율이 낮을수록 90점을 넘기기 어려웠던 시험이므로 아래쪽이 어려운 시험입니다.</figcaption>')
    return f'<div>{svg}</div>{cap}'


def render_methodology(items: list[dict]) -> None:
    scores = bd.compute_exam_scores(items)
    val = _methodology_validation()
    path = ROOT / 'methodology.html'
    html = path.read_text(encoding='utf-8')
    for name, body in (('fig-bins', _fig_bins(val)), ('fig-abs', _fig_abs(items, scores)), ('fig-validate', _fig_validate(val)),
                       ('val-table', _val_table(val)), ('fig-series', _fig_series(items, scores))):
        html = _replace_block(html, name, body)
    path.write_text(bd.public_files(html), encoding='utf-8')
    print(f'  + methodology.html 그림 5종 (검증 {len(val["rows"])}건)')


# ── 시험 분석 글: 2027학년도 9월 모의평가 (그림은 사이트 데이터로 생성) ──────────
def _fig_post_english(en: dict) -> str:
    series = [('2027학년도 9월', en['2027|sept'], 'mf-s1'), ('2027학년도 6월', en['2027|june'], 'mf-s2'), ('2026학년도 수능', en['2026|csat'], 'mf-s3')]
    W, H, ml, mr, mt, mb = 680, 300, 44, 16, 40, 46
    pw, ph = W - ml - mr, H - mt - mb
    ymax = 30.0
    Y = lambda v: mt + ph - v / ymax * ph
    b = [f'<line class="mf-axis" x1="{ml}" y1="{mt + ph}" x2="{ml + pw}" y2="{mt + ph}"/>']
    for t in (0, 10, 20, 30):
        b.append(f'<line class="mf-grid" x1="{ml}" y1="{Y(t):.1f}" x2="{ml + pw}" y2="{Y(t):.1f}"/>')
        b.append(_txt(ml - 6, Y(t) + 3, f'{t}%', 'mf-txt mf-txt--sm', 'end'))
    gw = pw / 9
    bw = gw * 0.24
    for g in range(9):
        cx = ml + gw * (g + .5)
        for k, (_, r, cls) in enumerate(series):
            x = cx + (k - 1) * (bw + 2) - bw / 2
            v = r['ratios'][g]
            b.append(f'<rect class="{cls}" x="{x:.1f}" y="{Y(v):.1f}" width="{bw:.1f}" height="{mt + ph - Y(v):.1f}"><title>{series[k][0]} {g + 1}등급 {v:g}%</title></rect>')
        b.append(_txt(cx, mt + ph + 16, f'{g + 1}등급', 'mf-txt mf-txt--sm'))
    lx = ml
    for name, _, cls in series:
        b.append(f'<rect class="{cls}" x="{lx}" y="10" width="10" height="10"/>')
        b.append(_txt(lx + 15, 19, name, 'mf-txt mf-txt--sm', 'start'))
        lx += 140
    cap = ('<figcaption>그림 1. 영어 등급별 응시자 비율입니다. 2027학년도 9월 모의평가는 1등급부터 3등급까지 합이 61.6%로, '
           '6월(42.6%)과 지난해 수능(43.8%)보다 크게 높습니다. 막대에 마우스를 올리면 값이 표시됩니다.</figcaption>')
    return f'<div>{_svg(W, H, "영어 등급별 비율 비교", "".join(b))}</div>{cap}'


def _fig_post_top() -> str:
    cuts = json.loads((ROOT / 'data' / 'gradecuts.json').read_text(encoding='utf-8'))
    def top(y, t, subj):
        for c in cuts:
            if c['gradeYear'] == y and c['type'] == t and c['subject'] == subj and c.get('typeGroup') == 'suneung' and c.get('highestStandardScore'):
                return c['highestStandardScore']
    rounds = [(2026, 'csat', '26 수능'), (2026, 'sept', '26 9월'), (2027, 'june', '27 6월'), (2027, 'sept', '27 9월')]
    W, H = 680, 260
    b = []
    for pi, subj in enumerate(('국어', '수학')):
        vals = [top(y, t, subj) for y, t, _ in rounds]
        if any(v is None for v in vals):
            return ''
        x0 = 30 + pi * 330
        pw, mt, ph = 280, 40, 150
        lo, hi = 125, 150
        X = lambda i: x0 + 20 + i * (pw - 40) / 3
        Y = lambda v: mt + ph - (v - lo) / (hi - lo) * ph
        b.append(_txt(x0 + pw / 2, 20, subj + ' 표준점수 최고점', 'mf-txt mf-txt--strong'))
        b.append(f'<line class="mf-axis" x1="{x0}" y1="{mt + ph}" x2="{x0 + pw}" y2="{mt + ph}"/>')
        b.append('<polyline class="mf-line" points="' + ' '.join(f'{X(i):.1f},{Y(v):.1f}' for i, v in enumerate(vals)) + '"/>')
        for i, ((_, _, lbl), v) in enumerate(zip(rounds, vals)):
            b.append(f'<circle class="{"mf-dot mf-dot--now" if i == 3 else "mf-dot"}" cx="{X(i):.1f}" cy="{Y(v):.1f}" r="5"/>')
            b.append(_txt(X(i), Y(v) - 11, v, 'mf-txt mf-txt--strong mf-txt--sm'))
            b.append(_txt(X(i), mt + ph + 16, lbl, 'mf-txt mf-txt--sm'))
    b.append(_txt(W / 2, H - 6, '세로축은 125점에서 150점까지만 표시했습니다', 'mf-txt mf-txt--sm'))
    cap = ('<figcaption>그림 2. 국어와 수학의 표준점수 최고점입니다. 국어는 6월 132점에서 9월 144점으로 올랐고, 수학은 138점에서 137점으로 거의 같습니다.</figcaption>')
    return f'<div>{_svg(W, H, "국어와 수학 표준점수 최고점 추이", "".join(b))}</div>{cap}'


def render_post_2027_sept() -> None:
    path = ROOT / 'blog-2027-sept-mock.html'
    if not path.exists():
        return
    en = json.loads((ROOT / 'data' / 'english-grade-ratios.json').read_text(encoding='utf-8'))
    if not all(k in en for k in ('2027|sept', '2027|june', '2026|csat')):
        return
    html = path.read_text(encoding='utf-8')
    html = _replace_block(html, 'fig-eng', _fig_post_english(en))
    html = _replace_block(html, 'fig-top', _fig_post_top())
    path.write_text(bd.public_files(html), encoding='utf-8')
    print('  + blog-2027-sept-mock.html 그림 2종')


def render_rss(items: list[dict]) -> None:
    """최신 추가 자료 RSS 피드(feed.xml). 네이버는 RSS를 사이트맵과 별개의
    freshness(최신성) 신호로 취급 — 전수가 아니라 '최근 추가 N개'만 담는다.
    pubDate는 시험 시행 시점(examYear·month) 기준으로 안정적(신규 시험만 최신 신호)."""
    import calendar
    from email.utils import formatdate
    base = 'https://kicegg.com'
    # id 순은 옛 자료 백필이 맨 위로 와서(2026-10: 2005 수능 한문이 '최신') 시행 시점 순으로 — 아직 안 온 달(예시문항 등)은 뺀다.
    def _when(it):
        return (int(it.get('examYear') or 0), int(it.get('month') or 1) or 1)
    now = datetime.date.today()
    recent = sorted((it for it in items if _when(it) <= (now.year, now.month)),
                    key=lambda x: (_when(x), x.get('id', 0)), reverse=True)[:40]
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
        mo = int(it.get('month') or 1) or 1
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
    (ROOT / 'feed.xml').write_text(bd.public_files('\n'.join(rows) + '\n'), encoding='utf-8')
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
    render_calendar()
    render_methodology(items)
    render_post_2027_sept()
    render_splits(items)
    render_archive_splits(items)
    render_set_splits(items)
    render_gradecut_splits(items)
    print('완료')


if __name__ == '__main__':
    main()
