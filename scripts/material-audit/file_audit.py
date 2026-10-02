# 전수 파일 점검: exams.json 의 모든 자료 URL(릴리즈는 GitHub 원본 직접)을 받아 PDF 유효성·쪽수·글자·1쪽 텍스트를 tmp/audit2/results.jsonl 에 기록. 워커 일일 한도 때문에 워커로는 호출하지 않는다.
# 실행: python3 scripts/material-audit/file_audit.py  (약 1시간, 이어받기 가능)
import json,os,sys,hashlib,urllib.request,urllib.error,threading,tempfile,fitz
from concurrent.futures import ThreadPoolExecutor
fitz.TOOLS.mupdf_display_errors(False)
L=json.load(open('data/exams.json'));L=L if isinstance(L,list) else L['exams']
KEYS=('questionUrl','answerUrl','solutionUrl','listenUrl','scriptUrl')
urls={}
for e in L:
    for k in KEYS:
        u=e.get(k)
        if u: urls.setdefault(u.split('?')[0],[]).append((e['id'],k))
out='tmp/audit2/results.jsonl'
done=set()
if os.path.exists(out):
    for l in open(out): done.add(json.loads(l)['url'])
todo=[u for u in urls if u not in done and 'wdown.ebsi' not in u]
print(len(urls),len(todo),flush=True)
lock=threading.Lock(); fh=open(out,'a'); cnt=[0]
def run(u):
    r={'url':u}
    try:
        gu=u.replace('https://suneung-files.hdh061224.workers.dev/','https://github.com/hongdoohyeon/Suneung/releases/download/')
        req=urllib.request.Request(gu,headers={'User-Agent':'Mozilla/5.0'})
        resp=urllib.request.urlopen(req,timeout=90)
        b=resp.read(); r['status']=resp.status; r['ct']=resp.headers.get('content-type'); r['size']=len(b)
        if u.lower().endswith('.pdf') or 'pdf' in (r['ct'] or ''):
            if not b.startswith(b'%PDF'): r['err']='not-pdf-magic'
            else:
                try:
                    d=fitz.open(stream=b,filetype='pdf'); r['pages']=d.page_count
                    if d.page_count:
                        p=d[0]; t=p.get_text(); r['t1']=t[:400]; r['n1']=len(t.strip()); r['img1']=len(p.get_images())
                        tot=0
                        for i in range(min(d.page_count,6)): tot+=len(d[i].get_text().strip())
                        r['ntot']=tot
                        bad=set()
                        for i in range(min(d.page_count,3)):
                            for f in d.get_page_fonts(i):
                                if f[2]=='Type0' and f[1]=='n/a': bad.add(f[5])
                        r['fonts']=sorted(bad)
                        r['w']=p.rect.width;r['h']=p.rect.height
                except Exception as ex: r['err']='open:'+str(ex)[:60]
    except urllib.error.HTTPError as ex: r['status']=ex.code
    except Exception as ex: r['err']=str(ex)[:80]
    with lock:
        fh.write(json.dumps(r,ensure_ascii=False)+'\n'); fh.flush(); cnt[0]+=1
        if cnt[0]%500==0: print(cnt[0],flush=True)
with ThreadPoolExecutor(6) as ex: list(ex.map(run,todo))
print('ALLDONE',flush=True)
