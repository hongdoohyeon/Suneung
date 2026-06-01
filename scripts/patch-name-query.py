#!/usr/bin/env python3
"""모든 Worker URL 에 ?name=<한글 파일명> 강제 + Download 필드 정규화.

원인:
1. 사탐/과탐 영역별 카드 매핑 과정에서 일부 URL이 ?name= 없이 박혔다 (1,125건).
   워커는 ?name= 없으면 Content-Disposition 을 'download.pdf' 로 응답하므로
   브라우저가 'download.pdf' 영문 파일명을 받는다.
2. 기존 *Download 필드 다수가 `2026학년도_csat_국어_q.pdf` 같이 영어 type/underscore
   섞인 비-사용자친화 형식 → 사용자에게 노출되면 안 됨.

처리:
- 모든 entry 의 *Download 필드를 entry 메타로부터 자연스러운 한글명으로 재생성.
- 모든 worker URL 에 ?name=<재생성된 한글명> 인코딩해 박음.
- 이미 ?name= 박힌 URL도 새 이름으로 재인코딩 (일관성).
"""
from __future__ import annotations
import json, shutil, sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'exams.json'

WORKER_HOST = 'workers.dev'

URL_DL_PAIRS = [
    ('questionUrl',     'questionDownload',     'q'),
    ('questionUrlEven', 'questionDownloadEven', 'qE'),
    ('answerUrl',       'answerDownload',       'a'),
    ('answerUrlEven',   'answerDownloadEven',   'aE'),
    ('solutionUrl',     'solutionDownload',     's'),
    ('listenUrl',       'listenDownload',       'l'),
    ('scriptUrl',       'scriptDownload',       't'),
]

# entry 메타로부터 자연스러운 한글 파일명 재구성 (build-data.py 의 korean_filename 과 동일 규약)
KOREAN_TYPE = {
    'csat': '수능', 'june': '6모', 'sept': '9모', 'prelim': '예비시험',
    'mar': '3월 학력평가', 'apr': '4월 학력평가', 'may': '5월 학력평가',
    'jun': '6월 학력평가', 'jul': '7월 학력평가', 'sep': '9월 학력평가',
    'oct': '10월 학력평가', 'nov': '11월 학력평가',
    'military_annual': '사관학교 1차', 'police_annual': '경찰대학 1차',
    'leet': 'LEET', 'meet': 'MEET',
}
DOC_LABEL = {
    'q':  '문제지',
    'qE': '문제지(짝수형)',
    'a':  '정답',
    'aE': '정답(짝수형)',
    's':  '해설',
    'l':  '듣기',
    't':  '듣기 스크립트',
}


def is_reference(item: dict) -> bool:
    """KICE 공식 통계 같은 reference entry — 기존 파일명 그대로 보존."""
    return (item.get('curriculum') == 'reference'
            or item.get('typeGroup')  == 'reference'
            or item.get('gradeYear')  == 9999)


def url_extension(url: str | None) -> str | None:
    """URL 의 path 끝 확장자 (?query 제외) — '.pdf' / '.mp3' / '.hwp' 등."""
    if not url:
        return None
    path = url.split('?', 1)[0]
    if '.' not in path.rsplit('/', 1)[-1]:
        return None
    return '.' + path.rsplit('.', 1)[-1].lower()


def korean_filename(item: dict, doc: str, url: str | None = None) -> str | None:
    """entry 메타로부터 사용자친화 한글 파일명 생성.

    예: '2026학년도 수능 국어 문제지.pdf'
        '2026년 3월 학력평가 영어 듣기.mp3'
        '2028예비 통합사회 문제지.pdf'
        '2026 LEET 언어이해 문제지.pdf'

    reference entry 는 None 반환 → 기존 파일명 보존 트리거.
    """
    if is_reference(item):
        return None

    gy = item.get('gradeYear')
    type_key = item.get('type') or ''
    group = item.get('typeGroup') or ''
    is_edu = group == 'education'
    is_prelim_year = (gy == 'preliminary'
                      or item.get('curriculum') == '예비'
                      or type_key == 'prelim')

    if is_prelim_year:
        if isinstance(gy, int):
            year_part = f"{gy}예비"          # '2028예비'
        elif item.get('examYear'):
            year_part = f"{item['examYear']}예비"
        else:
            year_part = '예비'
        type_label = ''                       # '2028예비 예비시험 ...' 중복 회피
    elif is_edu:
        year_part = f"{item.get('examYear') or gy}년"
        type_label = KOREAN_TYPE.get(type_key, '')
    elif group in ('leet', 'meet'):
        # LEET/MEET 도 학년도(gradeYear) 기준 표기 — '2026학년도 LEET ...'
        year_part = f"{gy}학년도" if isinstance(gy, int) else f"{item.get('examYear') or gy}"
        type_label = KOREAN_TYPE.get(type_key, '') or group.upper()
    else:
        year_part = f"{gy}학년도"
        type_label = KOREAN_TYPE.get(type_key, '')

    subj = item.get('subject') or ''
    sub = item.get('subSubject')
    # subject 와 subSubject 가 동일하면 (예: 사회탐구·사회탐구) 중복 제거
    subject_part = f"{subj}({sub})" if (sub and sub != subj) else subj
    doc_label = DOC_LABEL.get(doc, '')

    parts = [p for p in (year_part, type_label, subject_part, doc_label) if p]
    # 확장자는 URL 의 실제 파일 확장자 우선 — .hwp 가 .pdf 로 박히는 미스매치 방지
    ext = url_extension(url) or ('.mp3' if doc == 'l' else '.pdf')
    return ' '.join(parts) + ext


def is_worker_url(url: str | None) -> bool:
    return bool(url and WORKER_HOST in url)


def url_without_name(url: str) -> str:
    """기존 ?name=... 쿼리 제거 후 base URL 반환."""
    if '?name=' in url:
        return url.split('?name=', 1)[0]
    if '&name=' in url:
        # ?other=...&name=... 처리 (현재 없지만 안전)
        head, _, tail = url.partition('&name=')
        return head
    return url


def attach_name(url: str, korean_name: str) -> str:
    base = url_without_name(url)
    sep = '&' if '?' in base else '?'
    return f'{base}{sep}name={quote(korean_name, safe="")}'


def main() -> int:
    data = json.loads(DATA.read_text(encoding='utf-8'))

    url_updated = 0
    dl_updated = 0
    skipped = 0

    for item in data:
        for url_key, dl_key, doc in URL_DL_PAIRS:
            url = item.get(url_key)
            if not is_worker_url(url):
                continue

            new_name = korean_filename(item, doc, url)
            if new_name is None:
                # reference entry — 기존 Download 명 보존, URL 의 ?name= 도 그대로
                # 단 ?name= 자체가 없으면 기존 Download 로라도 박아준다.
                existing = item.get(dl_key)
                if existing and '?name=' not in url and '&name=' not in url:
                    item[url_key] = attach_name(url, existing)
                    url_updated += 1
                continue
            if new_name.strip() in ('.pdf', '.mp3'):
                skipped += 1
                continue

            old_dl = item.get(dl_key)
            if old_dl != new_name:
                item[dl_key] = new_name
                dl_updated += 1

            new_url = attach_name(url, new_name)
            if new_url != url:
                item[url_key] = new_url
                url_updated += 1

    print(f'URL updated:      {url_updated}')
    print(f'Download updated: {dl_updated}')
    print(f'skipped:          {skipped}')

    if '--write' in sys.argv:
        backup = DATA.with_suffix('.json.bak-name-patch')
        if not backup.exists():
            shutil.copy2(DATA, backup)
        DATA.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        print(f'wrote {DATA.relative_to(ROOT)}')
    else:
        print('(dry-run — pass --write to apply)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
