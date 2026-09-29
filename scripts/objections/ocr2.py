"""OCR 재판독 — 답변 본문용 (400dpi, kor 전용, psm 4). ocr2/ 에 쓰고 parse.py 가 우선 사용."""
import os, subprocess, sys, fitz, concurrent.futures as cf
O = os.path.dirname(os.path.abspath(__file__))
jobs = [(p, i) for p in sys.argv[1:] for i in range(fitz.open(O + '/' + p).page_count)]
def run(job):
    path, i = job
    out = f"{O}/ocr2/{os.path.basename(path)}.{i:03d}"
    if os.path.exists(out + '.txt'): return
    fitz.open(O + '/' + path)[i].get_pixmap(dpi=400).save(out + '.png')
    subprocess.run(['tesseract', out + '.png', out, '-l', 'kor', '--psm', '4'], capture_output=True)
    os.remove(out + '.png')
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(run, jobs))
print('pages', len(jobs))
