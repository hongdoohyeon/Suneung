#!/usr/bin/env python3
"""1757 unknown PDF (텍스트 추출 실패) 의 페이지 헤더를 OCR 로 '홀수'/'짝수' 검출.

전략: 각 PDF의 (1, half+1) 페이지의 상단 영역만 PNG 렌더 → tesseract kor → 표기 검출.
시간 한계로 페이지 짝수 + 사이즈 큰 (8p 이상) PDF 만 검사.

산출: data/ocr-even-detected.json — 합본으로 의심되는 (id, pages, 홀짝 패턴)
"""
import json, urllib.request, subprocess, tempfile, os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

UA = {'User-Agent':'Mozilla/5.0'}
e = json.load(open('data/exams-v2.json'))
candidates = [i for i in e if i.get('typeGroup')=='suneung' and i.get('questionUrl')]

# 이전 검사 결과 — unknown sample 추리기 (페이지 짝수 + 8p+)
def fast_pages(it):
    try:
        req = urllib.request.Request(it['questionUrl'], headers=UA)
        data = urllib.request.urlopen(req, timeout=20).read()
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf: tf.write(data); path=tf.name
        info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
        pages = next((int(l.split(':')[1].strip()) for l in info.splitlines() if l.startswith('Pages:')), 0)
        # 텍스트 추출
        text = subprocess.run(['pdftotext', path, '-'], capture_output=True, text=True).stdout
        return it['id'], pages, len(text.strip()), path
    except Exception as ex:
        return it['id'], 0, 0, None


print('1단계 — 페이지 수 + 텍스트 추출 가능성 (병렬)')
fast_results = {}
with ThreadPoolExecutor(max_workers=12) as ex:
    futs = {ex.submit(fast_pages, it): it for it in candidates}
    done = 0
    for fut in as_completed(futs):
        id_, pages, tlen, path = fut.result()
        fast_results[id_] = (pages, tlen, path)
        done += 1
        if done % 300 == 0: print(f'  {done}')

# unknown 후보: 페이지 짝수 + ≥8p + 텍스트 < 100자 (이미지 PDF)
img_targets = []
for id_, (pages, tlen, path) in fast_results.items():
    if pages >= 8 and pages % 2 == 0 and tlen < 100 and path:
        img_targets.append((id_, pages, path))
print(f'\n▣ OCR 대상 (이미지 PDF, ≥8p, 짝수): {len(img_targets)}건')


def ocr_page(pdf_path: str, page: int) -> str:
    """PDF 한 페이지 상단을 PNG 렌더 후 OCR."""
    with tempfile.NamedTemporaryFile(suffix='', delete=False) as tf: prefix = tf.name
    try:
        subprocess.run(['pdftoppm', '-r', '150', '-f', str(page), '-l', str(page),
                       '-png', pdf_path, prefix], capture_output=True)
        png_paths = [f'{prefix}-{page}.png', f'{prefix}-{page:02d}.png']
        png = next((p for p in png_paths if os.path.exists(p)), None)
        if not png: return ''
        # 상단 (헤더) 만 crop (sips 사용 — macOS 기본)
        result = subprocess.run(['tesseract', png, '-', '-l', 'kor+eng', '--psm', '6'],
                               capture_output=True, text=True, timeout=15)
        try: os.unlink(png)
        except: pass
        return result.stdout
    except Exception:
        return ''


# OCR 검사
print('2단계 — OCR 검사 (sample 50건)')
found_split = []
img_targets = img_targets[:50]   # 첫 50건만
for id_, pages, path in img_targets:
    half = pages // 2
    t1 = ocr_page(path, 1)
    tH = ocr_page(path, half+1)
    has_odd_p1 = '홀수' in t1
    has_even_pH = '짝수' in tH
    item = next(i for i in candidates if i['id'] == id_)
    mark = ' ⭐' if has_odd_p1 and has_even_pH else ''
    print(f'  id={id_} {item["gradeYear"]} {item["type"]} {item["subject"]} {pages}p — p1=[{repr(t1[:50])}] p{half+1}=[{repr(tH[:50])}]{mark}')
    if has_odd_p1 and has_even_pH:
        found_split.append((id_, pages))
    try: os.unlink(path)
    except: pass

# 나머지 PDF 정리
for id_, (_, _, path) in fast_results.items():
    if path and os.path.exists(path):
        try: os.unlink(path)
        except: pass

print(f'\n▣ 합본 발견 (OCR): {len(found_split)}건')
Path('data/ocr-even-detected.json').write_text(json.dumps([{'id': i, 'pages': p} for i, p in found_split], ensure_ascii=False, indent=2), encoding='utf-8')
