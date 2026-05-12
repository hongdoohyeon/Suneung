#!/usr/bin/env python3
"""모든 questionUrl 가진 문제지 PDF 를 probe → 홀수 전반 + 짝수 후반 합본 PDF 자동 분리.

탐지 룰:
  - 총 페이지 N 이 짝수
  - 1 ~ N/2 페이지에 '홀수' 표기 (또는 어디에도 표기 없는 경우 보존)
  - N/2+1 ~ N 페이지에 '짝수' 표기

이 경우:
  - tmp/even-questions/{id}_q_odd.pdf  — 1 ~ N/2 (기존 questionUrl 대체 후보)
  - tmp/even-questions/{id}_q_even.pdf — N/2+1 ~ N
"""
from __future__ import annotations
import json, urllib.request, subprocess, tempfile, os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from pypdf import PdfReader, PdfWriter

UA = {'User-Agent':'Mozilla/5.0'}
OUT = Path('tmp/even-questions')
OUT.mkdir(parents=True, exist_ok=True)

ITEMS = json.load(open('data/exams-v2.json'))
candidates = [i for i in ITEMS if i.get('typeGroup')=='suneung' and i.get('questionUrl')]
print(f'▣ 대상 candidates: {len(candidates)}')


def probe_and_split(it):
    url = it['questionUrl']
    out_odd  = OUT / f"{it['id']}_q_odd.pdf"
    out_even = OUT / f"{it['id']}_q_even.pdf"
    if out_odd.exists() and out_even.exists():
        return it['id'], 'cached', None
    try:
        req = urllib.request.Request(url, headers=UA)
        data = urllib.request.urlopen(req, timeout=45).read()
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
            tf.write(data); path = tf.name

        info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
        try:
            pages = next(int(l.split(':')[1].strip()) for l in info.splitlines() if l.startswith('Pages:'))
        except StopIteration:
            os.unlink(path); return it['id'], 'no_pages', None

        if pages < 4 or pages % 2 != 0:
            os.unlink(path); return it['id'], f'pages={pages}', None

        half = pages // 2
        # 전반·후반 텍스트 표기 확인
        front_text = subprocess.run(['pdftotext', '-layout', '-f', '1', '-l', str(half), path, '-'],
                                    capture_output=True, text=True).stdout
        back_text  = subprocess.run(['pdftotext', '-layout', '-f', str(half+1), '-l', str(pages), path, '-'],
                                    capture_output=True, text=True).stdout
        if not ('홀수' in front_text and '짝수' in back_text):
            os.unlink(path); return it['id'], 'no_pattern', None
        if '짝수' in front_text or '홀수' in back_text:
            # 양쪽 섞임 — 안전하게 skip
            os.unlink(path); return it['id'], 'mixed', None

        reader = PdfReader(path)
        # odd
        w = PdfWriter()
        for p in range(half):
            w.add_page(reader.pages[p])
        with open(out_odd, 'wb') as f: w.write(f)
        # even
        w = PdfWriter()
        for p in range(half, pages):
            w.add_page(reader.pages[p])
        with open(out_even, 'wb') as f: w.write(f)
        os.unlink(path)
        return it['id'], 'split', (str(out_odd), str(out_even), pages)
    except Exception as ex:
        return it['id'], f'err:{type(ex).__name__}', None


results = {'split':0, 'short':0, 'no_pattern':0, 'mixed':0, 'cached':0, 'err':0, 'other':0}
splits = []  # (id, even_path)
with ThreadPoolExecutor(max_workers=8) as ex:
    futs = {ex.submit(probe_and_split, it): it for it in candidates}
    done = 0
    for fut in as_completed(futs):
        id_, status, payload = fut.result()
        done += 1
        if status == 'split':
            results['split'] += 1
            splits.append((id_, payload[1]))
        elif status == 'cached':
            results['cached'] += 1
            splits.append((id_, str(OUT / f'{id_}_q_even.pdf')))
        elif status.startswith('err'):    results['err'] += 1
        elif status == 'no_pattern':      results['no_pattern'] += 1
        elif status == 'mixed':           results['mixed'] += 1
        elif status.startswith('pages='):
            try:
                if int(status[6:]) < 4: results['short'] += 1
                else: results['other'] += 1
            except: results['other'] += 1
        else: results['other'] += 1
        if done % 100 == 0:
            print(f'  진행 {done}/{len(candidates)} — {results}')

print(f'\n▣ 결과: {results}')
print(f'  분리 완료: {len(splits)}건 → {OUT}')

# overrides 추가
OV_PATH = Path('data/even-form-overrides.json')
existing = json.loads(OV_PATH.read_text(encoding='utf-8')) if OV_PATH.exists() else []
REL_BASE = 'https://suneung-files.hdh061224.workers.dev/kice-archive-v3/'
id_to_item = {i['id']: i for i in ITEMS}

# 동일 id 의 questionUrlEven 가 이미 있는지 — 분리 결과로 갱신
existing_q_keys = set()  # match 기준 (gy,type,subject,subSubject) — 단 이 함수는 'q' 항목만
for ov in existing:
    if 'questionUrlEven' in ov:
        m = ov.get('match', {})
        existing_q_keys.add((m.get('gradeYear'), m.get('type'), m.get('subject'), m.get('subSubject')))

new_count = 0
for id_, _ in splits:
    it = id_to_item.get(id_)
    if not it: continue
    key = (it.get('gradeYear'), it.get('type'), it.get('subject'), it.get('subSubject'))
    new_name = f"{it['gradeYear']}_{it['type']}_id{id_}_q_even.pdf"
    if key in existing_q_keys:
        # 이미 있던 카탈로그 짝수보다 자동 분리본을 우선 — 갱신
        for ov in existing:
            m = ov.get('match', {})
            if (m.get('gradeYear'), m.get('type'), m.get('subject'), m.get('subSubject')) == key and 'questionUrlEven' in ov:
                ov['questionUrlEven'] = REL_BASE + new_name
                ov['questionDownloadEven'] = f"{it.get('gradeYear')}학년도_{it.get('type')}_{it.get('subject')}_{it.get('subSubject') or ''}_문제지(짝수형).pdf".replace('__','_')
                ov['_split_local'] = str(OUT / f'{id_}_q_even.pdf')
                ov['_target_name'] = new_name
        continue
    existing.append({
        'match': {
            'gradeYear': it.get('gradeYear'), 'type': it.get('type'),
            'subject': it.get('subject'), 'subSubject': it.get('subSubject'),
        },
        'questionUrlEven': REL_BASE + new_name,
        'questionDownloadEven': f"{it.get('gradeYear')}학년도_{it.get('type')}_{it.get('subject')}_{it.get('subSubject') or ''}_문제지(짝수형).pdf".replace('__','_'),
        '_split_local': str(OUT / f'{id_}_q_even.pdf'),
        '_target_name': new_name,
    })
    new_count += 1
    existing_q_keys.add(key)

OV_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'  + {new_count} questionUrlEven overrides 신규 추가 (총 {len(existing)} entries)')
