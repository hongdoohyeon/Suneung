#!/usr/bin/env python3
"""negagea CDN 패턴으로 86개 대학의 정시 입시결과 PDF 일괄 수집.

URL 패턴 (확인된 광운대 케이스):
  https://cdn013.negagea.net/dgsmidc/omr/{region}/web/univ_info{year}/{name}/{name}_{year}학년도_정시입시결과.pdf

지역 폴더 후보: seoul, gyeonggi, busan, daegu, daejeon, gwangju, incheon, ulsan, sejong,
              gangwon, chungbuk, chungnam, jeonbuk, jeonnam, gyeongbuk, gyeongnam, jeju
파일명 패턴 후보 다중 시도.
"""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'admissions'
OUT  = ROOT / 'data' / 'admissions' / 'negagea-pdfs'
OUT.mkdir(parents=True, exist_ok=True)

ratios = json.loads((DATA / 'manual-ratios.json').read_text(encoding='utf-8'))
schools = [(s, ratios[s]['name']) for s in ratios if not s.startswith('_')]

# 학교명 정리: '연세대학교 (서울)' → '연세대학교'
# 단 캠퍼스 구분 필요한 케이스(미래·세종)는 보존
def clean_name(name):
    # 괄호 안의 캠퍼스 표시 제거 (서울/안성/세종 등은 폴더에 따라 다름)
    base = name.split('(')[0].strip()
    return base

REGIONS = ['seoul', 'gyeonggi', 'busan', 'daegu', 'daejeon', 'gwangju',
           'incheon', 'ulsan', 'sejong', 'gangwon', 'chungbuk', 'chungnam',
           'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju']

YEAR = '2025'

NAME_PATTERNS = [
    '{name}_{year}학년도_정시입시결과.pdf',
    '{name}_{year}_정시입시결과.pdf',
    '{name}_{year}학년도_정시_입시결과.pdf',
    '{name}_{year}학년도_정시모집_입시결과.pdf',
    '{name}_{year}학년도_정시 입시결과.pdf',
    '{year}학년도_{name}_정시입시결과.pdf',
]

BASE = 'https://cdn013.negagea.net/dgsmidc/omr/{region}/web/univ_info{year}/{name}/{file}'

def head_or_get(url):
    """HEAD 시도 (빠름), 실패 시 짧은 GET 일부."""
    req = urllib.request.Request(url, method='HEAD',
        headers={'User-Agent':'Mozilla/5.0'})
    try:
        r = urllib.request.urlopen(req, timeout=4)
        return r.status, int(r.headers.get('Content-Length', 0)), r.headers.get('Content-Type','')
    except urllib.error.HTTPError as e:
        return e.code, 0, ''
    except Exception:
        return None, 0, ''

def download(url, dst):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = r.read()
    if not data.startswith(b'%PDF'):
        return False
    dst.write_bytes(data)
    return True

def try_school(slug, name_orig):
    name = clean_name(name_orig)
    name_enc = urllib.parse.quote(name)
    dst = OUT / f'{slug}.pdf'
    if dst.exists() and dst.stat().st_size > 1000:
        return ('cached', str(dst))

    candidates = []
    for region in REGIONS:
        for pat in NAME_PATTERNS:
            file_name = pat.format(name=name, year=YEAR)
            file_enc  = urllib.parse.quote(file_name)
            url = BASE.format(region=region, year=YEAR, name=name_enc, file=file_enc)
            candidates.append(url)

    for url in candidates:
        status, size, ctype = head_or_get(url)
        if status == 200 and size > 1000:
            try:
                ok = download(url, dst)
                if ok: return ('ok', url)
            except Exception as e:
                continue
    return ('miss', None)

# ── 실행 ──
results = {}
for slug, name in schools:
    status, info = try_school(slug, name)
    results[slug] = (status, info, name)
    icon = '✓' if status == 'ok' else ('●' if status == 'cached' else '✗')
    print(f'{icon} {slug:<14} {name[:30]:<30} {status}')
    sys.stdout.flush()

ok = sum(1 for s, _, _ in results.values() if s in ('ok', 'cached'))
print(f'\n총 {ok}/{len(schools)}개 학교 PDF 확보')
(DATA / 'negagea-status.json').write_text(
    json.dumps({k: {'status': v[0], 'url': v[1], 'name': v[2]} for k, v in results.items()},
               ensure_ascii=False, indent=2), encoding='utf-8')
