#!/usr/bin/env python3
"""Render a small first-page image from the newest available PDF in each exam family."""

import concurrent.futures
import hashlib
import json
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'loading-previews'
EXAMS = json.loads((ROOT / 'data/exams.json').read_text())


def family(exam):
    group = exam.get('typeGroup')
    detail = ''
    if group == 'education':
        detail = exam.get('studentGrade') or ''
    elif group == 'ged':
        detail = exam.get('curriculum') or ''
    elif group == 'essay':
        subject = str(exam.get('subSubject') or '')
        natural = bool(re.search('자연|수학|공학|의약|의예|약학|과학|물리|화학|생명', subject))
        human = bool(re.search('인문|사회|상경|경영|경제|국어|언어|체육', subject))
        detail = '통합' if natural and human else '자연' if natural else '인문' if human else '기타'
    return '|'.join(map(str, (group or '', detail, exam.get('subject', ''))))


def recency(exam):
    year = exam.get('gradeYear')
    return (exam.get('type') != 'prelim', int(year) if str(year).isdigit() else 0,
            int(exam.get('examYear') or 0), int(exam.get('month') or 0),
            int(exam.get('id') or 0))


def render_pdf(source, target):
    with tempfile.TemporaryDirectory(prefix='kicegg-preview-') as scratch:
        prefix = Path(scratch) / 'page'
        result = subprocess.run([
            'pdftoppm', '-f', '1', '-l', '1', '-singlefile', '-scale-to', '720',
            '-jpeg', '-jpegopt', 'quality=48,optimize=y', str(source), str(prefix),
        ], capture_output=True, text=True, timeout=35)
        image = prefix.with_suffix('.jpg')
        if result.returncode != 0 or not image.exists():
            raise RuntimeError(result.stderr.strip() or 'PDF first page could not be rendered')
        target.write_bytes(image.read_bytes())


def create_one(item):
    key, candidates = item
    target = OUTPUT / (hashlib.sha1(key.encode()).hexdigest()[:16] + '.jpg')
    errors = []
    for exam in candidates[:5]:
        exam_id = exam['id']
        local = list((ROOT / 'work').glob(f'**/exam-{exam_id}.pdf'))
        try:
            if local:
                render_pdf(local[0], target)
            else:
                with tempfile.TemporaryDirectory(prefix='kicegg-source-') as scratch:
                    source = Path(scratch) / 'source.pdf'
                    req = urllib.request.Request(exam['questionUrl'], headers={'User-Agent': 'KICEGG-preview-builder/1.0'})
                    with urllib.request.urlopen(req, timeout=20) as response, source.open('wb') as out:
                        while chunk := response.read(1024 * 1024):
                            out.write(chunk)
                            if out.tell() > 25 * 1024 * 1024:
                                raise RuntimeError('PDF exceeds 25 MB')
                    render_pdf(source, target)
            return key, {'image': f'loading-previews/{target.name}', 'examId': exam_id}, None
        except Exception as error:
            errors.append(f'{exam_id}: {error}')
    return key, None, errors


def main():
    groups = {}
    for exam in EXAMS:
        url = str(exam.get('questionUrl') or '').split('?')[0].lower()
        if exam.get('typeGroup') == 'reference' or not url.endswith('.pdf'):
            continue
        groups.setdefault(family(exam), []).append(exam)
    for candidates in groups.values():
        candidates.sort(key=recency, reverse=True)
    OUTPUT.mkdir(exist_ok=True)
    previews = {}
    failures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for key, result, errors in pool.map(create_one, sorted(groups.items())):
            if result:
                previews[key] = result
            else:
                failures[key] = errors
            print(f'{len(previews) + len(failures)}/{len(groups)} {key}: {"ok" if result else "failed"}', flush=True)
    module = 'export const LOADING_PREVIEWS = ' + json.dumps(previews, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'lib/loading-previews.js').write_text(module)
    used = {Path(value['image']).name for value in previews.values()}
    for image in OUTPUT.glob('*.jpg'):
        if image.name not in used and re.fullmatch(r'[0-9a-f]{16}\.jpg', image.name):
            image.unlink()
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2))
        raise SystemExit(f'{len(failures)} preview families failed')


if __name__ == '__main__':
    main()
