"""평가원 탐구 문제지·정답 바로잡기 계획 — ~/Workspace/kice_archive/refetch/out 의 재수집 원본(과목별 q/a)으로
검수(report.json)에서 틀린 것으로 나온 문제지·정답 칸, 그리고 비어 있던 정답 칸을 채운다.
python3 scripts/material-audit/fix_kice_tamgu.py  → tmp/material-fix/plan_kice.json (적용은 apply_fix.py)"""
import json, re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
REF = Path.home() / 'Workspace/kice_archive/refetch/out'
TAG = 'kice-fix-v1'
WORKER = 'https://suneung-files.hdh061224.workers.dev'
TYPE = {'june': 'mock06', 'sept': 'mock09', 'csat': 'csat', 'prelim': 'prelim'}
TYPE_KO = {'june': '6모', 'sept': '9모', 'csat': '수능', 'prelim': '예시문항'}
GROUP = {'과학탐구': 'science', '사회탐구': 'social', '통합과학': 'science', '통합사회': 'social'}

def norm(s):
    s = re.sub(r'[\s·･ㆍ()（）\[\]<>_]', '', s or '')
    s = re.sub(r'(II|Ⅱ|2)(?=\.|$|[^0-9])', 'Ⅱ', s); s = re.sub(r'(I|Ⅰ|1)(?=\.|$|[^0-9])', 'Ⅰ', s)
    return {'법과정치': '정치와법', '사회문화': '사회·문화'}.get(s.replace('사회문화', '사회·문화'), s.replace('사회문화', '사회·문화'))

exams = json.loads((ROOT / 'data/exams.json').read_text())
report = json.loads((ROOT / 'tmp/material-audit/report.json').read_text())
bad = {(i, x['field']) for x in report['issues'] if x['code'] not in ('label',) for i in x['ids']}

plan = []
for e in exams:
    if e.get('typeGroup') != 'suneung' or e.get('type') not in TYPE: continue
    d = REF / f"{e['gradeYear']}_{TYPE[e['type']]}"
    if not (d / 'manifest.json').exists(): continue
    subj = e['subSubject'] or (e['subject'] if e['subject'] in ('통합과학', '통합사회') else None)
    if e['type'] == 'prelim' and e['subject'] in ('과학탐구', '사회탐구'): subj = '통합과학' if e['subject'] == '과학탐구' else '통합사회'
    if e['subject'] not in GROUP and not subj: continue
    man = json.loads((d / 'manifest.json').read_text())
    pick = {m['kind']: m for m in man if norm(m['subject']) == norm(subj)}
    label = f"{e['gradeYear']}학년도 {TYPE_KO[e['type']]} {e['subject']}" + (f"({e['subSubject']})" if e['subSubject'] else '')
    base = f"{e['gradeYear']}_{TYPE[e['type']]}_{GROUP.get(e['subject'], 'x')}_{re.sub('[^a-z0-9]', '', (e.get('questionUrl') or '').split('?')[0].rsplit('/', 1)[-1].split('_q')[0].split('_')[-1]) or e['id']}"
    for field, kind, word in (('questionUrl', 'q', '문제지'), ('answerUrl', 'a', '정답')):
        m = pick.get(kind)
        if not m: continue
        need = (e['id'], field) in bad or (field == 'answerUrl' and not e.get('answerUrl'))
        if not need: continue
        asset = f"{base}_{kind}.pdf"
        dl = f"{label} {word}.pdf"
        plan.append({'id': e['id'], 'field': field, 'old': e.get(field), 'local': str(d / m['file']), 'asset': asset,
                     'new': f"{WORKER}/{TAG}/{asset}?name={quote(dl)}", 'downloadField': field.replace('Url', 'Download'), 'download': dl,
                     'why': 'audit' if (e['id'], field) in bad else 'fill-empty'})
# 같은 자산 이름이 서로 다른 파일을 가리키면 안 됨
seen = {}
for p in plan:
    assert seen.setdefault(p['asset'], p['local']) == p['local'], p['asset']
out = ROOT / 'tmp/material-fix/plan_kice.json'
out.write_text(json.dumps(plan, ensure_ascii=False, indent=1))
from collections import Counter
print(len(plan), '건', Counter((p['field'], p['why']) for p in plan))
