"""공식 표준점수 도수분포 → 원점수 등급컷 (v4: 제약을 모두 만족하는 후보 전체, 전원 일치 시에만 확정).

표준점수 = round_half_up(C + b*(r-μ)), b=K/σ (국수영 C=100,K=20 / 탐구·제2외 C=50,K=10)
제약 (모두 '공식 도수분포'에서 바로 확인 가능한 것만)
 A. 관측된 표준점수는 모두 어떤 가능한 원점수의 상 (S ⊆ image)
 B. 상에 있는데 관측이 0명인 표준점수: 그 원점수 양옆의 1인당 인원이 전체의 0.1% 미만일 때만 허용
 D. 양 끝에서 연속으로 0명인 원점수는 최대 3개(응시 5천 명 미만은 6개)
 C. 표준점수 하나에 원점수 k개가 겹치면 인원은 대략 k배: 겹침 수가 다른 이웃끼리 원점수 1개당
    인원(n_s/k) 비가 [1/1.8, 1.8] 범위 (인원이 많아 통계적으로 뚜렷한 곳만 검사)
판정: 후보가 있고, 모든 후보의 원점수 등급컷이 같으면 확정. 아니면 모호(범위 보고).
"""
from __future__ import annotations
import numpy as np

RATIO = 1.8


def solve(dist, full, C, K, std_cuts, raws, nb=1500, na=200, min_n=400, edge=None, ratio=True):
    raws = np.array(sorted(raws), dtype=float)
    S = sorted(dist); lo, hi = S[0], S[-1]
    Sset = set(S); N = sum(dist.values())
    if edge is None:
        edge = 3 if N >= 5000 else 6
    span = raws[-1] - raws[0]
    base = (hi - lo) / span
    out = []
    for b in np.linspace(base * 0.8, base * 1.25 + 1.0 / span, nb):
        mu_hi = raws[-1] - (hi - 0.5 - C) / b
        mu_lo = raws[-1] - (hi + 3.5 - C) / b
        for mu in np.linspace(mu_lo, mu_hi, na):
            row = np.floor(C + b * (raws - mu) + 0.5 + 1e-9).astype(int)
            iv = set(row.tolist())
            if not Sset <= iv:
                continue
            vals, inv, cnt = np.unique(row, return_inverse=True, return_counts=True)
            per = {int(v): dist.get(int(v), 0) / k for v, k in zip(vals, cnt)}
            # D. 양 끝에서 연속 0명 원점수는 최대 edge 개 (실제 시험에서 하위·상위 구간이 통째로 비지 않음)
            mr = [dist.get(int(v), 0) for v in row]
            lead = next((i for i, x in enumerate(mr) if x), len(mr))
            trail = next((i for i, x in enumerate(reversed(mr)) if x), len(mr))
            if lead > edge or trail > edge:
                continue
            kk = {int(v): int(k) for v, k in zip(vals, cnt)}
            ok = True
            order = [int(v) for v in vals]
            for i, v in enumerate(order):
                if per[v] == 0:   # B
                    nb_ = [per[order[j]] for j in (i - 1, i + 1) if 0 <= j < len(order)]
                    if nb_ and max(nb_) > 0.001 * N:
                        ok = False; break
                    continue
                # C: 인원 많은 곳만
                if not ratio:
                    continue
                for j in (i - 1, i + 1):
                    if 0 <= j < len(order):
                        w = order[j]
                        if kk[v] != kk[w] and per[w] > 0 and dist.get(v, 0) >= min_n and dist.get(w, 0) >= min_n:
                            r = per[v] / per[w]
                            if r > RATIO or r < 1 / RATIO:
                                ok = False; break
                if not ok:
                    break
            if not ok:
                continue
            cuts = []
            for c in std_cuts:
                idx = np.nonzero(row >= c)[0]
                cuts.append(int(raws[idx].min()) if len(idx) else None)
            out.append((float(mu), float(K / b), tuple(cuts)))
    return out


def summarize(sols):
    if not sols:
        return None
    variants = sorted({s[2] for s in sols})
    lo = tuple(min(v[i] for v in variants) for i in range(len(variants[0])))
    hi = tuple(max(v[i] for v in variants) for i in range(len(variants[0])))
    return {"unique": len(variants) == 1, "cuts": variants[0] if len(variants) == 1 else None,
            "lo": lo, "hi": hi, "nvar": len(variants),
            "mu": (round(min(s[0] for s in sols), 2), round(max(s[0] for s in sols), 2)),
            "sd": (round(min(s[1] for s in sols), 2), round(max(s[1] for s in sols), 2))}
