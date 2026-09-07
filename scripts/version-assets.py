#!/usr/bin/env python3
"""CI 렌더 후 데이터·프런트엔드 내용으로 브라우저 캐시 버전을 생성한다."""
import argparse
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL_ASSET = re.compile(r'''(?P<quote>['"])(?P<path>(?!//)(?:\./|\.\./|/)?[\w./-]+\.(?:js|mjs|css|json))(?:\?v=[\w-]+)?(?P=quote)''')
DATA_VERSION = re.compile(r"(const DATA_VERSION = )'[^']*'")


def normalize(text):
    text = LOCAL_ASSET.sub(lambda m: m['quote'] + m['path'] + m['quote'], text)
    return DATA_VERSION.sub(r"\1''", text)


def source_files(root):
    return sorted([*root.glob('*.js'), *root.glob('*.css'), *root.glob('lib/*.js')])


def asset_version(root):
    digest = hashlib.sha256()
    sources = set(source_files(root))
    for path in sorted([*sources, *root.glob('data/**/*.json')]):
        digest.update(path.relative_to(root).as_posix().encode() + b'\0')
        body = normalize(path.read_text(encoding='utf-8')).encode() if path in sources else path.read_bytes()
        digest.update(body + b'\0')
    return digest.hexdigest()[:20]


def version_assets(root, check=False):
    version = asset_version(root)
    changed = []
    for path in [*source_files(root), *sorted(root.glob('*.html'))]:
        before = path.read_text(encoding='utf-8')
        after = LOCAL_ASSET.sub(
            lambda m: f"{m['quote']}{m['path']}?v={version}{m['quote']}", before)
        after = DATA_VERSION.sub(lambda m: f"{m[1]}'{version}'", after)
        if before != after:
            changed.append(path.relative_to(root).as_posix())
            if not check:
                path.write_text(after, encoding='utf-8')
    return version, changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    version, changed = version_assets(ROOT, args.check)
    print(f'asset version {version}: {len(changed)} files {"out of date" if args.check else "updated"}')
    if args.check and changed:
        raise SystemExit(1)
