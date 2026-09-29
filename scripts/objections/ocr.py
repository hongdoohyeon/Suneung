import json, os, re, subprocess, fitz, concurrent.futures as cf
O = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(O + '/kice_posts.json'))
os.makedirs(O + '/ocr', exist_ok=True)
def needs(f):
    if not f['path'].endswith('.pdf'): return False
    t = open(O + '/' + f['txt']).read()
    flat = re.sub(r'\s+', '', t)
    if len(flat) < 300: return True
    if '이의신청' in flat and not re.search(r'모두\d[\d,]*건', flat) and ('보도' in f['name'] or '발표' in f['name']): return True
    if '답변' in f['name'] and '이상' in flat and not re.search(r'\d{1,2}(정답|문제)(\(|이의)', flat): return True
    return False
jobs = []
for r in P.values():
    for f in r['files']:
        if needs(f):
            d = fitz.open(O + '/' + f['path'])
            for i in range(d.page_count):
                jobs.append((f['path'], i))
print('pages', len(jobs), flush=True)
def run(job):
    path, i = job
    out = f"{O}/ocr/{os.path.basename(path)}.{i:03d}.txt"
    if os.path.exists(out): return
    d = fitz.open(O + '/' + path)
    png = out[:-4] + '.png'
    d[i].get_pixmap(dpi=220).save(png)
    subprocess.run(['tesseract', png, out[:-4], '-l', 'kor+eng', '--psm', '6'], capture_output=True)
    os.remove(png)
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(run, jobs))
print('done')
