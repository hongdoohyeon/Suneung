#!/usr/bin/env python3
"""data/exam/{id}.json 단건 split을 data/exams.json에서 재생성.

exam.js가 페이지 진입 시 단건 split을 exams.json보다 우선 fetch하므로
exams.json을 수정하면 반드시 이 스크립트로 split을 동기화해야 한다.
(build-data.py 전체 재실행은 surgical append 데이터를 파괴하므로 금지 —
 scripts/README.md 참고.)

사용: python3 scripts/regen-exam-splits.py [--check]
  --check: 쓰지 않고 불일치만 보고, 불일치 있으면 exit 1 (CI용)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'exam'


def main() -> None:
    check_only = '--check' in sys.argv
    data = json.loads((ROOT / 'data' / 'exams.json').read_text(encoding='utf-8'))
    OUT.mkdir(exist_ok=True)

    ids = set()
    written = unchanged = 0
    for e in data:
        ids.add(e['id'])
        p = OUT / f"{e['id']}.json"
        body = json.dumps(e, ensure_ascii=False)
        old = p.read_text(encoding='utf-8') if p.exists() else None
        if old == body:
            unchanged += 1
            continue
        written += 1
        if not check_only:
            p.write_text(body, encoding='utf-8')

    orphans = [p.name for p in OUT.glob('*.json')
               if p.stem.isdigit() and int(p.stem) not in ids]
    print(f"동기화 {written}건 / 일치 {unchanged}건 / "
          f"고아 split {len(orphans)}건 (exams.json에 없는 id)")
    if orphans:
        print("  고아:", ', '.join(sorted(orphans)[:10]),
              '...' if len(orphans) > 10 else '')
    if check_only and written:
        sys.exit(1)


if __name__ == '__main__':
    main()
