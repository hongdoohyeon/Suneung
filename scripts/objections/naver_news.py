"""회차별 이의신청 관련 기사 수집 — 네이버 뉴스 검색(발표일 앞뒤 기간 한정) → news_naver.json
각 기사에 제목·요약에서 찾은 과목 태그(subjects)를 붙인다. 태그가 없으면 시험 전체 기사."""
import datetime as dt, html, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

O = Path(__file__).parent
REC = json.load(open(Path.home() / 'Workspace/suneung-site-fix/data/objections.json'))['exams']
OUT = O / 'news_naver.json'
out = json.loads(OUT.read_text()) if OUT.exists() else {}

SUBJ = [  # (태그, 정규식)
    ('국어', r'국어|언어\s*영역|언어영역|화법과\s*작문|언어와\s*매체|문학|독서'),
    ('수학', r'수학|수리\s*영역|수리|미적분|확률과\s*통계|기하'),
    ('영어', r'영어|외국어\s*영역|외국어\(영어\)'),
    ('한국사', r'한국사(?!\s*능력)'),
    ('사회탐구', r'사회탐구|사탐|생활과\s*윤리|윤리와\s*사상|한국\s*지리|세계\s*지리|동아시아사|세계사|법과\s*정치|정치와\s*법|경제(?!\s*(?:성장|위기))|사회[·ㆍ]\s*문화|사회문화|법과\s*사회|국사|근현대사|근·현대사'),
    ('과학탐구', r'과학탐구|과탐|물리|화학|생명\s*과학|생물|지구\s*과학'),
    ('직업탐구', r'직업탐구|직탐'),
    ('제2외국어', r'제2외국어|한문|일본어|중국어|아랍어|베트남어|독일어|프랑스어|스페인어|러시아어'),
]
BAD = r'학력평가|학평|교육청|전국연합|고1|고2|토익|공무원|임용|검정고시|LEET|사관학교|경찰대|모의고사\s*해설|공인중개'


def fetch(q, d0, d1):
    f, t = d0.strftime('%Y.%m.%d'), d1.strftime('%Y.%m.%d')
    url = ('https://search.naver.com/search.naver?where=news&sort=0&query=' + urllib.parse.quote(q) +
           f'&ds={f}&de={t}&nso=so%3Ar%2Cp%3Afrom{d0:%Y%m%d}to{d1:%Y%m%d}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36'})
    return urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')


def parse(t):
    res = []
    for m in re.finditer(r'<a[^>]+href="(https?://(?!n\.news\.naver|search\.naver|www\.naver|help\.naver|media\.naver|news\.naver)[^"]+)"[^>]*>(.{8,400}?)</a>', t):
        title = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).replace('새 창 열림', '').strip()
        if len(title) < 12 or not re.search(r'이의|정답|오류|출제|복수', title):
            continue
        before = t[max(0, m.start() - 6000):m.start()]
        outs = [html.unescape(x) for x in re.findall(r'>([^<>]{2,20})</span><span class="[^"]*">새 창 열림', before) if x != '네이버뉴스']
        dates = re.findall(r'>(\d{4}\.\d{2}\.\d{2})\.<', before)
        after = t[m.end():m.end() + 3000]
        snip = re.search(r'<a[^>]*>(.{30,600}?)</a>', after)
        snippet = html.unescape(re.sub(r'<[^>]+>', '', snip.group(1))).replace('새 창 열림', '').strip() if snip else ''
        res.append({'title': title, 'outlet': outs[-1] if outs else '', 'date': dates[-1].replace('.', '-') if dates else '',
                    'url': m.group(1), 'snippet': snippet[:300]})
    return res


def tags(x):
    s = x['title'] + ' ' + x['snippet']
    return [k for k, p in SUBJ if re.search(p, s)]


for key, rec in sorted(REC.items()):
    if key in out and '--force' not in sys.argv:
        continue
    gy, typ = key.split('|')
    posts = [p['date'] for p in rec['official'].get('posts') or [] if p.get('date')]
    if posts:
        base = dt.date.fromisoformat(max(posts)[:10])
    else:   # 날짜 모름 — 시행월 기준 대략
        base = dt.date(int(gy) - 1, {'csat': 11, 'june': 6, 'sept': 9}[typ], 25 if typ == 'csat' else 18)
    d0, d1 = base - dt.timedelta(days=12), base + dt.timedelta(days=6)
    word = '수능' if typ == 'csat' else ('6월 모의평가' if typ == 'june' else '9월 모의평가')
    qs = [f'{word} 이의신청', f'{word} 정답 오류' if typ == 'csat' else f'{word} 이의 신청 이상 없음']
    got = []
    for q in qs:
        try:
            got += parse(fetch(q, d0, d1))
        except Exception as e:
            print('ERR', key, q, e)
        time.sleep(1.2)
    seen, items = set(), []
    for x in got:
        k = re.sub(r'\W', '', x['title'])[:24]
        if k in seen or re.search(BAD, x['title']):
            continue
        seen.add(k)
        x['subjects'] = tags(x)
        items.append(x)
    out[key] = {'window': [str(d0), str(d1)], 'items': items}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(key, len(items), [i['title'][:40] for i in items[:3]], flush=True)
