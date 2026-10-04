#!/usr/bin/env python3
"""영어 듣기 mp3 → 문항 시작 시점(exams.json listenChapters "초:라벨,…").

원리: 문항마다 끝에 '답 쓰는 시간'(6초 이상 무음)이 있다. 그 무음이 끝나는 곳 = 다음 문항 시작.
 - 무음 끝이 25~135초 간격으로 이어지는 가장 긴 구간 = 2번~마지막 문항 시작
 - 1번 = 그 직전 짧은 무음 끝(없으면 0초, 앞에 안내 방송이 있으면 '안내' 0초 추가)
 - 문항 수가 16(16~17 묶음)·17·21(21~22 묶음)이 아니면 실패로 보고 비움
 - 실제 경계보다 1초 일찍(문항 앞부분이 안 잘리게)
문항별 트랙으로 받은 평가원 자료 7회차로 검증: 문항 수·번호 전부 일치, 오차 최대 2.4초(2026-10).

사용: python3 scripts/listening-chapters.py 파일.mp3   → listenChapters 문자열 출력 (실패면 빈 줄)
필요: ffmpeg/ffprobe
"""
import re
import subprocess
import sys


def silences(path, db=-40, d=2.0):
    err = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', f'silencedetect=noise={db}dB:d={d}',
                          '-f', 'null', '-'], capture_output=True).stderr.decode('utf-8', 'ignore')
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', err)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', err)]
    return list(zip(st, en))


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True).stdout.decode()
    return float(out.strip())


def detect(path):
    S = silences(path)
    T = duration(path)
    cand = [e for a, e in S if e - a >= 6 and T - e > 30]
    best, cur = [], []
    for c in cand:
        cur = cur + [c] if cur and 25 <= c - cur[-1] <= 135 else [c]
        if len(cur) > len(best):
            best = cur[:]
    if not best:
        return None
    q2 = best[0]
    pre = [e for a, e in S if q2 - 135 <= e <= q2 - 25]
    if not pre and q2 >= 135:
        pre = [e for a, e in silences(path, -40, 1.0) if q2 - 135 <= e <= q2 - 25]
    q1 = pre[-1] if pre else (0.0 if q2 < 135 else None)
    if q1 is None:
        return None
    starts = [q1] + best
    labels = {16: [str(i) for i in range(1, 16)] + ['16~17'],
              17: [str(i) for i in range(1, 18)],
              21: [str(i) for i in range(1, 21)] + ['21~22']}.get(len(starts))
    if not labels:
        return None
    out = [(0.0, '안내')] if q1 > 20 else []
    out += [(max(0.0, round(t - 1.0, 1)), l) for t, l in zip(starts, labels)]
    return ','.join(f'{t:g}:{l}' for t, l in out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(detect(p) or '')
