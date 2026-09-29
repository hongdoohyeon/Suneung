"""news_naver.json + 기존 수동 목록(news_a~d) → news_final.json
- URL 당 첫 앵커(제목)만, 결과·논란과 관련된 제목만
- 과목 태그는 제목에서만 (3개 이상이면 시험 전체 기사로 봄)
- 같은 내용 제목(통신사 전재)은 하나, 회차당 전체 기사 최대 6개 + 과목별 최대 4개"""
import json, re
from pathlib import Path
O = Path(__file__).parent
SUBJ = [
    ('국어', r'(?<!외)국어|언어\s*영역|언어영역|언어\s*\d+번|화법과\s*작문|언어와\s*매체|화작|언매|문학|독서'),
    ('수학', r'수학(?!\s*능력)|수리|미적분|확률과\s*통계|기하|가형|나형'),
    ('영어', r'영어|외국어\s*영역|외국어\s*\d+번'),
    ('한국사', r'한국사(?!\s*능력)'),
    ('사회탐구', r'사회탐구|사탐|생활과\s*윤리|생윤|윤리와\s*사상|한국\s*지리|세계\s*지리|동아시아사|세계사|법과\s*정치|정치와\s*법|정치\s*\d+번|경제\s*\d+번|사회[·ㆍ]\s*문화|사회문화|법과\s*사회|(?<!한)국사|근현대사|근·현대사|윤리\s*\d+번'),
    ('과학탐구', r'과학탐구|과탐|물리|화학|생명\s*과학|생물|지구\s*과학|지학'),
    ('직업탐구', r'직업탐구|직탐|기초\s*제도|프로그래밍|회계|상업'),
    ('제2외국어', r'제2외국어|한문|일본어|중국어|아랍어|베트남어|독일어|프랑스어|스페인어|러시아어'),
]
REL = r'이의|오류|복수\s*정답|정답\s*(없음|확정|변경|번복|인정|논란|이상)|전원\s*정답|이상\s*(없|無|무)|소송|판결|출제\s*실수|문제\s*없'
NOISE = r'실시|진행\s*중|치[뤄러]져|절차|까지…|접수\s*중|이의신청\s*(받는다|방법|하려면|하고\s*싶|기간|마감)|주의사항|성적표|응시|시행된다|실시된다|출제\s*방향|가채점|등급컷|해설'


N1, N2 = r'\s*(?:Ⅰ|I(?!I)|1(?!\d)|Ⅰ)', r'\s*(?:Ⅱ|II|2(?!\d))'
SUBS = [  # (영역, 세부과목, 정규식) — 로마숫자 없으면 줄기(물리 등)만 → 같은 줄기 과목에만 표시
    ('국어', '화법과작문', r'화법과\s*작문|화작'), ('국어', '언어와매체', r'언어와\s*매체|언매'),
    ('수학', '미적분', r'미적분'), ('수학', '확률과통계', r'확률과\s*통계|확통'), ('수학', '기하', r'기하(?!급수)'),
    ('수학', '가형', r'가\s*형|수리\s*가'), ('수학', '나형', r'나\s*형|수리\s*나'),
    ('과학탐구', '물리Ⅱ', r'물리(?:학)?' + N2), ('과학탐구', '물리Ⅰ', r'물리(?:학)?' + N1), ('과학탐구', '물리', r'물리'),
    ('과학탐구', '화학Ⅱ', r'화학' + N2), ('과학탐구', '화학Ⅰ', r'화학' + N1), ('과학탐구', '화학', r'화학'),
    ('과학탐구', '생명과학Ⅱ', r'(?:생명\s*과학|생과|생물)' + N2), ('과학탐구', '생명과학Ⅰ', r'(?:생명\s*과학|생과|생물)' + N1), ('과학탐구', '생명과학', r'생명\s*과학|생과|생물'),
    ('과학탐구', '지구과학Ⅱ', r'(?:지구\s*과학|지학)' + N2), ('과학탐구', '지구과학Ⅰ', r'(?:지구\s*과학|지학)' + N1), ('과학탐구', '지구과학', r'지구\s*과학|지학'),
    ('사회탐구', '생활과윤리', r'생활과\s*윤리|생윤'), ('사회탐구', '윤리와사상', r'윤리와\s*사상|윤사'), ('사회탐구', '한국지리', r'한국\s*지리|한지'),
    ('사회탐구', '세계지리', r'세계\s*지리'), ('사회탐구', '동아시아사', r'동아시아사'), ('사회탐구', '세계사', r'(?<!아)세계사'),
    ('사회탐구', '법과정치', r'법과\s*정치|정치와\s*법|정치\s*\d+번'), ('사회탐구', '경제', r'경제\s*\d+번|경제\s*과목'), ('사회탐구', '사회·문화', r'사회\s*[·ㆍ]?\s*문화|사문'),
    ('사회탐구', '법과사회', r'법과\s*사회'), ('사회탐구', '윤리', r'(?<!생활과\s)(?<!생활과)윤리\s*\d+번'), ('사회탐구', '국사', r'(?<!한)국사'),
    ('사회탐구', '한국근현대사', r'근\s*[·ㆍ]?\s*현대사'),
    ('직업탐구', '기초제도', r'기초\s*제도'), ('직업탐구', '프로그래밍', r'프로그래밍'),
]


def tags(title):
    """[{subject, sub}] — 세부과목까지 알면 sub, 영역만 알면 sub=None. 3개 영역 이상 걸리면 시험 전체 기사."""
    out, areas = [], set()
    for area, sub, pat in SUBS:
        if re.search(pat, title) and not any(o['subject'] == area and o['sub'] and o['sub'].startswith(sub) for o in out):
            out.append({'subject': area, 'sub': sub}); areas.add(area)
    for area, pat in SUBJ:
        if area not in areas and re.search(pat, title):
            out.append({'subject': area, 'sub': None}); areas.add(area)
    return out if 0 < len(areas) < 3 else []


def looks_snippet(t):
    return len(t) > 70 or re.search(r'(다|요)\.\s|^\[.*?\]\s*\S+\s*기자|기자\]|=\s*\S+\s*기자|@', t) or t.startswith(('한국교육과정평가원은', '평가원은', '앞서', '지난'))


def norm(t):
    return re.sub(r'[^가-힣0-9A-Za-z]', '', re.sub(r'\(.*?\)|\[.*?\]|<.*?>', '', t))[:18]


NV = json.load(open(O / 'news_naver.json'))
manual = {}
for f in ('news_a', 'news_b', 'news_c', 'news_d'):
    for k, v in json.load(open(O / f'{f}.json')).items():
        if k.startswith('_'): continue
        base = k.replace('_extra', '')
        m = manual.setdefault(base, {'summary': None, 'items': []})
        m['summary'] = m['summary'] or v.get('summary')
        m['items'] += v['items']

out = {}
for key in sorted(set(NV) | set(manual)):
    cand = [dict(x, manual=True) for x in manual.get(key, {}).get('items', [])]
    seen_url = set()
    for x in NV.get(key, {}).get('items', []):
        if x['url'] in seen_url: continue
        seen_url.add(x['url'])
        t = x['title']
        if looks_snippet(t) or not re.search(REL, t) or re.search(NOISE, t):
            continue
        cand.append(x)
    items, seen = [], set()
    per = {}
    for x in cand:
        n = norm(x['title'])
        if n in seen or any(x['url'] == y['url'] for y in items):
            continue
        tg = tags(x['title'])
        if not x.get('manual'):
            if tg and all(per.get((t['subject'], t['sub']), 0) >= 4 for t in tg): continue
            if not tg and sum(1 for y in items if not y['subjects']) >= 4: continue
        seen.add(n)
        for t in tg: per[(t['subject'], t['sub'])] = per.get((t['subject'], t['sub']), 0) + 1
        items.append({'title': x['title'], 'outlet': x.get('outlet') or '', 'date': x.get('date') or '', 'url': x['url'], 'subjects': tg})
    items.sort(key=lambda y: y['date'] or '9999')
    if items:
        out[key] = {'summary': manual.get(key, {}).get('summary'), 'items': items}
(O / 'news_final.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out), 'exams', sum(len(v['items']) for v in out.values()), 'items')
for k, v in out.items():
    print(k, len(v['items']), '|', ' / '.join(f"{y['title'][:28]}{'['+','.join((t['sub'] or t['subject']) for t in y['subjects'])+']' if y['subjects'] else ''}" for y in v['items'][:7]))
