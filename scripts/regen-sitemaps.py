#!/usr/bin/env python3
"""sitemap-*.xml만 priority 차등화 적용해 재생성. build-data.py 전체 실행 부작용 회피."""
from __future__ import annotations
import datetime, json
from pathlib import Path

ROOT = Path(__file__).parent.parent
BASE = 'https://kicegg.com'
TODAY = datetime.date.today().isoformat()
CURRENT_YEAR = datetime.date.today().year + 1  # 학년도 기준

items = json.loads((ROOT / 'data/exams.json').read_text(encoding='utf-8'))


def exam_priority(it):
    gy = it.get('gradeYear', 0) or 0
    tp = it.get('type', '')
    tg = it.get('typeGroup', '')
    is_english = (it.get('subject') == '영어')
    has_listen = bool(it.get('listenUrl') or it.get('scriptUrl'))
    if tg == 'reference' or tp == 'prelim': return '0.2'
    if gy and gy <= 2007: return '0.2'
    if tg == 'suneung' and tp in ('csat', 'june', 'sept'):
        if gy >= CURRENT_YEAR - 1: return '0.9'
        if gy >= CURRENT_YEAR - 3: return '0.7'
        if gy >= 2014: return '0.5'
        return '0.3'
    if gy >= CURRENT_YEAR - 1: return '0.7' if (is_english and has_listen) else '0.6'
    if gy >= CURRENT_YEAR - 3: return '0.5' if (is_english and has_listen) else '0.4'
    return '0.4' if (is_english and has_listen) else '0.3'


def set_priority(curr, year_str, t, sg):
    try: gy = int(year_str)
    except: gy = 0
    if t == 'prelim' or curr == 'reference': return '0.3'
    if gy and gy <= 2007: return '0.3'
    if t in ('csat', 'june', 'sept'):
        if gy >= CURRENT_YEAR - 1: return '1.0'
        if gy >= CURRENT_YEAR - 3: return '0.9'
        if gy >= 2014: return '0.7'
        return '0.5'
    if gy >= CURRENT_YEAR - 1: return '0.8'
    if gy >= CURRENT_YEAR - 3: return '0.6'
    return '0.5'


def set_friendly_filename(curr, year, t, sg):
    """build-data.py의 set_friendly_filename과 동일 — 기존 파일들을 그대로 재참조."""
    # 기존 파일 패턴: exam-set-{curr}-{year}-{type}[-g{sg}].html
    suffix = f'-g{sg}' if sg else ''
    return f'exam-set-{curr}-{year}-{t}{suffix}.html'


# sitemap-exams.xml
exams_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for it in items:
    exams_parts.append(
        f'  <url><loc>{BASE}/exam-{it["id"]}.html</loc>'
        f'<lastmod>{TODAY}</lastmod>'
        f'<changefreq>monthly</changefreq><priority>{exam_priority(it)}</priority></url>')
exams_parts.append('</urlset>')
(ROOT / 'sitemap-exams.xml').write_text('\n'.join(exams_parts) + '\n', encoding='utf-8')

# sitemap-sets.xml — 기존 파일에서 URL 그대로 재사용 (set_friendly_filename 재구현 위험 회피)
import re
existing_sets = (ROOT / 'sitemap-sets.xml').read_text(encoding='utf-8')
sets_urls = re.findall(r'<loc>([^<]+)</loc>', existing_sets)

sets_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url in sets_urls:
    # URL 파싱: https://kicegg.com/exam-set-{curr}-{year}-{type}[-g{sg}].html
    m = re.match(r'.*?exam-set-(\w+)-(\d+)-([\w]+?)(?:-g(\d))?\.html$', url)
    if m:
        curr, year, t, sg = m.group(1), m.group(2), m.group(3), m.group(4)
        prio = set_priority(curr, year, t, int(sg) if sg else None)
    else:
        prio = '0.5'
    sets_parts.append(
        f'  <url><loc>{url}</loc>'
        f'<lastmod>{TODAY}</lastmod>'
        f'<changefreq>monthly</changefreq><priority>{prio}</priority></url>')
sets_parts.append('</urlset>')
(ROOT / 'sitemap-sets.xml').write_text('\n'.join(sets_parts) + '\n', encoding='utf-8')

# sitemap-static.xml
static_parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    f'  <url><loc>{BASE}/</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>',
    f'  <url><loc>{BASE}/archive.html</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>',
    f'  <url><loc>{BASE}/gradecut.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>',
    f'  <url><loc>{BASE}/sets.html</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>',
    f'  <url><loc>{BASE}/admissions.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
    f'  <url><loc>{BASE}/calendar.html</loc><lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>',
    '</urlset>',
]
(ROOT / 'sitemap-static.xml').write_text('\n'.join(static_parts) + '\n', encoding='utf-8')

# 통계
from collections import Counter
exam_prios = Counter(exam_priority(it) for it in items)
print(f"sitemap-exams.xml priority 분포 ({len(items)}건):")
for p in sorted(exam_prios.keys(), reverse=True):
    print(f"  {p}: {exam_prios[p]}건")

set_prios = Counter()
for url in sets_urls:
    m = re.match(r'.*?exam-set-(\w+)-(\d+)-([\w]+?)(?:-g(\d))?\.html$', url)
    if m:
        set_prios[set_priority(m.group(1), m.group(2), m.group(3), int(m.group(4)) if m.group(4) else None)] += 1
print(f"\nsitemap-sets.xml priority 분포 ({len(sets_urls)}건):")
for p in sorted(set_prios.keys(), reverse=True):
    print(f"  {p}: {set_prios[p]}건")
