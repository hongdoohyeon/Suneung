#!/usr/bin/env python3
"""t1.daumcdn.net(티스토리 CDN) 핫링크를 자체 미러로 교체 (1회성).

배경: 활성 URL 1,682건이 티스토리 첨부 CDN 직링크였음 — 원 게시자가 글을
지우면 즉시 404 (실제로 다운로드 중 1건이 이미 404). 전수 다운로드해
daum-mirror-v1(1,000)·v2(681) 릴리즈에 dm_{id}_{field}.{ext} 로 미러링함.

교체 규칙:
- .pdf → 워커 프록시 (?name=한글파일명 → 미리보기·CSP·다운로드명 모두 해결)
- .hwp → GitHub 직링크 (워커가 .hwp 거부. 미리보기는 원래 미지원 UI)
- 죽은 원본(404) → null (다운로드 버튼 비노출이 깨진 링크보다 낫다)
- 원본 URL은 {field}_daum_original 로 보존
"""
import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = 'https://suneung-files.hdh061224.workers.dev'
GH = 'https://github.com/hongdoohyeon/Suneung/releases/download'
DL_OF = {'questionUrl': 'questionDownload', 'answerUrl': 'answerDownload',
         'solutionUrl': 'solutionDownload', 'scriptUrl': 'scriptDownload',
         'listenUrl': 'listenDownload'}


def main() -> None:
    v1 = set(Path('/tmp/v1_assets.txt').read_text().split())
    mirror_dir = ROOT / 'tmp' / 'daum-mirror'
    local = {p.name for p in mirror_dir.iterdir()}

    data = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    swapped_pdf = swapped_hwp = nulled = 0
    for e in data:
        for f, dlf in DL_OF.items():
            u = e.get(f)
            if not u or 't1.daumcdn.net' not in u:
                continue
            ext = 'pdf'
            dl = e.get(dlf) or ''
            if dl.lower().endswith('.hwp'):
                ext = 'hwp'
            asset = f"dm_{e['id']}_{f}.{ext}"
            e[f'{f}_daum_original'] = u
            if asset not in local:
                e[f] = None          # 원본도 404 — 죽은 링크 제거
                nulled += 1
                continue
            tag = 'daum-mirror-v1' if asset in v1 else 'daum-mirror-v2'
            if ext == 'pdf':
                name = dl if dl.lower().endswith('.pdf') else (dl or asset)
                e[f] = f'{WORKER}/{tag}/{asset}?name={urllib.parse.quote(name)}'
                swapped_pdf += 1
            else:
                e[f] = f'{GH}/{tag}/{asset}'
                swapped_hwp += 1

    (ROOT / 'data' / 'exams.json').write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'PDF→워커 {swapped_pdf} / HWP→직링크 {swapped_hwp} / 죽은 링크 null {nulled}')


if __name__ == '__main__':
    main()
