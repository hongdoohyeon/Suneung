#!/usr/bin/env python3
"""모의지원 코드에서 직접 import할 수 있는 단일 lookup JSON 빌드.

input: universities-merged.json + universities-extras-merged.json
output: data/admissions/ratios-lookup.json — slug별 학과군별 ratio + 영어 환산

format:
{
  "snu": {
    "name": "서울대학교",
    "tier": "sky",
    "tracks": [
      {"label": "지역균형 - 인문/사회/공학", "ratios": {국어, 수학, 영어, 탐구}, "english_grades": {1..9}}
    ],
    "source": "...pdf",
    "confidence": "high|medium|low"
  }
}
"""
from __future__ import annotations
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = ROOT / 'data' / 'admissions' / 'universities-merged.json'
E = ROOT / 'data' / 'admissions' / 'universities-extras-merged.json'
RATIO_DIR = ROOT / 'data' / 'admissions' / 'ratios'
MANUAL = ROOT / 'data' / 'admissions' / 'manual-ratios.json'
OUT = ROOT / 'data' / 'admissions' / 'ratios-lookup.json'


def load_manual(slug: str) -> dict | None:
    if not MANUAL.exists():
        return None
    data = json.loads(MANUAL.read_text())
    return data.get(slug)


def load_school_ratios(slug: str) -> list:
    """학교별 매처 결과 — data/admissions/ratios/{slug}/{year}.json."""
    d = RATIO_DIR / slug
    if not d.exists():
        return []
    files = sorted(d.glob('*.json'), reverse=True)
    if not files:
        return []
    data = json.loads(files[0].read_text())
    out = []
    for e in data.get('entries', []):
        if 'ratio' in e:
            ratio = e['ratio']
            ratios_kor = {}
            mapping = {'korean':'국어','math':'수학','english':'영어','tamgu':'탐구','hanguksa':'한국사'}
            for k, v in ratio.items():
                ratios_kor[mapping.get(k, k)] = v
            out.append({
                'label': f"{e.get('track','')} - {e.get('unit','')}".strip(' -'),
                'ratios': ratios_kor,
                'page': e.get('page'),
                'source': 'school_matcher',
            })
    return out


# 메디컬 분야만 표시 = 지방 중급 이하 학교 단순화
MEDICAL_ONLY_TIERS = {'national', 'regional_med'}
MEDICAL_KW = ['의예', '치의예', '한의예', '약학', '수의예', '의학', '치의학', '한의학', '약대', '의과', '치과', '한의', '의예과', '의대']
EXCLUDE_SLUGS = {'kyonggi'}  # 메디컬 없는 지방대 제외


def is_medical_track(label: str) -> bool:
    return any(kw in label for kw in MEDICAL_KW)


BAD_LABEL_KEYWORDS = ['백분위', '표준점수', '환산점수', '배점', '변환', '감점',
                     '점수 우수', '등 급', '125점', '점수 산출', '예시']


def is_label_suspicious(label: str) -> bool:
    """라벨이 false positive 의심."""
    if not label:
        return False  # 빈 라벨은 일단 통과
    for kw in BAD_LABEL_KEYWORDS:
        if kw in label:
            return True
    return False


def is_ratio_value_suspicious(ratios: dict) -> bool:
    """비율값이 의심 — 200+ 큰 값 (표준점수)."""
    vals = list(ratios.values())
    if not vals: return True
    s = sum(vals)
    # 합이 정확히 100±10 (% 기준) 또는 1000±50 (천점 만점) 만 통과
    if 90 <= s <= 110: return False
    if 950 <= s <= 1050: return False
    return True  # 그 외는 의심


def merge_eng_ratio(eng_list: list, ratio_list: list) -> list:
    """페이지 기준 페어링 + 필터 + 같은 ratio 그룹화."""
    pages_eng = {e.get('source_page', e.get('page')): e for e in eng_list}
    pages_ratio = {r.get('source_page', r.get('page')): r for r in ratio_list}
    # 1) ratio 같은 entry 그룹화 (라벨 합침)
    grouped = {}  # ratio_tuple -> {labels: [], pages: [], eng}
    for r in ratio_list:
        label = r.get('label', '').replace('\n', ' ').strip()
        ratios = r.get('ratios', {})
        # 학교별 매처 출처는 필터 우회 (정확도 신뢰)
        from_school_matcher = r.get('source') == 'school_matcher'
        if not from_school_matcher:
            if is_label_suspicious(label):
                continue
            if is_ratio_value_suspicious(ratios):
                continue
        key = tuple(sorted(ratios.items()))
        if key not in grouped:
            grouped[key] = {'labels': [], 'pages': [], 'ratios': ratios}
        # 라벨 미식별 또는 너무 짧으면 (예: '전체', 'A', 'B') 그대로 두지만
        # 같은 ratio에 여러 의미 있는 라벨 있으면 합침
        if label and label not in grouped[key]['labels']:
            grouped[key]['labels'].append(label)
        page = r.get('source_page', r.get('page'))
        if page not in grouped[key]['pages']:
            grouped[key]['pages'].append(page)

    tracks = []
    for grp in grouped.values():
        labels = grp['labels']
        # 라벨 미식별/빈 라벨이고 ratio가 다른 entry와 같으면 이미 그룹화됨
        # 라벨이 0개면 그래도 표시 (다른 단일 ratio에 의미 있을 수도)
        if not labels:
            display_label = '(라벨 미식별)'
        elif len(labels) == 1:
            display_label = labels[0][:80]
        else:
            # 여러 라벨 합침
            display_label = ' / '.join(l[:40] for l in labels[:3])
            if len(labels) > 3:
                display_label += f' 외 {len(labels)-3}건'
        # 영어는 첫 페이지의 eng 사용
        eng = None
        for pg in grp['pages']:
            if pg in pages_eng:
                eng = pages_eng[pg]
                break
        if not eng and eng_list:
            eng = eng_list[0]
        track = {
            'label': display_label,
            'ratios': grp['ratios'],
            'pages': grp['pages'][:5],
        }
        if eng:
            track['english_grades'] = eng.get('grades', {})
        tracks.append(track)
    # 라벨 미식별 트랙: 의미 있는 라벨 있는 다른 트랙이 있을 때만 제거
    has_real_label = any(t['label'] != '(라벨 미식별)' for t in tracks)
    if has_real_label:
        tracks = [t for t in tracks if t['label'] != '(라벨 미식별)']
    # ratio 없으면 영어만
    if not tracks and eng_list:
        for e in eng_list:
            tracks.append({
                'label': e.get('label', '').replace('\n', ' ').strip()[:80] or '전체',
                'english_grades': e.get('grades', {}),
                'page': e.get('source_page', e.get('page')),
            })
    return tracks


def confidence(tracks: list) -> str:
    if any(t.get('manual') for t in tracks):
        return 'high'  # 검증된 manual 데이터
    if any('ratios' in t for t in tracks):
        return 'medium'  # ratio + 라벨 추출됨 (학과 정확도는 검증 필요)
    if tracks:
        return 'low'  # 영어만
    return 'none'


def main():
    lookup = {}
    # universities.json 학교
    m_data = json.loads(M.read_text())
    for u in m_data['universities']:
        slug = u.get('slug')
        if not slug:
            continue
        if slug in EXCLUDE_SLUGS:
            continue
        is_medical_only = u.get('tier') in MEDICAL_ONLY_TIERS
        ext = u.get('extracted', {})
        eng_list = ext.get('english_grades', [])
        ratio_list = ext.get('ratios', [])
        # 학교별 매처 결과 추가 (snu 등)
        school_ratios = load_school_ratios(slug)
        if school_ratios:
            ratio_list = list(ratio_list) + school_ratios
        tracks = merge_eng_ratio(eng_list, ratio_list)
        # manual-ratios.json 우선 (정확도 가장 높음)
        manual = load_manual(slug)
        if manual:
            manual_tracks = []
            for t in manual.get('tracks', []):
                manual_tracks.append({
                    'label': t['label'],
                    'ratios': {k: v for k, v in t['ratios'].items() if isinstance(v, (int, float))},
                    'ratios_note': {k: v for k, v in t['ratios'].items() if isinstance(v, str)},
                    'scoreFormula': t.get('scoreFormula'),
                    'math_pick': t.get('math_pick'),
                    'tamgu_pick': t.get('tamgu_pick'),
                    'manual': True,
                })
            if manual.get('english_grades'):
                for mt in manual_tracks:
                    mt['english_grades'] = manual['english_grades']
            # manual이 있으면 자동 추출은 라벨 미식별/중복만 제거하고 manual을 위에
            if manual_tracks:
                # 자동 추출 트랙 중 라벨 미식별 + ratio 비슷한 것은 제거 (manual 우선)
                manual_ratio_keys = {tuple(sorted(mt['ratios'].items())) for mt in manual_tracks if mt.get('ratios')}
                filtered_auto = []
                for at in tracks:
                    if not at.get('ratios'):
                        filtered_auto.append(at); continue
                    if at.get('label') == '(라벨 미식별)':
                        continue
                    auto_key = tuple(sorted(at['ratios'].items()))
                    if auto_key in manual_ratio_keys:
                        continue  # manual에 같은 ratio 있음 → 중복 제거
                    filtered_auto.append(at)
                tracks = manual_tracks + filtered_auto
            else:
                tracks = tracks
        # 지방 중급/거점 → 메디컬 트랙만 필터
        if is_medical_only:
            tracks = [t for t in tracks if is_medical_track(t.get('label', ''))]
        # lookup에 학교 항상 추가 (빈 tracks라도 PDF만 있으면 표시)
        from pathlib import Path as _Path
        pdf_dir = ROOT / 'data' / 'admissions' / 'pdfs' / slug
        has_pdf = pdf_dir.exists() and any(pdf_dir.glob('*.pdf'))
        if tracks or has_pdf:
            lookup[slug] = {
                'name': u['name'],
                'shortName': u.get('shortName'),
                'tier': u.get('tier'),
                'admissionUrl': u.get('admissionUrl'),
                'source': ext.get('source'),
                'tracks': tracks,
                'confidence': confidence(tracks) if tracks else 'no_data',
                'category': 'univ',
                'pdf_available': has_pdf,
            }

    # extras 학교
    e_data = json.loads(E.read_text())
    for u in e_data['universities']:
        slug = u.get('slug')
        if not slug:
            continue
        ext = u.get('extracted', {})
        eng_list = ext.get('english_grades', [])
        ratio_list = ext.get('ratios', [])
        tracks = merge_eng_ratio(eng_list, ratio_list)
        # extras도 PDF 있으면 항상 표시
        pdf_dir_e = ROOT / 'data' / 'admissions' / 'pdfs-extra' / slug
        has_pdf_e = pdf_dir_e.exists() and any(pdf_dir_e.glob('*.pdf'))
        # extras도 manual 보강
        manual = load_manual(slug)
        if manual:
            manual_tracks = []
            for t in manual.get('tracks', []):
                manual_tracks.append({
                    'label': t['label'],
                    'ratios': {k: v for k, v in t['ratios'].items() if isinstance(v, (int, float))},
                    'ratios_note': {k: v for k, v in t['ratios'].items() if isinstance(v, str)},
                    'scoreFormula': t.get('scoreFormula'),
                    'math_pick': t.get('math_pick'),
                    'tamgu_pick': t.get('tamgu_pick'),
                    'manual': True,
                })
            if manual.get('english_grades'):
                for mt in manual_tracks:
                    mt['english_grades'] = manual['english_grades']
            tracks = manual_tracks + tracks
        if tracks or has_pdf_e:
            lookup[slug] = {
                'name': u['name'],
                'megastudy_code': u.get('megastudy_code'),
                'tracks': tracks,
                'confidence': confidence(tracks) if tracks else 'no_data',
                'category': 'extra',
                'pdf_available': has_pdf_e,
            }

    # merged 목록에 아직 반영되지 않은 수동 보강 학교도 lookup에서 누락하지 않는다.
    manual_data = json.loads(MANUAL.read_text()) if MANUAL.exists() else {}
    for slug, manual in manual_data.items():
        if slug == '_meta' or slug in lookup:
            continue
        manual_tracks = []
        for t in manual.get('tracks', []):
            manual_tracks.append({
                'label': t['label'],
                'ratios': {k: v for k, v in t['ratios'].items() if isinstance(v, (int, float))},
                'ratios_note': {k: v for k, v in t['ratios'].items() if isinstance(v, str)},
                'scoreFormula': t.get('scoreFormula'),
                'math_pick': t.get('math_pick'),
                'tamgu_pick': t.get('tamgu_pick'),
                'manual': True,
            })
        if manual.get('english_grades'):
            for mt in manual_tracks:
                mt['english_grades'] = manual['english_grades']
        if manual_tracks:
            lookup[slug] = {
                'name': manual.get('name', slug),
                'tracks': manual_tracks,
                'confidence': 'high',
                'category': 'extra',
                'source': 'data/admissions/manual-ratios.json',
                'pdf_available': False,
            }

    OUT.write_text(json.dumps({
        '_meta': {
            'description': '대학별 정시 반영비율 lookup. 수동 검수 자료 우선, 자동 추출 자료는 별도 신뢰도 표시.',
            'generated': date.today().isoformat(),
            'count': len(lookup),
            'with_ratio': sum(1 for v in lookup.values() if any('ratios' in t for t in v['tracks'])),
            'with_eng_only': sum(1 for v in lookup.values() if all('ratios' not in t for t in v['tracks']) and v['tracks']),
        },
        'lookup': lookup,
    }, ensure_ascii=False, indent=2))
    print(f'wrote {OUT}')
    print(f'  학교 수: {len(lookup)}')
    print(f'  ratio 있는 학교: {sum(1 for v in lookup.values() if any("ratios" in t for t in v["tracks"]))}')
    print(f'  영어만: {sum(1 for v in lookup.values() if all("ratios" not in t for t in v["tracks"]) and v["tracks"])}')


if __name__ == '__main__':
    main()
