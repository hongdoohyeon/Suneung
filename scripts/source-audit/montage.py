#!/usr/bin/env python3
"""PDF 몇 쪽을 한 장으로 이어 붙여 육안 점검용 이미지를 만든다. 사용: montage.py out.png url_or_cachepdf [쪽번호...]"""
import hashlib
import io
import sys
import urllib.request
from pathlib import Path

import fitz

CACHE = Path(__file__).resolve().parents[2] / "tmp/source-audit/cache"


def local(u):
    if not u.startswith("http"):
        return Path(u)
    p = CACHE / (hashlib.sha1(u.split("?")[0].encode()).hexdigest()[:16] + ".pdf")
    if not p.exists() or p.stat().st_size == 0:
        p.write_bytes(urllib.request.urlopen(urllib.request.Request(u.split("?")[0], headers={"User-Agent": "kicegg-source-audit/1.0"}), timeout=90).read())
    return p


def main():
    out, src, pages = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]] or [1]
    doc = fitz.open(local(src))
    imgs = [doc[min(p, doc.page_count) - 1].get_pixmap(matrix=fitz.Matrix(0.9, 0.9)) for p in pages]
    w = sum(i.width for i in imgs); h = max(i.height for i in imgs)
    canvas = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, w, h), False); canvas.set_rect(canvas.irect, (255, 255, 255))
    x = 0
    for i in imgs:
        i = fitz.Pixmap(fitz.csRGB, i) if i.colorspace.n != 3 else i
        i.set_origin(x, 0); canvas.copy(i, i.irect); x += i.width
    canvas.save(out)
    print(out, doc.page_count, "쪽 중", pages)


if __name__ == "__main__":
    main()
