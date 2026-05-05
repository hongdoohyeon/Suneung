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


def fetch_generic(slug: str, urls: list[str]):
    """일반 fetcher — 메인 + 정시 페이지에서 '{year} 정시 모집요강' 키워드 매칭 PDF 다운.
    학교 입학처 사이트 구조가 정형이면 작동, 동적 SPA면 별도 fetcher 필요."""
    def _fetcher(ctx: BrowserContext, year: int) -> bool:
        page = ctx.new_page()
        found = []
        try:
            for url in urls:
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                    page.wait_for_timeout(2000)
                except Exception:
                    continue
                # 페이지의 모든 PDF 링크 + 그 텍스트 컨텍스트
                pdfs = page.eval_on_selector_all("a", """
                    els => els.map(a => ({
                        text: (a.textContent||'').trim(),
                        href: a.href,
                        // 부모 element의 텍스트도 포함 (PDF 라벨이 인근 요소에 있을 때 대비)
                        ctx: ((a.closest('tr,li,div,article')||a).textContent||'').trim().slice(0,200)
                    }))
                    .filter(x => x.href && x.href.toLowerCase().includes('.pdf'))
                """)
                for p_ in pdfs:
                    label = (p_['text'] + ' ' + p_['ctx']).replace('\\n', ' ')
                    # 연도 매칭 + 정시 키워드
                    if str(year) in label and ('정시' in label or '모집요강' in label):
                        # 단 '편입' '재외국민' '수시' 키워드 있으면 제외
                        if any(k in label for k in ['편입', '재외국민', '재외', '수시', '수능최저']):
                            continue
                        found.append((p_['href'], label[:60]))
            # 다운 시도
            for url, label in found[:3]:
                try:
                    resp = ctx.request.get(url, headers={"Referer": page.url}, timeout=60_000)
                    if resp.status == 200 and is_real_pdf(resp.body()):
                        save_pdf(slug, year, resp.body())
                        print(f'  {slug} {year}: {len(resp.body()):,} bytes ✓ ({label[:30]})')
                        return True
                except Exception as e:
                    pass
        finally:
            page.close()
        return False
    return _fetcher


# ── 학교별 fetcher 등록 ────────────────────────────────────
FETCHERS = {
    'yonsei': fetch_yonsei,
    'snu':    fetch_snu,
    'korea':  fetch_korea,
    'sogang': fetch_generic('sogang', [
        'https://admission.sogang.ac.kr/',
        'https://admission.sogang.ac.kr/enter/html/regular/guide.asp',
    ]),
    'skku': fetch_generic('skku', [
        'https://admission.skku.edu/',
        'https://admission.skku.edu/admission/html/regular/guide.html',
    ]),
    'hanyang': fetch_generic('hanyang', [
        'https://go.hanyang.ac.kr/',
        'https://go.hanyang.ac.kr/seoul/admissions/regular/regular_intro.do',
    ]),
    'cau': fetch_generic('cau', [
        'https://admission.cau.ac.kr/',
    ]),
    'khu': fetch_generic('khu', [
        'https://iphak.khu.ac.kr/',
    ]),
    'hufs': fetch_generic('hufs', [
        'https://admission.hufs.ac.kr/',
    ]),
    'uos': fetch_generic('uos', [
        'https://enter.uos.ac.kr/',
    ]),
    'konkuk': fetch_generic('konkuk', [
        'https://admission.konkuk.ac.kr/',
    ]),
    'dongguk': fetch_generic('dongguk', [
        'https://ipsi.dongguk.edu/',
    ]),
    'hongik': fetch_generic('hongik', [
        'https://ibsi.hongik.ac.kr/',
    ]),
    'kookmin': fetch_generic('kookmin', [
        'https://ipsi.kookmin.ac.kr/',
    ]),
    'ssu': fetch_generic('ssu', [
        'https://admission.ssu.ac.kr/',
    ]),
    'sejong': fetch_generic('sejong', [
        'https://ipsi.sejong.ac.kr/',
    ]),
    'dankook': fetch_generic('dankook', [
        'https://ipsi.dankook.ac.kr/',
    ]),
    'kw': fetch_generic('kw', [
        'https://iphak.kw.ac.kr/',
    ]),
    'mju': fetch_generic('mju', [
        'https://ipsi.mju.ac.kr/',
    ]),
    'smu': fetch_generic('smu', [
        'https://admission.smu.ac.kr/',
    ]),
    'catholic': fetch_generic('catholic', [
        'https://ipsi.catholic.ac.kr/',
    ]),
    'ewha': fetch_generic('ewha', [
        'https://admission.ewha.ac.kr/',
    ]),
    'sookmyung': fetch_generic('sookmyung', [
        'https://www.sookmyung.ac.kr/sookmyungkr/2056/subview.do',
    ]),
    'dongduk': fetch_generic('dongduk', [
        'https://admission.dongduk.ac.kr/',
    ]),
    'swu': fetch_generic('swu', [
        'https://admission.swu.ac.kr/',
    ]),
    'seoultech': fetch_generic('seoultech', [
        'https://www.seoultech.ac.kr/admission/',
    ]),
    'hansung': fetch_generic('hansung', [
        'https://hsipsi.hansung.ac.kr/',
    ]),
    'skuniv': fetch_generic('skuniv', [
        'https://ipsi.skuniv.ac.kr/',
    ]),
    'inha': fetch_generic('inha', [
        'https://admission.inha.ac.kr/',
    ]),
    'ajou': fetch_generic('ajou', [
        'https://iphak.ajou.ac.kr/',
    ]),
    'gachon': fetch_generic('gachon', [
        'https://www.gachon.ac.kr/admission/',
    ]),
    'hanyang_erica': fetch_generic('hanyang_erica', [
        'https://erica.hanyang.ac.kr/admission/',
    ]),
    'inu': fetch_generic('inu', [
        'https://enter.inu.ac.kr/',
    ]),
    'kau': fetch_generic('kau', [
        'https://iphak.kau.ac.kr/',
    ]),
    'pusan': fetch_generic('pusan', [
        'https://go.pusan.ac.kr/',
    ]),
    'knu': fetch_generic('knu', [
        'https://ipsi.knu.ac.kr/',
    ]),
    'jnu': fetch_generic('jnu', [
        'https://admission.jnu.ac.kr/',
    ]),
    'cnu': fetch_generic('cnu', [
        'https://admission.cnu.ac.kr/',
    ]),
    'chungbuk': fetch_generic('chungbuk', [
        'https://ipsi.chungbuk.ac.kr/',
    ]),
    'jbnu': fetch_generic('jbnu', [
        'https://enter.jbnu.ac.kr/',
    ]),
    'gnu': fetch_generic('gnu', [
        'https://ipsi.gnu.ac.kr/',
    ]),
    'kangwon': fetch_generic('kangwon', [
        'https://admission.kangwon.ac.kr/',
    ]),
    'jejunu': fetch_generic('jejunu', [
        'https://ibsi.jejunu.ac.kr/',
    ]),
    'unist': fetch_generic('unist', [
        'https://admission.unist.ac.kr/',
    ]),
    'gist': fetch_generic('gist', [
        'https://www.gist.ac.kr/admission/',
    ]),
    'dgist': fetch_generic('dgist', [
        'https://www.dgist.ac.kr/admission/',
    ]),
    'ulsan': fetch_generic('ulsan', [
        'https://admission.ulsan.ac.kr/',
    ]),
    'wku': fetch_generic('wku', [
        'https://ipsi.wku.ac.kr/',
    ]),
    'gwnu': fetch_generic('gwnu', [
        'https://admission.gwnu.ac.kr/',
    ]),
    'cha': fetch_generic('cha', [
        'https://www.cha.ac.kr/admission/',
    ]),
    'eulji': fetch_generic('eulji', [
        'https://www.eulji.ac.kr/admission/',
    ]),
    'yu': fetch_generic('yu', [
        'https://admission.yu.ac.kr/',
    ]),
    'chosun': fetch_generic('chosun', [
        'https://ipsi.chosun.ac.kr/',
    ]),
    'kmu': fetch_generic('kmu', [
        'https://www.kmu.ac.kr/admission/',
    ]),
    'kyonggi': fetch_generic('kyonggi', [
        'https://ipsi.kyonggi.ac.kr/',
    ]),
    'sch': fetch_generic('sch', [
        'https://entry.sch.ac.kr/',
    ]),
    'kosin': fetch_generic('kosin', [
        'https://www.kosin.ac.kr/ad/',
    ]),
    'donga': fetch_generic('donga', [
        'https://ipsi.donga.ac.kr/',
    ]),
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
