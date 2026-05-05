#!/usr/bin/env python3
"""DNS 실패한 학교들의 정확한 입학처 URL 찾기 — 후보 URL 일괄 시도."""
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

CANDIDATES = {
    "hufs": [
        "https://adms.hufs.ac.kr/", "https://www.hufs.ac.kr/",
        "https://oadms.hufs.ac.kr/",
    ],
    "uos": [
        "https://enter.uos.ac.kr/", "https://www.uos.ac.kr/", "https://www.uos.ac.kr/admission/",
    ],
    "hongik": [
        "https://ibsi.hongik.ac.kr/", "https://www.hongik.ac.kr/",
    ],
    "hansung": [
        "https://ipsi.hansung.ac.kr/", "https://hansung.ac.kr/", "https://www.hansung.ac.kr/",
    ],
    "skuniv": [
        "https://www.skuniv.ac.kr/", "https://ipsi.skuniv.ac.kr/",
    ],
    "ajou": [
        "https://www.ajou.ac.kr/", "https://admission.ajou.ac.kr/",
    ],
    "inu": [
        "https://www.inu.ac.kr/", "https://admission.inu.ac.kr/",
    ],
    "kau": [
        "https://www.kau.ac.kr/", "https://admission.kau.ac.kr/",
    ],
    "cnu": [
        "https://www.cnu.ac.kr/", "https://admission.cnu.ac.kr/",
    ],
    "unist": [
        "https://www.unist.ac.kr/", "https://admissions.unist.ac.kr/",
    ],
    "ulsan": [
        "https://www.ulsan.ac.kr/", "https://admission.ulsan.ac.kr/",
    ],
    "chosun": [
        "https://www.chosun.ac.kr/", "https://admission.chosun.ac.kr/",
    ],
    "kyonggi": [
        "https://www.kyonggi.ac.kr/", "https://ipsi.kyonggi.ac.kr/",
    ],
    "sch": [
        "https://www.sch.ac.kr/", "https://entry.sch.ac.kr/",
    ],
}

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def check(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status, resp.url
    except urllib.error.HTTPError as e:
        return e.code, url
    except Exception as e:
        return None, str(e)[:50]


def probe_slug(slug):
    candidates = CANDIDATES[slug]
    for url in candidates:
        status, final = check(url)
        if status and 200 <= status < 400:
            return slug, url, status, final
    return slug, candidates[0], None, "all failed"


def main():
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(probe_slug, CANDIDATES.keys()))
    for slug, url, status, final in results:
        if status:
            print(f"  ✓ {slug:<10} {url}  → {status}")
        else:
            print(f"  ✗ {slug:<10} all failed")


if __name__ == '__main__':
    main()
