#!/usr/bin/env python3
"""교육부 고시 교육과정 원문(텍스트)에서 과목·영역(단원)·성취기준을 뽑아 data/curriculum/official/*.json 으로 저장한다.

입력(--work 디렉터리, README.md 의 '원문 받는 법' 참고)
  2022 개정  b5_full.txt b7_full.txt b8_full.txt b9_full.txt b14_full.txt   (교육부 고시 제2022-33호 별책 5·7·8·9·14 HWP → hwp5html → 텍스트)
  2015 개정  c15_5.txt c15_7.txt c15_8.txt c15_9.txt c15_14.txt            (교육부 고시 제2015-74호 별책 5·7·8·9·14 PDF → PyMuPDF 텍스트)
  2009 개정  cur09/{01_language,02_english,03_math,04_society,05_science,07_ethics}.txt (고시 제2011-361호 등 PDF → 텍스트)
출력 JSON 은 원문 그대로의 성취기준 문장을 담는다. 수식·기호는 원문 변환 과정에서 빠졌을 수 있다(math_symbols_lost).
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/curriculum/official"

# ── 2022 개정 ────────────────────────────────────────────────────────────
# (코드 접두어, 파일, 과목명, 교과, 구분)
C22 = [
    ("10공국1-", "b5", "공통국어1", "국어", "공통"), ("10공국2-", "b5", "공통국어2", "국어", "공통"),
    ("12화언", "b5", "화법과 언어", "국어", "일반선택"), ("12독작", "b5", "독서와 작문", "국어", "일반선택"), ("12문학", "b5", "문학", "국어", "일반선택"),
    ("10공수1-", "b8", "공통수학1", "수학", "공통"), ("10공수2-", "b8", "공통수학2", "수학", "공통"),
    ("12대수", "b8", "대수", "수학", "일반선택"), ("12미적Ⅰ-", "b8", "미적분Ⅰ", "수학", "일반선택"), ("12확통", "b8", "확률과 통계", "수학", "일반선택"),
    ("12미적Ⅱ-", "b8", "미적분Ⅱ", "수학", "진로선택"), ("12기하", "b8", "기하", "수학", "진로선택"),
    ("12영Ⅰ-", "b14", "영어Ⅰ", "영어", "일반선택"), ("12영Ⅱ-", "b14", "영어Ⅱ", "영어", "일반선택"),
    ("10한사1-", "b7", "한국사1", "한국사", "공통"), ("10한사2-", "b7", "한국사2", "한국사", "공통"),
    ("10통사1-", "b7", "통합사회1", "사회", "공통"), ("10통사2-", "b7", "통합사회2", "사회", "공통"),
    ("10통과1-", "b9", "통합과학1", "과학", "공통"), ("10통과2-", "b9", "통합과학2", "과학", "공통"),
]
# ── 2015 개정 ────────────────────────────────────────────────────────────
C15 = [
    ("10국", "c15_5", "공통국어", "국어", "공통"), ("12화작", "c15_5", "화법과 작문", "국어", "선택"), ("12독서", "c15_5", "독서", "국어", "선택"),
    ("12언매", "c15_5", "언어와 매체", "국어", "선택"), ("12문학", "c15_5", "문학", "국어", "선택"),
    ("10수학", "c15_8", "수학", "수학", "공통"), ("12수학Ⅰ", "c15_8", "수학Ⅰ", "수학", "일반선택"), ("12수학Ⅱ", "c15_8", "수학Ⅱ", "수학", "일반선택"),
    ("12확통", "c15_8", "확률과 통계", "수학", "일반선택"), ("12미적", "c15_8", "미적분", "수학", "일반선택"), ("12기하", "c15_8", "기하", "수학", "일반선택"),
    ("12영I", "c15_14", "영어Ⅰ", "영어", "일반선택"), ("12영II", "c15_14", "영어Ⅱ", "영어", "일반선택"), ("10영", "c15_14", "영어", "영어", "공통"),
    ("10한사", "c15_7", "한국사", "한국사", "공통"), ("10통사", "c15_7", "통합사회", "사회", "공통"),
    ("12한지", "c15_7", "한국지리", "사회", "일반선택"), ("12세지", "c15_7", "세계지리", "사회", "일반선택"), ("12동사", "c15_7", "동아시아사", "사회", "일반선택"),
    ("12세사", "c15_7", "세계사", "사회", "일반선택"), ("12경제", "c15_7", "경제", "사회", "일반선택"), ("12정법", "c15_7", "정치와 법", "사회", "일반선택"),
    ("12사문", "c15_7", "사회·문화", "사회", "일반선택"),
    ("10통과", "c15_9", "통합과학", "과학", "공통"),
    ("12물리Ⅰ", "c15_9", "물리학Ⅰ", "과학", "일반선택"), ("12화학Ⅰ", "c15_9", "화학Ⅰ", "과학", "일반선택"), ("12생과Ⅰ", "c15_9", "생명과학Ⅰ", "과학", "일반선택"),
    ("12지과Ⅰ", "c15_9", "지구과학Ⅰ", "과학", "일반선택"), ("12물리Ⅱ", "c15_9", "물리학Ⅱ", "과학", "진로선택"), ("12화학Ⅱ", "c15_9", "화학Ⅱ", "과학", "진로선택"),
    ("12생과Ⅱ", "c15_9", "생명과학Ⅱ", "과학", "진로선택"), ("12지과Ⅱ", "c15_9", "지구과학Ⅱ", "과학", "진로선택"),
]

NOISE_LINE = re.compile(r"^(\[|\(|<|[가-힣]\. |\d+$|○|◦|·|\s*$)")


def clean(s: str) -> str:
    s = s.replace("\x01", " ")
    s = re.sub(r"[-\U000f0000-\U000fffff]", "", s)  # 변환 과정에서 깨진 수식 글리프
    return re.sub(r"\s+", " ", s).strip()


def extract_standards(text: str, prefix: str):
    """코드 줄과 이어지는 줄바꿈 조각을 합쳐 성취기준 문장을 만든다. 같은 코드는 처음 나온 것(내용 체계 표)만 쓴다."""
    lines = text.split("\n")
    pat = re.compile(r"^\[" + re.escape(prefix) + r"(\d\d)-(\d\d)\]\s*(.*)$")
    seen = {}
    for i, ln in enumerate(lines):
        m = pat.match(ln)
        if not m:
            continue
        k = (m.group(1), m.group(2))
        if k in seen:
            continue
        body = m.group(3)
        j = i + 1
        while j < len(lines) and not clean(body).endswith((".", "다", "다.", ")")) and j - i <= 4 and not NOISE_LINE.match(lines[j]):
            body += lines[j]
            j += 1
        seen[k] = (i, clean(body))
    return seen


def area_names(text: str, seen, prefix):
    names = {}
    for (a, _b), (pos, _t) in sorted(seen.items()):
        if a in names:
            continue
        first = min(p for (aa, _), (p, _) in seen.items() if aa == a)
        seg = "\n".join(text.split("\n")[max(0, first - 60):first])
        hs = re.findall(r"^\((\d)\)\s+(.+?)\s*$", seg, re.M)
        nm = None
        for n, name in reversed(hs):
            if int(n) == int(a) and len(name) < 40:
                nm = clean(name)
                break
        names[a] = nm
    return names


def run_codes(work: Path, courses, era: str, source: dict):
    out = []
    cache = {}
    for prefix, f, name, subject, kind in courses:
        p = work / ((f + "_full.txt") if era == "2022" else (f + ".txt"))
        text = cache.setdefault(p, p.read_text(encoding="utf-8"))
        seen = extract_standards(text, prefix)
        if not seen:
            print("없음:", era, name, file=sys.stderr)
            continue
        names = area_names(text, seen, prefix)
        areas = {}
        for (a, b), (_pos, t) in sorted(seen.items()):
            ar = areas.setdefault(a, {"no": int(a), "name": names.get(a), "standards": []})
            ar["standards"].append({"code": f"[{prefix}{a}-{b}]", "text": t})
        out.append({"subject": subject, "course": name, "kind": kind, "codePrefix": prefix.rstrip("-"), "areas": list(areas.values())})
    return {"era": era, "source": source, "math_symbols_lost": era != "2022", "courses": out}


# 2015 개정 도덕과는 성취기준 코드 없이 '대주제(소주제)' 형식이라, 고시 별책 6 의 내용 체계 대주제 제목을 옮겨 둔다(수동, 목차 대조).
MANUAL15 = [
    {"subject": "도덕", "course": "생활과 윤리", "kind": "일반선택", "extraction": "수동(고시 별책 6 내용 체계 대주제)", "areas": [
        {"no": 1, "name": "현대의 삶과 실천윤리", "items": ["현대 생활과 실천윤리", "현대 윤리 문제에 대한 접근", "윤리 문제에 대한 탐구와 성찰"]},
        {"no": 2, "name": "생명과 윤리", "items": ["삶과 죽음의 윤리", "생명윤리", "사랑과 성윤리"]},
        {"no": 3, "name": "사회와 윤리", "items": ["직업과 청렴의 윤리", "사회 정의와 윤리", "국가와 시민의 윤리"]},
        {"no": 4, "name": "과학과 윤리", "items": ["과학 기술과 윤리", "정보 사회와 윤리", "자연과 윤리"]},
        {"no": 5, "name": "문화와 윤리", "items": ["예술과 대중문화 윤리", "의식주 윤리와 윤리적 소비", "다문화 사회의 윤리"]},
        {"no": 6, "name": "평화와 공존의 윤리", "items": ["갈등 해결과 소통의 윤리", "민족 통합의 윤리", "지구촌 평화의 윤리"]}]},
    {"subject": "도덕", "course": "윤리와 사상", "kind": "일반선택", "extraction": "수동(고시 별책 6 내용 체계 대주제)", "areas": [
        {"no": 1, "name": "인간과 윤리 사상", "items": ["인간의 삶에서 윤리사상과 사회사상", "우리의 삶에서 윤리사상과 사회사상"]},
        {"no": 2, "name": "동양과 한국 윤리 사상", "items": ["사상의 연원", "인의 윤리", "도덕적 심성", "자비의 윤리", "분쟁과 화합", "무위자연의 윤리", "현대 사회에서 한국과 동양윤리사상"]},
        {"no": 3, "name": "서양 윤리 사상", "items": ["사상의 연원", "덕", "행복 추구의 방법", "신앙", "도덕의 기초", "옳고 그름의 기준", "현대의 윤리적 삶"]},
        {"no": 4, "name": "사회사상", "items": ["사회사상", "국가", "시민", "민주주의", "자본주의", "평화"]}]},
]


# ── 2009 개정(성취기준 코드가 없는 문서) ───────────────────────────────
ORDER09 = {
    "01_language": ("국어", ["국어(공통)", "국어Ⅰ", "국어Ⅱ", "화법과 작문", "독서와 문법", "문학", "고전"]),
    "02_english": ("영어", ["영어(공통)", "기초 영어", "실용 영어Ⅰ", "실용 영어 회화", "실용 영어 독해와 작문", "실용 영어Ⅱ", "영어Ⅰ", "영어 회화", "영어 독해와 작문", "영어Ⅱ",
                          "심화 영어", "심화 영어 회화Ⅰ", "심화 영어 회화Ⅱ", "심화 영어 독해Ⅰ", "심화 영어 독해Ⅱ", "심화 영어 작문"]),
    "03_math": ("수학", ["수학(공통)", "기초수학", "수학Ⅰ", "수학Ⅱ", "확률과 통계", "미적분Ⅰ", "미적분Ⅱ", "기하와 벡터", "고급 수학Ⅰ", "고급 수학Ⅱ"]),
    "04_society": ("사회", ["사회(공통)", "역사(공통)", "사회", "한국지리", "세계지리", "한국사", "동아시아사", "세계사", "경제", "법과 정치", "사회·문화",
                          "국제 정치", "국제 경제", "국제 관계와 국제 기구", "세계 문제", "비교 문화", "사회 과학 방법론", "한국의 사회와 문화", "국제법", "지역 이해", "인류의 미래 사회", "과제 연구"]),
    "05_science": ("과학", ["과학(공통)", "과학", "물리Ⅰ", "물리Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명 과학Ⅰ", "생명 과학Ⅱ", "지구 과학Ⅰ", "지구 과학Ⅱ",
                          "고급 물리", "물리 실험", "고급 화학", "화학 실험", "고급 생명 과학", "생명 과학 실험", "고급 지구 과학", "지구 과학 실험", "환경 과학", "과학사 및 과학 철학", "정보 과학", "과제 연구"]),
    "07_ethics": ("도덕", ["도덕(공통)", "생활과 윤리", "윤리와 사상"]),
}
BUL = ("•", "․", "◦", "·", "ㆍ", "-", "‧", "∙")
NOISE09 = re.compile(r"^(수학과 교육과정|사회과 교육과정|과학과 교육과정|국어과 교육과정|영어과 교육과정|도덕과 교육과정|영\s*역|내\s*용|내\s*용\s*요소|내용\s*요소|\d+|\d+\.\s*.*|\d+\s*[가-힣 ]*교육과정|[가-힣]*교육과정\s*\d*)$")
SUBMARK = "㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗"
SKIP_AREAS = {"진단 평가", "형성 평가", "총괄 평가"}


def blocks09(path: Path):
    lines = path.read_text(encoding="utf-8").split("\n")
    idx = [i for i, l in enumerate(lines) if re.match(r"\s*가\. ?내용 ?체계", l)] + [len(lines)]
    return lines, idx


def system_areas(lines, i, end):
    """'가. 내용 체계' 표의 영역/내용 요소."""
    j = i + 1
    seg = []
    while j < end and not re.match(r"\s*나\. ", lines[j]):
        s = lines[j].strip()
        if s and not NOISE09.match(s):
            seg.append(s)
        j += 1
    areas, cur = [], None
    for n, s in enumerate(seg):
        nxt = seg[n + 1] if n + 1 < len(seg) else ""
        if s.startswith(BUL):
            if cur is None:
                cur = {"name": None, "items": []}
                areas.append(cur)
            cur["items"].append(s.lstrip("".join(BUL) + " ").strip())
        elif nxt.startswith(BUL) and len(s) < 35:
            cur = {"name": s, "items": []}
            areas.append(cur)
        elif cur and cur["items"]:
            cur["items"][-1] += " " + s
        elif cur and cur["name"]:
            cur["name"] += " " + s
    return [a for a in areas if a["name"]]


def numbered_areas(lines, i, end):
    areas, cur = [], None
    for l in lines[i:end]:
        s = l.strip()
        m = re.match(r"^\((\d{1,2})\)\s+([^\s].{1,40})$", s)
        if m and not s.endswith("다."):
            cur = {"no": int(m.group(1)), "name": clean(m.group(2)), "items": []}
            areas.append(cur)
        elif s and s[0] in SUBMARK and cur is not None:
            cur["items"].append(clean(s[1:]))
    seen, out, last = set(), [], 0
    for a in areas:
        k = (a["no"], a["name"])
        if a["no"] <= last and out:  # 번호가 다시 1부터 시작하면 평가 방법 등 뒤쪽 장이라 끊는다
            break
        if k in seen or a["name"] in SKIP_AREAS:
            continue
        seen.add(k)
        last = a["no"]
        out.append(a)
    return out


def run09(work: Path):
    out = []
    for f, (subject, names) in ORDER09.items():
        lines, idx = blocks09(work / "cur09" / f"{f}.txt")
        for k in range(len(idx) - 1):
            name = names[k] if k < len(names) else f"?{k}"
            if name.endswith("(공통)"):  # 초·중 국민공통기본교육과정 내용이라 고등학교 범위가 아니다
                continue
            sysa = system_areas(lines, idx[k], idx[k + 1])
            numa = numbered_areas(lines, idx[k], idx[k + 1])
            # 수학·국어는 '내용 체계' 표가 깨끗하고, 사회·과학·도덕은 '(n) 영역' 장 제목이 단원 구분과 같다.
            if subject == "영어":
                areas, how = [], "영역 구분 없음(언어 기능 중심이라 단원을 두지 않음)"
            elif subject in ("수학", "국어") or (not numa and sysa):
                areas = [{"no": n + 1, "name": a["name"], "items": a["items"]} for n, a in enumerate(sysa)]
                how = "내용 체계 표"
            else:
                areas = numa
                how = "영역별 내용 장 제목"
            out.append({"subject": subject, "course": name, "extraction": how, "areas": areas})
    return {"era": "2009", "source": {"doc": "2009 개정 교과 교육과정(교육과학기술부 고시 제2011-361호 등)", "files": list(ORDER09)},
            "math_symbols_lost": True, "courses": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, help="원문 텍스트가 있는 디렉터리")
    a = ap.parse_args()
    work = Path(a.work)
    OUT.mkdir(parents=True, exist_ok=True)
    for era, courses, src in (
        ("2022", C22, {"doc": "교육부 고시 제2022-33호 별책 5·7·8·9·14", "url": "https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&lev=0&statusYN=W&s=moe&m=0404&opType=N&boardSeq=93458"}),
        ("2015", C15, {"doc": "교육부 고시 제2015-74호 별책 5·7·8·9·14", "url": "https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&lev=0&statusYN=C&s=moe&m=0404&opType=N&boardSeq=60747"}),
    ):
        data = run_codes(work, courses, era, src)
        if era == "2015":
            data["courses"] += MANUAL15
        (OUT / f"{era}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(era, len(data["courses"]), "과목")
    d09 = run09(work)
    (OUT / "2009.json").write_text(json.dumps(d09, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("2009", len(d09["courses"]), "과목")


if __name__ == "__main__":
    main()
