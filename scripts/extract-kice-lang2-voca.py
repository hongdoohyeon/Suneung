#!/usr/bin/env python3
"""tmp/kice-zips-lang2-voca/ 풀기 + cp949 fix → tmp/kice-extracted-lang2-voca/

파일명 패턴: {gy}_{type}_{board}_{subject}_{hash}.{ext}

ZIP 안에는 같은 파일명(01 독일어Ⅰ.pdf)이 문제지/정답표에 둘 다 있어
출력 시 q/a 디렉토리로 분리 — 카탈로그에서 fileSeq → kind 매핑 lookup.
"""
import json, zipfile
from pathlib import Path

SRC = Path('tmp/kice-zips-lang2-voca')
DST = Path('tmp/kice-extracted-lang2-voca')
DST.mkdir(parents=True, exist_ok=True)

# fileSeq[:8] → 'q'/'a' 매핑 (카탈로그의 zip fileName 기준)
cat = json.load(open('data/kice-catalog.json'))
SEQ_KIND = {}
for board, posts in cat['boards'].items():
    for p in posts:
        for f in p.get('files', []):
            fname = f.get('fileName', '')
            seq = f.get('fileSeq', '')[:8]
            if not seq: continue
            if '문제' in fname:    SEQ_KIND[seq] = 'q'
            elif '정답' in fname:  SEQ_KIND[seq] = 'a'
            elif '해설' in fname:  SEQ_KIND[seq] = 'sol'
            elif '듣기' in fname:  SEQ_KIND[seq] = 'listen'


def fix_name(raw):
    if isinstance(raw, str):
        try:
            return raw.encode('cp437').decode('cp949')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return raw
    return raw


def parse(name: str):
    """2014_csat_csat_제2외국어_한문_a6b4c7c2 → (2014, csat, csat, 제2외국어/한문, a6b4c7c2)"""
    # rsplit 으로 hash 분리
    rest, hash_ = name.rsplit('_', 1)
    parts = rest.split('_', 3)
    if len(parts) < 4:
        return None
    gy, type_, board, subject = parts
    subject = subject.replace('_', '/')   # 제2외국어_한문 → 제2외국어/한문
    return gy, type_, board, subject, hash_


def main():
    zips = sorted(SRC.glob('*.zip'))
    pdfs = sorted(SRC.glob('*.pdf'))
    print(f'▣ ZIP {len(zips)} + 단일 PDF {len(pdfs)} 처리\n')

    for zp in zips:
        meta = parse(zp.stem)
        if not meta:
            print(f'  스킵 패턴X: {zp.name}')
            continue
        gy, type_, board, subject, hash_ = meta
        kind_dir = SEQ_KIND.get(hash_, 'misc')   # 문제지 ZIP=q, 정답표 ZIP=a
        out_dir = DST / gy / type_ / board / subject.replace('/', '_') / kind_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(zp, 'r') as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    fixed = fix_name(info.filename)
                    target = out_dir / fixed
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(zf.read(info))
            n = sum(1 for _ in out_dir.rglob('*') if _.is_file())
            print(f'  ✓ {gy}/{type_}/{board}/{subject}: {n}')
        except Exception as e:
            print(f'  ✗ {zp.name}: {e}')

    # 단일 PDF (보통 정답표 통합본) 분류 — kind 매핑
    for p in pdfs:
        meta = parse(p.stem)
        if not meta:
            continue
        gy, type_, board, subject, hash_ = meta
        kind_dir = SEQ_KIND.get(hash_, 'misc')
        out_dir = DST / gy / type_ / board / subject.replace('/', '_') / kind_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / p.name
        if not target.exists():
            target.write_bytes(p.read_bytes())

    # 요약
    print('\n▣ 결과')
    for gy_dir in sorted(DST.iterdir()):
        if gy_dir.is_dir():
            n = sum(1 for _ in gy_dir.rglob('*') if _.is_file())
            print(f'  {gy_dir.name}: {n}')


if __name__ == '__main__':
    main()
