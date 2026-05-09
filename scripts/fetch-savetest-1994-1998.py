#!/usr/bin/env python3
"""savetest.com (tistory)에서 1994~1998 수능 PDF 자동 다운.
페이지: 1248=1994, 1247=1995, 1246=1996, 1245=1997, 1244=1998.
첨부 패턴: <a href="https://t1.daumcdn.net/cfile/tistory/{ID}">원본명.확장자</a>
"""
import re, urllib.request, time, html
from pathlib import Path

OUT = Path('tmp/savetest-1994-1998')
OUT.mkdir(parents=True, exist_ok=True)

# tistory 페이지 ID → 학년도
PAGES = {
    1248: 1995,  # "1994년 시행" = 1995학년도
    1247: 1996,  # 1995년 시행 = 1996학년도
    1246: 1997,
    1245: 1998,
    1244: 1999,  # 1998년 시행 = 1999학년도 (혹시 우리 KICE보다 더 좋은 자료일 수도)
}

ATTACH_RE = re.compile(
    r'<a href="(https://t1\.daumcdn\.net/cfile/tistory/[0-9A-F]+)">'
    r'<img[^>]*/>([^<]+)</a>',
    re.DOTALL,
)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://savetest.com/'})
    return urllib.request.urlopen(req, timeout=30).read()

stats = {'ok': 0, 'skip': 0, 'fail': 0}
for pid, year in PAGES.items():
    print(f'\n▣ 페이지 /{pid} → {year}학년도')
    try:
        page = fetch(f'https://savetest.com/{pid}').decode('utf-8', errors='replace')
    except Exception as e:
        print(f'  ✗ 페이지 fetch 실패: {e}'); continue

    # 첨부 추출
    attachs = []
    for m in ATTACH_RE.finditer(page):
        url, fname = m.group(1), html.unescape(m.group(2)).strip()
        # &amp;amp; 같은 이중 escape 정리
        fname = fname.replace('&amp;', '&')
        attachs.append((url, fname))

    print(f'  첨부 {len(attachs)}개')

    year_dir = OUT / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)
    for url, fname in attachs:
        # PDF만 우선 (HWP·ZIP은 나중에)
        if not (fname.endswith('.pdf') or fname.endswith('.zip')):
            stats['skip'] += 1; continue
        local = year_dir / fname
        if local.exists() and local.stat().st_size > 1000:
            stats['skip'] += 1; continue
        try:
            data = fetch(url)
            local.write_bytes(data)
            stats['ok'] += 1
            print(f'  ✓ {fname} ({len(data)/1024:.0f} KB)')
        except Exception as e:
            print(f'  ✗ {fname}: {e}')
            stats['fail'] += 1
        time.sleep(0.3)

print(f'\n총 ok {stats["ok"]} / skip {stats["skip"]} / fail {stats["fail"]}')
print(f'경로: {OUT}')
