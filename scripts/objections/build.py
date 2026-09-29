"""평가원 이의신청 기록 → suneung-site data/objections.json"""
import json, os, re, urllib.parse
O = os.path.dirname(os.path.abspath(__file__))
OFF = json.load(open(O + '/official.json'))
P = json.load(open(O + '/kice_posts.json'))
AM = json.load(open(O + '/assetmap.json'))
NEWS = {}
for f in ('news_a', 'news_b', 'news_c', 'news_d'):
    for k, v in json.load(open(O + f'/{f}.json')).items():
        if k.startswith('_'): continue
        base = k.replace('_extra', '')
        if base in NEWS:
            NEWS[base]['items'] += [i for i in v['items'] if i['url'] not in {x['url'] for x in NEWS[base]['items']}]
            if v.get('summary') and not NEWS[base].get('summary'): NEWS[base]['summary'] = v['summary']
        else:
            NEWS[base] = {**v, 'items': list(v['items'])}
# 평가원 발표를 옮겨 실은 정부·공공기관 게시물
EXTRA = json.load(open(O + '/official_extra.json'))
W = 'https://suneung-files.hdh061224.workers.dev/objection-v1/'
G = 'https://github.com/hongdoohyeon/Suneung/releases/download/objection-v1/'
BOARD = {'1500229': '0301', '1500230': '0302'}

OVR = {  # 원문 확인 후 보정(자동 추출 누락분)
    '2006|csat': {'received': 402, 'items': 106, 'verdict': "모두 정답에 영향이 없는 '단순 사안'"},
    '2006|june': {'received': 233, 'items': 106},
    '2006|sept': {'received': 157, 'items': 76},
    '2022|june': {'received': 82, 'items': 55, 'cases': 70},
    '2022|sept': {'received': 53, 'items': 32, 'cases': 42},
    '2023|csat': {'received': 663, 'items': 67, 'cases': 214},
    '2027|sept': {'received': 154},
    # 평가원 원문(HWP) 판독 불가 → 당시 보도(한국일보 2004-11-29) 수치
    '2005|csat': {'received': 609, 'items': 120, 'verdict': "모두 '문제 및 정답에 이상 없음' (당시 보도 기준)"},
}
# 정답이 바뀐 문항 — 평가원 심사 결과 원문 문장 근거. via=news 는 이의심사 이후 뒤집힌 사례(평가원 게시판 원문 없음)
CHANGES = {
    '2006|june': [{'subject': '제2외국어', 'sub': '프랑스어Ⅰ', 'no': 26, 'decision': '전원 정답', 'detail': '문두에서 B를 A로 표기한 편집 오류 → 모든 답지 정답'}],
    '2006|sept': [{'subject': '사회탐구', 'sub': '법과 사회', 'no': 16, 'decision': '복수 정답', 'detail': '③ 서술의 경찰청은 법리상 경찰청장 → ③·⑤ 정답'}],
    '2009|june': [{'subject': '수학', 'sub': '나형', 'no': 28, 'decision': '복수 정답', 'detail': '④ 외에 ①도 정답'}],
    '2010|june': [{'subject': '직업탐구', 'sub': '프로그래밍', 'no': 13, 'decision': '복수 정답', 'detail': '② 외에 ①도 정답'}],
    '2010|csat': [{'subject': '과학탐구', 'sub': '지구과학Ⅰ', 'no': 19, 'decision': '복수 정답', 'detail': '실제 일식 지속시간 계산 결과에 따라 ③ 외에 ①도 정답'}],
    '2015|csat': [{'subject': '영어', 'sub': None, 'no': 25, 'decision': '복수 정답', 'detail': '④ 외에 ⑤도 정답 (⑤ 진술이 그래프와 불일치)'},
                  {'subject': '과학탐구', 'sub': '생명과학Ⅱ', 'no': 8, 'decision': '복수 정답', 'detail': '④ 외에 ②도 정답 (<보기> ㄱ 해석 차이)'}],
    '2017|csat': [{'subject': '한국사', 'sub': None, 'no': 14, 'decision': '복수 정답', 'detail': '① 외에 ⑤도 정답 (대한매일신보의 시일야방성대곡 게재)'},
                  {'subject': '과학탐구', 'sub': '물리Ⅱ', 'no': 9, 'decision': '전원 정답', 'detail': '정답 없음 판정 → 모두 정답 처리'}],
    '2018|sept': [{'subject': '과학탐구', 'sub': '지구과학Ⅰ', 'no': 17, 'decision': '복수 정답', 'detail': '① 외에 ⑤도 정답'},
                  {'subject': '직업탐구', 'sub': '기초 제도', 'no': 18, 'decision': '정답 변경', 'detail': '③ → ⑤'}],
    '2022|csat': [{'subject': '과학탐구', 'sub': '생명과학Ⅱ', 'no': 20, 'decision': '전원 정답', 'detail': "이의심사에서는 '이상 없음'이었으나 법원이 정답결정을 취소(2021-12-15) → 전원 정답",
                   'after': True, 'url': 'https://www.suneung.re.kr/boardCnts/view.do?boardID=1500230&boardSeq=5074372&lev=0&m=0302&s=suneung'}],
    '2014|csat': [{'subject': '사회탐구', 'sub': '세계지리', 'no': 8, 'decision': '전원 정답', 'detail': "이의심사·1심은 '오류 아님', 2014-10 서울고법 '정답 없음' 판결 → 교육부가 전원 정답·성적 재산정",
                   'after': True, 'via': 'news'}],
    '2008|csat': [{'subject': '과학탐구', 'sub': '물리Ⅱ', 'no': 11, 'decision': '복수 정답', 'detail': "이의심사 발표 뒤 '단원자 분자 이상기체' 조건 누락이 인정돼 ④ 외에 ②도 정답",
                   'after': True, 'via': 'news'}],
}
AREA = {'언어': '국어', '국어': '국어', '수리': '수학', '수학': '수학', '외국어': '영어', '외국어(영어)': '영어', '영어': '영어', '한국사': '한국사',
        '사회탐구': '사회탐구', '과학탐구': '과학탐구', '직업탐구': '직업탐구', '제2외국어/한문': '제2외국어', '제2외국어·한문': '제2외국어', '제2외국어': '제2외국어'}

def clean_sub(s):
    if not s: return None
    s = re.sub(r"[‘’'\"]", '', s).strip()
    return s or None

out = {}
for k, v in OFF.items():
    s = {**v['summary'], **OVR.get(k, {})}
    posts = [{'title': p['title'], 'date': p['date'],
              'url': f"https://www.suneung.re.kr/boardCnts/view.do?boardID={p['board']}&boardSeq={p['seq']}&lev=0&m={BOARD[p['board']]}&s=suneung"}
             for p in sorted(v['posts'], key=lambda p: p['date'])]
    docs, seen = [], set()
    for d in v['docs']:
        a = AM.get(d['fileSeq'])
        if not a or d['name'] in seen: continue
        seen.add(d['name'])
        url = (G + a) if a.endswith('.hwp') else (W + a + '?name=' + urllib.parse.quote(d['name']))
        docs.append({'name': d['name'], 'url': url})
    ch = CHANGES.get(k, [])
    verdict = s.get('verdict')
    if not verdict and s.get('items'):
        verdict = f"심사 대상 {s['items']}개 문항 " + ("모두 '문제 및 정답에 이상 없음'" if not [c for c in ch if not c.get('after')] else f"중 {len([c for c in ch if not c.get('after')])}개 문항 정답 변경")
    after = [c for c in ch if c.get('after')]
    if verdict and after:
        verdict += f" → 이후 {len(after)}개 문항 사후 정정"
    items = []
    if v['items']:
        for i in v['items']:
            items.append({'subject': AREA.get(i['area'], i['area']), 'sub': clean_sub(i['sub']), 'no': i['no'],
                          'kind': i['kind'], 'result': i['result'], 'explained': i['explained']})
    det = []
    for d in v['details']:
        claim = d['claim'].strip()
        if not claim or len(claim) < 15: continue
        det.append({'subject': AREA.get(d['area'], d['area']) if d['area'] else None, 'sub': clean_sub(d['sub']), 'no': d['no'],
                    'claim': claim[:300], 'conclusion': (d['conclusion'].strip()[:220] if not re.search(r'영역|이의\s*신청\s*정답에|이상이\s*없음\s*[-◎]', d['conclusion']) else '')})
    rec = {'official': {
        'org': '한국교육과정평가원', 'posts': posts, 'docs': docs,
        'received': s.get('received'), 'cases': s.get('cases'), 'items': s.get('items'),
        'verdict': verdict, 'changes': ch, 'questions': items,
        'questionsComplete': bool(items) and bool(s.get('items')) and len({(i['subject'], i['sub'], i['no']) for i in items}) >= s['items'],
        'details': det}}
    if k in EXTRA: rec['official']['extra'] = EXTRA[k]
    if k in NEWS: rec['news'] = NEWS[k]
    out[k] = rec
res = {'_meta': {
    'description': '평가원 수능·모의평가 문제 및 정답 이의신청 기록. official=평가원 심사 결과 원문(자동 추출·원문 링크), official.extra=평가원 발표를 옮겨 실은 교육부·정책브리핑 등 공공기관 게시물, news=언론 보도.',
    'sources': 'suneung.re.kr 공지사항·보도자료 게시판 (원문은 GitHub 릴리스 objection-v1 에 보관)',
    'updated': '2026-09-29'}, 'exams': out}
open(os.path.expanduser('~/Workspace/suneung-site-fix/data/objections.json'), 'w').write(json.dumps(res, ensure_ascii=False, indent=1) + '\n')
print(len(out), 'exams;', sum(1 for r in out.values() if r['official']['questions']), 'with question tables;',
      sum(len(r['official']['changes']) for r in out.values()), 'changes;', len(NEWS), 'news;', len(EXTRA), 'extra')
