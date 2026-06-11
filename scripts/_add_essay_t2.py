#!/usr/bin/env python3
"""대학 논술 기출 2차(10개교) exams.json surgical append (1회성).

입력: /tmp/essay_manifest2.json — essay-v1 릴리즈 추가 자산 600건
(레전드스터디 아카이브의 공식 PDF 사본 — 파일명 규약 "{학년도} {대학}
[수시 ][모의]논술_{계열} {자료종류}.pdf" 을 범용 파싱)
"""
import json
import re
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = 'https://suneung-files.hdh061224.workers.dev'
UNI_LABEL = {'hanyang': '한양대학교', 'khu': '경희대학교', 'ewha': '이화여자대학교',
             'hufs': '한국외국어대학교', 'uos': '서울시립대학교', 'konkuk': '건국대학교',
             'dongguk': '동국대학교', 'sookmyung': '숙명여자대학교',
             'inha': '인하대학교', 'ajou': '아주대학교',
             'catholic': '가톨릭대학교', 'hongik': '홍익대학교', 'dankook': '단국대학교',
             'sejong': '세종대학교', 'kw': '광운대학교', 'soongsil': '숭실대학교',
             'swu': '서울여자대학교', 'sungshin': '성신여자대학교', 'pusan': '부산대학교',
             'knu': '경북대학교', 'gachon': '가천대학교', 'kyonggi': '경기대학교',
             'kau': '한국항공대학교', 'seokyeong': '서경대학교', 'sangmyung': '상명대학교'}
KIND_WORDS = ('문제', '예시답안', '모범답안', '우수답안', '해설', '출제의도',
              '답안', '채점기준', '총평', '논술자료집', '가이드북')


def parse(name: str):
    n = name.rsplit('.', 1)[0].strip()
    # 가이드북·자료집 — 기출/모의 통합 수록물
    if re.search(r'논술(?:가이드북?|자료집)', n):
        m = re.match(r'^(\d{4})학년도', n)
        if not m:
            return None
        mock = '모의' in n
        label = '논술자료집' if '자료집' in n else '논술가이드북'
        return int(m.group(1)), mock, f'{label}(기출·해설 수록)', 'q', f'{label}'
    m = re.match(r'^(\d{4})학년도\s+\S+?[_\s]+(?:수시[_\s]+)?(모의\s*)?논술(?:기출)?(?:\([^)]*\))?[_\s]+(.+)$', n)
    if not m:
        # '성신 모의_인문 문제' 류 — '논술' 생략형
        m = re.match(r'^(\d{4})학년도\s+\S+?[_\s]+(모의)[_\s]+(.+)$', n)
    if not m:
        return None
    gy, mock, rest = int(m.group(1)), bool(m.group(2)), m.group(3).strip()
    # rest 에서 첫 자료종류 키워드 위치로 track / kind 분리
    idx = min((rest.find(w) for w in KIND_WORDS if w in rest), default=-1)
    if idx <= 0:
        track, kindstr = rest, '문제'   # 종류 미표기 → 문제로 간주
    else:
        track, kindstr = rest[:idx].strip(' _-,'), rest[idx:].strip()
    if not track:
        track = None
    if '문제' in kindstr:
        kind = 'q'
    elif '출제의도' in kindstr or '채점' in kindstr:
        kind = 'a'
    else:
        kind = 'sol'
    return gy, mock, track, kind, kindstr


def main() -> None:
    import sys
    manifest_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/essay_manifest2.json'
    tag = sys.argv[2] if len(sys.argv) > 2 else 'essay-v1'
    manifest = json.load(open(manifest_path))
    groups: dict[tuple, list] = {}
    skipped = []
    for x in manifest:
        p = parse(x['name'])
        if not p:
            skipped.append((x['uni'], x['name']))
            continue
        gy, mock, track, kind, kindstr = p
        groups.setdefault((x['uni'], gy, mock, track), []).append((kind, kindstr, x))

    path = ROOT / 'data' / 'exams.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    next_id = max(e['id'] for e in data) + 1

    F = {'q': ('questionUrl', 'questionDownload'),
         'a': ('answerUrl', 'answerDownload'),
         'sol': ('solutionUrl', 'solutionDownload')}

    added = []
    overflow_entries = 0
    for (uni, gy, mock, track), files in sorted(groups.items()):
        uni_full = UNI_LABEL[uni]
        lbl = '모의논술' if mock else '논술'

        def new_entry(tr):
            nonlocal next_id
            e = {'id': next_id, 'curriculum': '논술', 'gradeYear': gy, 'examYear': gy - 1,
                 'month': 8 if mock else 12, 'typeGroup': 'essay',
                 'type': 'essay_mock' if mock else 'essay_annual', 'studentGrade': None,
                 'subject': uni_full, 'subSubject': tr,
                 'questionUrl': None, 'answerUrl': None, 'solutionUrl': None,
                 'questionDownload': None, 'answerDownload': None, 'solutionDownload': None,
                 'source': 'essay-v1'}
            next_id += 1
            added.append(e)
            return e

        def put(e, slot, kindstr, x):
            uf, df = F[slot]
            tp = f' {track}' if track else ''
            dl = f'{gy}학년도 {uni_full} {lbl}{tp} {kindstr}.pdf'
            e[uf] = f'{WORKER}/{tag}/{x["asset"]}?name={urllib.parse.quote(dl)}'
            e[df] = dl
            e[f'{uf}_source_original'] = x['url']

        e = new_entry(track)
        # 슬롯 채우기: q 우선, 나머지는 a → sol 순. 넘치면 추가 entry.
        order = sorted(files, key=lambda t: {'q': 0, 'a': 1, 'sol': 2}[t[0]])
        for kind, kindstr, x in order:
            slot = None
            pref = {'q': ['questionUrl', 'answerUrl', 'solutionUrl'],
                    'a': ['answerUrl', 'solutionUrl'],
                    'sol': ['solutionUrl', 'answerUrl']}[kind]
            for cand in pref:
                if e[cand] is None:
                    slot = {'questionUrl': 'q', 'answerUrl': 'a', 'solutionUrl': 'sol'}[cand]
                    break
            if slot is None:
                e = new_entry(f'{track} (추가)' if track else '(추가)')
                overflow_entries += 1
                slot = kind
            put(e, slot, kindstr, x)

    data.extend(added)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    from collections import Counter
    print(f'추가 entry {len(added)}건 (overflow {overflow_entries}) — 총 {len(data)}')
    print('대학별:', dict(Counter(e["subject"] for e in added)))
    if skipped:
        print(f'파싱 실패 {len(skipped)}건:')
        for u, n in skipped[:15]: print('  -', u, n[:65])


if __name__ == '__main__':
    main()
