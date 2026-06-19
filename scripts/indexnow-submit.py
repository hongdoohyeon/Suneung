# -*- coding: utf-8 -*-
"""IndexNow 제출 — 네이버(+빙)에 URL 변경을 능동 push.

네이버는 2023-07부터 IndexNow 지원. 정적사이트가 색인을 능동적으로 당기는
거의 유일한 자동 경로. 키파일 {key}.txt 가 사이트 루트에 라이브여야 검증 통과.

사용:
  python3 scripts/indexnow-submit.py          # 직전 커밋 대비 변경된 HTML만
  python3 scripts/indexnow-submit.py --all     # 전체 사이트맵 URL 백필(초기 1회)
"""
import json, os, re, sys, subprocess, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = 'kicegg.com'
ENDPOINT = 'https://searchadvisor.naver.com/indexnow'
KEY = open(os.path.join(ROOT, '.indexnow-key'), encoding='utf-8').read().strip()

PAGE_RE = re.compile(
    r'^(exam-\d+|exam-set-[a-z0-9_\-]+|nonsul-[a-z\-]+|suneung-[a-z]+|'
    r'hakpyeong-[a-z]+|index|archive|sets|gradecut|about|calendar|admissions)\.html$')


def all_urls():
    urls = []
    for sm in ('sitemap-static.xml', 'sitemap-sets.xml', 'sitemap-exams.xml'):
        p = os.path.join(ROOT, sm)
        if os.path.exists(p):
            urls += re.findall(r'<loc>([^<]+)</loc>', open(p, encoding='utf-8').read())
    return list(dict.fromkeys(urls))


def changed_urls():
    r = subprocess.run(['git', '-C', ROOT, 'diff', '--name-only', 'HEAD~1', 'HEAD'],
                       capture_output=True, text=True)
    out = []
    for f in r.stdout.split('\n'):
        if PAGE_RE.match(f.strip()):
            out.append(f'https://{HOST}/{f.strip()}')
    return list(dict.fromkeys(out))


def submit(urls):
    BATCH = 5000
    for i in range(0, len(urls), BATCH):
        chunk = urls[i:i + BATCH]
        body = json.dumps({
            'host': HOST, 'key': KEY,
            'keyLocation': f'https://{HOST}/{KEY}.txt',
            'urlList': chunk,
        }, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            ENDPOINT, data=body,
            headers={'Content-Type': 'application/json; charset=utf-8'})
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            print(f'  batch {i // BATCH}: HTTP {resp.status} ({len(chunk)} URLs)')
        except urllib.error.HTTPError as e:
            print(f'  batch {i // BATCH}: HTTP {e.code} — {e.read().decode()[:300]}')
        except Exception as e:
            print(f'  batch {i // BATCH}: ERROR {e}')


if __name__ == '__main__':
    full = '--all' in sys.argv
    urls = all_urls() if full else changed_urls()
    print(f'IndexNow 제출: {len(urls)} URLs ({"전체 백필" if full else "변경분"})')
    if urls:
        submit(urls)
    else:
        print('  (제출할 URL 없음)')
