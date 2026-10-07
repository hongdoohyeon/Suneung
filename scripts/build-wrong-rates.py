#!/usr/bin/env python3
"""EBSi 역대 오답률 TOP15 → data/wrong-rates.json (커밋용 요약, 로컬 전용).

원본: data/raw/item-analytics/ebsi-public-wrong-answer-history.json (EBSi '역대 등급컷·오답률' 공개 화면 수집본).
키 = "시행연도|월|학년|영역|EBSi 과목명". 과목명 정규화·사이트 항목 매칭은 build-data.py wrong_rates_for() 가 한다.
값 = 오답률 순 [[문항번호, 오답률%, 배점, 정답, [①~⑤ 선택률%] | 주관식이면 null], ...].
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'item-analytics' / 'ebsi-public-wrong-answer-history.json'
OUT = ROOT / 'data' / 'wrong-rates.json'

AREA = {'언어': '국어', '사탐': '사회탐구', '과탐': '과학탐구', '직탐': '직업탐구'}


def main():
    src = json.loads(SRC.read_text(encoding='utf-8'))
    out: dict = {}
    for r in src['records']:
        ans = r['correctAnswer']
        mc = r['responseType'] == 'multiple_choice'
        if not isinstance(ans, int) or (mc and not 1 <= ans <= 5):   # '1,2,3,4,5'(전원 정답 처리) 등은 뺀다
            continue
        area = AREA.get(r['area'], r['area'])
        key = f"{r['examYear']}|{r['month']}|{r['gradeYear']}|{area}|{r['subject']}"
        pt = r['pointValue']
        out.setdefault(key, []).append((r['rankByWrongRate'], [
            r['questionNumber'], r['wrongRatePct'], int(pt) if pt == int(pt) else pt, ans, r['choiceRatePct'] if mc else None]))
    data = {k: [row for _, row in sorted(v, key=lambda x: x[0])] for k, v in sorted(out.items())}
    OUT.write_text(json.dumps({'source': src['sourcePage'], 'collectedAt': src['collectedAt'][:10], 'exams': data},
                              ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(data):,}과목 · {sum(map(len, data.values())):,}문항')


if __name__ == '__main__':
    main()
