#!/usr/bin/env python3
"""negagea CDN 2022~2026 5개 학년도 일괄 수집.

연도별 univ_info{year}/ 폴더 + 86개 학교 + 17개 지역 후보 + 6개 파일명 패턴.
이미 받은 PDF 는 스킵.
"""
import json, os, sys, urllib.request, urllib.parse, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'admissions'
OUT  = DATA / 'negagea-pdfs'
OUT.mkdir(parents=True, exist_ok=True)

ratios = json.loads((DATA / 'manual-ratios.json').read_text(encoding='utf-8'))
schools = [(s, ratios[s]['name']) for s in ratios if not s.startswith('_')]

def clean_name(name):
    return name.split('(')[0].strip()

REGIONS = ['seoul', 'gyeonggi', 'busan', 'daegu', 'daejeon', 'gwangju',
           'incheon', 'ulsan', 'sejong', 'gangwon', 'chungbuk', 'chungnam',
           'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju']

YEARS = ['2022', '2023', '2024', '2025', '2026']

NAME_PATTERNS = [
    '{name}_{year}학년도_정시입시결과.pdf',
    '{name}_{year}_정시입시결과.pdf',
    '{name}_{year}학년도_정시_입시결과.pdf',
    '{name}_{year}학년도_정시모집_입시결과.pdf',
    '{year}학년도_{name}_정시입시결과.pdf',
    '{name}_{year}학년도_정시입학결과.pdf',
]

BASE = 'https://cdn013.negagea.net/dgsmidc/omr/{region}/web/univ_info{year}/{name}/{file}'

def head(url):
    req = urllib.request.Request(url, method='HEAD',
        headers={'User-Agent':'Mozilla/5.0'})
    try:
        r = urllib.request.urlopen(req, timeout=4)
        return r.status, int(r.headers.get('Content-Length', 0))
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception:
        return None, 0

def download(url, dst):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    if not data.startswith(b'%PDF'): return False
    dst.write_bytes(data)
    return True

def try_one(slug, name_orig, year):
    name = clean_name(name_orig)
    name_enc = urllib.parse.quote(name)
    dst = OUT / f'{slug}-{year}.pdf'
    if dst.exists() and dst.stat().st_size > 1000:
        return ('cached', str(dst))
    for region in REGIONS:
        for pat in NAME_PATTERNS:
            file_name = pat.format(name=name, year=year)
            file_enc  = urllib.parse.quote(file_name)
            url = BASE.format(region=region, year=year, name=name_enc, file=file_enc)
            status, size = head(url)
            if status == 200 and size > 1000:
                try:
                    if download(url, dst): return ('ok', url)
                except Exception:
                    continue
    return ('miss', None)

def task(args):
    slug, name, year = args
    s, info = try_one(slug, name, year)
    return (slug, year, s, info)

# ── 실행 ──
jobs = [(slug, name, year) for slug, name in schools for year in YEARS]
print(f'총 {len(jobs)} 작업 — 학교 {len(schools)} × 연도 {len(YEARS)}\n')

results = {}
with ThreadPoolExecutor(max_workers=12) as pool:
    futures = {pool.submit(task, j): j for j in jobs}
    done_count = 0
    for fut in as_completed(futures):
        slug, year, status, info = fut.result()
        results.setdefault(year, {})[slug] = (status, info)
        done_count += 1
        if status in ('ok', 'cached'):
            icon = '✓' if status == 'ok' else '●'
            print(f'  [{done_count}/{len(jobs)}] {icon} {year} {slug}')
            sys.stdout.flush()

# 요약
print('\n--- 연도별 확보 ---')
for year in YEARS:
    yr = results.get(year, {})
    ok = sum(1 for s, _ in yr.values() if s in ('ok', 'cached'))
    print(f'  {year}: {ok}/{len(schools)} 개교')

(DATA / 'negagea-multi-status.json').write_text(
    json.dumps({y: {k: v[0] for k, v in d.items()} for y, d in results.items()},
               ensure_ascii=False, indent=2), encoding='utf-8')
