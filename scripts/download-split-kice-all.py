#!/usr/bin/env python3
"""KICE 카탈로그 모든 csat·mock·csat_old·preview 게시물의 fileSeq 다운 →
   각 PDF 페이지별 헤더('홀수형'/'짝수형') 검출 → 홀수/짝수 PDF 분리.

100% 신뢰도 — pdftotext 로 페이지 헤더 텍스트 검출 후 페이지 묶음.

산출:
  tmp/kice-split-final/{gy}_{type}_{subject}_{q|a}_{odd|even}.pdf
  data/kice-split-overrides.json — match + url 매핑
"""
from __future__ import annotations
import json, urllib.request, subprocess, tempfile, os, re, hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from pypdf import PdfReader, PdfWriter

UA = {'User-Agent':'Mozilla/5.0'}
DL = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'
OUT_DL = Path('tmp/kice-split-dl')
OUT_DL.mkdir(parents=True, exist_ok=True)
OUT_FINAL = Path('tmp/kice-split-final')
OUT_FINAL.mkdir(parents=True, exist_ok=True)
OV_PATH = Path('data/kice-split-overrides.json')

cat = json.load(open('data/kice-catalog.json'))
ROUND_MAP = {'6월':'june','9월':'sept','수능':'csat','예비':'prelim','예시':'prelim'}

# 처리 대상: 모든 게시물의 문제지·정답표 PDF (ZIP 제외 — 별도 처리)
targets = []
for board, posts in cat['boards'].items():
    for p in posts:
        gy = p.get('gradeYear','')
        if not gy.isdigit(): continue
        t = ROUND_MAP.get(p.get('round'))
        if not t: continue
        subj = (p.get('subject') or '').replace('/', '')
        for f in p.get('files', []):
            fn = f.get('fileName','')
            if not fn.lower().endswith('.pdf'): continue
            if '문제' in fn: kind = 'q'
            elif '정답' in fn: kind = 'a'
            elif '해설' in fn: kind = 'sol'
            elif '듣기' in fn or '대본' in fn: kind = 'script'
            else: kind = 'other'
            targets.append({
                'fileSeq': f['fileSeq'], 'fileName': fn,
                'gy': int(gy), 't': t, 'board': board, 'subject': subj,
                'kind': kind,
                'localPath': OUT_DL / f"{gy}_{t}_{board}_{subj}_{kind}_{f['fileSeq'][:8]}.pdf"
            })

print(f'▣ 대상 PDF: {len(targets)}')


def fetch(tg):
    p = tg['localPath']
    if p.exists() and p.stat().st_size > 0:
        return tg, 'skip'
    try:
        req = urllib.request.Request(DL.format(tg['fileSeq']), headers=UA)
        data = urllib.request.urlopen(req, timeout=90).read()
        p.write_bytes(data)
        return tg, 'ok'
    except Exception as e:
        return tg, f'err:{e}'


# 다운
ok=skip=err=0
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(fetch, t): t for t in targets}
    done = 0
    for fut in as_completed(futs):
        tg, st = fut.result()
        done += 1
        if st == 'ok': ok += 1
        elif st == 'skip': skip += 1
        else: err += 1
        if done % 100 == 0: print(f'  다운 {done}/{len(targets)} (ok {ok}, skip {skip}, err {err})')
print(f'\n다운 완료: ok={ok} skip={skip} err={err}')


# 페이지별 헤더 검출 + 분리
def split_pdf(tg):
    p = tg['localPath']
    if not p.exists(): return None
    try:
        info = subprocess.run(['pdfinfo', str(p)], capture_output=True, text=True).stdout
        pages = next((int(l.split(':')[1].strip()) for l in info.splitlines() if l.startswith('Pages:')), 0)
        if pages < 2: return None
        # 페이지별 헤더 검출
        page_marks = []
        for pg in range(1, pages+1):
            t = subprocess.run(['pdftotext', '-layout', '-f', str(pg), '-l', str(pg), str(p), '-'],
                              capture_output=True, text=True).stdout
            o = '홀수' in t
            e = '짝수' in t
            page_marks.append('o' if (o and not e) else ('e' if (e and not o) else '·'))
        # 페이지 묶기: 첫 홀수 시작~마지막 홀수 = odd, 첫 짝수 시작~마지막 짝수 = even
        odd_pages = [i for i, m in enumerate(page_marks) if m == 'o']
        even_pages = [i for i, m in enumerate(page_marks) if m == 'e']
        if not odd_pages and not even_pages:
            return None   # 표기 없는 PDF
        return {
            'tg': tg, 'pages': pages, 'marks': ''.join(page_marks),
            'odd_pages': odd_pages, 'even_pages': even_pages,
        }
    except Exception as e:
        return None


print('\n▣ 페이지 헤더 검출')
splits = []
with ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(split_pdf, t): t for t in targets}
    done = 0
    for fut in as_completed(futs):
        r = fut.result()
        done += 1
        if done % 100 == 0: print(f'  검사 {done}/{len(targets)}')
        if r and (r['odd_pages'] and r['even_pages']):
            # 진짜 홀짝 합본만 — 둘 다 있어야
            splits.append(r)
print(f'\n진짜 홀짝 합본 PDF: {len(splits)}')


# 분리 → 별도 PDF
HANGUL_RE = re.compile(r'[가-힣]')
def asciify(s):
    if not s: return ''
    if not HANGUL_RE.search(s): return re.sub(r'[^A-Za-z0-9_\-]','',s)
    return 'k' + hashlib.md5(s.encode('utf-8')).hexdigest()[:8]

REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v7/'
overrides = []
for r in splits:
    tg = r['tg']
    try:
        reader = PdfReader(str(tg['localPath']))
        # odd
        wo = PdfWriter()
        for i in r['odd_pages']: wo.add_page(reader.pages[i])
        odd_name = f"{tg['gy']}_{tg['t']}_{asciify(tg['subject'])}_{tg['kind']}_odd_{tg['fileSeq'][:8]}.pdf"
        with open(OUT_FINAL / odd_name, 'wb') as fo: wo.write(fo)
        # even
        we = PdfWriter()
        for i in r['even_pages']: we.add_page(reader.pages[i])
        even_name = f"{tg['gy']}_{tg['t']}_{asciify(tg['subject'])}_{tg['kind']}_even_{tg['fileSeq'][:8]}.pdf"
        with open(OUT_FINAL / even_name, 'wb') as fo: we.write(fo)
        # 매핑 entry
        subject_norm = tg['subject']
        # board=mock → type 별도 (mock 게시물의 round 가 type)
        ov_kind_q = 'questionUrl' if tg['kind']=='q' else ('answerUrl' if tg['kind']=='a' else 'solutionUrl')
        ov_kind_d = ov_kind_q.replace('Url','Download')
        ov_kind_qe = ov_kind_q + 'Even'
        ov_kind_de = ov_kind_d + 'Even'
        overrides.append({
            'match': {'gradeYear': tg['gy'], 'type': tg['t'], 'subject': subject_norm},
            'kind': tg['kind'],
            ov_kind_q: REL_BASE + odd_name,
            ov_kind_d: f"{tg['gy']}학년도_{tg['t']}_{subject_norm}_{tg['kind']}_(홀수형).pdf",
            ov_kind_qe: REL_BASE + even_name,
            ov_kind_de: f"{tg['gy']}학년도_{tg['t']}_{subject_norm}_{tg['kind']}_(짝수형).pdf",
            '_pages': r['pages'],
            '_marks': r['marks'],
        })
    except Exception as e:
        print(f'  ✘ {tg["fileSeq"][:8]}: {e}')

OV_PATH.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n✓ 분리: {len(overrides)}건 → {OUT_FINAL}')
print(f'  매핑 저장: {OV_PATH}')

# 학년도×영역 분포
from collections import Counter
by_gy = Counter((o['match']['gradeYear'], o['match']['subject'], o['kind']) for o in overrides)
print(f'\n학년도×영역×kind:')
for k, v in sorted(by_gy.items()):
    print(f'  {k}: {v}')
