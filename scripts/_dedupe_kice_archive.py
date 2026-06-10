#!/usr/bin/env python3
"""kice-archive 인제스트가 만든 평가원 중복 426쌍 제거 (1회성).

같은 시험이 (원본 빌드: studentGrade null) + (kice-archive 인제스트:
studentGrade 3) 두 entry로 이중 등재되어, 동일 제목의 exam 페이지가
쌍으로 존재(SEO 중복)하고 아카이브 목록에도 두 번 노출되던 문제.

정책: 원본 빌드 entry(source 없음)를 keeper로 유지하고, donor(kice-archive)
에만 있는 파일 URL은 keeper로 병합한 뒤 donor entry를 제거한다.
donor의 exam-{id}.html 은 이후 redirect stub 으로 교체한다(별도 단계).

산출: /tmp/dedupe_map.json — {donor_id: keeper_id} (stub 생성용)
"""
import json
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
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

    groups = collections.defaultdict(list)
    for e in data:
        k = (e.get('gradeYear'), e.get('type'), e.get('subject'), e.get('subSubject'),
             e.get('examYear'), e.get('month'), e.get('typeGroup'), e.get('curriculum'))
        groups[k].append(e)

    donor_to_keeper: dict[int, int] = {}
    merged_fields = 0
    for k, es in groups.items():
        if len(es) != 2:
            continue
        srcs = {e.get('source') for e in es}
        sgs = {e.get('studentGrade') for e in es}
        # '원본(None) + 인제스트(kice-archive/savetest-mock), sg {3, None}' 패턴만
        if srcs not in ({None, 'kice-archive'}, {None, 'savetest-mock'}) or sgs != {3, None}:
            continue
        keeper = next(e for e in es if e.get('source') is None)
        donor = next(e for e in es if e.get('source') is not None)
        for f in URL_FIELDS:
            if not keeper.get(f) and donor.get(f):
                keeper[f] = donor[f]
                dl = PAIRED.get(f)
                if dl and donor.get(dl):
                    keeper[dl] = donor[dl]
                merged_fields += 1
        donor_to_keeper[donor['id']] = keeper['id']

    before = len(data)
    data = [e for e in data if e['id'] not in donor_to_keeper]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                    encoding='utf-8')
    map_path = Path('/tmp/dedupe_map.json')
    merged = json.loads(map_path.read_text()) if map_path.exists() else {}
    merged.update({str(k): v for k, v in donor_to_keeper.items()})
    map_path.write_text(json.dumps(merged))
    print(f'중복 제거: {before} → {len(data)} (donor {len(donor_to_keeper)}건), '
          f'keeper로 병합한 파일 필드 {merged_fields}건')


if __name__ == '__main__':
    main()
