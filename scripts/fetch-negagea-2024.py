#!/usr/bin/env python3
"""negagea CDN univ_info2024/ 폴더 batch — 24학년도 정시 PDF.
처음 시도(univ_info2025) 외에 univ_info2024 폴더에 24학년도 PDF 다수 게재.
"""
import json, os, sys, urllib.request, urllib.parse, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'admissions'
OUT  = DATA / 'negagea-pdfs'
OUT.mkdir(parents=True, exist_ok=True)

ratios = json.loads((DATA / 'manual-ratios.json').read_text(encoding='utf-8'))
schools = [(s, ratios[s]['name']) for s in ratios if not s.startswith('_')]

def clean_name(name):
    return name.split('(')[0].strip()

REGIONS = ['seoul', 'gyeonggi', 'busan', 'daegu', 'daejeon', 'gwangju',
           'incheon', 'ulsan', 'gangwon', 'chungbuk', 'chungnam',
           'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju']

PATTERNS = [
    '{name}_2024학년도_정시입시결과.pdf',
    '{name}_2024_정시입시결과.pdf',
    '{name}_2024학년도_정시_입시결과.pdf',
]

BASE = 'https://cdn013.negagea.net/dgsmidc/omr/{region}/web/univ_info2024/{name}/{file}'

def head(url):
    req = urllib.request.Request(url, method='HEAD',
        headers={'User-Agent':'Mozilla/5.0'})
    try:
        r = urllib.request.urlopen(req, timeout=4)
        return r.status, int(r.headers.get('Content-Length', 0))
    except: return None, 0

def download(url, dst):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read()
        if not data.startswith(b'%PDF'): return False
        dst.write_bytes(data)
        return True
    except: return False

def try_school(slug, name_orig):
    name = clean_name(name_orig)
    name_enc = urllib.parse.quote(name)
    dst = OUT / f'{slug}-2024.pdf'
    if dst.exists() and dst.stat().st_size > 1000:
        return ('cached', None)
    for region in REGIONS:
        for pat in PATTERNS:
            file_name = pat.format(name=name)
            file_enc  = urllib.parse.quote(file_name)
            url = BASE.format(region=region, name=name_enc, file=file_enc)
            status, size = head(url)
            if status == 200 and size > 1000:
                if download(url, dst): return ('ok', url)
    return ('miss', None)

ok = 0
for slug, name in schools:
    s, _ = try_school(slug, name)
    if s in ('ok', 'cached'):
        icon = '✓' if s == 'ok' else '●'
        print(f'  {icon} {slug:<18} {name}')
        ok += 1
    sys.stdout.flush()
print(f'\n총 {ok}/{len(schools)} PDF 확보 (univ_info2024/)')
