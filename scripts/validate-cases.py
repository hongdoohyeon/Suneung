#!/usr/bin/env python3
"""실제 합격 케이스 CSV 로 라인 산정 알고리즘 검증.

핵심:
  - score_type 으로 백분위 위치 결정 (백분위 미명시 케이스는 검증 불가)
  - 학교/학과 매칭 강화
  - lib/lineup.js 산식 복제
"""
import csv, json, re
from pathlib import Path

ROOT = Path('/Users/hongduhyeon/Workspace/suneung-site')
ratios  = json.loads((ROOT / 'data/admissions/manual-ratios.json').read_text(encoding='utf-8'))
results = json.loads((ROOT / 'data/admissions/manual-results.json').read_text(encoding='utf-8'))

CSV = '/Users/hongduhyeon/Documents/Playground/suneung_jungsi_actual_only_in_progress.csv'

# ── 점수 파싱 (score_type 기반) ──
def num_after(s, prefix):
    m = re.search(prefix + r'\s*(\d{1,3}(?:\.\d+)?)', s)
    return float(m.group(1)) if m else None

def parse_pct(field, score_type):
    """필드에서 백분위 추출. score_type 별 분기.

    핵심: 슬래시로 분리한 각 토큰에서 *마지막* 숫자만 채택해야
    "물리학1 63" 같이 과목명에 든 숫자가 끼어들지 않음.
    """
    if not field: return None, '빈필드'
    s = str(field).strip()

    # "백NN" 명시 패턴 (가장 명확)
    m = re.search(r'백\s*(\d{1,3}(?:\.\d+)?)', s)
    if m: return float(m.group(1)), 'pct'

    parts = [p.strip() for p in re.split(r'/', s)]
    nums = []
    for p in parts:
        toks = re.findall(r'\d{1,3}(?:\.\d+)?', p)
        if toks:
            # 각 토큰에서 마지막 숫자만 (과목명에 든 1·2 무시)
            nums.append(float(toks[-1]))

    st = score_type or ''
    if '표준점수/백분위/등급' in st:
        # [표점, 백분위, 등급] — 백분위는 인덱스 [1]
        if len(nums) >= 2: return nums[1], 'pct'
    elif '원점수/표준점수/백분위/등급' in st:
        # [원점수, 표점, 백분위, 등급] — [2]
        if len(nums) >= 3: return nums[2], 'pct'
    elif '표준점수/원점수/등급' in st or '표준점수/등급' in st:
        return None, '백분위 미명시'
    return None, '형식미상'

# ── 학교 매칭 ──
SCHOOL_MAP = {
    '서울대': 'snu', '연세대': 'yonsei', '고려대': 'korea',
    '서강대': 'sogang', '성균관대': 'skku', '한양대': 'hanyang',
    '중앙대': 'cau', '경희대': 'khu', '한국외대': 'hufs',
    '서울시립대': 'uos', '동국대': 'dongguk', '건국대': 'konkuk',
    '홍익대': 'hongik', '이화여대': 'ewha', '숙명여대': 'sookmyung',
    '인하대': 'inha', '아주대': 'ajou', '광운대': 'kw',
    '단국대': 'dankook', '국민대': 'kookmin', '숭실대': 'ssu',
    '세종대': 'sejong', '명지대': 'mju', '상명대': 'smu',
    '가톨릭대': 'catholic',
    '가천대': 'gachon', '인천대': 'inu', '호서대': 'hoseo',
    '조선대': 'chosun', '원광대': 'wku', '제주대': 'jejunu',
    '영남대': 'yu', '계명대': 'kmu',
    # 여전히 미등록: 건양·상지·용인
}

# ── lib/lineup.js 핵심 로직 복제 ──
# lib/lineup.js와 동일 정의 유지 (드리프트 방지)
SUSHI = re.compile(r'지역균형|지균|학생부|교과우수|교과전형|학종|종합전형|논술|면접전형|특기|실기')
NAT = re.compile(r'자연|이공|공학|의|약|치|수의|간호|생명|화학|물리(?!학과)|수학|컴퓨터|소프트웨어|전자|기계|건축|시스템|로봇|반도체|AI')
HUM = re.compile(r'인문|사회|상경|경영|경제|어문|문학|사학|철학|예술|디자인|음악|미술|체육|글로벌|국제|미디어|언론')

def cls_unit(unit):
    if not unit: return 'humanities'
    if re.search(r'\(자연\)|\(이공\)', unit): return 'natural'
    if re.search(r'\(인문\)|\(사회\)', unit): return 'humanities'
    if re.search(r'의예|의학|치의|약학|수의|간호|보건|치의예|약학부|치과|한의|방사선|물리치료|작업치료', unit): return 'natural'
    if re.search(r'공학과|공학부|공과대|이공계|이공대|자연계열|자연과학|화학과|물리학|컴퓨터|소프트웨어|전자|기계|건축|토목|생명과학|생명공학|환경공학|반도체|항공|식품|농학|산림|생물학|수학과|로봇|에너지|시스템반도체|AI|데이터사이언스|바이오|신소재|소재공학', unit): return 'natural'
    if re.search(r'인문|국어|어문|영어|독어|불어|중어|일어|러시아|문학|사학|철학|사회|경제|경영|법학|정치|미디어|언론|행정|심리|교육|아동|음악|미술|디자인|체육|상경|글로벌|국제|관광|호텔|문화|자유전공|자율전공', unit): return 'humanities'
    return 'humanities'

def pick_track(school, unit):
    all_t = [t for t in (school.get('tracks') or []) if t.get('ratios')]
    elig = [t for t in all_t if not SUSHI.search(t.get('label', ''))]
    pool = elig if elig else all_t
    if not pool: return None
    if len(pool) == 1: return pool[0]
    cls = cls_unit(unit)
    if cls == 'natural':
        return next((t for t in pool if NAT.search(t['label'])), pool[0])
    return next((t for t in pool if HUM.search(t['label'])),
                next((t for t in pool if not NAT.search(t['label'])), pool[0]))

def num(v):
    return v if isinstance(v, (int, float)) else None

def compute(school, unit, areas):
    t = pick_track(school, unit)
    if not t: return None, None
    r = t.get('ratios', {})
    s, w = 0, 0
    for k, v in [('국어', 'korean'), ('수학', 'math'), ('탐구', 'tamgu')]:
        wk = num(r.get(k))
        if wk and areas.get(v) is not None:
            s += areas[v] * wk; w += wk
    if w == 0: return None, t.get('label')
    return s / w, t.get('label')

def classify(diff):
    if diff >= 1.5:  return '안정'
    if diff >= 0:    return '적정'
    if diff >= -1.5: return '소신'
    return '어려움'

# 학과 → unit 매칭 강화: 키워드 동의어
DEPT_SYNONYMS = {
    '의대': ['의예', '의학'],
    '수의예': ['수의예'],
    '치의예': ['치의예'],
    '약학': ['약학'],
    '경영': ['경영학', '경영대'],
    '경제': ['경제학', '경제대'],
    '간호': ['간호학', '간호'],
    '전기전자': ['전기전자', '전자공학'],
    '기계공학': ['기계공학', '기계공'],
    '유럽문화': ['유럽문화', '유럽'],
    '영어영문': ['영어영문', '영문'],
    '사회과학대학': ['사회과학', '사회'],
    '경영경제대학': ['경영경제', '경영'],
    '행정학과': ['행정학'],
    '교육학과': ['교육학'],
    '수학과': ['수학과', '수학'],
    '물리치료학과': ['물리치료'],
    '인문학기반자유전공학부': ['자유전공', '인문기반', '인문계'],
    '경영학부': ['경영학', '경영대'],
}

def _match_in_year(yr, dept):
    if not yr: return None, None
    for u in yr:
        if dept in u['unit'] or u['unit'] in dept:
            return u['pct70'], u['unit']
    for kw in DEPT_SYNONYMS.get(dept, [dept[:2], dept[:3]]):
        for u in yr:
            if kw and kw in u['unit']:
                return u['pct70'], u['unit']
    for u in yr:
        if dept[:2] and dept[:2] in u['unit']:
            return u['pct70'], u['unit']
    return None, None

def find_cut(slug, year, dept):
    """학과 70%컷 매칭. 해당 연도에 없으면 인접 연도(±1, ±2) 사용 (추정)."""
    direct = results.get(slug, {}).get(year, [])
    cut, unit = _match_in_year(direct, dept)
    if cut is not None: return cut, unit, year
    # 인접 연도 fallback (±2 까지만, 그 이상은 추정 신뢰도 낮음)
    yi = int(year)
    for delta in [1, -1, 2, -2]:
        alt = str(yi + delta)
        alt_yr = results.get(slug, {}).get(alt, [])
        c, u = _match_in_year(alt_yr, dept)
        if c is not None:
            return c, u, alt + '추정'
    return None, None, None

# ── 실행 ──
rows = []
with open(CSV, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        rows.append(r)

print('═' * 110)
print(f'  실제 합격 사례 {len(rows)}건 — 정시 라인 산정 알고리즘 검증')
print('═' * 110)
print()

verified, hits, miss, no_pct, no_school, no_dept = 0, 0, 0, 0, 0, 0
detailed = []

for row in rows:
    case   = row['case_label']
    year   = row['admission_year']
    univ   = row['applied_university']
    dept   = row['applied_department']
    actual = row['result']
    st     = row['score_type']

    kor, kreason = parse_pct(row['korean'], st)
    mth, mreason = parse_pct(row['math'], st)
    inq1, _ = parse_pct(row['inquiry1'], st)
    inq2, _ = parse_pct(row['inquiry2'], st)
    tamgu = (inq1 + inq2) / 2 if (inq1 and inq2) else (inq1 or inq2)

    # 백분위가 없거나 비정상(>=100 등) 거부
    if not kor or not mth or not tamgu or kor > 100 or mth > 100 or tamgu > 100:
        no_pct += 1
        detailed.append({'case': case, 'univ': univ, 'dept': dept, 'year': year, 'actual': actual,
                         'status': '백분위 없음', 'pred': '—', 'score': None, 'cut': None, 'ok': '·',
                         'pcts': f'{kreason or "?"}'})
        continue

    slug = SCHOOL_MAP.get(univ)
    if not slug or slug not in ratios:
        no_school += 1
        detailed.append({'case': case, 'univ': univ, 'dept': dept, 'year': year, 'actual': actual,
                         'status': f'{univ} 미등록', 'pred': '—', 'score': None, 'cut': None, 'ok': '·',
                         'pcts': f'국{kor:.0f}/수{mth:.0f}/탐{tamgu:.1f}'})
        continue

    school = ratios[slug]
    score, track_label = compute(school, dept, {'korean': kor, 'math': mth, 'tamgu': tamgu})
    if score is None:
        no_dept += 1
        detailed.append({'case': case, 'univ': univ, 'dept': dept, 'year': year, 'actual': actual,
                         'status': '환산 실패', 'pred': '—', 'score': None, 'cut': None, 'ok': '·',
                         'pcts': f'국{kor:.0f}/수{mth:.0f}/탐{tamgu:.1f}'})
        continue

    cut, matched, cut_year = find_cut(slug, year, dept)
    if cut is None:
        no_dept += 1
        detailed.append({'case': case, 'univ': univ, 'dept': dept, 'year': year, 'actual': actual,
                         'status': f'{year} 학과컷X', 'pred': f'환산 {score:.1f}', 'score': score, 'cut': None, 'ok': '·',
                         'pcts': f'국{kor:.0f}/수{mth:.0f}/탐{tamgu:.1f}'})
        continue

    diff = score - cut
    pred = classify(diff)
    verified += 1

    # 평가: 예비순위는 사실상 불합격, 추가합격은 컷 근처(소신/적정), 최초합격은 안정/적정
    if '예비순위' in actual or '불합격' in actual:
        ok = pred == '어려움'
    elif '최초합격' in actual:
        ok = pred in ('안정', '적정', '소신')
    elif '합격' in actual:  # 추가합격, X차추가합격, 합격
        ok = pred in ('안정', '적정', '소신')
    else:
        ok = False

    if ok: hits += 1
    else: miss += 1

    detailed.append({'case': case, 'univ': univ, 'dept': dept, 'year': year, 'actual': actual,
                     'status': '검증', 'pred': f'{pred}', 'score': score, 'cut': cut, 'ok': '✓' if ok else '✗',
                     'pcts': f'국{kor:.0f}/수{mth:.0f}/탐{tamgu:.1f}',
                     'diff': diff, 'matched': matched, 'cut_year': cut_year})

# ── 보고 ──
print('▣ 1. 검증 가능한 케이스 (백분위 명시 + 학교 등록 + 학과 컷 보유)')
print('─' * 110)
print(f'  {"학년":<5} {"학교":<6} {"학과":<14} {"점수":<22} {"환산":>5}  {"컷(출처)":<10}  {"diff":>6}  {"예측":<5}  {"실제":<10}  ✓')
print('─' * 110)
for d in detailed:
    if d['status'] != '검증': continue
    cut_src = f'{d["cut"]:.1f}({d["cut_year"]})'
    print(f'  {d["year"]:<5} {d["univ"][:6]:<6} {d["dept"][:14]:<14} {d["pcts"]:<22} '
          f'{d["score"]:>5.1f}  {cut_src:<10}  {d["diff"]:>+6.2f}  {d["pred"]:<5}  {d["actual"][:10]:<10}  {d["ok"]}')

print()
print('▣ 2. 검증 불가 (사유별)')
print('─' * 110)
for d in detailed:
    if d['status'] == '검증': continue
    print(f'  [{d["status"]:<14}] {d["year"]} {d["univ"][:8]:<8} {d["dept"][:18]:<18} → 실제: {d["actual"]}  ({d["pcts"]})')

print()
print('━━━ 3. 결과 요약 ━━━')
print(f'  총 케이스 ............ {len(rows)}')
print(f'  검증 가능 ............ {verified}')
print(f'    ▶ 예측 일치 ....... {hits}  ({100*hits/max(verified,1):.1f}%)')
print(f'    ▶ 예측 불일치 ..... {miss}')
print(f'  검증 불가 ............ {no_pct + no_school + no_dept}')
print(f'    · 백분위 미명시 ... {no_pct}')
print(f'    · 학교 미등록 ..... {no_school}')
print(f'    · 학과 컷 부재 .... {no_dept}')
