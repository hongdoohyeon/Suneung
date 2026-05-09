#!/usr/bin/env python3
"""tmp/kice-extracted/ 의 추출된 PDF·MP3 → 우리 명명 규칙으로 정리.
영역·소과목별로 분리해 업로드 준비.
"""
import shutil, re, json
from pathlib import Path
from collections import defaultdict

SRC = Path('tmp/kice-extracted')
DST = Path('tmp/kice-upload')
DST.mkdir(parents=True, exist_ok=True)

# 영역 한글 → 우리 영문 키
SUBJECT_KEY = {
    '국어':'korean', '언어':'korean',
    '수학':'math',   '수리':'math',
    '영어':'english','외국어':'english',
    '한국사':'khistory',
    '사회탐구':'social', '과학탐구':'science',
    '직업탐구':'voc',
    '제2외국어':'second',
}

# 소과목 패턴 (사회/과학/직업/제2외국어)
SUB_KEY = {
    # 사회탐구
    '경제':'economics', '경제지리':'econ-geo', '국사':'history-old', '한국지리':'kor-geo',
    '세계사':'world-hist', '세계지리':'world-geo', '동아시아사':'easia-hist',
    '생활과윤리':'ethics-life', '윤리':'ethics', '윤리와사상':'ethics-thought',
    '사회문화':'sociology', '사회·문화':'sociology', '법과사회':'law-society',
    '법과정치':'law-politics', '정치':'politics', '한국근현대사':'korean-modern',
    # 과학탐구
    '물리':'phys', '물리1':'phys1', '물리2':'phys2',
    '화학':'chem', '화학1':'chem1', '화학2':'chem2',
    '생물':'bio', '생물1':'bio1', '생물2':'bio2', '생명과학1':'bio1', '생명과학2':'bio2',
    '지구과학':'earth', '지구과학1':'earth1', '지구과학2':'earth2',
    '지구과학Ⅰ':'earth1', '지구과학Ⅱ':'earth2',
    # 수학
    '가형':'a', '나형':'b',
    # 직업탐구
    '농업':'agriculture','상업':'commerce','공업':'industry','수산':'fishery',
    '가사':'home','정보':'info','컴퓨터':'computer','해사':'maritime',
}

ROUND_KEY = {'csat':'csat','june':'06','sept':'09','prelim':'prelim'}

def parse_filename(fn):
    """2013_수능_경제문제.pdf → ('경제', '문제')
       2013_6_언어_정답.pdf → ('언어', '정답')
       01-안내방송.mp3 → ('listen-intro', None)
    """
    if fn.endswith('.mp3'):
        return ('mp3-' + fn.replace('.mp3','').replace(' ',''), None)
    if fn.endswith('.zip'):
        return ('listen-zip', None)
    # PDF
    name = fn.replace('.pdf', '')
    # 2013_6_언어_정답 / 2013_수능_경제문제
    parts = re.split(r'[_]', name)
    # 마지막 토큰이 "문제"/"정답"/"듣기대본"/"정답표" 등
    last = parts[-1]
    is_answer = '정답' in last or '답' in last
    is_script = '대본' in last or '스크립트' in last
    sub = parts[-2] if len(parts) >= 2 else ''
    # 마지막 토큰에 소과목+자료타입 합쳐있으면 분리
    m = re.match(r'^(.+?)(문제|정답|문제지|정답표|대본|스크립트)$', last)
    if m:
        sub = m.group(1)
        is_answer = '정답' in m.group(2) or '답' in m.group(2)
        is_script = '대본' in m.group(2) or '스크립트' in m.group(2)
    return (sub, 'a' if is_answer else ('script' if is_script else 'q'))

records = []  # 시험 단위 매핑 결과

for year_dir in sorted(SRC.iterdir()):
    if not year_dir.is_dir(): continue
    year = year_dir.name
    for round_dir in sorted(year_dir.iterdir()):
        if not round_dir.is_dir(): continue
        rd = round_dir.name  # csat/june/sept
        for subj_dir in sorted(round_dir.iterdir()):
            if not subj_dir.is_dir(): continue
            kr_subj = subj_dir.name
            our_subj = SUBJECT_KEY.get(kr_subj, kr_subj)

            # 소과목별 그룹: {소과목: {q: path, a: path}}
            groups = defaultdict(dict)
            mp3_files = []
            listen_zips = []
            for f in sorted(subj_dir.iterdir()):
                if f.is_dir(): continue
                if f.suffix == '.mp3':
                    mp3_files.append(f); continue
                if f.suffix == '.zip':
                    listen_zips.append(f); continue
                if f.suffix != '.pdf': continue
                sub, kind = parse_filename(f.name)
                if not kind: continue
                if not sub: sub = '_'
                groups[sub][kind] = f

            # 단일 영역 (언어/수리/외국어): 그룹 1개 (sub='_')
            for sub, files in groups.items():
                sub_eng = SUB_KEY.get(sub, sub) if sub != '_' else None
                rec = {
                    'year': int(year),
                    'round': rd,
                    'subject': our_subj,
                    'sub': sub_eng,
                    'q_pdf': str(files.get('q')) if files.get('q') else None,
                    'a_pdf': str(files.get('a')) if files.get('a') else None,
                    'script_pdf': str(files.get('script')) if files.get('script') else None,
                }
                # 영어 듣기: 단일 영역의 외국어/언어에 mp3·zip 있을 수 있음
                if our_subj == 'english' and listen_zips and sub == '_':
                    rec['listen_zip'] = str(listen_zips[0])
                records.append(rec)

print(f'▣ 매핑 결과: {len(records)} 시험 단위\n')

# 통계
by_round = defaultdict(int)
for r in records:
    by_round[(r['year'], r['round'])] += 1
for k, n in sorted(by_round.items()):
    print(f'  {k[0]} {k[1]}: {n} 시험')

# JSON 저장
out = Path('data/kice-archive-mapping.json')
out.write_text(json.dumps(records, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
print(f'\n✓ 매핑: {out}')
