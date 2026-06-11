#!/usr/bin/env python3
"""대학 논술 기출 1차(5개교) exams.json surgical append (1회성).

입력: /tmp/essay_manifest.json — essay-v1 릴리즈 자산 161건
      [{uni, name(원본 한글 파일명), url(원 출처), asset(es_*.pdf)}]
출력: exams.json 에 typeGroup 'essay' entry 추가.
      subject=대학명, subSubject=계열/과목, 파일은 워커 프록시 경유.
      원 출처 URL 은 {field}_source_original 로 보존.

이후 반드시 `python3 scripts/render-site.py` 로 산출물 동기화할 것.
"""
import json
import re
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = 'https://suneung-files.hdh061224.workers.dev'
UNI_LABEL = {'korea': '고려대학교', 'yonsei': '연세대학교', 'sogang': '서강대학교',
             'skku': '성균관대학교', 'cau': '중앙대학교'}

CAU_TRACK = {'jy1': '자연1', 'jy2': '자연2', 'gy': '경영경제', 'im': '인문사회',
             'j1': '자연1', 'j2': '자연2', 'g': '경영경제', 'i': '인문사회',
             'j': '자연', 'b': '경영경제'}


def parse(uni: str, name: str):
    """파일명 → (gradeYear, mock, track, kind) — kind: q/a/sol. None = 제외."""
    n = name.replace('.pdf', '').strip()
    if uni == 'yonsei':
        m = re.match(r'(\d{4})학년도 연세대 (모의)?논술_(.+?) (문제|해설,답안|해설|출제의도|답안)$', n)
        if not m: return None
        kind = {'문제': 'q', '해설,답안': 'sol', '해설': 'sol', '출제의도': 'a', '답안': 'a'}[m.group(4)]
        return int(m.group(1)), bool(m.group(2)), m.group(3), kind
    if uni == 'sogang':
        m = re.match(r'(\d{4})학년도 서강대 논술_(.+?) 문제,\s*답안$', n)
        if m: return int(m.group(1)), False, m.group(2), 'q'
        m = re.match(r'(\d{4})학년도\s*서강대학교?\s*모의논술\s*자료집_(\d차)_(.+?)(?:\(수정\))?$', n)
        if m: return int(m.group(1)), True, f'{m.group(3)} {m.group(2)}', 'q'
        m = re.match(r'(\d{4})학년도 서강대 모의논술(2차)?_(.+?) 문제,\s*답안$', n)
        if m: return None  # 공식 자료집과 중복 — 제외
        if '논술가이드북' in n:
            return 2026, False, '논술가이드북(기출·해설 수록)', 'q'
        return None
    if uni == 'skku':
        m = re.match(r'\[성균관대\] (\d{4})학년도 논술\S*전형 기출문항$', n)
        if m: return int(m.group(1)), False, None, 'q'
        m = re.match(r'(\d{4})학년도 논술우수 (\d)교시 문제-(\S+)$', n)
        if m: return int(m.group(1)), False, f'{m.group(3)} {m.group(2)}교시', 'q'
        m = re.match(r'(\d{4})(?:학년도)?\s*(?:성균관대학교\s*)?모의논술 (문제지|해설지)[_-]\s*(.+)$', n)
        if m:
            kind = 'q' if m.group(2) == '문제지' else 'sol'
            return int(m.group(1)), True, m.group(3).replace(' ', ''), kind
        return None
    if uni == 'korea':
        m = re.match(r'(\d{4})년 고려대학교 모의논술 출제의도 및 문항해설\((\S+)\)$', n)
        if m: return int(m.group(1)) + 1, True, m.group(2), 'q'
        m = re.match(r'(\d{4})학년도 고려대학교 선행학습 영향평가', n)
        if m: return int(m.group(1)), False, '기출 수록 선행학습 보고서', 'q'
        return None
    if uni == 'cau':
        m = re.match(r'(?:cau_)?(\d{4})_(?:cau_ns|s_n)_([a-z]+\d?)(?:_(\d))?$', n)
        if not m: return None
        track = CAU_TRACK.get(m.group(2), m.group(2))
        if m.group(3): track = f'{track}({m.group(3)})'
        return int(m.group(1)), False, track, 'q'
    return None


def main() -> None:
    manifest = json.load(open('/tmp/essay_manifest.json'))
    groups: dict[tuple, dict] = {}
    skipped = []
    for x in manifest:
        p = parse(x['uni'], x['name'])
        if not p:
            skipped.append((x['uni'], x['name']))
            continue
        gy, mock, track, kind = p
        key = (x['uni'], gy, mock, track)
        g = groups.setdefault(key, {})
        g.setdefault(kind, []).append(x)

    path = ROOT / 'data' / 'exams.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    next_id = max(e['id'] for e in data) + 1

    KIND_FIELD = {'q': 'questionUrl', 'a': 'answerUrl', 'sol': 'solutionUrl'}
    KIND_DL = {'q': 'questionDownload', 'a': 'answerDownload', 'sol': 'solutionDownload'}
    KIND_LABEL = {'q': '문제', 'a': '답안·출제의도', 'sol': '해설'}

    added = []
    for (uni, gy, mock, track), files in sorted(groups.items()):
        uni_full = UNI_LABEL[uni]
        lbl = '모의논술' if mock else '논술'
        e = {
            'id': next_id,
            'curriculum': '논술',
            'gradeYear': gy,
            'examYear': gy - 1,
            'month': 8 if mock else 12,
            'typeGroup': 'essay',
            'type': 'essay_mock' if mock else 'essay_annual',
            'studentGrade': None,
            'subject': uni_full,
            'subSubject': track,
            'questionUrl': None, 'answerUrl': None, 'solutionUrl': None,
            'questionDownload': None, 'answerDownload': None, 'solutionDownload': None,
            'source': 'essay-v1',
        }
        for kind, items in files.items():
            x = items[0]   # kind 당 1파일 (충돌 시 첫 번째)
            if len(items) > 1:
                print('  ⚠️ kind 중복:', uni, gy, track, kind, [i['name'][:40] for i in items])
            tp = f' {track}' if track else ''
            dl = f'{gy}학년도 {uni_full} {lbl}{tp} {KIND_LABEL[kind]}.pdf'
            e[KIND_FIELD[kind]] = (f'{WORKER}/essay-v1/{x["asset"]}'
                                   f'?name={urllib.parse.quote(dl)}')
            e[KIND_DL[kind]] = dl
            e[f'{KIND_FIELD[kind]}_source_original'] = x['url']
        if not e['questionUrl'] and e['solutionUrl']:
            pass  # 해설만 있는 entry 도 허용 (questionUrl null 허용 스키마)
        added.append(e)
        next_id += 1

    data.extend(added)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    from collections import Counter
    print(f'추가 entry {len(added)}건 (총 {len(data)}) — 대학별:',
          dict(Counter(e["subject"] for e in added)))
    if skipped:
        print(f'제외 {len(skipped)}건:')
        for u, n in skipped: print('  -', u, n[:60])


if __name__ == '__main__':
    main()
