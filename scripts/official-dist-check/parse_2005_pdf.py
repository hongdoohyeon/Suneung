"""2005학년도 수능 '표준점수 1점 급간별 자료' PDF(평가원 공식) → JSON.
페이지마다 '표준점수|남자|여자|계|누적(계)' 5열 묶음이 가로로 4개. 과목명은 묶음 위 텍스트.
과학탐구 Ⅰ/Ⅱ 는 PDF 글꼴에서 로마숫자가 빠져 페이지 순서(6쪽=Ⅰ, 7쪽=Ⅱ)로 붙인다 — 공식 등급컷과 대조해 확인.
출력: std_dist_2005.json  {"2005|csat": {과목: {표준점수: 계}}}
"""
import fitz, json, re
d = fitz.open('2005csat_dist.pdf')
out = {}
for pi, p in enumerate(d):
    # 페이지가 90도 회전돼 있어 (열=-y, 행=x) 로 바꿔 쓴다
    words = [(-w[3], w[0], -w[1], w[2], w[4]) for w in p.get_text('words')]
    heads = sorted([w for w in words if w[4] == '표준점수'], key=lambda w: w[0])
    if not heads:
        continue
    hy = heads[0][1]
    xs = [h[0] for h in heads] + [p.rect.width + 1]
    # 과목명: 헤더 바로 위 줄의 한글 단어들을 묶음 x 범위로 모음
    for gi in range(len(heads)):
        x0, x1 = xs[gi] - 5, xs[gi + 1] - 5
        name_words = [w for w in words if x0 <= w[0] < x1 and hy - 40 < w[1] < hy - 1 and re.search(r'[가-힣]', w[4])]
        name = ' '.join(w[4] for w in sorted(name_words, key=lambda w: (w[1], w[0]))
                        if not w[4].endswith('영역') and w[4] not in ('영역',))
        name = re.sub(r'\s+', ' ', name).strip()
        name = re.sub(r'^(사회탐구|과학탐구|직업탐구|제2외국어/한문)\s*', '', name)
        if pi == 6 and name in ('물리', '화학', '생물', '지구과학'): name += ' I'
        if pi == 7 and name in ('물리', '화학', '생물', '지구과학'): name += ' II'
        if pi in (13, 14) and name in ('독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어'): name += ' I'
        # 숫자 행: 같은 y 의 묶음 안 단어 5개
        rows = {}
        for w in words:
            if x0 <= w[0] < x1 and w[1] > hy + 3 and re.fullmatch(r'[\d,]+', w[4]):
                rows.setdefault(round(w[1]), []).append((w[0], int(w[4].replace(',', ''))))
        dist = out.setdefault(name, {})
        for y in sorted(rows):
            cells = [v for _, v in sorted(rows[y])]
            if len(cells) == 5 and cells[3]:
                dist[str(cells[0])] = cells[3]
json.dump({'2005|csat': out}, open('std_dist_2005.json', 'w'), ensure_ascii=False, indent=1)
for k, v in out.items():
    print(repr(k), len(v), sum(v.values()), v and max(map(int, v)), v and min(map(int, v)))
