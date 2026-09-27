"""남은 오류 후보를 파일 전체 텍스트로 재확인 — 1쪽만 보고 생긴 오탐(여러 과목 통합본 등)을 걸러 낸다.
python3 scripts/material-audit/verify_full.py → tmp/material-fix/confirmed.json (진짜 오류만)"""
import json, re, hashlib, urllib.request, concurrent.futures as cf
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
DL = ROOT / 'tmp/material-fix/full'; DL.mkdir(parents=True, exist_ok=True)
report = json.loads((ROOT / 'tmp/material-audit/report.json').read_text())
exams = {e['id']: e for e in json.loads((ROOT / 'data/exams.json').read_text())}
fixed = {(p['id'], p['field']) for f in (ROOT / 'tmp/material-fix').glob('plan_*.json') for p in json.loads(f.read_text())}

def text_of(url):
    h = hashlib.sha1(url.split('?')[0].encode()).hexdigest()[:12]
    t = DL / f'{h}.txt'
    if t.exists(): return t.read_text()
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=180).read()
    d = fitz.open(stream=data, filetype='pdf')
    s = f'<<pages {d.page_count}>>\n' + '\n'.join(p.get_text() for p in d)
    t.write_text(s); return s

def n(s): return re.sub(r'[\s·･ㆍ()（）\[\]<>]', '', s or '').replace('Ⅰ', '1').replace('Ⅱ', '2').replace('I', '1')
SYN = [['정치와법', '법과정치', '법과사회'], ['생명과학1', '생물1'], ['생명과학2', '생물2'], ['물리학1', '물리1'], ['물리학2', '물리2'], ['사회문화', '사회·문화']]
def has_name(body, name):
    k = n(name); g = next((g for g in SYN if k in [n(x) for x in g]), [k])
    return any(n(x) in body for x in g)

todo = [i for i in report['issues'] if i['code'] not in ('label', 'broken')
        and any((x, i['field']) not in fixed for x in i['ids'])]
def check(i):
    e = exams[i['ids'][0]]
    try: full = text_of(i['url'])
    except Exception as err: return i, None, f'받기 실패 {err}'
    body = n(full)
    pages = int(re.search(r'<<pages (\d+)>>', full).group(1))
    c = i['code']
    if c == 'subsub' and has_name(body, e['subSubject']): return i, False, '통합본 — 등록 과목 포함'
    if c == 'subject' and (n(e['subject']) + '영역' in body or (e['subSubject'] and has_name(body, e['subSubject']))): return i, False, '등록 영역 포함'
    if c == 'grade' and re.search(rf"고\s*{e.get('studentGrade')}\b|{e.get('studentGrade')}\s*학년", full[:3000]): return i, False, '등록 학년 표기 있음'
    if c == 'org' and e['typeGroup'] == 'education' and re.search('전국\s*연합|교육청', full): return i, False, '교육청 표기 있음'
    if c == 'kind' and i['field'].startswith('question') and pages >= 3 and re.search(r'\[\s*[234]\s*점\s*\]', full): return i, False, '문항 포함(문제지+정답 합본)'
    if c == 'kind' and i['field'] == 'solutionUrl' and re.search('해설|풀이', full): return i, False, '해설 포함'
    if c == 'kind' and i['field'] == 'answerUrl' and re.search('정\s*답', full): return i, False, '정답 포함'
    return i, True, f'{pages}쪽 전체에서도 등록 정보 없음'

out = []
with cf.ThreadPoolExecutor(8) as ex:
    for i, real, why in ex.map(check, todo):
        out.append({**i, 'real': real, 'why': why})
(ROOT / 'tmp/material-fix/confirmed.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
from collections import Counter
print('확인', len(out), Counter((o['code'], o['real']) for o in out))
