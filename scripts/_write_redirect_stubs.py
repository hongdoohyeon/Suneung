#!/usr/bin/env python3
"""제거된 시험 페이지 URL → 통합 페이지 리다이렉트 스텁 생성 (1회성).

중복 정리(657건)와 과거 빌드 잔재(33건)로 exams.json에서 빠진 id의
exam-{id}.html 이 렌더에서 삭제되어 404가 된다. 검색엔진에 색인됐거나
외부에서 링크된 URL일 수 있으므로 meta refresh + canonical 스텁으로
대체한다 (GitHub Pages는 서버 리다이렉트 불가).

입력: /tmp/dedupe_map.json {donor_id: keeper_id},
      /tmp/orphan_titles.json [(id, title), ...] (1차 dedupe 후 캡처본)
"""
import json
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location(
    'build_data', ROOT / 'scripts' / 'build-data.py')
bd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bd)

STUB = '''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <link rel="canonical" href="https://kicegg.com/{target}" />
  <meta http-equiv="refresh" content="0;url=/{target}" />
  <title>{title} — 기출해체분석기</title>
</head>
<body>
  <p>이 자료는 <a href="/{target}">통합 페이지</a>로 이동했습니다.</p>
</body>
</html>
'''


def main() -> None:
    data = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    ids = {e['id'] for e in data}
    title_to_id = {}
    for e in data:
        title_to_id.setdefault(bd.build_exam_meta(e)['title'], e['id'])

    dedupe_map = json.loads(Path('/tmp/dedupe_map.json').read_text())
    orphans = json.loads(Path('/tmp/orphan_titles.json').read_text())

    targets: dict[int, tuple[str, str]] = {}  # id -> (target file, label)
    for donor, keeper in dedupe_map.items():
        if keeper in ids:
            targets[int(donor)] = (f'exam-{keeper}.html', '통합 페이지로 이동')
    unmatched = []
    for oid, title in orphans:
        if oid in targets or oid in ids:
            continue
        tid = title_to_id.get(title)
        if tid:
            targets[oid] = (f'exam-{tid}.html', '통합 페이지로 이동')
        else:
            targets[oid] = ('archive.html', '기출 검색으로 이동')
            unmatched.append((oid, title))

    written = 0
    for oid, (target, _) in targets.items():
        p = ROOT / f'exam-{oid}.html'
        if p.exists():  # 살아있는 페이지는 건드리지 않음 (안전망)
            print('  skip(존재):', p.name)
            continue
        p.write_text(STUB.format(target=target, title='페이지 이동'), encoding='utf-8')
        written += 1
    print(f'스텁 생성 {written}건 (제목 미매칭 → archive 폴백 {len(unmatched)}건)')
    for oid, t in unmatched[:8]:
        print('  폴백:', oid, t)


if __name__ == '__main__':
    main()
