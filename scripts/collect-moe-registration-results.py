#!/usr/bin/env python3
"""교육부 보도자료의 '수능 응시원서 접수 결과' 첨부파일(2012·2016~2027학년도)을 수집한다.

collect-moe-scoring-statistics.py 의 검색·첨부 파서를 그대로 쓴다. moe.go.kr 은 약한 DH 키를 써서
Homebrew Python(OpenSSL 3)은 접속이 거부되므로 시스템 /usr/bin/python3 로 실행한다.
"""

from __future__ import annotations

import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "kice" / "registration-archive"

spec = importlib.util.spec_from_file_location("moe", ROOT / "scripts" / "collect-moe-scoring-statistics.py")
moe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(moe)

TITLE = re.compile(r"^\d{4}학년도 대학수학능력시험 응시원서 접수 결과$")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    datasets = []
    for post in moe.search("응시원서 접수 결과"):
        if not TITLE.match(post["title"]):
            continue
        page_url, files = moe.attachments(post["boardSeq"])
        saved = []
        for index, item in enumerate(files, 1):
            data, headers = moe.fetch(item["downloadUrl"])
            local = f"registration_{post['boardSeq']}_{index:02d}{item['extension']}"
            (OUT / local).write_bytes(data)
            saved.append({**item, "localFile": local, "bytes": len(data), "sha256": moe.sha256(data),
                          "contentType": headers.get("Content-Type")})
        datasets.append({**post, "sourcePage": page_url, "files": saved})
    manifest = {"schemaVersion": 1, "collectedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "owner": "교육부·한국교육과정평가원", "datasets": datasets}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(datasets)}개 게시물 · {sum(len(d['files']) for d in datasets)}개 첨부")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
