#!/usr/bin/env python3
"""검정고시 합본 PDF를 과목별 PDF와 재현 가능한 매니페스트로 분리한다."""

from __future__ import annotations

import argparse
import json
import subprocess
import urllib.request
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "sources"
WORKER = "https://suneung-files.hdh061224.workers.dev"
OUTPUT_DIR = ROOT / "output" / "pdf" / "ged-subjects"
CACHE_DIR = ROOT / "tmp" / "pdfs" / "ged-originals"
MANIFEST_PATH = SOURCE_DIR / "ged_subject_splits.json"

SUBJECT_SLUGS = {
    "국어": "kor",
    "수학": "math",
    "영어": "eng",
    "사회": "soc",
    "과학": "sci",
    "한국사": "his",
    "도덕": "ethics",
    "기술·가정": "tech_home",
    "체육": "pe",
    "음악": "music",
    "미술": "art",
    "정보": "info",
    "실과": "practical",
}

# 2013~2017 신당야학 스캔 합본의 실제 페이지 경계.
# 대표 원본을 렌더링해 확인했으며, 같은 시리즈 30권은 페이지 수가 모두 동일하다.
LEGACY_RANGES = {
    "초졸": [
        ("국어", 1, 2),
        ("영어", 3, 4),
        ("수학", 5, 6),
        ("사회", 7, 8),
        ("과학", 9, 10),
        ("도덕", 11, 12),
    ],
    "중졸": [
        ("국어", 1, 4),
        ("영어", 5, 6),
        ("수학", 7, 8),
        ("사회", 9, 10),
        ("과학", 11, 12),
        ("도덕", 13, 14),
    ],
    "고졸": [
        ("국어", 1, 4),
        ("영어", 5, 6),
        ("수학", 7, 8),
        ("사회", 9, 10),
        ("과학", 11, 12),
        ("도덕", 13, 14),
        ("한국사", 15, 16),
    ],
}

LEVEL_SLUGS = {"초졸": "elem", "중졸": "mid", "고졸": "high"}
LEGACY_ANSWER_ASSETS = {
    "중졸": (
        "2016_2_mid_answer.pdf",
        ["국어", "수학", "영어", "사회", "과학", "도덕", "기술·가정", "체육", "음악", "미술"],
    ),
    "고졸": (
        "2016_2_high_answer.pdf",
        ["국어", "수학", "영어", "사회", "과학", "한국사", "도덕", "기술·가정", "체육", "음악", "미술"],
    ),
}


def pdf_pages(path: Path) -> int:
    output = subprocess.check_output(["pdfinfo", str(path)], text=True)
    for line in output.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    raise RuntimeError(f"페이지 수를 읽지 못함: {path}")


def download(tag: str, asset: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / f"{tag}__{asset}"
    if not target.exists():
        request = urllib.request.Request(
            f"{WORKER}/{tag}/{asset}",
            headers={"User-Agent": "Mozilla/5.0 kicegg-data-maintenance"},
        )
        with urllib.request.urlopen(request) as response, target.open("wb") as output:
            output.write(response.read())
    return target


def extract(source: Path, start: int, end: int, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["qpdf", str(source), "--pages", ".", f"{start}-{end}", "--", str(target)],
        check=True,
    )
    expected = end - start + 1
    actual = pdf_pages(target)
    if actual != expected:
        raise RuntimeError(f"분할 페이지 오류: {target} ({actual} != {expected})")


def split_asset_name(year: int, sess: int, level: str, subject: str, doc: str) -> str:
    return (
        f"{year}_{sess}_{LEVEL_SLUGS[level]}_"
        f"{SUBJECT_SLUGS[subject]}_{doc}.pdf"
    )


def split_modern_answers(records: list[dict], manifest: list[dict]) -> None:
    grouped_questions: dict[tuple, list[dict]] = defaultdict(list)
    answer_assets: dict[tuple, str] = {}
    for record in records:
        key = (record["year"], record["level"], record["sess"])
        if record["doc"] == "q":
            grouped_questions[key].append(record)
        elif record["doc"] == "a":
            answer_assets[key] = record["asset"]

    for key, questions in sorted(grouped_questions.items()):
        year, level, sess = key
        source_asset = answer_assets.get(key)
        if not source_asset:
            continue
        source = download("ged-v1", source_asset)
        if pdf_pages(source) != len(questions):
            raise RuntimeError(
                f"정답 과목/페이지 불일치: {year} {sess}회 {level} "
                f"({len(questions)}과목, {pdf_pages(source)}쪽)"
            )
        for page, question in enumerate(questions, 1):
            subject = question["subject"]
            asset = split_asset_name(year, sess, level, subject, "a")
            extract(source, page, page, OUTPUT_DIR / asset)
            manifest.append(
                {
                    "year": year,
                    "level": level,
                    "sess": sess,
                    "subject": subject,
                    "answerAsset": asset,
                    "sourceAsset": source_asset,
                }
            )


def split_legacy_questions(records: list[dict], manifest: list[dict]) -> None:
    for record in sorted(records, key=lambda r: (r["year"], r["sess"], r["level"])):
        if not record.get("file"):
            continue
        year, level, sess = record["year"], record["level"], record["sess"]
        source = download("ged-v2", record["asset"])
        ranges = LEGACY_RANGES[level]
        expected_pages = ranges[-1][2]
        if pdf_pages(source) != expected_pages:
            raise RuntimeError(
                f"문제지 페이지 불일치: {year} {sess}회 {level} "
                f"({pdf_pages(source)} != {expected_pages})"
            )
        for subject, start, end in ranges:
            asset = split_asset_name(year, sess, level, subject, "q")
            extract(source, start, end, OUTPUT_DIR / asset)
            manifest.append(
                {
                    "year": year,
                    "level": level,
                    "sess": sess,
                    "subject": subject,
                    "questionAsset": asset,
                    "sourceAsset": record["asset"],
                    "sourcePages": [start, end],
                }
            )


def split_legacy_answers(manifest: list[dict]) -> None:
    for level, (source_asset, subjects) in LEGACY_ANSWER_ASSETS.items():
        source = download("ged-v2", source_asset)
        if pdf_pages(source) != len(subjects):
            raise RuntimeError(
                f"구형 정답 과목/페이지 불일치: {level} "
                f"({len(subjects)}과목, {pdf_pages(source)}쪽)"
            )
        for page, subject in enumerate(subjects, 1):
            asset = split_asset_name(2016, 2, level, subject, "a")
            extract(source, page, page, OUTPUT_DIR / asset)
            manifest.append(
                {
                    "year": 2016,
                    "level": level,
                    "sess": 2,
                    "subject": subject,
                    "answerAsset": asset,
                    "sourceAsset": source_asset,
                }
            )


def merge_manifest(records: list[dict]) -> list[dict]:
    merged: dict[tuple, dict] = {}
    for record in records:
        key = (record["year"], record["level"], record["sess"], record["subject"])
        current = merged.setdefault(
            key,
            {
                "year": record["year"],
                "level": record["level"],
                "sess": record["sess"],
                "subject": record["subject"],
            },
        )
        current.update({k: v for k, v in record.items() if k not in current})
    return sorted(
        merged.values(),
        key=lambda r: (r["year"], r["sess"], LEVEL_SLUGS[r["level"]], r["subject"]),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="기존 결과물과 매니페스트의 완전성만 검사",
    )
    args = parser.parse_args()

    modern = json.loads((SOURCE_DIR / "ged_records.json").read_text())
    legacy = json.loads((SOURCE_DIR / "ged_yahak_recs.json").read_text())

    if args.check:
        manifest = json.loads(MANIFEST_PATH.read_text())
        missing = []
        bad_pages = []
        for record in manifest:
            for field in ("questionAsset", "answerAsset"):
                asset = record.get(field)
                if not asset:
                    continue
                path = OUTPUT_DIR / asset
                if not path.exists():
                    missing.append(asset)
                elif field == "answerAsset" and pdf_pages(path) != 1:
                    bad_pages.append(asset)
        if missing or bad_pages:
            raise SystemExit(
                f"분할 검증 실패: 누락 {len(missing)}건, 정답 다중쪽 {len(bad_pages)}건"
            )
        print(f"검정고시 과목별 분할 검증 통과: {len(manifest)}개 과목 레코드")
        return

    generated: list[dict] = []
    split_modern_answers(modern, generated)
    split_legacy_questions(legacy, generated)
    split_legacy_answers(generated)
    manifest = merge_manifest(generated)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"검정고시 과목별 PDF {len(list(OUTPUT_DIR.glob('*.pdf')))}개 · "
        f"매니페스트 {len(manifest)}건"
    )


if __name__ == "__main__":
    main()
