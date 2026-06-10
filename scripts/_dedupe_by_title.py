#!/usr/bin/env python3
"""렌더된 제목 기준 2차 중복 제거 (1회성).

1차(_dedupe_kice_archive.py)는 필드 키로 매칭했지만, savetest 인제스트가
curriculum 을 '2009'/'2007개정' 등으로 다르게 기록한 쌍(사관·경찰대·LEET·
평가원 ~110쌍)은 키가 어긋나 남았다. 사용자에게 보이는 진실은 페이지 제목이
같다는 것이므로, 제목 그룹에서 '원본(BUILD, source 없음) 1 + 인제스트 donor'
패턴만 병합·제거한다. 원본끼리 제목이 겹치는 경우(LEET 예비/본시험)는
건드리지 않고 제목 생성기 수정으로 해결한다.
"""
import json
import collections
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location(
    'build_data', ROOT / 'scripts' / 'build-data.py')
bd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bd)
URL_FIELDS = ('questionUrl', 'answerUrl', 'solutionUrl', 'scriptUrl', 'listenUrl',
              'questionUrlEven', 'answerUrlEven')
PAIRED = {
    'questionUrl': 'questionDownload', 'answerUrl': 'answerDownload',
    'solutionUrl': 'solutionDownload', 'scriptUrl': 'scriptDownload',
    'listenUrl': 'listenDownload',
    'questionUrlEven': 'questionDownloadEven', 'answerUrlEven': 'answerDownloadEven',
}


def main() -> None:
    path = ROOT / 'data' / 'exams.json'
    data = json.loads(path.read_text(encoding='utf-8'))

    # 디스크 파일 대신 표준 제목 생성기(build_exam_meta)로 그룹핑 —
    # 렌더 전이라도 동작하고, 제목 생성기 수정이 즉시 반영된다.
    titles = collections.defaultdict(list)
    for e in data:
        titles[bd.build_exam_meta(e)['title']].append(e)

    donor_to_keeper: dict[int, int] = {}
    merged = 0
    skipped = []
    for t, es in titles.items():
        if len(es) < 2:
            continue
        keepers = [e for e in es if e.get('source') is None]
        donors = [e for e in es if e.get('source') is not None]
        if len(keepers) != 1 or not donors:
            skipped.append((t, [(e['id'], e.get('source')) for e in es]))
            continue
        keeper = keepers[0]
        for d in donors:
            for f in URL_FIELDS:
                if not keeper.get(f) and d.get(f):
                    keeper[f] = d[f]
                    dl = PAIRED.get(f)
                    if dl and d.get(dl):
                        keeper[dl] = d[dl]
                    merged += 1
            donor_to_keeper[d['id']] = keeper['id']

    before = len(data)
    data = [e for e in data if e['id'] not in donor_to_keeper]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                    encoding='utf-8')
    map_path = Path('/tmp/dedupe_map.json')
    all_map = json.loads(map_path.read_text()) if map_path.exists() else {}
    all_map.update({str(k): v for k, v in donor_to_keeper.items()})
    map_path.write_text(json.dumps(all_map))
    print(f'2차 중복 제거: {before} → {len(data)} (donor {len(donor_to_keeper)}), '
          f'병합 필드 {merged}건, 보류 그룹 {len(skipped)}건')
    for t, info in skipped[:6]:
        print('  보류:', t, info)


if __name__ == '__main__':
    main()
