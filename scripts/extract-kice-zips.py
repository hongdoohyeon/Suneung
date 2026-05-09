#!/usr/bin/env python3
"""tmp/kice-zips/ 에 받은 ZIP들 풀기 + cp949 → utf-8 인코딩 fix.
영역별 PDF/MP3 분리해서 tmp/kice-extracted/ 로.
"""
import zipfile, sys
from pathlib import Path

SRC = Path('tmp/kice-zips')
DST = Path('tmp/kice-extracted')
DST.mkdir(parents=True, exist_ok=True)

def fix_name(raw_bytes):
    """ZIP 안 한글 파일명: cp437로 잘못 디코딩된 cp949 바이트 → 정상 utf-8."""
    if isinstance(raw_bytes, str):
        try:
            return raw_bytes.encode('cp437').decode('cp949')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return raw_bytes
    return raw_bytes

def main():
    zips = sorted(SRC.glob('*.zip'))
    print(f'▣ ZIP {len(zips)}개 처리\n')

    for zp in zips:
        # 파일명에서 학년도/회차/영역 파싱: 2013_csat_언어_e840925a.zip
        name = zp.stem
        parts = name.split('_', 3)
        if len(parts) < 4:
            print(f'  스킵 (이름 패턴 X): {name}')
            continue
        year, t, subject, _ = parts
        out_dir = DST / year / t / subject
        out_dir.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(zp, 'r') as zf:
                for info in zf.infolist():
                    fixed = fix_name(info.filename)
                    target = out_dir / fixed
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if info.is_dir(): continue
                    target.write_bytes(zf.read(info))
            n = len(list(out_dir.iterdir()))
            print(f'  ✓ {year}/{t}/{subject}: {n}개')
        except Exception as e:
            print(f'  ✗ {zp.name}: {e}')

    # 직접 PDF 들도 분류
    pdfs = sorted(SRC.glob('*.pdf'))
    for p in pdfs:
        parts = p.stem.split('_', 3)
        if len(parts) < 4: continue
        year, t, subject, _ = parts
        out_dir = DST / year / t / subject
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / p.name
        if not target.exists():
            target.write_bytes(p.read_bytes())
    print(f'  + 단일 PDF {len(pdfs)}개 분류')

    # 트리 요약
    print('\n▣ 추출 결과')
    for year_dir in sorted(DST.iterdir()):
        if not year_dir.is_dir(): continue
        n_files = sum(1 for _ in year_dir.rglob('*') if _.is_file())
        print(f'  {year_dir.name}: {n_files} files')

if __name__ == '__main__':
    main()
