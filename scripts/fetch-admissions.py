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


def fetch_multi_step(slug: str, main_url: str):
    """메인 → '정시·모집요강·자료' 메뉴 follow → 게시판 → 게시글 → 첨부파일 다운.

    v2 변경:
    - 첨부파일은 .pdf 확장자 외에도 download/FileDown/cmm/fms 등 다운로드 링크 모두 시도
    - 응답 PDF magic byte로 검증 (확장자 무관)
    - 게시판 row 매칭에서 year 표기 변형 허용 ('2026', '26학년도')
    """
    YEAR_FORMS = lambda y: [str(y), f"{y-2000}학년도", f"{y}학년도"]

    def try_download(ctx, url, referer, slug, year, label_hint=''):
        try:
            resp = ctx.request.get(url, headers={"Referer": referer}, timeout=60_000)
            if resp.status == 200 and is_real_pdf(resp.body()):
                save_pdf(slug, year, resp.body())
                print(f'  {slug} {year}: {len(resp.body()):,} bytes ✓ ({label_hint})')
                return True
        except Exception:
            pass
        return False

    def collect_download_links(page):
        """현재 페이지에서 다운로드 후보 링크 추출 (확장자 + URL 패턴 둘 다)."""
        return page.eval_on_selector_all("a", """
            els => els.map(a => ({
                text:(a.textContent||'').trim(),
                href:a.href,
                ctx:((a.closest('tr,li,div,article,section')||a).textContent||'').trim().slice(0,300)
            }))
            .filter(x => x.href && (
                /\\.(pdf|hwp|hwpx|zip)(\\?|$)/i.test(x.href) ||
                /(download|filedown|fileDownload|cmm\\/fms|attachfile|attach_file|atchfile|fileview|board.*file)/i.test(x.href)
            ))
        """)

    def _fetcher(ctx: BrowserContext, year: int) -> bool:
        page = ctx.new_page()
        year_forms = YEAR_FORMS(year)
        try:
            try:
                page.goto(main_url, wait_until="domcontentloaded", timeout=15_000)
                page.wait_for_timeout(2500)
            except Exception as e:
                print(f'  {slug} {year}: main goto fail — {str(e)[:60]}', file=sys.stderr)
                return False

            menu = page.eval_on_selector_all("a", """
                els => els.map(a => ({text:(a.textContent||'').trim(), href:a.href}))
                    .filter(x => x.text && x.href.includes('http')
                        && x.text.length < 30
                        && (x.text.includes('정시') || x.text.includes('모집요강')
                            || x.text.includes('자료실') || x.text.includes('전형')
                            || x.text.includes('공지') || x.text.includes('입시자료')))
                    .slice(0, 10)
            """)
            seen_urls = {page.url}

            for m in menu[:8]:
                if m['href'] in seen_urls: continue
                seen_urls.add(m['href'])
                try:
                    page.goto(m['href'], wait_until="domcontentloaded", timeout=15_000)
                    page.wait_for_timeout(1800)
                except Exception:
                    continue

                # 현재 페이지에서 다운로드 후보 직접 시도
                links = collect_download_links(page)
                for p_ in links:
                    label = (p_['text'] + ' ' + p_['ctx']).replace('\n', ' ')
                    if any(yf in label for yf in year_forms) and ('정시' in label or '모집요강' in label):
                        if any(k in label for k in ['편입', '재외국민', '재외', '수시', '수능최저', '학생부종합', '논술']):
                            continue
                        if try_download(ctx, p_['href'], page.url, slug, year, 'menu'):
                            return True

                # 게시판 row → 게시글 navigate
                rows = page.eval_on_selector_all("a", """
                    els => els.map(a => ({text:(a.textContent||'').trim(), href:a.href}))
                        .filter(x => x.href && x.text && x.text.length < 80
                            && (x.text.includes('정시') || x.text.includes('모집요강'))
                            && (year_match))
                        .slice(0, 6)
                """.replace('year_match', ' || '.join(f"x.text.includes('{yf}')" for yf in year_forms)))
                for r in rows[:4]:
                    if r['href'] in seen_urls: continue
                    seen_urls.add(r['href'])
                    if any(k in r['text'] for k in ['편입', '재외국민', '수시', '수능최저', '논술']):
                        continue
                    try:
                        page.goto(r['href'], wait_until="domcontentloaded", timeout=15_000)
                        page.wait_for_timeout(1500)
                    except Exception:
                        continue
                    # 게시글 안 모든 다운로드 후보 시도
                    post_links = collect_download_links(page)
                    for pp in post_links[:8]:
                        if try_download(ctx, pp['href'], page.url, slug, year, 'post'):
                            return True
        finally:
            page.close()
        return False
    return _fetcher


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
    'skku': fetch_multi_step('skku', 'https://admission.skku.edu/'),
    'hanyang': fetch_multi_step('hanyang', 'https://go.hanyang.ac.kr/'),
    'cau': fetch_multi_step('cau', 'https://admission.cau.ac.kr/'),
    'khu': fetch_multi_step('khu', 'https://iphak.khu.ac.kr/'),
    'hufs': fetch_multi_step('hufs', 'https://adms.hufs.ac.kr/'),
    'uos': fetch_multi_step('uos', 'https://www.uos.ac.kr/'),
    'konkuk': fetch_multi_step('konkuk', 'https://admission.konkuk.ac.kr/'),
    'dongguk': fetch_multi_step('dongguk', 'https://ipsi.dongguk.edu/'),
    'hongik': fetch_multi_step('hongik', 'https://www.hongik.ac.kr/'),
    'kookmin': fetch_multi_step('kookmin', 'https://ipsi.kookmin.ac.kr/'),
    'ssu': fetch_multi_step('ssu', 'https://admission.ssu.ac.kr/'),
    'sejong': fetch_multi_step('sejong', 'https://ipsi.sejong.ac.kr/'),
    'dankook': fetch_multi_step('dankook', 'https://ipsi.dankook.ac.kr/'),
    'kw': fetch_multi_step('kw', 'https://iphak.kw.ac.kr/'),
    'mju': fetch_multi_step('mju', 'https://ipsi.mju.ac.kr/'),
    'smu': fetch_multi_step('smu', 'https://admission.smu.ac.kr/'),
    'catholic': fetch_multi_step('catholic', 'https://ipsi.catholic.ac.kr/'),
    'ewha': fetch_multi_step('ewha', 'https://admission.ewha.ac.kr/'),
    'sookmyung': fetch_multi_step('sookmyung', 'https://www.sookmyung.ac.kr/sookmyungkr/2056/subview.do'),
    'dongduk': fetch_multi_step('dongduk', 'https://admission.dongduk.ac.kr/'),
    'swu': fetch_multi_step('swu', 'https://admission.swu.ac.kr/'),
    'seoultech': fetch_multi_step('seoultech', 'https://www.seoultech.ac.kr/admission/'),
    'hansung': fetch_multi_step('hansung', 'https://hansung.ac.kr/'),
    'skuniv': fetch_multi_step('skuniv', 'https://www.skuniv.ac.kr/'),
    'inha': fetch_multi_step('inha', 'https://admission.inha.ac.kr/'),
    'ajou': fetch_multi_step('ajou', 'https://www.ajou.ac.kr/'),
    'gachon': fetch_multi_step('gachon', 'https://www.gachon.ac.kr/admission/'),
    'hanyang_erica': fetch_multi_step('hanyang_erica', 'https://erica.hanyang.ac.kr/admission/'),
    'inu': fetch_multi_step('inu', 'https://www.inu.ac.kr/'),
    'kau': fetch_multi_step('kau', 'https://www.kau.ac.kr/'),
    'pusan': fetch_multi_step('pusan', 'https://go.pusan.ac.kr/'),
    'knu': fetch_multi_step('knu', 'https://ipsi.knu.ac.kr/'),
    'jnu': fetch_multi_step('jnu', 'https://admission.jnu.ac.kr/'),
    'cnu': fetch_multi_step('cnu', 'https://www.cnu.ac.kr/'),
    'chungbuk': fetch_multi_step('chungbuk', 'https://ipsi.chungbuk.ac.kr/'),
    'jbnu': fetch_multi_step('jbnu', 'https://enter.jbnu.ac.kr/'),
    'gnu': fetch_multi_step('gnu', 'https://ipsi.gnu.ac.kr/'),
    'kangwon': fetch_multi_step('kangwon', 'https://admission.kangwon.ac.kr/'),
    'jejunu': fetch_multi_step('jejunu', 'https://ibsi.jejunu.ac.kr/'),
    'unist': fetch_multi_step('unist', 'https://www.unist.ac.kr/'),
    'gist': fetch_multi_step('gist', 'https://www.gist.ac.kr/admission/'),
    'dgist': fetch_multi_step('dgist', 'https://www.dgist.ac.kr/admission/'),
    'ulsan': fetch_multi_step('ulsan', 'https://www.ulsan.ac.kr/'),
    'wku': fetch_multi_step('wku', 'https://ipsi.wku.ac.kr/'),
    'gwnu': fetch_multi_step('gwnu', 'https://admission.gwnu.ac.kr/'),
    'cha': fetch_multi_step('cha', 'https://www.cha.ac.kr/admission/'),
    'eulji': fetch_multi_step('eulji', 'https://www.eulji.ac.kr/admission/'),
    'yu': fetch_multi_step('yu', 'https://admission.yu.ac.kr/'),
    'chosun': fetch_multi_step('chosun', 'https://ipsi.chosun.ac.kr/'),
    'kmu': fetch_multi_step('kmu', 'https://www.kmu.ac.kr/admission/'),
    'kyonggi': fetch_multi_step('kyonggi', 'https://www.kyonggi.ac.kr/'),
    'sch': fetch_multi_step('sch', 'https://www.sch.ac.kr/'),
    'kosin': fetch_multi_step('kosin', 'https://www.kosin.ac.kr/ad/'),
    'donga': fetch_multi_step('donga', 'https://ipsi.donga.ac.kr/'),
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
                try:
                    if FETCHERS[slug](ctx, year):
                        ok.append(year)
                except Exception as e:
                    print(f'  {slug} {year}: fetcher crash — {str(e)[:80]}', file=sys.stderr)
            summary[slug] = ok
        browser.close()

    print('\n=== 요약 ===')
    for slug, years in summary.items():
        print(f'  {slug}: {len(years)}/{len(args.years)}년 — {years}')


if __name__ == '__main__':
    main()
