#!/usr/bin/env python3
"""universities-merged.json + tables → 검토용 markdown REPORT."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MERGED = ROOT / 'data' / 'admissions' / 'universities-merged.json'
OUT = ROOT / 'data' / 'admissions' / 'REPORT.md'


def main():
    data = json.loads(MERGED.read_text())
    univs = data['universities']
    stats = data['_meta']['stats']

    lines = [
        '# 자동 수집·추출 보고서',
        f'\n생성: {data["_meta"]["generated"]}',
        f'\n## 통계',
        f'- 전체 대학: {stats["total"]}개',
        f'- 데이터 보유: {stats["with_data"]}개',
        f'- 영어 등급 추출: {stats["with_eng_grades"]}개',
        f'- 반영비율 추출: {stats["with_ratios"]}개',
        f'\n자동 추출 데이터는 정확성 검증이 필요. 모집단위 라벨이 부정확할 수 있음.',
        '',
        '---',
        '\n## 학교별 추출 결과',
    ]

    by_tier = {}
    for u in univs:
        tier = u.get('tier', 'misc')
        by_tier.setdefault(tier, []).append(u)

    tier_order = ['sky', 'ssh', 'csis', 'kdh', 'gov', 'ddw', 'minor', 'kki', 'gist_etc', 'misc']
    for tier in tier_order + [t for t in by_tier if t not in tier_order]:
        if tier not in by_tier:
            continue
        lines.append(f'\n### Tier: {tier}')
        for u in by_tier[tier]:
            ext = u.get('extracted', {})
            n_eng = len(ext.get('english_grades', []))
            n_ratio = len(ext.get('ratios', []))
            slug = u.get('slug') or '?'
            mark = '✓' if ext.get('has_data') else '✗'
            lines.append(f'- {mark} **{u["name"]}** (`{slug}`) — 영어 {n_eng}건 / ratio {n_ratio}건')
            if ext.get('ratios'):
                for r in ext['ratios'][:3]:
                    label = r['label'][:60].replace('\n', ' ')
                    rs = ' · '.join(f'{k}={v}' for k, v in r['ratios'].items())
                    lines.append(f'  - p{r.get("source_page","?")} *{label}* — {rs}')
                if len(ext['ratios']) > 3:
                    lines.append(f'  - ... ({len(ext["ratios"])-3}건 더)')
            if ext.get('english_grades') and not ext.get('ratios'):
                # ratio 없으면 영어 1개만 표시
                e = ext['english_grades'][0]
                grades = e.get('grades', {})
                gstr = ' · '.join(f'{k}={v}' for k, v in sorted(grades.items(), key=lambda x: int(x[0])))
                lines.append(f'  - 영어 환산표 1번째: {gstr[:120]}')

    lines.append('\n---\n## 미수집·미추출 학교')
    no_data = [u for u in univs if not u.get('extracted', {}).get('has_data')]
    for u in no_data:
        slug = u.get('slug') or 'no-slug'
        url = u.get('admissionUrl', '')
        lines.append(f'- **{u["name"]}** (`{slug}`) — {url}')

    OUT.write_text('\n'.join(lines))
    print(f'wrote {OUT} ({sum(len(l) for l in lines)} chars)')


if __name__ == '__main__':
    main()
