#!/usr/bin/env python3
"""51개 학교 메인 페이지 probe — 정시 모집요강 PDF 위치·패턴 분석."""
from playwright.sync_api import sync_playwright

UNIVS = [
    ("korea", "https://oku.korea.ac.kr/"),
    ("skku", "https://admission.skku.edu/"),
    ("hanyang", "https://go.hanyang.ac.kr/"),
    ("cau", "https://admission.cau.ac.kr/"),
    ("khu", "https://iphak.khu.ac.kr/"),
    ("hufs", "https://admission.hufs.ac.kr/"),
    ("uos", "https://enter.uos.ac.kr/"),
    ("konkuk", "https://admission.konkuk.ac.kr/"),
    ("dongguk", "https://ipsi.dongguk.edu/"),
    ("hongik", "https://ibsi.hongik.ac.kr/"),
    ("kookmin", "https://ipsi.kookmin.ac.kr/"),
    ("ssu", "https://admission.ssu.ac.kr/"),
    ("sejong", "https://ipsi.sejong.ac.kr/"),
    ("dankook", "https://ipsi.dankook.ac.kr/"),
    ("kw", "https://iphak.kw.ac.kr/"),
    ("mju", "https://ipsi.mju.ac.kr/"),
    ("smu", "https://admission.smu.ac.kr/"),
    ("catholic", "https://ipsi.catholic.ac.kr/"),
    ("ewha", "https://admission.ewha.ac.kr/"),
    ("sookmyung", "https://www.sookmyung.ac.kr/sookmyungkr/2056/subview.do"),
    ("dongduk", "https://admission.dongduk.ac.kr/"),
    ("swu", "https://admission.swu.ac.kr/"),
    ("seoultech", "https://www.seoultech.ac.kr/admission/"),
    ("hansung", "https://hsipsi.hansung.ac.kr/"),
    ("skuniv", "https://ipsi.skuniv.ac.kr/"),
    ("inha", "https://admission.inha.ac.kr/"),
    ("ajou", "https://iphak.ajou.ac.kr/"),
    ("gachon", "https://www.gachon.ac.kr/admission/"),
    ("hanyang_erica", "https://erica.hanyang.ac.kr/admission/"),
    ("inu", "https://enter.inu.ac.kr/"),
    ("kau", "https://iphak.kau.ac.kr/"),
    ("pusan", "https://go.pusan.ac.kr/"),
    ("knu", "https://ipsi.knu.ac.kr/"),
    ("jnu", "https://admission.jnu.ac.kr/"),
    ("cnu", "https://admission.cnu.ac.kr/"),
    ("chungbuk", "https://ipsi.chungbuk.ac.kr/"),
    ("jbnu", "https://enter.jbnu.ac.kr/"),
    ("gnu", "https://ipsi.gnu.ac.kr/"),
    ("kangwon", "https://admission.kangwon.ac.kr/"),
    ("jejunu", "https://ibsi.jejunu.ac.kr/"),
    ("unist", "https://admission.unist.ac.kr/"),
    ("gist", "https://www.gist.ac.kr/admission/"),
    ("dgist", "https://www.dgist.ac.kr/admission/"),
    ("ulsan", "https://admission.ulsan.ac.kr/"),
    ("wku", "https://ipsi.wku.ac.kr/"),
    ("yu", "https://admission.yu.ac.kr/"),
    ("chosun", "https://ipsi.chosun.ac.kr/"),
    ("kmu", "https://www.kmu.ac.kr/admission/"),
    ("kyonggi", "https://ipsi.kyonggi.ac.kr/"),
    ("sch", "https://entry.sch.ac.kr/"),
    ("donga", "https://ipsi.donga.ac.kr/"),
]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale="ko-KR")
        for slug, url in UNIVS:
            page = ctx.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=12_000)
                page.wait_for_timeout(1200)
                pdfs = page.eval_on_selector_all("a", """
                    els => els.map(a => ({text:(a.textContent||'').trim(), href:a.href}))
                        .filter(x => x.href && x.text)
                """)
                jeongsi_pdfs = [p_ for p_ in pdfs
                                if '.pdf' in p_['href'].lower()
                                and ('정시' in p_['text'] or '모집요강' in p_['text'])]
                all_pdfs = [p_ for p_ in pdfs if '.pdf' in p_['href'].lower()][:3]
                jeongsi_links = [p_ for p_ in pdfs
                                 if '.pdf' not in p_['href'].lower()
                                 and ('정시' in p_['text'] or '모집요강' in p_['text'])][:3]
                print(f"\n=== {slug} ({url}) ===")
                print(f"  total PDF: {len([p_ for p_ in pdfs if '.pdf' in p_['href'].lower()])}, "
                      f"정시 PDF: {len(jeongsi_pdfs)}")
                for p_ in jeongsi_pdfs[:3]:
                    print(f"  PDF★ {p_['text'][:30]:<32} → {p_['href'][:120]}")
                for p_ in all_pdfs[:2]:
                    print(f"  PDF  {p_['text'][:30]:<32} → {p_['href'][:120]}")
                for l in jeongsi_links[:2]:
                    print(f"  link {l['text'][:30]:<32} → {l['href'][:120]}")
            except Exception as e:
                print(f"\n=== {slug}: FAIL — {str(e)[:60]} ===")
            page.close()
        browser.close()


if __name__ == '__main__':
    main()
