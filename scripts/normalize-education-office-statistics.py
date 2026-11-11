#!/usr/bin/env python3
"""교육청 공식 통계표의 모든 시트를 손실 없이 CSV로 내보낸다."""

import csv
import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/education-office/2026"
OUT = ROOT / "data/raw/education-office/normalized"

SOURCES = [
    ("2026_03_g1", "2026_03_g1_statistics.xlsx", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3367515&mi=10910"),
    ("2026_03_g2", "2026_03_g2_statistics.xlsx", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3367515&mi=10910"),
    ("2026_03_g3", "2026_03_g3_statistics.xlsx", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3367515&mi=10910"),
    ("2026_05_g3", "2026_05_g3_statistics.xls", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3374294&mi=10910"),
    ("2026_06_g1", "2026_06_g1_statistics_scoring.zip", "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20260619151912082&q_bbsSn=1036"),
    ("2026_06_g2", "2026_06_g2_statistics_scoring.zip", "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20260619151953010&q_bbsSn=1036"),
    ("2026_07_g3", "2026_07_g3_statistics.xlsx", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?bbsId=1703&mi=10910&nttSn=3378755"),
    ("2026_09_g1", "2026_09_g1_statistics.xls", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3384863&mi=10910"),
    ("2026_09_g2", "2026_09_g2_statistics.xls", "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3384863&mi=10910"),
    ("2026_10_g1", "2026_10_g1_statistics.xlsx", "https://www.sen.go.kr/user/bbs/BD_selectBbsList.do?q_bbsSn=1036"),
    ("2026_10_g2", "2026_10_g2_statistics.xlsx", "https://www.sen.go.kr/user/bbs/BD_selectBbsList.do?q_bbsSn=1036"),
    ("2026_10_g3", "2026_10_g3_statistics.xlsx", "https://www.sen.go.kr/user/bbs/BD_selectBbsList.do?q_bbsSn=1036"),
]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def workbook_path(source, temp_dir):
    if source.suffix == ".xlsx":
        return source
    input_path = source
    if source.suffix == ".zip":
        with zipfile.ZipFile(source) as archive:
            member = next((name for name in archive.namelist() if name.lower().endswith(".xls")), None)
            if not member:
                raise RuntimeError(f"통계 XLS가 없습니다: {source}")
            input_path = temp_dir / f"{source.stem}.xls"
            input_path.write_bytes(archive.read(member))
    subprocess.run(
        ["soffice", "--headless", "--convert-to", "xlsx", "--outdir", str(temp_dir), str(input_path)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    converted = temp_dir / f"{input_path.stem}.xlsx"
    if not converted.exists():
        raise RuntimeError(f"XLSX 변환 실패: {source}")
    return converted


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    manifest = {"schemaVersion": 1, "checkedAt": "2026-09-20", "owner": "시도교육청", "exams": []}

    with tempfile.TemporaryDirectory(prefix="edu-stats-") as temp:
        temp_dir = Path(temp)
        for exam_key, filename, source_page in SOURCES:
            source = RAW / filename
            book = load_workbook(workbook_path(source, temp_dir), read_only=True, data_only=True)
            exam_dir = OUT / exam_key
            exam_dir.mkdir()
            sheets = []
            for index, sheet in enumerate(book.worksheets, 1):
                csv_path = exam_dir / f"sheet-{index:02d}.csv"
                with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
                    writer = csv.writer(stream)
                    writer.writerows(sheet.iter_rows(values_only=True))
                sheets.append({
                    "title": sheet.title,
                    "file": str(csv_path.relative_to(OUT.parent)),
                    "rows": sheet.max_row,
                    "columns": sheet.max_column,
                    "sha256": sha256(csv_path),
                })
            manifest["exams"].append({
                "examKey": exam_key,
                "sourcePage": source_page,
                "sourceFile": str(source.relative_to(ROOT)),
                "sourceSha256": sha256(source),
                "sheets": sheets,
            })

    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(SOURCES)}개 시험 · {sum(len(exam['sheets']) for exam in manifest['exams'])}개 시트 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
