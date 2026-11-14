#!/usr/bin/env python3
"""문제지·정답표 PDF 쪽수 검증 (재발 방지).

배경: 2026-11 확통 짝수형이 3쪽 빠진 19쪽 합본으로 올라가 있던 제보 → 전수검사.
  · 합본(선택과목 3개가 한 파일), 쪽 누락, 뒤에 붙은 OMR 답안지/'확인사항'만 있는 쪽이
    모두 '홀수 쪽'이나 '홀·짝수형 쪽수 불일치'로 드러났다.

규칙 (data/pdf-pages.json = {쿼리 뺀 URL: {pages, sha}} 매니페스트 기준, 오프라인 검사):
  1. exams.json 의 questionUrl / questionUrlEven / answerUrl / answerUrlEven 은 전부 매니페스트에 있어야 한다.
     (없으면 실패 → `--update` 로 쪽수를 재서 채운 뒤 커밋. 즉 PDF 주소를 바꾸면 쪽수 확인이 강제된다.)
  2. 문제지 쪽수는 짝수여야 한다. 원본이 원래 홀수인 파일은 data/pdf-pages-allow.json 에
     {쿼리 뺀 URL: "사유"} 로 올려야 통과한다 (사유 없이 예외 금지).
  3. 같은 시험의 홀수형·짝수형 문제지/정답표 쪽수는 같아야 한다.

사용:
  python3 scripts/validate-pdf-pages.py            # 검사 (CI)
  python3 scripts/validate-pdf-pages.py --update   # 매니페스트에 없는 URL 만 내려받아 쪽수 기록 (온라인)
"""
from __future__ import annotations
import hashlib, json, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'data' / 'pdf-pages.json'
ALLOW = ROOT / 'data' / 'pdf-pages-allow.json'
REVIEW = ROOT / 'data' / 'pdf-pages-review.json'  # 원본 대조 대기 목록(경고만, 새 항목 추가 금지)
KEYS_Q = ('questionUrl', 'questionUrlEven')
KEYS_A = ('answerUrl', 'answerUrlEven')


def norm(u: str) -> str:
    # 우리 파일 서버는 ?name= 이 표시용 이름일 뿐이라 뗀다. 외부 주소는 쿼리가 파일을 가르므로 그대로 둔다.
    if 'suneung-files.hdh061224.workers.dev' in u or 'kicegg.com/files/' in u:
        return u.split('?')[0]
    return u


def collect(exams):
    urls = {}
    for e in exams:
        for k in KEYS_Q + KEYS_A:
            u = e.get(k)
            if isinstance(u, str) and u.startswith('http') and '.pdf' in norm(u).lower():
                urls.setdefault(norm(u), u)
    return urls


def probe(u: str):
    with tempfile.TemporaryDirectory() as d:
        f = d + '/a.pdf'
        for _ in range(3):
            c = subprocess.run(['curl', '-sL', '--max-time', '120', '-o', f, '-w', '%{http_code}', u],
                               capture_output=True, text=True)
            if c.stdout.strip() == '200':
                break
        else:
            return None
        out = subprocess.run(['pdfinfo', f], capture_output=True, text=True).stdout
        pg = [int(l.split()[1]) for l in out.splitlines() if l.startswith('Pages:')]
        if not pg:
            return None
        return {'pages': pg[0], 'sha': hashlib.sha1(open(f, 'rb').read()).hexdigest()[:16]}


def main():
    exams = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    allow = json.loads(ALLOW.read_text(encoding='utf-8')) if ALLOW.exists() else {}
    review = json.loads(REVIEW.read_text(encoding='utf-8')) if REVIEW.exists() else {}
    urls = collect(exams)

    if '--update' in sys.argv:
        todo = [(n, u) for n, u in urls.items() if n not in manifest]
        print(f'매니페스트에 없는 URL {len(todo)}개 측정')
        with ThreadPoolExecutor(6) as t:
            for (n, _), r in zip(todo, t.map(lambda x: probe(x[1]), todo)):
                if r is None:
                    print('  ✗ 내려받기 실패:', n)
                else:
                    manifest[n] = r
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=0) + '\n', encoding='utf-8')

    errs = []
    missing = [n for n in urls if n not in manifest]
    if missing:
        errs.append(f'매니페스트에 없는 PDF {len(missing)}개 — `python3 scripts/validate-pdf-pages.py --update` 후 커밋: ' + ', '.join(missing[:3]))
    qset = {norm(e[k]) for e in exams for k in KEYS_Q if e.get(k)}
    for n in sorted(qset):
        m = manifest.get(n)
        if m and m['pages'] % 2 and n not in allow and n not in review:
            errs.append(f'홀수 쪽 문제지({m["pages"]}쪽): {n}')
    for e in exams:
        for a, b in (('questionUrl', 'questionUrlEven'), ('answerUrl', 'answerUrlEven')):
            if e.get(a) and e.get(b):
                ma, mb = manifest.get(norm(e[a])), manifest.get(norm(e[b]))
                if ma and mb and ma['pages'] != mb['pages'] and norm(e[b]) not in allow and norm(e[a]) not in allow and norm(e[b]) not in review and norm(e[a]) not in review:
                    errs.append(f'홀·짝수형 쪽수 불일치 id={e["id"]} {a}={ma["pages"]} / {b}={mb["pages"]}')
    stale = [n for n in allow if n not in urls]
    if errs:
        print(f'✗ PDF 쪽수 검증 실패 {len(errs)}건')
        for x in errs[:40]:
            print('  -', x)
        sys.exit(1)
    print(f'✅ PDF 쪽수 검증 통과 (PDF {len(urls)}개, 예외 {len(allow)}개' + (f', 안 쓰는 예외 {len(stale)}개' if stale else '') + f', 원본 대조 대기 {len(review)}개' + ')')


if __name__ == '__main__':
    main()
