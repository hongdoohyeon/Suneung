#!/usr/bin/env python3
"""sitemap-*.xml 의 모든 URL 이 실제 SSG 파일과 매칭되는지 검증.

build 후 즉시 실행 — 404 가 sitemap 에 포함되면 검색엔진이 색인 후 제거하므로 SEO 부정적.
"""
from __future__ import annotations
import re
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).parent.parent
BASE = 'https://kicegg.com/'

NS = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

def loc_to_path(loc: str) -> str:
    """https://kicegg.com/exam-1.html → exam-1.html"""
    if loc.startswith(BASE): return loc[len(BASE):]
    return loc.lstrip('/')

bad = []
checked = 0
for sm in ['sitemap-static.xml', 'sitemap-sets.xml', 'sitemap-exams.xml']:
    p = ROOT / sm
    if not p.exists(): continue
    tree = ET.fromstring(p.read_text(encoding='utf-8'))
    for url in tree.findall('sm:url', NS):
        loc = url.find('sm:loc', NS).text
        path = loc_to_path(loc)
        if not path or path == '':   # 루트
            continue
        # 절대 경로 (e.g. archive.html / exam-N.html / exam-set-...html)
        local = ROOT / path
        checked += 1
        if not local.exists():
            bad.append((sm, loc))

print(f'▣ sitemap URL 검증: {checked}건 검사')
print(f'  404 후보: {len(bad)}건')
for sm, loc in bad[:20]:
    print(f'  ✘ [{sm}] {loc}')
if len(bad) > 20:
    print(f'  ... and {len(bad) - 20} more')

import sys
sys.exit(1 if bad else 0)
