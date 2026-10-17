#!/usr/bin/env python3
"""시험 당일 자료 자동 수집·검증·게시 (KICEGG).

흐름: 오늘 시험 감지(calendar.json) → EBSi 기출 목록에서 해당 회차 카드 수집 →
PDF 내려받아 코드 검사 → 강한 모델의 판정 → 통과분만 릴리스 업로드 + exams.json 추가 + 푸시.

안전장치
- 검사 하나라도 실패하면 게시하지 않고 보류 보고만 한다.
- 이미 exams.json 에 있는 회차·과목은 건너뛴다(--force 로 무시, 시험용).
- 락 파일로 동시 실행을 막는다(크론 10분 간격 + 긴 실행 대비).

사용:
  python3 scripts/collect-examday.py --dry-run            # 감지·다운로드·검사·모델판정만
  python3 scripts/collect-examday.py                      # 통과분 자동 게시(푸시 → CI 렌더)
  python3 scripts/collect-examday.py --date 2026-10-20    # 특정 날짜로 실행
  python3 scripts/collect-examday.py --grades 1,2 --limit 2 --dry-run --force
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / 'data' / 'calendar.json'
EXAMS = ROOT / 'data' / 'exams.json'
WORK = Path('/tmp/kicegg-examday')
LOCK = WORK / 'lock'
PROFILE_ENV = Path('/opt/data/profiles/sandbox/.env')
UA = 'Mozilla/5.0 (compatible; kicegg-collector/1.0)'
EBSI_DL = 'https://wdown.ebsi.co.kr/W61001/01exam'
VERIFY_MODEL = os.environ.get('EXAMDAY_MODEL', 'kimi-k3')
API_BASE = os.environ.get('OPENCODE_GO_BASE', 'https://opencode.ai/zen/go/v1')

TYPE_BY_MONTH = {3: 'mar', 4: 'apr', 5: 'may', 6: 'jun', 7: 'jul', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec'}


def env(name: str) -> str:
    v = os.environ.get(name)
    if v:
        return v
    for line in PROFILE_ENV.read_text(encoding='utf-8').splitlines():
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f'{name} 없음 — 프로필 .env 확인')


def run(cmd: list[str], cwd: Path | None = ROOT, check: bool = True) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f'명령 실패 {cmd[:2]}: {p.stderr.strip()[:300]}')
    return p


# ── 1. 오늘 시험 감지 ────────────────────────────────────────────────
def today_kst() -> dt.date:
    return (dt.datetime.utcnow() + dt.timedelta(hours=9)).date()


def today_targets(day: dt.date) -> list[dict]:
    """calendar.json 에서 그날 시험 일정(학평·모평·수능·검정고시 시행)을 찾는다."""
    doc = json.loads(CAL.read_text(encoding='utf-8'))
    iso = day.isoformat()
    out = []
    for e in doc['events']:
        if e.get('date') != iso or e.get('type') != 'exam':
            continue
        out.append({
            'title': e['title'],
            'category': e.get('category'),
            'grades': e.get('grades') or [3],
            'org': e.get('org'),
        })
    return out


# ── 2. EBSi 목록에서 회차 카드 수집 ──────────────────────────────────
def ebsi_cards(year: int, grade: int) -> list[dict]:
    p = run(['node', 'scripts/fetch-ebsi-paper-list.mjs', '--year', str(year), '--grade', str(grade)])
    return json.loads(p.stdout)['cards']


SUBJECT_FIX = [('언어와 매체', '언어와매체'), ('화법과 작문', '화법과작문')]


def split_subject(title: str) -> tuple[str, str | None]:
    """카드 제목 → (과목, 세부과목). 예: '고3 9월 모평(평원) 화법과 작문'."""
    tail = title.split(')', 1)[-1].strip()
    for raw, norm in SUBJECT_FIX:
        if raw in tail:
            return '국어', norm
    if '기하' in tail:
        return '수학', '기하'
    if '확률과 통계' in tail:
        return '수학', '확률과통계'
    if '미적분' in tail:
        return '수학', '미적분'
    if '언어이해' in tail:
        return '언어이해', None
    return tail, None


# ── 3. 내려받기 + 코드 검사 ─────────────────────────────────────────
SUBJECT_SLUG = {
    '국어': 'korean', '수학': 'math', '영어': 'english', '한국사': 'history',
    '통합사회': 'social', '사회탐구': 'social', '통합과학': 'science', '과학탐구': 'science',
    '제2외국어': 'foreign', '직업탐구': 'vocational',
}
# 학평 정답은 EBSi '정답 및 해설' PDF(H). 모바일 정답 이미지(J)는 사이트 규칙(정답·해설 PDF)에 맞지 않아 쓰지 않는다.
ANSWER_TEXT_KEYS = ('정답', '정답 및 해설')


def slug(subject: str, grade: int, day: 'dt.date') -> str:
    core = SUBJECT_SLUG.get(subject, re.sub(r'[^a-z0-9]+', '', subject.lower())[:8] or 'subject')
    return f'{day.year}_{day.month:02d}_g{grade}_{core}'


def fetch_pdf(url: str, dest: Path) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://www.ebsi.co.kr/'})
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read()
    dest.write_bytes(body)
    info = {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()[:16]}
    if body[:5] != b'%PDF-':
        info['kind'] = 'not-pdf'
        return info
    info['kind'] = 'pdf'
    try:
        out = run(['pdfinfo', str(dest)], check=False).stdout
        m = re.search(r'Pages:\s+(\d+)', out)
        info['pages'] = int(m.group(1)) if m else None
        txt = run(['pdftotext', '-f', '1', '-l', '2', str(dest), '-'], check=False).stdout
        info['head'] = re.sub(r'\s+', ' ', txt)[:1200]
        full = run(['pdftotext', str(dest), '-'], check=False).stdout
        info['full_text_len'] = len(full)
        info['text'] = re.sub(r'\s+', ' ', full)[:8000]
    except Exception as e:  # noqa: BLE001
        info['error'] = f'{type(e).__name__}: {e}'
    return info


def code_checks(day: dt.date, grade: int, subject: str, q: dict, a: dict) -> list[str]:
    """결정적으로 판정 가능한 것만 본다. 실패 사유 목록을 돌려준다."""
    bad = []
    if q.get('kind') != 'pdf':
        bad.append('문제지가 PDF 아님')
    if a.get('kind') != 'pdf':
        bad.append('정답·해설이 PDF 아님')
    if q.get('pages') is None or a.get('pages') is None:
        bad.append('쪽수 확인 실패')
    if q.get('full_text_len', 0) < 500:
        bad.append('문제지 텍스트가 거의 없음(스캔 이미지 가능)')
    head = q.get('head', '')
    if str(day.year) not in head:
        bad.append(f'문제지 1쪽에 {day.year} 없음')
    if f'{day.month}월' not in head:
        bad.append(f'문제지 1쪽에 {day.month}월 없음')
    if f'고{grade}' not in head and f'고등학교 {grade}' not in head:
        bad.append(f'문제지 1쪽에 고{grade} 표기 없음')
    if not re.search(r'(?m)(?:^|\s)(\d{1,2})\.\s', q.get('text', '')):
        bad.append('문항 번호를 찾지 못함')
    if not any(k in a.get('text', '') for k in ANSWER_TEXT_KEYS):
        bad.append('정답·해설 파일에 "정답" 표기 없음')
    if f'고{grade}' not in a.get('head', '') and f'고{grade}' not in a.get('text', '')[:400]:
        bad.append(f'정답·해설에 고{grade} 표기 없음')
    if q.get('sha256') == a.get('sha256'):
        bad.append('문제지와 정답 파일이 동일')
    return bad


# ── 4. 강한 모델 판정 ────────────────────────────────────────────────
def model_verdict(payload: dict) -> dict:
    key = env('OPENCODE_GO_API_KEY')
    prompt = (
        '너는 한국 시험 자료 검수자다. 아래는 자동 수집한 회차 자료의 실측 정보다.\n'
        '기대값: ' + json.dumps(payload['expected'], ensure_ascii=False) + '\n'
        '문제지 1~2쪽 텍스트: ' + payload['question_head'][:1500] + '\n'
        '정답·해설 1~2쪽 텍스트: ' + payload['answer_head'][:800] + '\n'
        '코드 검사 결과(실패 사유): ' + json.dumps(payload['code_issues'], ensure_ascii=False) + '\n\n'
        '이 파일들이 기대한 학년도·시행월·학년·과목의 "문제지"와 "정답"이 맞는지 판단하라.\n'
        '다른 회차·다른 과목·다른 학년이거나, 문제지가 아니라 답안/해설/안내문이면 match=false 다.\n'
        '확실하지 않으면 match=false 로 하고 이유를 써라. 추측으로 true 를 주지 마라.\n'
        'JSON 만 출력: {"match": true|false, "confidence": 0~1, "why": "한 줄"}'
    )
    body = json.dumps({
        'model': VERIFY_MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0,
    }).encode()
    req = urllib.request.Request(
        f'{API_BASE}/chat/completions', data=body,
        headers={
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            # UA 없이 보내면 Cloudflare 1010(browser signature banned)로 막힌다
            'User-Agent': 'kicegg-examday/1.0',
            # opencode-go 게이트웨이는 세션 헤더가 없으면 라우팅을 거부한다(MissingSessionID)
            'x-opencode-session': 'examday-' + hashlib.sha256(os.urandom(16)).hexdigest()[:24],
        })
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    text = data['choices'][0]['message']['content']
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return {'match': False, 'confidence': 0, 'why': '모델 응답 파싱 실패: ' + text[:120]}
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return {'match': False, 'confidence': 0, 'why': '모델 JSON 오류: ' + m.group(0)[:120]}


# ── 5. 게시 ─────────────────────────────────────────────────────────
def gh(path: str, method: str = 'GET', body=None, raw: bytes | None = None, ctype='application/json'):
    tok = env('GITHUB_TOKEN')
    req = urllib.request.Request('https://api.github.com' + path, method=method,
                                 data=raw if raw is not None else (json.dumps(body).encode() if body is not None else None),
                                 headers={'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github+json',
                                          'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, (json.load(r) if r.status != 204 else None)


def ensure_release(tag: str, name: str) -> int:
    try:
        _, rel = gh(f'/repos/hongdoohyeon/Suneung/releases/tags/{tag}')
        return rel['id']
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    _, rel = gh('/repos/hongdoohyeon/Suneung/releases', 'POST',
                {'tag_name': tag, 'name': name, 'body': f'{name} — 자동 수집(collect-examday.py)'})
    return rel['id']


def upload_asset(release_id: int, path: Path, asset_name: str) -> str:
    data = path.read_bytes()
    req = urllib.request.Request(
        f'https://uploads.github.com/repos/hongdoohyeon/Suneung/releases/{release_id}/assets'
        f'?name={urllib.parse.quote(asset_name)}', method='POST', data=data,
        headers={'Authorization': 'Bearer ' + env('GITHUB_TOKEN'),
                 'Content-Type': 'application/pdf', 'Content-Length': str(len(data))})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)['browser_download_url']


def verify_live(day: dt.date, ids: list[int], timeout_min: int = 25) -> str:
    """푸시 뒤 CI 빌드가 끝나고 새 자료가 라이브 exams.json 에 실제로 있는지 확인한다."""
    sha = run(['git', 'rev-parse', 'HEAD']).stdout.strip()
    deadline = time.time() + timeout_min * 60
    state = 'CI 빌드 대기 시간 초과'
    while time.time() < deadline:
        try:
            _, runs = gh(f'/repos/hongdoohyeon/Suneung/actions/runs?head_sha={sha}&per_page=20')
            build = [r for r in runs.get('workflow_runs', []) if r['name'] == 'build']
            if build and build[0]['status'] == 'completed':
                if build[0]['conclusion'] != 'success':
                    return f'CI build {build[0]["conclusion"]} — 로그 확인 필요'
                state = 'CI build 성공'
                break
        except Exception:  # noqa: BLE001
            pass
        time.sleep(60)
    for _ in range(15):
        try:
            req = urllib.request.Request(f'https://kicegg.com/data/exams.json?live={int(time.time())}',
                                         headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                live = json.load(r)
            have = {e['id'] for e in live}
            if all(i in have for i in ids):
                return f'{state} · 라이브 exams.json 에 신규 {len(ids)}건 확인'
        except Exception:  # noqa: BLE001
            pass
        time.sleep(60)
    return f'{state} · 라이브 반영 확인 실패(수동 확인 필요)'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', help='YYYY-MM-DD (기본: 한국 오늘)')
    ap.add_argument('--grades', help='쉼표 구분(기본: calendar.json 의 grades)')
    ap.add_argument('--limit', type=int, default=0, help='과목 수 제한(시험용)')
    ap.add_argument('--dry-run', action='store_true', help='게시하지 않음')
    ap.add_argument('--force', action='store_true', help='이미 있는 회차도 다시 검사(시험용)')
    ap.add_argument('--no-model', action='store_true', help='모델 판정 생략(시험용)')
    ap.add_argument('--no-push', action='store_true', help='커밋만 하고 푸시·라이브 확인은 하지 않음(시험용)')
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    lock = open(LOCK, 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('다른 수집 실행이 진행 중 — 이번 틱은 건너뜀')
        return 0

    day = dt.date.fromisoformat(args.date) if args.date else today_kst()
    targets = today_targets(day)
    if not targets:
        return 0  # 오늘 시험 없음 → 조용히 종료(stdout 없음 = 알림 없음)

    # 같은 내용을 매 틱(10분)마다 다시 알리지 않도록 이미 낸 소식을 기억한다.
    stamp0 = day.strftime('%Y%m%d')
    seen_path = WORK / f'said-{stamp0}.json'
    try:
        said = set(json.loads(seen_path.read_text()))
    except Exception:  # noqa: BLE001
        said = set()

    exams = json.loads(EXAMS.read_text(encoding='utf-8'))
    have = {(e.get('gradeYear'), e.get('month'), e.get('studentGrade'), e.get('subject'), e.get('subSubject'), e.get('type'))
            for e in exams}
    maxid = max(e['id'] for e in exams)
    published, held, done = [], [], 0
    stamp = day.strftime('%Y%m%d')
    stage = WORK / stamp
    stage.mkdir(exist_ok=True)

    for t in targets:
        if t['category'] != 'edu':
            held.append({'card': t['title'], 'why': f'자동 게시 대상 아님({t["category"]}) — 수동 처리 필요'})
            continue
        grades = [int(g) for g in args.grades.split(',')] if args.grades else t['grades']
        for grade in grades:
            cards = [c for c in ebsi_cards(day.year, grade) if c['month'] == day.month]
            print(f'[정보] {day.year}년 {day.month}월 고{grade}: 카드 {len(cards)}장', file=sys.stderr)
            for card in cards:
                subject, sub = split_subject(card['title'])
                etype = TYPE_BY_MONTH.get(day.month)
                key = (day.year, day.month, grade if t['category'] == 'edu' else None, subject, sub, etype)
                if key in have and not args.force:
                    continue
                if args.limit and done >= args.limit:
                    break
                done += 1
                q_url = card['downloads'].get('P')
                a_url = card['downloads'].get('H') or card['downloads'].get('J')
                if not q_url or not a_url:
                    held.append({'card': card['title'], 'why': '문제지/정답 링크 없음'})
                    continue
                name = slug(subject, grade, day)
                qfile, afile = stage / f'{name}_q.pdf', stage / f'{name}_a.pdf'
                try:
                    qi = fetch_pdf(q_url, qfile)
                    ai = fetch_pdf(a_url, afile)
                except Exception as e:  # noqa: BLE001
                    held.append({'card': card['title'], 'why': f'다운로드 실패 {type(e).__name__}'})
                    continue
                issues = code_checks(day, grade, subject, qi, ai)
                verdict = {'match': False, 'confidence': 0, 'why': '모델 판정 생략'}
                if not args.no_model:
                    try:
                        verdict = model_verdict({
                            'expected': {'시행일': day.isoformat(), '학년도': day.year, '월': day.month,
                                         '학년': grade, '과목': subject, '세부과목': sub, '제목': card['title']},
                            'question_head': qi.get('head', ''), 'answer_head': ai.get('head', ''),
                            'code_issues': issues,
                        })
                    except Exception as e:  # noqa: BLE001
                        verdict = {'match': False, 'why': f'모델 호출 실패 {type(e).__name__}: {str(e)[:120]}'}
                ok = (not issues) and verdict.get('match') is True
                rec = {'card': card['title'], 'files': [qfile.name, afile.name], 'pages': [qi.get('pages'), ai.get('pages')],
                       'code_issues': issues, 'verdict': verdict}
                if not ok:
                    held.append({**rec, 'why': '검사 실패'})
                    continue
                if args.dry_run:
                    published.append({**rec, 'why': 'dry-run: 게시 생략'})
                    continue
                # 게시: 릴리스 업로드 → exams.json 추가
                try:
                    rid = ensure_release(f'edu-{day.year}-{day.month:02d}', f'{day.year}년 {day.month}월 학평 자동 수집')
                    qu = upload_asset(rid, qfile, f'{name}_q.pdf')
                    au = upload_asset(rid, afile, f'{name}_a.pdf')
                    maxid += 1
                    label = f'{day.year}년 {day.month}월 학력평가 {subject}'
                    exams.append({
                        'curriculum': '2015', 'gradeYear': day.year, 'examYear': day.year, 'month': day.month,
                        'studentGrade': grade, 'typeGroup': 'education', 'type': etype,
                        'subject': subject, 'subSubject': sub,
                        'solutionUrl': None, 'answerIncludesSolution': True,
                        'questionUrl': f'https://suneung-files.hdh061224.workers.dev/edu-{day.year}-{day.month:02d}/{name}_q.pdf?name={urllib.parse.quote(label + " 문제지.pdf")}',
                        'answerUrl': f'https://suneung-files.hdh061224.workers.dev/edu-{day.year}-{day.month:02d}/{name}_a.pdf?name={urllib.parse.quote(label + " 정답 및 해설.pdf")}',
                        'questionDownload': label + ' 문제지.pdf', 'answerDownload': label + ' 정답 및 해설.pdf',
                        'id': maxid, 'source': 'examday-auto',
                        'sourcePage': f'https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=D{grade}00',
                    })
                    published.append({**rec, 'id': maxid, 'asset': [qu, au]})
                except Exception as e:  # noqa: BLE001
                    held.append({**rec, 'why': f'게시 실패 {type(e).__name__}: {str(e)[:150]}'})

    if published and not args.dry_run:
        EXAMS.write_text(json.dumps(exams, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        run(['node', 'scripts/validate-exams.mjs'])
        run(['git', 'add', 'data/exams.json'])
        msg = f'{day.month}월 학평 자동 수집 — {len(published)}건 (자료·검증: collect-examday.py)'
        run(['git', 'commit', '-q', '-m', msg])
        if not args.no_push:
            run(['git', 'pull', '--rebase', '-q', 'origin', 'main'])
            run(['git', 'push', '-q', 'origin', 'main'])
            print(f'[게시] {len(published)}건 커밋·푸시 완료 — CI가 렌더 후 배포')
            verify_ids = [p['id'] for p in published]
            verdict = verify_live(day, verify_ids)
            print(f'[라이브 확인] {verdict}')
        else:
            print(f'[게시] {len(published)}건 커밋만 함(--no-push)')

    report = {'date': day.isoformat(), 'targets': [t['title'] for t in targets],
              'published': published, 'held': held}
    (WORK / f'report-{stamp}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    def hkey(h: dict) -> str:
        return 'held:' + h['card'] + ':' + (h.get('why') or ','.join(h.get('code_issues', [])[:2]))

    new_pub = [p for p in published if f"pub:{p.get('id')}" not in said]
    new_held = [h for h in held if hkey(h) not in said]
    if not new_pub and not new_held:
        return 0  # 새 소식 없음 → 조용히(10분마다 같은 알림 반복 금지)
    said |= {f"pub:{p.get('id')}" for p in new_pub} | {hkey(h) for h in new_held}
    seen_path.write_text(json.dumps(sorted(said), ensure_ascii=False), encoding='utf-8')

    lines = [f'시험 자료 자동 수집 — {day.isoformat()}']
    for t in targets:
        lines.append(f'• {t["title"]}')
    if new_pub:
        lines.append(f'게시 {len(new_pub)}건:')
        for p in new_pub[:20]:
            lines.append(f'  - {p["card"]} → id {p.get("id", "-")} ({p.get("why", "게시됨")})')
    if new_held:
        lines.append(f'보류 {len(new_held)}건(사람 확인 필요):')
        for h in new_held[:10]:
            why = h.get('why') or ('코드검사 ' + ', '.join(h.get('code_issues', [])[:2]))
            lines.append(f'  - {h["card"]}: {why}')
    print('\n'.join(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main())
