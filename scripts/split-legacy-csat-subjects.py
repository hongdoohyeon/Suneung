#!/usr/bin/env python3
"""1999~2004학년도 수능의 잘못 매핑된 합본을 과목별 PDF로 정규화한다."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from urllib.parse import quote

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf" / "legacy-csat-subjects"
CACHE_DIR = ROOT / "tmp" / "pdfs" / "legacy-csat-originals"
MANIFEST_PATH = ROOT / "data" / "sources" / "legacy_csat_subject_splits.json"
EXAMS_PATH = ROOT / "data" / "exams.json"
WORKER = "https://suneung-files.hdh061224.workers.dev"

SOURCES = {
    1999: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/2151E93F59544B8F2B",
        "eng": "https://t1.daumcdn.net/cfile/tistory/2708573559544B9703",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/22577D3A59544C8B2A",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/24687E3C59544C9014",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/2443B73A59544C9532",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/2416BF4359544E2904",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/2156743659544E1724",
    },
    2000: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/215371455954520030",
        "eng": "https://t1.daumcdn.net/cfile/tistory/25401D395954520801",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/25745D345954527C14",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/261D4A3D5954528216",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/276B374D5954528604",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/2275DB3D595452B503",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/217AEC4C595452BC36",
    },
    2001: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/251BFB495954565007",
        "eng": "https://t1.daumcdn.net/cfile/tistory/2629B0425954565A1D",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/277BDC485954577B1B",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/246710385954578421",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/211BB73F5954579314",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/223D11375954593E14",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/227C17445954594A1E",
    },
    2002: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/22684A3D5955A75E31",
        "eng": "https://t1.daumcdn.net/cfile/tistory/222D1E365955A7871C",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/263BE8465955A83C1F",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/2672E1425955A84233",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/2123DC4F5955A84813",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/246074345955AB5C03",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/2607E44A5955AB5C22",
    },
    2003: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/251AC53C5959A0B212?original",
        "eng": "https://t1.daumcdn.net/cfile/tistory/236DD04A5959A0D11A?original",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/273185335959A1A616?original",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/2572AC3D5959A1A620?original",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/2561A4335959A1A72C?original",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/2360AB395959A23A21?original",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/212C62385959A2411E?original",
    },
    2004: {
        "kor": "https://t1.daumcdn.net/cfile/tistory/2740594D5959A3820D",
        "eng": "https://t1.daumcdn.net/cfile/tistory/242BC5385959A38F23",
        "math_hum": "https://t1.daumcdn.net/cfile/tistory/2141C43A5959A3EE0B",
        "math_nat": "https://t1.daumcdn.net/cfile/tistory/21198A4B5959A3EE20",
        "math_art": "https://t1.daumcdn.net/cfile/tistory/227C2D4E5959A3FB12",
        "soc_hum": "https://t1.daumcdn.net/cfile/tistory/2535133F5959A48F27",
        "sci_nat": "https://t1.daumcdn.net/cfile/tistory/2547F8355959A48F29",
    },
}

EXPECTED_COMBINED_PAGES = {
    (2000, "soc_hum"): 14,
    (2000, "sci_nat"): 16,
    (2001, "soc_hum"): 24,
    (2001, "sci_nat"): 32,
    (2002, "soc_hum"): 24,
    (2002, "sci_nat"): 32,
    (2003, "soc_hum"): 24,
    (2003, "sci_nat"): 32,
    (2004, "soc_hum"): 24,
    (2004, "sci_nat"): 32,
}


def asset_name(year: int, key: str) -> str:
    return f"{year}_csat_{key}_q.pdf"


def download(year: int, key: str, url: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / f"{year}_{key}.pdf"
    if not target.exists():
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 kicegg-data-maintenance"},
        )
        with urllib.request.urlopen(request) as response, target.open("wb") as output:
            output.write(response.read())
    return target


def normalize(source_path: Path, target_path: Path, year: int, key: str) -> int:
    source = fitz.open(source_path)
    output = fitz.open()

    if key == "soc_hum" and year >= 2000:
        expected = EXPECTED_COMBINED_PAGES[(year, key)]
        if source.page_count != expected:
            raise RuntimeError(f"{year} {key} 페이지 수 오류: {source.page_count} != {expected}")
        source_page = source[6]
        box = source_page.rect
        clip = fitz.Rect(
            box.x0 + box.width / 2 + 2,
            box.y0,
            box.x1,
            box.y1,
        )
        first = output.new_page(width=clip.width, height=clip.height)
        first.show_pdf_page(first.rect, source, 6, clip=clip)
        output.insert_pdf(source, from_page=7, to_page=source.page_count - 1)
    elif key == "sci_nat" and year >= 2000:
        expected = EXPECTED_COMBINED_PAGES[(year, key)]
        if source.page_count != expected:
            raise RuntimeError(f"{year} {key} 페이지 수 오류: {source.page_count} != {expected}")
        output.insert_pdf(source, from_page=8, to_page=source.page_count - 1)
    else:
        output.insert_pdf(source)

    target_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(target_path, garbage=4, deflate=True)
    pages = output.page_count
    output.close()
    source.close()
    return pages


def build() -> list[dict]:
    manifest = []
    for year, sources in SOURCES.items():
        for key, url in sources.items():
            source = download(year, key, url)
            asset = asset_name(year, key)
            pages = normalize(source, OUTPUT_DIR / asset, year, key)
            manifest.append(
                {
                    "gradeYear": year,
                    "key": key,
                    "questionAsset": asset,
                    "pages": pages,
                    "sourceUrl": url,
                    "sourcePages": (
                        ["7-right", f"8-{EXPECTED_COMBINED_PAGES[(year, key)]}"]
                        if key == "soc_hum" and year >= 2000
                        else [9, EXPECTED_COMBINED_PAGES[(year, key)]]
                        if key == "sci_nat" and year >= 2000
                        else "all"
                    ),
                }
            )
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def check() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = {(year, key) for year, sources in SOURCES.items() for key in sources}
    actual = {(row["gradeYear"], row["key"]) for row in manifest}
    if actual != expected:
        raise SystemExit(f"매니페스트 키 불일치: 누락 {expected - actual}, 초과 {actual - expected}")
    for row in manifest:
        path = OUTPUT_DIR / row["questionAsset"]
        if not path.exists():
            raise SystemExit(f"분할 PDF 누락: {path}")
        with fitz.open(path) as document:
            if document.page_count != row["pages"]:
                raise SystemExit(
                    f"페이지 수 불일치: {path} ({document.page_count} != {row['pages']})"
                )
    print(f"구형 수능 과목별 PDF 검증 통과: {len(manifest)}개 자산")


def update_exams() -> None:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    track_slugs = {"인문계": "hum", "자연계": "nat", "예체능계": "art"}
    updated = 0
    for exam in exams:
        year = exam.get("gradeYear")
        if exam.get("type") != "csat" or year not in SOURCES:
            continue
        subject = exam.get("subject")
        if subject == "국어":
            key = "kor"
        elif subject == "영어":
            key = "eng"
        elif subject == "수학":
            key = f"math_{track_slugs[exam['subSubject']]}"
        elif subject == "사회탐구" and exam.get("subSubject") == "인문계":
            key = "soc_hum"
        elif subject == "과학탐구" and exam.get("subSubject") == "자연계":
            key = "sci_nat"
        else:
            continue
        asset = asset_name(year, key)
        download_name = exam["questionDownload"]
        exam["questionUrl"] = f"{WORKER}/legacy-csat-v2/{asset}?name={quote(download_name)}"
        exam["source"] = "legacy-csat-v2"
        updated += 1
    if updated != 66:
        raise RuntimeError(f"구형 수능 카드 갱신 수 오류: {updated} != 66")
    EXAMS_PATH.write_text(
        json.dumps(exams, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"구형 수능 카드 URL 갱신 완료: {updated}건")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--update-data", action="store_true")
    args = parser.parse_args()
    if args.check:
        check()
        return
    manifest = build()
    print(f"구형 수능 과목별 PDF 생성 완료: {len(manifest)}개 자산")
    if args.update_data:
        update_exams()


if __name__ == "__main__":
    main()
