"""나머지 자료 오류 처리 계획 — confirmed.json(전 쪽 재확인으로 확정된 오류) + label/broken.
규칙 순서: ① 평가원 게시판 원본(refetch/out2)으로 교체 ② 같은 시험 과목끼리 바뀐 파일 맞바꾸기
③ 문제지 칸의 정답표 → 정답 칸으로 ④ 라벨만 틀린 것 이름 고치기 ⑤ 그래도 안 되면 틀린 링크 빼기
python3 scripts/material-audit/fix_rest.py → tmp/material-fix/plan_rest.json + 사람용 요약"""
import json, re, copy
from pathlib import Path
from urllib.parse import quote, unquote
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
REF = Path.home() / 'Workspace/kice_archive/refetch/out2'
TAG, WORKER = 'kice-fix-v1', 'https://suneung-files.hdh061224.workers.dev'
TYPE = {'june': 'mock06', 'sept': 'mock09', 'csat': 'csat', 'prelim': 'prelim'}
TYPE_KO = {'june': '6모', 'sept': '9모', 'csat': '수능'}
KIND = {'questionUrl': 'q', 'answerUrl': 'a', 'scriptUrl': 's'}
WORD = {'questionUrl': '문제지', 'answerUrl': '정답', 'scriptUrl': '듣기 대본', 'solutionUrl': '해설'}

exams = json.loads((ROOT / 'data/exams.json').read_text())
E = {e['id']: e for e in exams}
done = {(p['id'], p['field']) for p in json.loads((ROOT / 'tmp/material-fix/plan_kice.json').read_text())}
conf = [c for c in json.loads((ROOT / 'tmp/material-fix/confirmed.json').read_text()) if c['real']]
report = json.loads((ROOT / 'tmp/material-fix/report-before.json').read_text())   # 수정 전 검수 결과
plan, notes = [], Counter()

def n(s):
    s = re.sub(r'[\s·･ㆍ․()（）\[\]<>_\-]', '', s or '')
    s = re.sub(r'(II|Ⅱ|2)(?=\.|$|[^0-9])', 'Ⅱ', s); s = re.sub(r'(I|Ⅰ|1)(?=\.|$|[^0-9])', 'Ⅰ', s)
    for a, b in (('물리학', '물리'), ('생명과학', '생물'), ('법과정치', '정치와법'), ('사회문화', '사회·문화'), ('가형', 'A형'), ('나형', 'B형')):
        s = s.replace(a, b)
    return s
def set_(eid, **kv): plan.append({'id': eid, 'field': '*', 'set': kv})
def clear(eid, field, why):
    plan.append({'id': eid, 'field': field, 'new': None, 'downloadField': field.replace('Url', 'Download'), 'why': why}); notes[why] += 1
def replace(eid, field, local, asset, dl, why):
    plan.append({'id': eid, 'field': field, 'local': local, 'asset': asset, 'new': f'{WORKER}/{TAG}/{asset}?name={quote(dl)}',
                 'downloadField': field.replace('Url', 'Download'), 'download': dl, 'why': why}); notes[why] += 1
def rename_names(e, frm, to):
    out = {}
    for k, v in e.items():
        if isinstance(v, str) and (k.endswith('Download') or k.endswith('Url')) and v:
            if k.endswith('Url') and '?name=' in v:
                base, nm = v.split('?name=', 1); nv = unquote(nm).replace(frm, to)
                if nv != unquote(nm): out[k] = f'{base}?name={quote(nv)}'
            elif k.endswith('Download') and frm in v: out[k] = v.replace(frm, to)
    return out

handled = set()   # (id, field)

# ── ④-a 2025·2026학년도 '4월 고3 학평' = 실제 5월 학평(파일명 _05_g3) → 5월로
for e in exams:
    if e.get('typeGroup') == 'education' and e['gradeYear'] in (2025, 2026) and e['type'] == 'apr' and e.get('studentGrade') == 3 \
       and re.search(r'_05_g3_', e.get('questionUrl') or ''):
        set_(e['id'], type='may', month=5, **rename_names(e, '4월', '5월')); notes['4월→5월 학평 라벨'] += 1
        for f in KIND: handled.add((e['id'], f))

# ── ④-b 2003년 12월 '고2 학평'(외부 수집본) = 실제 평가원 2005학년도 수능 예비평가 — 대부분 평가원 원본 항목의 중복
import hashlib as _h
def _full(u):
    f = ROOT / 'tmp/material-fix/full' / (_h.sha1(u.split('?')[0].encode()).hexdigest()[:12] + '.txt')
    return f.read_text() if f.exists() else ''
series = [e for e in exams if e.get('typeGroup') == 'education' and e['gradeYear'] == 2003 and e.get('month') == 12 and e.get('studentGrade') == 2
          and any(re.search(r'2005\s*학년도\s*대학수학능력시험\s*예비', _full(e[f]) or '') for f in ('questionUrl', 'answerUrl') if e.get(f))]
flagged = {i for c in conf if c['code'] == 'year' and '2005' in c['msg'] for i in c['ids']}
for e in exams:   # 텍스트를 못 받은 것도 검수에서 2005 로 확인된 것은 포함
    if e['id'] in flagged and e not in series: series.append(e)
FIELDS = ['questionUrl', 'answerUrl', 'solutionUrl', 'scriptUrl', 'listenUrl']
for e in series:
    twin = [x for x in exams if x['typeGroup'] == 'suneung' and x['type'] == 'prelim' and x['gradeYear'] == 2005
            and x['subject'] == e['subject'] and x.get('subSubject') == e.get('subSubject')]
    if twin:
        t = twin[0]; fill = {}
        for f in FIELDS:
            if e.get(f) and not t.get(f):
                fill[f] = e[f]; dk = f.replace('Url', 'Download')
                if e.get(dk): fill[dk] = e[dk].replace('2003년 12월 고2 모의고사', '2005학년도 수능 예비평가')
        if fill: set_(t['id'], **fill); notes['예비평가 원본에 빠진 파일 채움'] += 1
        plan.append({'id': e['id'], 'field': '*', 'delete': True}); notes['2003-12 고2(예비평가 중복) 삭제'] += 1
    else:
        kv = dict(typeGroup='suneung', type='prelim', curriculum='7차', gradeYear=2005, examYear=2003, month=12, studentGrade=None)
        kv.update(rename_names(e, '2003년 12월 고2 모의고사', '2005학년도 수능 예비평가')); set_(e['id'], **kv); notes['2003-12 고2 → 2005 예비평가'] += 1
    for f in list(KIND) + ['solutionUrl', 'label']: handled.add((e['id'], f))

# ── ④-c 가형/나형으로 등록된 A형/B형 문서(2014~2016) → A형/B형
for x in report['issues']:
    if x['code'] != 'label': continue
    for i in x['ids']:
        e = E[i]; to = {'가형': 'A형', '나형': 'B형'}.get(e['subSubject'])
        if to and (i, 'label') not in handled:
            set_(i, subSubject=to, **rename_names(e, e['subSubject'], to)); handled.add((i, 'label')); notes['가/나형 → A/B형'] += 1

# ── ④-d 외부 수집본 '국어' 항목이 실제 중국어 시험지 → 같은 시험 중국어가 있으면 중복 삭제, 없으면 옮김
for c in conf:
    if c['code'] == 'subject' and '제2외국어' in c['msg']:
        for i in c['ids']:
            e = E[i]
            if e['subject'] != '국어' or e.get('subSubject'): continue
            twin = [x for x in exams if x['typeGroup'] == e['typeGroup'] and x['gradeYear'] == e['gradeYear'] and x['type'] == e['type']
                    and x['subject'] == '제2외국어' and x.get('subSubject') == '중국어' and x['id'] != i]
            if twin: plan.append({'id': i, 'field': '*', 'delete': True}); notes['국어로 잘못 붙은 중국어(중복) 삭제'] += 1
            else: set_(i, subject='제2외국어', subSubject='중국어', **rename_names(e, '국어', '중국어')); notes['국어 → 제2외국어(중국어)'] += 1
            for f in list(KIND) + ['solutionUrl']: handled.add((i, f))

# ── ④-e 2014 수능 '한국근현대사' = 한국사 (2014학년도에 근현대사 폐지)
for c in conf:
    if c['code'] == 'subsub' and '한국사로' in c['msg']:
        for i in c['ids']:
            if E[i]['subSubject'] == '한국근현대사' and E[i]['gradeYear'] >= 2014:
                set_(i, subSubject='한국사', **rename_names(E[i], '한국근현대사', '한국사')); handled.add((i, c['field'])); notes['한국근현대사 → 한국사'] += 1

# ── ① 평가원 게시판 원본으로 교체
def kice_pick(e, field):
    d = REF / f"{e['gradeYear']}_{TYPE.get(e['type'], '')}"
    if not (d / 'manifest.json').exists(): return None
    man = json.loads((d / 'manifest.json').read_text())
    area = n(e['subject']); sub = n(e.get('subSubject') or '')
    cand = [m for m in man if m['kind'] == KIND.get(field) and n(m['area']).startswith(area[:3])
            and (n(m['sub'] or '') == sub if sub else not m['sub'])]
    return (d / cand[0]['file']) if len(cand) == 1 else None

for c in conf:
    for i in c['ids']:
        e, f = E[i], c['field']
        if (i, f) in handled or (i, f) in done: continue
        if e['typeGroup'] == 'suneung' and f in KIND:
            p = kice_pick(e, f)
            if p:
                lab = f"{e['gradeYear']}학년도 {TYPE_KO.get(e['type'], e['type'])} {e['subject']}" + (f"({e['subSubject']})" if e.get('subSubject') else '')
                replace(i, f, str(p), f"{e['gradeYear']}_{TYPE[e['type']]}_x{i}_{KIND[f]}.pdf", f'{lab} {WORD[f]}.pdf', '평가원 원본으로 교체')
                handled.add((i, f))

# ── 짝수형 문제지가 확통 것으로 통일 → 빼기
for c in conf:
    if c['field'] == 'questionUrlEven':
        for i in c['ids']:
            if (i, 'questionUrlEven') not in handled: clear(i, 'questionUrlEven', '다른 선택과목 짝수형 → 빼기'); handled.add((i, 'questionUrlEven'))

# ── ② 형제 맞바꾸기 / ③ 칸 옮기기 / ⑤ 빼기 — 링크를 빼는 건 '다른 자료'라는 증거가 본문에 있을 때만
import hashlib
def full(url):
    f = ROOT / 'tmp/material-fix/full' / (hashlib.sha1(url.split('?')[0].encode()).hexdigest()[:12] + '.txt')
    return f.read_text() if f.exists() else ''
def nn(s): return re.sub(r'[\s·･ㆍ․()（）\[\]<>]', '', s or '').replace('Ⅰ', '1').replace('Ⅱ', '2').replace('I', '1')
SYN = [['정치와법', '법과정치', '법과사회'], ['생명과학1', '생물1'], ['생명과학2', '생물2'], ['물리학1', '물리1'], ['물리학2', '물리2']]
def mentions(body, name, raw=''):
    # 로마 숫자 과목(물리Ⅰ 등)은 원문에서 Ⅰ/Ⅱ/I/II 로 적힌 것만 인정 — '물리 2점' 같은 숫자 오인 방지
    if raw and re.search('[ⅠⅡ]$', name or ''):
        base = re.sub('[ⅠⅡ]$', '', name); num = 'Ⅱ|II' if name.endswith('Ⅱ') else 'Ⅰ|I(?!I)'
        alts = [base] + {'물리학': ['물리'], '물리': ['물리학'], '생명과학': ['생물'], '생물': ['생명과학']}.get(base, [])
        return any(re.search(rf'{re.escape(a)}\s*({num})', raw) for a in alts)
    k = nn(name); g = next((g for g in SYN if k in g), [k]); return any(x in body for x in g)
def ident(c):
    m = re.search(r'(세부 과목|영역)이 (.+?)로 보임', c['msg']); return m.group(2) if m else None
def move(i, frm, to, why):
    e = E[i]
    plan.append({'id': i, 'field': to, 'new': e[frm], 'downloadField': to.replace('Url', 'Download'),
                 'download': (e.get(frm.replace('Url', 'Download')) or '').replace(WORD[frm], WORD[to]), 'why': why})
    plan.append({'id': i, 'field': frm, 'new': None, 'downloadField': frm.replace('Url', 'Download'), 'why': why}); notes[why] += 1
by_group = {}
for x in exams:
    by_group.setdefault((x['typeGroup'], x['gradeYear'], x['type'], x.get('studentGrade'), x['subject']), []).append(x)
keep = Counter()
for c in conf:
    for i in c['ids']:
        e, f = E[i], c['field']
        if (i, f) in handled or (i, f) in done or not e.get(f): continue
        t = full(e[f]); body = nn(t); head = t[:400]
        handled.add((i, f))
        if c['code'] in ('grade', 'month') or (c['code'] == 'org' and 'EBS' in c['msg']):
            keep['학년·월·EBS 정답(문제 아님)'] += 1; continue
        if c['code'] == 'subsub':
            other = ident(c)
            hdr = re.search(r'영역\s*\(\s*([^)]+?)\s*\)', head)
            if hdr and nn(hdr.group(1)) == nn(other) and not mentions(body, e['subSubject']) \
               and not any(nn(s.get('subSubject')) == nn(other) for s in by_group[(e['typeGroup'], e['gradeYear'], e['type'], e.get('studentGrade'), e['subject'])]):
                set_(i, subSubject=hdr.group(1).strip(), **rename_names(e, e['subSubject'], hdr.group(1).strip())); notes['과목 이름만 틀림 → 이름 고침'] += 1; continue
            # 당시 계열 묶음 이름(공업①·수산·해운② 등)은 과목명 표기일 뿐 — 파일은 맞음
            if nn(other) in {nn(x) for x in ('공업', '수산·해운', '수산해운', '상업', '농업', '가사실업', '가사·실업', '상업경제')}:
                keep['당시 계열 이름 표기(유지)'] += 1; continue
            # 한국사 ↔ 국사: 옛 시험의 과목명 → 이름만 고침
            if e['subSubject'] == '한국사' and other == '국사' and e['gradeYear'] <= 2013:
                set_(i, subSubject='국사', **rename_names(e, '한국사', '국사')); notes['과목 이름만 틀림 → 이름 고침'] += 1; continue
            if mentions(body, other, t) and not mentions(body, e['subSubject'], t):
                clear(i, f, '다른 과목 파일 → 빼기'); continue
            keep['과목 표기 불분명(유지)'] += 1; continue
        if c['code'] == 'subject':
            other = ident(c)
            pages = int(re.search(r'<<pages (\d+)>>', t).group(1)) if t else 0
            ALIAS = {'국어': '국어|언어', '수학': '수학|수리', '영어': '영어|외국어'}
            reg = ALIAS.get(e['subject'], re.escape(e['subject']))
            areas = set(m.group(1) for m in re.finditer(r'(국어|언어|수학|수리|영어|외국어|한국사|탐구)[^\n]{0,4}?영역', t))
            if re.search(reg, head) or (pages >= 10 and len(areas) >= 3):   # 전 영역 통합본(영역 머리말 3개 이상)
                keep['영역 표기 불분명·통합본(유지)'] += 1; continue
            area_hdr = re.search(r'(언어|수리|외국어|국어|수학|영어|한국사|사회탐구|과학탐구)\s*영역', head)
            if area_hdr and nn(e['subject'])[:2] not in nn(area_hdr.group(0)) and not (e['subject'] == '국어' and '언어' in area_hdr.group(0)) \
               and not (e['subject'] == '수학' and '수리' in area_hdr.group(0)) and not (e['subject'] == '영어' and '외국어' in area_hdr.group(0)):
                clear(i, f, '다른 영역 파일 → 빼기'); continue
            keep['영역 표기 불분명·통합본(유지)'] += 1; continue
        if c['code'] == 'kind':
            has_sol = re.search('해설|출제\s*의도|풀이|평가\s*요소', t); has_ans = re.search('예시\s*답안|모범\s*답안|문항\s*카드|채점|평가\s*기준', t)
            if e['typeGroup'] == 'essay':
                if f == 'answerUrl':
                    if has_ans and has_sol: keep['논술 문항카드·예시답안(유지)'] += 1; continue
                    if not e.get('questionUrl'): move(i, f, 'questionUrl', '논술 문제지를 문제지 칸으로')
                    else: clear(i, f, '논술 정답 칸의 문제지 → 빼기')
                    continue
                if f == 'solutionUrl':
                    if has_sol or has_ans: keep['논술 해설·모범답안 있음(유지)'] += 1; continue
                    if not e.get('questionUrl'): move(i, f, 'questionUrl', '논술 문제지를 문제지 칸으로')
                    else: clear(i, f, '논술 해설 칸의 문제지 → 빼기')
                    continue
                if f == 'questionUrl':
                    if not e.get('solutionUrl'): move(i, f, 'solutionUrl', '논술 해설을 해설 칸으로')
                    else: keep['논술 문제지 칸 해설(해설 따로 있음, 유지)'] += 1
                    continue
            if f == 'questionUrl' and '정답' in c['msg']:
                pages = int(re.search(r'<<pages (\d+)>>', t).group(1)) if t else 0
                if pages >= 3: keep['문제+정답 합본(유지)'] += 1; continue
                if not e.get('answerUrl'): move(i, f, 'answerUrl', '정답표를 정답 칸으로')
                else: clear(i, f, '문제지 칸의 정답표 → 빼기')
                continue
            keep['해설 등 판단 보류(유지)'] += 1; continue
        if c['code'] in ('year', 'org') and f == 'scriptUrl':
            clear(i, f, '다른 시험 듣기 대본 → 빼기'); continue
        if c['code'] == 'org' and '교육청' in c['msg'] and f == 'solutionUrl':
            clear(i, f, '학평 해설이 붙은 평가원 시험 → 빼기'); continue
        keep['기타(유지)'] += 1

# ── 암호·빈 PDF → 빼기
for x in report['issues']:
    if x['code'] != 'broken': continue
    if re.search(r'es5_suwon_0(44|47|50|53|54)|es5_hanshin_033|es7_ajou_061|es_ajou_0(10|04|39|41)', x['url']):
        for i in x['ids']: clear(i, x['field'], '암호 걸림·빈 PDF → 빼기')

# 같은 칸에 두 번 손대지 않았는지
seen = Counter((p['id'], p['field']) for p in plan if p['field'] != '*')
dup = [k for k, v in seen.items() if v > 1]
assert not dup, dup
(ROOT / 'tmp/material-fix/plan_rest.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1))
print(len(plan), '항목'); [print(f'{v:4d}  {k}') for k, v in notes.most_common() if v]
print('-- 손대지 않음'); [print(f'{v:4d}  {k}') for k, v in keep.most_common()]
