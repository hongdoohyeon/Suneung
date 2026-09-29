"""평가원 이의신청 심사 결과 게시글·첨부 → 시험별 공식 기록."""
import json, re, os, collections, sys
O = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(O + '/kice_posts.json'))

def exam_of(title):
    m = re.search(r'(\d{4})\s*학년도', title)
    if not m: return None
    gy = int(m.group(1))
    if '6월' in title: t = 'june'
    elif '9월' in title: t = 'sept'
    elif '예비' in title: t = 'prelim'
    else: t = 'csat'
    return gy, t

def norm(t): return re.sub(r'[ \t\r\f\v]+', ' ', t)

AREA = r'(국어|언어|수학|수리|영어|외국어\(영어\)|외국어|한국사|사회탐구|과학탐구|직업탐구|제2외국어/한문|제2외국어·한문|제2외국어)'
RES = r'((?:정답|문제)(?:\((?:정답|문제)\))?\s*에\s*이상\s*이?\s*없음|(?:복수\s*정답|정답\s*변경|전원\s*정답)[^\n]{0,20})'

def parse_items(text):
    """【문항별 정답 이의신청 내역과 타당성 심사 결과】 표 → [{area, sub, no, kind, result, explained}]"""
    items = []
    t = norm(text)
    # 섹션: '...학년도 ... ○○ 영역(, 유형(과목) : X)? 문제 및 정답 이의신청 관련 답변 자료' 머리 → 표
    heads = [(m.start(), m.group(1), (m.group(3) or '').strip()) for m in re.finditer(
        AREA + r'\s*영역\s*(,\s*유형\s*\(\s*과목\s*\)\s*:\s*([^\n]{1,30}?))?\s*\n?\s*문제\s*및\s*정답\s*이의\s*신청\s*관련\s*답변', t)]
    heads.append((len(t), None, None))
    for (s, area, sub), (e, _, _) in zip(heads, heads[1:]):
        seg = t[s:e]
        cut = re.search(r'문항\s*번호\s*:', seg)
        table = seg[:cut.start()] if cut else seg
        flat = re.sub(r'\s+', ' ', table)
        for m in re.finditer(r'(?<!\d)(\d{1,2})\s+((?:정답|문제)(?:\s*\((?:정답|문제)\))?\s*이의\s*신청)\s+' + RES + r'\s*(◎|-|○)?', flat):
            items.append({'area': area, 'sub': sub or None, 'no': int(m.group(1)), 'kind': re.sub(r'\s+', '', m.group(2)),
                          'result': re.sub(r'\s+', ' ', m.group(3)).strip(), 'explained': m.group(4) in ('◎', '○')})
    return items

def _paragraphs(raw):
    """PDF/HWP 줄바꿈 복원 — 들여쓴 줄에서 새 문단, 나머지는 이어 붙임(줄 끝 공백이 없으면 낱말 중간 줄바꿈)."""
    paras, cur = [], ''
    for line in raw.split('\n'):
        if re.fullmatch(r'\s*-\s*\d+\s*-\s*', line) or not line.strip():
            continue
        if re.match(r'\s{2,}\S|\s*[○◦·※]\s', line) and cur:
            paras.append(cur.strip()); cur = ''
        cur += (line.strip() if cur.endswith(' ') or not cur else line.lstrip()) if not cur.endswith(' ') else line.strip()
        cur += ' ' if line.endswith(' ') else ''
    if cur.strip(): paras.append(cur.strip())
    return [re.sub(r'\s+', ' ', re.sub(r'[-]', '', x)).strip() for x in paras if x.strip()]

_AREA_RE = re.compile(r'(언어|국어|수리|수학|외국어\s*\(\s*영어\s*\)|외국어|영어|한국사|사회\s*탐구|과학\s*탐구|직업\s*탐구|제\s*2\s*외국어\s*[/·]\s*한문|제\s*2\s*외국어)\s*영역')
_SUB_RE = re.compile(r'(?:유형\s*\(\s*과목\s*\)|과목)\s*:\s*(.+)|영역\s*:\s*(?!\s*(?:유형|과목))(.+)')

def _heads(t):
    """답변 블록 앞 머리줄 → [(pos, area, sub)] — '사회탐구 영역 : 과목 : 윤리', '유형(과목) : 지구과학Ⅰ'(영역은 앞 머리 이어받기) 등."""
    out, area, pos = [], None, 0
    for line in t.split('\n'):
        L = line.strip()
        if L and len(L) < 60 and '문항 번호' not in L:
            a = _AREA_RE.search(L)
            m = _SUB_RE.search(L)
            if a or (m and not re.search(r'[다요]\.?$', L)):
                sub = (m.group(1) or m.group(2)).strip() if m else None
                if sub and '영역' in sub:   # '유형(과목) : 과학탐구 영역, 물리학Ⅱ'
                    a2 = _AREA_RE.search(sub); a = a or a2; sub = sub.split(',')[-1].strip()
                if a:
                    area = re.sub(r'\s+', '', a.group(1)); area = {'제2외국어·한문': '제2외국어/한문'}.get(area, area)
                if sub:
                    sub = re.sub(r"[‘’'\"]", '', sub).strip(' ,:')
                out.append((pos, area, sub or None))
        pos += len(line) + 1
    return out

def parse_details(text):
    """'문항 번호 : (과목) N(번) 답변 내용 : ...' 블록 → [{area, sub, no, claim, conclusion, answer}]"""
    t = text.replace('\r', '')
    out = []
    marks = _heads(t)
    blocks = list(re.finditer(r'문항\s*번호\s*:\s*(?:([^\d\n:]{1,20}?)\s*)?(\d{1,2})\s*번?\s*(?:문항)?\s*\n?\s*답변\s*내용\s*:?[ \t]*', t))
    for i, b in enumerate(blocks):
        end = blocks[i + 1].start() if i + 1 < len(blocks) else len(t)
        body = t[b.end():end]
        cut = re.search(r'INSID|\n\s*\d{4}\s*학년도\s*대학수학능력시험|【\s*문항별|\n\s*번호\s*\n\s*이의\s*신청\s*내역|\n\s*붙임\s*\d', body)
        if cut: body = body[:cut.start()]
        paras = _paragraphs(body)
        flat = ' '.join(paras)
        prev = [m for m in marks if m[0] < b.start()]
        area, sub = (prev[-1][1], prev[-1][2]) if prev else (None, None)
        if b.group(1) and b.group(1).strip():
            sub = re.sub(r'\s+', ' ', b.group(1)).strip()
        sents = re.split(r'(?<=[다요])\.\s*', flat)
        claim_p = next((x for x in paras if re.search(r'이의\s*신청의?\s*(주요\s*)?내용|이의\s*(제기|신청)[^.]{0,30}(주장|요지)', x)), None)
        claim = claim_p or next((x for x in sents if re.search(r'이의\s*(제기|신청)', x)), None)
        concl = next((x for x in reversed(sents) if re.search(r'그러므로|따라서|이상이\s*없|정답(은|입니다)', x)), None)
        out.append({'area': area, 'sub': sub, 'no': int(b.group(2)),
                    'claim': (claim or '')[:700], 'conclusion': (concl or '')[:400],
                    'answer': paras, 'chars': len(flat)})
    return out

def garble_text(x):
    """OCR 깨짐 정도 — 한글 문장 속 로마자 비율(영어 지문 인용이 아닌 경우)."""
    lat = len(re.findall(r'[A-Za-z]', x)); han = len(re.findall(r'[가-힣]', x))
    return lat / max(1, lat + han)

def garble(ds):
    return sum(garble_text(' '.join(d['answer'])) for d in ds) / max(1, len(ds))

def parse_summary(text):
    t = re.sub(r'\s+', ' ', text)
    r = {}
    m = re.search(r'접수된\s*이의\s*신청은\s*모두\s*([\d,]+)\s*건', t)
    if m: r['received'] = int(m.group(1).replace(',', ''))
    m = re.search(r'제외한\s*([\d,]+)\s*건이\s*실제\s*심사\s*대상', t)
    m2 = re.search(r'이의\s*신청\s*문항은\s*모두\s*([\d,]+)\s*개', t)
    if m and m2: r['cases'], r['items'] = int(m.group(1).replace(',', '')), int(m2.group(1))
    m = re.search(r'심사\s*대상은\s*([\d,]+)\s*개\s*문항\s*([\d,]+)\s*건', t)
    if m: r['items'], r['cases'] = int(m.group(1)), int(m.group(2).replace(',', ''))
    elif 'cases' in r: pass
    else:
        m = re.search(r'심사\s*대상은\s*([\d,]+)\s*건[^.]{0,20}?([\d,]+)\s*개\s*문항', t) or re.search(r'심사\s*대상은\s*([\d,]+)\s*건으로,?\s*(?:이와\s*관련된\s*문항은\s*)?([\d,]+)\s*개', t)
        if m: r['cases'], r['items'] = int(m.group(1).replace(',', '')), int(m.group(2))
    m = re.search(r'-\s*([^-]{4,60}(?:이상\s*없음|정답|인정)[^-]{0,30})\s*-', t)
    if m: r['headline'] = m.group(1).strip(' ’‘\'"')
    m = re.search(r'([^.]{0,120}(?:복수\s*정답|정답을\s*변경|모두\s*정답|전원\s*정답)[^.]{0,120}\.)', t)
    if m: r['change'] = m.group(1).strip()
    m = re.search(r'(\d+)\s*개\s*문항에\s*(?:대한|관한)\s*상세', t) or re.search(r'총\s*(\d+)\s*개\s*문항에\s*관한\s*답변', t)
    if m: r['detailed'] = int(m.group(1))
    return r

exams = collections.defaultdict(lambda: {'posts': [], 'docs': [], 'summary': {}, 'items': [], 'details': []})
for seq, p in P.items():
    ex = exam_of(p['title'])
    if not ex: continue
    E = exams[ex]
    E['posts'].append({'seq': seq, 'board': p['board'], 'title': p['title'], 'date': p['date']})
    texts = [(p.get('body') or '', False)]
    import glob
    for f in p['files']:
        t = open(O + '/' + f['txt']).read() if os.path.exists(O + '/' + f['txt']) else ''
        ocr = sorted(glob.glob(O + '/ocr/' + os.path.basename(f['path']) + '.*.txt'))
        if ocr:
            texts.append((' '.join(open(x).read() for x in ocr), True))
        ocr2 = sorted(glob.glob(O + '/ocr2/' + os.path.basename(f['path']) + '.*.txt'))   # 답변 본문용 고해상 재판독
        if ocr2:
            texts.append(('\n'.join(open(x).read() for x in ocr2), True))
        E['docs'].append({'name': f['name'], 'path': f['path'], 'fileSeq': f['seq'], 'chars': len(t)})
        texts.append((t, False))
    for t, is_ocr in texts:
        s = parse_summary(t)
        for k, v in s.items(): E['summary'].setdefault(k, v)
        its = parse_items(t)
        if its and not E['items']: E['items'] = its
        ds = parse_details(t)
        for d in ds: d['ocr'] = is_ocr
        if ds and (not E['details'] or (len(ds) >= 0.8 * len(E['details']) and garble(ds) < garble(E['details']) - 0.01)): E['details'] = ds
out = {f'{g}|{t}': v for (g, t), v in sorted(exams.items())}
json.dump(out, open(O + '/official.json', 'w'), ensure_ascii=False, indent=1)
for k, v in out.items():
    s = v['summary']
    print(k, s.get('received'), s.get('items'), s.get('cases'), 'tbl', len(v['items']), 'det', len(v['details']), '|', (s.get('headline') or '')[:40], '|', (s.get('change') or '')[:60])
