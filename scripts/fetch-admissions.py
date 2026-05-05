#!/usr/bin/env python3
"""대학별 정시 모집요강 PDF 자동 수집기.

각 대학 입학처에서 학년도별 정시 모집요강 PDF를 다운받아
data/admissions/pdfs/{slug}/{year}_guide.pdf 형식으로 저장.

학교마다 입학처 사이트 구조·URL 패턴 다름 → 학교별 fetch 함수로 분리.
새 학교 추가는 FETCHERS dict에 함수만 등록.

실행:
    python3 scripts/fetch-admissions.py             # 전체
    python3 scripts/fetch-admissions.py yonsei      # 단일 대학
    python3 scripts/fetch-admissions.py --years 2026 2027  # 학년도 한정
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, BrowserContext

ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / 'data' / 'admissions' / 'pdfs'
YEARS = list(range(2022, 2028))  # 2022~2027학년도

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")


def save_pdf(slug: str, year: int, body: bytes, kind: str = 'guide') -> Path:
    """slug/{year}_{kind}.pdf 로 저장."""
    out_dir = PDF_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'{year}_{kind}.pdf'
    out.write_bytes(body)
    return out


def is_real_pdf(body: bytes) -> bool:
    """PDF magic byte 확인 (HTML redirect 등 가짜 PDF 거부)."""
    return len(body) > 50_000 and body[:4] == b'%PDF'


# ── 학교별 fetcher ─────────────────────────────────────────
# 각 fetcher는 (ctx, year) → bool (성공 여부) 반환

def fetch_yonsei(ctx: BrowserContext, year: int) -> bool:
    """연세대 — www2.yonsei.ac.kr/entrance/plan/{year}_{kind}.pdf 패턴.
    kind: 'guide' (모집요강, 시행 직전 발표) | 'plan' (시행계획, 1-2년 전 발표)
    가장 최근 학년도는 plan만 있을 수 있음."""
    api = ctx.request
    referer = "https://admission.yonsei.ac.kr/"
    for kind in ['guide', 'plan']:
        url = f"https://www2.yonsei.ac.kr/entrance/plan/{year}_{kind}.pdf"
        try:
            resp = api.get(url, headers={"Referer": referer}, timeout=60_000)
            if resp.status == 200 and is_real_pdf(resp.body()):
                save_pdf('yonsei', year, resp.body(), kind)
                print(f'  yonsei {year} {kind}: {len(resp.body()):,} bytes ✓')
                return True
        except Exception as e:
            print(f'  yonsei {year} {kind}: {e}', file=sys.stderr)
    return False


def fetch_snu(ctx: BrowserContext, year: int) -> bool:
    """서울대 — webdata/admission/files/{year}jungsi.pdf 패턴."""
    api = ctx.request
    referer = "https://admission.snu.ac.kr/undergraduate/regular/guide"
    # 정시 모집요강 (jungsi) + 시행계획 (sihaeng) 모두 시도
    for kind, slug in [('guide', 'jungsi'), ('plan', 'sihaeng')]:
        url = f"https://admission.snu.ac.kr/webdata/admission/files/{year}{slug}.pdf"
        try:
            resp = api.get(url, headers={"Referer": referer}, timeout=60_000)
            if resp.status == 200 and is_real_pdf(resp.body()):
                save_pdf('snu', year, resp.body(), kind)
                print(f'  snu {year} {kind}: {len(resp.body()):,} bytes ✓')
                return True
        except Exception as e:
            print(f'  snu {year} {kind}: {e}', file=sys.stderr)
    return False


def fetch_korea(ctx: BrowserContext, year: int) -> bool:
    """고려대 — oku.korea.ac.kr 모집요강 게시판."""
    page = ctx.new_page()
    try:
        page.goto("https://oku.korea.ac.kr/oku/admission/under/regular_intro.do",
                  wait_until="networkidle", timeout=30_000)
        page.wait_for_timeout(1500)
        pdfs = page.eval_on_selector_all("a", """
            els => els.map(a => ({text: (a.textContent||'').trim(), href: a.href}))
                .filter(x => x.href && (x.href.toLowerCase().includes('.pdf') || x.href.includes('download')))
        """)
        for p_ in pdfs:
            label = p_['text'] + ' ' + p_['href']
            if str(year) in label and ('정시' in label or '모집' in label):
                resp = ctx.request.get(p_['href'], headers={"Referer": page.url}, timeout=60_000)
                if resp.status == 200 and is_real_pdf(resp.body()):
                    save_pdf('korea', year, resp.body())
                    print(f'  korea {year}: {len(resp.body()):,} bytes ✓')
                    return True
    except Exception as e:
        print(f'  korea {year}: {e}', file=sys.stderr)
    finally:
        page.close()
    return False


# ── 학교별 fetcher 등록 ────────────────────────────────────
FETCHERS = {
    'yonsei': fetch_yonsei,
    'snu':    fetch_snu,
    'korea':  fetch_korea,
    # 추가: 'sogang': fetch_sogang, ...
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('univs', nargs='*', default=list(FETCHERS.keys()),
                    help='대학 슬러그 (기본: 전체 등록된 학교)')
    ap.add_argument('--years', nargs='+', type=int, default=YEARS,
                    help='학년도 범위 (기본 2022~2027)')
    args = ap.parse_args()

    targets = [u for u in args.univs if u in FETCHERS]
    skipped = [u for u in args.univs if u not in FETCHERS]
    if skipped:
        print(f'[warn] 등록 안 됨 (fetcher 미작성): {skipped}', file=sys.stderr)

    print(f'대상 대학: {targets}')
    print(f'학년도: {args.years}')
    print()

    summary: dict = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, locale="ko-KR")
        for slug in targets:
            print(f'=== {slug} ===')
            ok = []
            for year in args.years:
                # 이미 받았으면 skip
                existing = list((PDF_ROOT / slug).glob(f'{year}_*.pdf')) if (PDF_ROOT / slug).exists() else []
                if existing:
                    print(f'  {slug} {year}: skip (이미 받음)')
                    ok.append(year)
                    continue
                if FETCHERS[slug](ctx, year):
                    ok.append(year)
            summary[slug] = ok
        browser.close()

    print('\n=== 요약 ===')
    for slug, years in summary.items():
        print(f'  {slug}: {len(years)}/{len(args.years)}년 — {years}')


if __name__ == '__main__':
    main()
