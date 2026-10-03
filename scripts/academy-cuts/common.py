"""입시기관 등급컷 수집 공통 — 기관마다 다른 표기를 한 형식으로 맞춘다.

정규화 레코드 (data/raw/academy-cuts/{source}.json 의 한 줄):
  source        기관 id (ebsi·megastudy·etoos·jongro·daesung)
  examYear      시행 연도,  month 시행 월,  studentGrade 1~3
  typeGroup/type/gradeYear  사이트 exams.json 과 같은 시험 키 (exam_key 로 계산)
  subject, subSubject       기관 표기 그대로 (매칭은 subject_key 로)
  rawCuts[8], standardCuts[8], percentiles[8]   1~8등급 경계 (없으면 None)
  top           {"raw","std","pct"} 최고점 행 (있으면)
  url, fetchedAt
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data/raw/academy-cuts"

EDU_TYPE = {3: "mar", 4: "apr", 5: "may", 6: "jun", 7: "jul", 9: "sep", 10: "oct", 11: "nov"}
SUNEUNG_TYPE = {6: "june", 9: "sept", 11: "csat"}


def exam_key(exam_year: int, month: int, student_grade: int) -> dict | None:
    """시행 연월·학년 → 사이트 시험 키. 고3 6·9·11월은 평가원(모평·수능), 나머지는 학평."""
    if student_grade == 3 and month in SUNEUNG_TYPE:
        return {"typeGroup": "suneung", "type": SUNEUNG_TYPE[month], "gradeYear": exam_year + 1}
    if month in EDU_TYPE:  # 사이트 규칙: 고3 학평은 학년도(시행+1), 고1·2 는 시행 연도
        return {"typeGroup": "education", "type": EDU_TYPE[month],
                "gradeYear": exam_year + 1 if student_grade == 3 else exam_year}
    return None


def subject_key(name: str | None) -> str:
    """'물리학 I' = '물리Ⅰ', '생활과 윤리' = '생활과윤리', '수리 가형' = '가' … 비교용 키."""
    s = (name or "").strip()
    s = re.sub(r"[\s·ㆍ・'’‘()\[\]]", "", s)
    s = s.replace("II", "Ⅱ").replace("I", "Ⅰ").replace("Ⅰ Ⅰ", "Ⅱ")
    s = s.replace("물리학", "물리").replace("생물", "생명과학").replace("생명과학과학", "생명과학")
    s = s.replace("법과정치", "정치와법")
    s = re.sub(r"형$", "", s)
    return s


def to_int(v):
    m = re.search(r"-?\d+(?:\.\d+)?", str(v or ""))
    if not m:
        return None
    f = float(m.group(0))
    return int(f) if f == int(f) else f


def record(source, exam_year, month, student_grade, subject, sub_subject, raw, std, pct, top=None, url=None):
    key = exam_key(exam_year, month, student_grade)
    if key is None:
        return None
    pad = lambda xs: (list(xs) + [None] * 8)[:8]
    return {
        "source": source, "examYear": exam_year, "month": month, "studentGrade": student_grade, **key,
        "subject": subject, "subSubject": sub_subject,
        "rawCuts": pad(raw), "standardCuts": pad(std), "percentiles": pad(pct),
        "top": top, "url": url, "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }


def save(source: str, records: list[dict]):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = [r for r in records if r]
    records.sort(key=lambda r: (r["examYear"], r["month"], r["studentGrade"], r["subject"], r["subSubject"] or ""))
    (OUT_DIR / f"{source}.json").write_text(json.dumps(records, ensure_ascii=False, indent=1) + "\n")
    print(f"{source}: {len(records)}건 → {(OUT_DIR / f'{source}.json').relative_to(ROOT)}")
