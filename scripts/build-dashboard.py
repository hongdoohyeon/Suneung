#!/usr/bin/env python3
"""universities-merged + extras-merged → 종합 검토용 DASHBOARD.md.

사용자가 한눈에 검토할 수 있는 학교별 추출 결과 + 다년치 보유 + 신뢰도 status."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MERGED = ROOT / 'data' / 'admissions' / 'universities-merged.json'
EXTRAS = ROOT / 'data' / 'admissions' / 'universities-extras-merged.json'
OUT = ROOT / 'data' / 'admissions' / 'DASHBOARD.md'


def fmt_ratio(r: dict) -> str:
    return ' · '.join(f'{k}={v}' for k, v in r.items())


def build_section(title: str, univs: list, is_extras: bool = False) -> list:
    lines = [f'\n## {title} ({len(univs)}개)\n']
    # 분류 — 데이터 풍부 / 영어만 / 데이터 없음
    rich = []
    eng_only = []
    none = []
    for u in univs:
        ext = u.get('extracted', {})
        if ext.get('ratios'):
            rich.append(u)
        elif ext.get('english_grades'):
            eng_only.append(u)
        else:
            none.append(u)

    lines.append(f'- 학과별 ratio 추출: **{len(rich)}개** | 영어 등급만: {len(eng_only)}개 | 데이터 없음: {len(none)}개\n')

    if rich:
        lines.append(f'\n### 학과별 반영비율 추출 ({len(rich)}개)\n')
        for u in rich:
            ext = u['extracted']
            n_ratio = len(ext.get('ratios', []))
            n_eng = len(ext.get('english_grades', []))
            slug = u.get('slug', '?')
            tier = u.get('tier', '')
            tier_str = f' [{tier}]' if tier else ''
            lines.append(f'\n#### {u["name"]}{tier_str} (`{slug}`) — ratio {n_ratio} · 영어 {n_eng}\n')
            for r in ext['ratios'][:5]:
                lbl = r.get('label', '').replace('\n', ' ').strip()[:60] or '(라벨 없음)'
                lines.append(f'- p{r.get("source_page", r.get("page", "?"))} *{lbl}*: {fmt_ratio(r["ratios"])}')
            if n_ratio > 5:
                lines.append(f'- ... (+{n_ratio-5}개)')
            if ext.get('english_grades'):
                e = ext['english_grades'][0]
                grades = e.get('grades', {})
                gstr = ' '.join(f'{k}:{v}' for k, v in sorted(grades.items(), key=lambda x: int(x[0])))
                lines.append(f'- 영어 환산: {gstr[:120]}')

    if eng_only:
        lines.append(f'\n### 영어 등급만 추출 ({len(eng_only)}개)\n')
        for u in eng_only:
            ext = u['extracted']
            slug = u.get('slug', '?')
            tier = u.get('tier', '')
            tier_str = f' [{tier}]' if tier else ''
            lines.append(f'- **{u["name"]}**{tier_str} (`{slug}`) — 영어 {len(ext["english_grades"])}건')

    if none:
        lines.append(f'\n### 추출 데이터 없음 ({len(none)}개)\n')
        slug_list = ', '.join(f'`{u.get("slug","?")}`' for u in none[:30])
        lines.append(slug_list)
        if len(none) > 30:
            lines.append(f' ... +{len(none)-30}개')

    return lines


def main():
    merged = json.loads(MERGED.read_text())
    extras = json.loads(EXTRAS.read_text())
    m_stats = merged['_meta']['stats']
    e_stats = extras['_meta']['stats']

    # PDF 카운트
    pdfs = sum(1 for _ in (ROOT / 'data' / 'admissions' / 'pdfs').rglob('*.pdf'))
    pdfs_extra = sum(1 for _ in (ROOT / 'data' / 'admissions' / 'pdfs-extra').rglob('*.pdf'))

    lines = [
        '# 정시 모집요강 자동 수집·추출 DASHBOARD',
        '\n생성: 2026-05-06',
        '\n## 종합',
        f'- **PDF**: 총 {pdfs + pdfs_extra}개 (universities.json {pdfs} + extras {pdfs_extra})',
        f'- **학교**: 총 {m_stats["total"] + e_stats["total"]}개 (universities.json {m_stats["total"]} + extras {e_stats["total"]})',
        f'- **영어 등급 자동 추출**: {m_stats["with_eng_grades"] + e_stats["with_eng"]}개 학교',
        f'- **반영비율 자동 추출 (filter 통과)**: {m_stats["with_ratios"] + e_stats["with_ratio"]}개 학교',
        '',
        '\n## 자동 추출 한계',
        '- UNIST: 학교 사이트 JS 동적 로딩, megastudy 백업 미보유',
        '- 울산대(ulsan): 위 한계였으나 megastudy 백업으로 해결',
        '- 고신대: megastudy 백업 미보유',
        '- 다년치 PDF: megastudy CDN으로 2022~2026 5년치 보유 (universities.json 17개 학교, extras 50개 학교 다년치)',
    ]

    lines += build_section('Universities.json (60개 등록)', merged['universities'])
    lines += build_section('Extras (universities.json 외 발견 50개)', extras['universities'], is_extras=True)

    OUT.write_text('\n'.join(lines))
    print(f'wrote {OUT} ({sum(len(l) for l in lines)} chars)')


if __name__ == '__main__':
    main()
