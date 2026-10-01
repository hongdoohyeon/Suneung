#!/usr/bin/env python3
"""HWP 5.x 본문 텍스트 추출(표·수식 개체 제외) — 변환 PDF 와의 내용 대조용. 로컬 전용."""
import re
import subprocess
from pathlib import Path

HWP5TXT = str(Path.home() / "Library/Python/3.9/bin/hwp5txt")


def hwp_text(path: str) -> str:
    """pyhwp(hwp5txt) 로 본문 텍스트 추출. 배포용(암호화) 문서도 처리한다."""
    r = subprocess.run([HWP5TXT, path], capture_output=True, timeout=180)
    if r.returncode != 0 and not r.stdout:
        raise ValueError(r.stderr.decode("utf-8", "ignore")[-200:])
    return r.stdout.decode("utf-8", "ignore")


def norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s)


def coverage(src: str, dst: str, k: int = 5) -> float:
    """src(HWP) 의 k-글자 조각 중 dst(PDF) 에 있는 비율."""
    a, b = norm(src), norm(dst)
    if len(a) < k:
        return 1.0
    grams = {a[i:i + k] for i in range(0, len(a) - k + 1)}
    bset = {b[i:i + k] for i in range(0, max(0, len(b) - k + 1))}
    return len(grams & bset) / len(grams)
