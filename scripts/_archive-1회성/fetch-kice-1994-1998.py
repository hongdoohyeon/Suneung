#!/usr/bin/env python3
"""KICE csat_old(1500235) 1994~1998 학년도 자료 다운 + 메타 보존.
학년도/회차(1차/2차)/영역/문제vs정답을 영문 키로 변환해 저장."""
import re, urllib.request, time, json, hashlib
from pathlib import Path

OUT  = Path('tmp/kice-zips')
META = Path('data/kice-1994-1998-meta.json')
OUT.mkdir(parents=True, exist_ok=True)

BASE = 'https://www.suneung.re.kr/boardCnts/list.do?boardID=1500235&m=0403&s=suneung'
DL   = 'https://www.suneung.re.kr/boardCnts/fileDown.do?fileSeq={}'
UA = 'Mozilla/5.0'

TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
FILE_RE = re.compile(r"fn_fileDown\('([0-9a-f]+)'\)[^>]*title='([^']+)'")
TAG_RE = re.compile(r"<[^>]+>")

# 영역 한글 → 영문
SUBJECT_KEY = {
    '언어':'korean','수리':'math','외국어':'english','한국사':'khistory',
    '사회탐구':'social','과학탐구':'science','직업탐구':'voc','제2외국어':'second',
    '인문계':'humanities','자연계':'natural','예체능계':'arts',
}

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=30).read().decode('utf-8', errors='replace')

def asciify(s):
    if not s: return ''
    if all(ord(c) < 128 for c in s):
        return re.sub(r'[^A-Za-z0-9]', '', s)
    return 'k' + hashlib.md5(s.encode('utf-8')).hexdigest()[:6]

# 파일명에서 1차/2차 구분
def extract_round(fname):
    if '1차' in fname or '_1_' in fname or '1차' in fname: return '1'
    if '2차' in fname or '_2_' in fname or '2차' in fname: return '2'
    return ''

# 파일명에서 정답 vs 문제 판별
def extract_kind(fname):
    if any(k in fname for k in ['답안', '정답', '해설']): return 'a'
    if '대본' in fname or '스크립트' in fname: return 'script'
    return 'q'

records = []
for year in range(1994, 1999):
    print(f'\n▣ {year}학년도')
    page = 1
    rows = []
    while page <= 5:
        html = fetch(f'{BASE}&C01={year}&page={page}')
        body = re.search(r'<tbody[^>]*>(.*?)</tbody>', html, re.DOTALL)
        if not body: break
        page_rows = []
        for tr in TR_RE.findall(body.group(1)):
            if 'goView' not in tr: continue
            tds = [TAG_RE.sub('', td).strip() for td in TD_RE.findall(tr)]
            if len(tds) < 5: continue
            files = [(fs, fn) for fs, fn in FILE_RE.findall(tr)]
            page_rows.append({
                'no': tds[0],
                'year': tds[1],
                'category': tds[2] if len(tds) > 6 else '',
                'subject_kr': tds[3] if len(tds) > 6 else tds[2],
                'date': next((t for t in tds if re.fullmatch(r'\d{4}-\d{2}-\d{2}', t)), ''),
                'files': files,
            })
        if not page_rows: break
        rows.extend(page_rows)
        if len(page_rows) < 10: break
        page += 1
        time.sleep(0.3)

    print(f'  게시글 {len(rows)}개')
    for r in rows:
        subject_eng = SUBJECT_KEY.get(r['subject_kr'], asciify(r['subject_kr']))
        category_eng = SUBJECT_KEY.get(r['category'], asciify(r['category']) if r['category'] else '')
        for fs, fn in r['files']:
            ext = fn.rsplit('.', 1)[-1].lower() if '.' in fn else 'bin'
            if ext not in ('pdf', 'zip'): continue
            rd = extract_round(fn)
            kind = extract_kind(fn)
            # 영문 안전 파일명: {year}_csat_{subject}_{round}_{category}_{kind}_{hash}.{ext}
            parts = [str(year), 'csat', subject_eng]
            if rd: parts.append('r' + rd)
            if category_eng: parts.append(category_eng)
            parts.append(kind)
            parts.append(fs[:6])
            new_name = '_'.join(parts) + '.' + ext

            local = OUT / new_name
            if not local.exists() or local.stat().st_size < 1000:
                try:
                    req = urllib.request.Request(DL.format(fs), headers={'User-Agent': UA})
                    data = urllib.request.urlopen(req, timeout=60).read()
                    local.write_bytes(data)
                except Exception as e:
                    print(f'  ✗ {fn}: {e}')
                    continue
                time.sleep(0.2)

            records.append({
                'year': int(year),
                'round': rd,           # '1' / '2' / ''
                'subject_kr': r['subject_kr'],
                'subject_eng': subject_eng,
                'category_kr': r['category'],
                'kind': kind,           # 'q' / 'a' / 'script'
                'fileSeq': fs,
                'orig_filename': fn,
                'new_filename': new_name,
                'postId': r['no'],
            })

# 옛 한글 파일명 정리 (이전 fetch 잔재)
for f in OUT.glob('*_csat_old_*'):
    f.unlink()

META.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n총 {len(records)} 파일 / 메타 → {META}')
