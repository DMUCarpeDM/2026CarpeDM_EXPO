#!/usr/bin/env python3
"""4-Fit 측정 타당성 — 준거 타당성 분석 (Study A 실행 도구).

설계서: docs/studies/measurement-validity-study.md
전문가 채점 폼: docs/studies/expert-rating-form.md
실행 계획: docs/studies/validity-pilot-plan.md

입력 CSV 2개:
  --fit      /admin export.csv 그대로
             (session_id,total_score,response_fit,voice_fit,eye_fit,posture_fit,...)
  --ratings  전문가 블라인드 채점 (평정자×세션 1행)
             session_id,rater_id,expert_response,expert_voice,expert_eye,expert_posture[,expert_overall]
             선택: fit.csv 또는 ratings.csv에 group 열(experienced|novice)이 있으면 기지-집단 비교도 수행

출력:
  · 준거 타당성: 각 Fit ↔ 대응 전문가 구성 Spearman ρ + 95% CI(Fisher z) + p
  · 다중비교 보정: Benjamini–Hochberg (주력 지표에만)
  · 평정자 간 신뢰도: ICC(2,k) 절대일치 (완전 케이스)
  · (group 있으면) 기지-집단 타당성: Mann–Whitney U + Cliff's δ

의존성: numpy만. scipy/pandas 불필요 (오프라인·최소 의존 원칙).
실행:   /Users/.../backend/.venv/bin/python docs/studies/analyze_validity.py --fit f.csv --ratings r.csv
자기검증: python docs/studies/analyze_validity.py --selftest

정직 경계(설계서 §7):
  - 이 스크립트는 계산 도구다. 결과 해석·사전등록·표본 대표성은 사람이 판단한다.
  - pilot 소표본(n<15)의 CI는 넓다 → '예비 결과'로만 보고.
  - eye/posture는 문화·신경다양성 교란으로 '점수 타당성'이 아니라 '관찰 지표'로만 다룬다
    (BH 주력 집합에서 제외, 별도 표기). 코드의 '관찰 격리' 원칙을 데이터로 뒷받침.
"""
from __future__ import annotations

import argparse
import csv
import math
import sys

import numpy as np

# 4-Fit 하위 점수 → 대응 전문가 구성. 주력(점수 타당성)과 관찰(해석 타당성)을 분리한다.
FIT_TO_EXPERT = {
    "response_fit": "expert_response",
    "voice_fit": "expert_voice",
    "eye_fit": "expert_eye",
    "posture_fit": "expert_posture",
}
PRIMARY = ("response_fit", "voice_fit")       # H1: 점수 타당성 주력 — BH 보정 대상
OBSERVATION = ("eye_fit", "posture_fit")      # 관찰 지표 — 문화 교란 명시, 강등 서사
Z95 = 1.959963984540054                        # 표준정규 97.5 분위


# ---------------------------------------------------------------------------
# 통계 (numpy만 — scipy 대체 구현)
# ---------------------------------------------------------------------------

def _phi(x: float) -> float:
    """표준정규 CDF (math.erf)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _rankdata(a: np.ndarray) -> np.ndarray:
    """평균 순위 (동점은 평균) — Spearman·Mann–Whitney 공용."""
    a = np.asarray(a, dtype=float)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a), dtype=float)
    sa = a[order]
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and sa[j + 1] == sa[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0  # 1-기반 평균 순위
        i = j + 1
    return ranks


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    rx, ry = _rankdata(x), _rankdata(y)
    rx = rx - rx.mean()
    ry = ry - ry.mean()
    denom = math.sqrt(float((rx ** 2).sum()) * float((ry ** 2).sum()))
    return float((rx * ry).sum() / denom) if denom > 0 else float("nan")


def spearman_ci_p(rho: float, n: int, alpha: float = 0.05) -> tuple[float, float, float]:
    """Fisher z 변환 기반 95% CI와 두측 p (H0: ρ=0). n>=4 필요."""
    if n < 4 or not math.isfinite(rho) or abs(rho) >= 1.0:
        return (float("nan"), float("nan"), float("nan"))
    z = math.atanh(rho)
    se = 1.0 / math.sqrt(n - 3)
    lo, hi = math.tanh(z - Z95 * se), math.tanh(z + Z95 * se)
    p = 2.0 * (1.0 - _phi(abs(z) / se))
    return (lo, hi, p)


def benjamini_hochberg(pvals: list[float], alpha: float = 0.05) -> list[bool]:
    """BH FDR: 유의 판정 리스트(입력 순서 유지)."""
    m = len(pvals)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: pvals[i])
    reject = [False] * m
    max_k = -1
    for rank, i in enumerate(order, start=1):
        if pvals[i] <= (rank / m) * alpha:
            max_k = rank
    if max_k >= 0:
        for rank, i in enumerate(order, start=1):
            if rank <= max_k:
                reject[i] = True
    return reject


def icc_2k(matrix: np.ndarray) -> tuple[float, int, int]:
    """ICC(2,k) 이원 랜덤효과·평균측정·절대일치. matrix: 행=대상(세션), 열=평정자.

    완전 케이스(결측 없는 행)만 사용. 반환: (icc, n_targets, k_raters).
    """
    m = np.asarray(matrix, dtype=float)
    m = m[~np.isnan(m).any(axis=1)]  # 완전 케이스
    n, k = m.shape
    if n < 2 or k < 2:
        return (float("nan"), n, k)
    grand = m.mean()
    row = m.mean(axis=1)   # 대상 평균
    col = m.mean(axis=0)   # 평정자 평균
    ss_r = k * float(((row - grand) ** 2).sum())
    ss_c = n * float(((col - grand) ** 2).sum())
    resid = m - row[:, None] - col[None, :] + grand
    ss_e = float((resid ** 2).sum())
    ms_r = ss_r / (n - 1)
    ms_c = ss_c / (k - 1)
    ms_e = ss_e / ((n - 1) * (k - 1)) if (n - 1) * (k - 1) > 0 else float("nan")
    denom = ms_r + (ms_c - ms_e) / n
    return (float((ms_r - ms_e) / denom) if denom > 0 else float("nan"), n, k)


def mann_whitney(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """Mann–Whitney U (a>b 방향), Cliff's δ, 정규근사 두측 p. 소표본은 근사임을 유의."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    n1, n2 = len(a), len(b)
    if n1 == 0 or n2 == 0:
        return (float("nan"), float("nan"), float("nan"))
    diff = a[:, None] - b[None, :]
    gt = float((diff > 0).sum())
    lt = float((diff < 0).sum())
    eq = float((diff == 0).sum())
    delta = (gt - lt) / (n1 * n2)             # Cliff's δ ∈ [-1,1]
    u1 = gt + 0.5 * eq
    mu = n1 * n2 / 2.0
    sigma = math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12.0)
    p = 2.0 * (1.0 - _phi(abs(u1 - mu) / sigma)) if sigma > 0 else float("nan")
    return (u1, delta, p)


# ---------------------------------------------------------------------------
# 데이터 로드·병합
# ---------------------------------------------------------------------------

def _read(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_pairs(fit_path: str, ratings_path: str):
    """fit·ratings를 session_id로 병합. 평정자 평균 전문가 점수와 4-Fit을 짝짓는다.

    반환: merged(list[dict]), rater_cube(construct→(sessions,raters) 행렬), group_map.
    """
    fit_rows = {r["session_id"]: r for r in _read(fit_path) if r.get("session_id")}
    rating_rows = _read(ratings_path)

    constructs = list(FIT_TO_EXPERT.values())
    raters = sorted({r.get("rater_id", "") for r in rating_rows})
    # session → rater → {construct: val}
    by_session: dict[str, dict[str, dict[str, float]]] = {}
    group_map: dict[str, str] = {}
    for r in rating_rows:
        sid = r.get("session_id")
        if not sid:
            continue
        rid = r.get("rater_id", "")
        vals = {c: _num(r.get(c)) for c in constructs}
        by_session.setdefault(sid, {})[rid] = vals
        if r.get("group"):
            group_map[sid] = r["group"]

    merged = []
    for sid, fr in fit_rows.items():
        if fr.get("group"):
            group_map.setdefault(sid, fr["group"])
        if sid not in by_session:
            continue
        row = {"session_id": sid}
        for fit_col in FIT_TO_EXPERT:
            row[fit_col] = _num(fr.get(fit_col))
        for c in constructs:
            vs = [rv[c] for rv in by_session[sid].values() if rv[c] is not None]
            row[c] = float(np.mean(vs)) if vs else None
        row["total_score"] = _num(fr.get("total_score"))
        merged.append(row)

    # 평정자 신뢰도용 큐브
    rater_cube = {}
    for c in constructs:
        mat = np.full((len(fit_rows), len(raters)), np.nan)
        for i, sid in enumerate(fit_rows):
            rv = by_session.get(sid, {})
            for j, rid in enumerate(raters):
                if rid in rv and rv[rid][c] is not None:
                    mat[i, j] = rv[rid][c]
        rater_cube[c] = mat
    return merged, rater_cube, group_map, raters


# ---------------------------------------------------------------------------
# 리포트
# ---------------------------------------------------------------------------

def _fmt(v, nd=3):
    return f"{v:.{nd}f}" if isinstance(v, float) and math.isfinite(v) else "  n/a"


def analyze(fit_path: str, ratings_path: str, out_path: str | None = None):
    merged, rater_cube, group_map, raters = load_pairs(fit_path, ratings_path)
    print(f"\n=== 4-Fit 측정 타당성 분석 (Study A) ===")
    print(f"병합된 세션: {len(merged)} · 평정자: {len(raters)} ({', '.join(raters) or '—'})\n")
    if len(merged) < 4:
        print("경고: 병합 세션 4개 미만 — 상관 계산 불가. 데이터 수집을 늘리세요.")
        return

    # --- 준거 타당성 ---
    rows_out = []
    primary_p = []
    print("[준거 타당성] Fit ↔ 전문가 구성  Spearman ρ (95% CI, p)")
    print(f"{'Fit':<14}{'구성':<18}{'n':>4}{'ρ':>8}{'CI_low':>9}{'CI_high':>9}{'p':>9}  판정")
    lines = []
    for fit_col, exp_col in FIT_TO_EXPERT.items():
        xy = [(m[fit_col], m[exp_col]) for m in merged
              if m.get(fit_col) is not None and m.get(exp_col) is not None]
        n = len(xy)
        if n < 4:
            lines.append((fit_col, exp_col, n, float("nan"), float("nan"),
                          float("nan"), float("nan"), "표본부족"))
            continue
        x = np.array([p[0] for p in xy]); y = np.array([p[1] for p in xy])
        rho = spearman(x, y)
        lo, hi, p = spearman_ci_p(rho, n)
        kind = "주력" if fit_col in PRIMARY else "관찰"
        lines.append((fit_col, exp_col, n, rho, lo, hi, p, kind))
        if fit_col in PRIMARY and math.isfinite(p):
            primary_p.append((fit_col, p))

    # BH 보정 (주력만)
    bh = dict(zip([f for f, _ in primary_p],
                  benjamini_hochberg([p for _, p in primary_p])))
    for fit_col, exp_col, n, rho, lo, hi, p, kind in lines:
        verdict = kind
        if kind == "주력" and fit_col in bh:
            sig = bh[fit_col] and math.isfinite(lo) and lo > 0
            verdict = "주력·지지" if sig else "주력·미지지"
        print(f"{fit_col:<14}{exp_col:<18}{n:>4}{_fmt(rho):>8}"
              f"{_fmt(lo):>9}{_fmt(hi):>9}{_fmt(p):>9}  {verdict}")
        rows_out.append({"metric": fit_col, "construct": exp_col, "n": n,
                         "rho": rho, "ci_low": lo, "ci_high": hi, "p": p, "verdict": verdict})
    print("\n  · 주력(Response/Voice): BH 보정 후 유의 & CI 하한>0 이면 '지지'. 그 외 정직하게 미지지.")
    print("  · 관찰(Eye/Posture): 점수 타당성 아님 — 해석 참고용. 문화·신경다양성 교란 명시(설계서 §6).")

    # --- 평정자 신뢰도 ---
    print("\n[평정자 간 신뢰도] ICC(2,k) 절대일치 (완전 케이스)")
    for c in FIT_TO_EXPERT.values():
        icc, n, k = icc_2k(rater_cube[c])
        flag = "" if not math.isfinite(icc) else ("  ✓양호(≥.7)" if icc >= 0.7 else "  ⚠낮음")
        print(f"  {c:<18} ICC={_fmt(icc)}  (n={n}, k={k}){flag}")
    print("  · ICC<0.7면 평정자 캘리브레이션(공통 샘플 재조율)이 먼저다 — 상관 해석 보류.")

    # --- 기지-집단 타당성 ---
    exp_ids = [m["session_id"] for m in merged if group_map.get(m["session_id"]) == "experienced"]
    nov_ids = [m["session_id"] for m in merged if group_map.get(m["session_id"]) == "novice"]
    if exp_ids and nov_ids:
        ts = {m["session_id"]: m["total_score"] for m in merged if m["total_score"] is not None}
        a = np.array([ts[s] for s in exp_ids if s in ts])
        b = np.array([ts[s] for s in nov_ids if s in ts])
        u, delta, p = mann_whitney(a, b)
        print(f"\n[기지-집단 타당성] 총점: 경험자(n={len(a)}) vs 초심자(n={len(b)})")
        print(f"  Mann–Whitney U={_fmt(u,1)}  Cliff's δ={_fmt(delta)}  p={_fmt(p)} (정규근사)")
        print("  · δ>0 이면 경험자 우위. |δ|: 0.15 소·0.33 중·0.47 대 (경험칙).")
    else:
        print("\n[기지-집단 타당성] group 열(experienced|novice) 없음 — 건너뜀.")

    if out_path:
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["metric", "construct", "n", "rho",
                                              "ci_low", "ci_high", "p", "verdict"])
            w.writeheader()
            w.writerows(rows_out)
        print(f"\n결과 저장: {out_path}")
    print("\n⚠ pilot 소표본이면 '예비 결과'로만 보고하고 표본을 확대하세요 (설계서 §8).\n")


# ---------------------------------------------------------------------------
# 자기검증 — 합성 데이터로 파이프라인 전체 검증 (오늘 실행 가능)
# ---------------------------------------------------------------------------

def selftest() -> int:
    rng = np.random.default_rng(12345)
    n = 40
    latent = rng.normal(0, 1, n)  # 잠재 역량
    ok = True

    def check(name, cond):
        nonlocal ok
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")
        ok = ok and cond

    # 준거 타당성: fit과 전문가 평정이 같은 잠재요인을 반영 → 중간 이상 상관 회복
    fit = np.clip(60 + 14 * latent + rng.normal(0, 6, n), 0, 100)
    experts = [np.clip(3 + latent + rng.normal(0, 0.6, n), 1, 5) for _ in range(3)]
    expert_mean = np.mean(experts, axis=0)
    rho = spearman(fit, expert_mean)
    lo, hi, p = spearman_ci_p(rho, n)
    check(f"Spearman 상관 회복 ρ={rho:.2f} (≥0.5 기대)", rho >= 0.5)
    check(f"CI 하한>0 & p<0.05 (ρ 유의)  CI=({lo:.2f},{hi:.2f}) p={p:.4f}", lo > 0 and p < 0.05)

    # 무상관 대조: 독립 잡음이면 ρ≈0, CI가 0을 포함
    noise = rng.normal(0, 1, n)
    r0 = spearman(fit, noise)
    lo0, hi0, p0 = spearman_ci_p(r0, n)
    check(f"무상관 대조 CI가 0 포함 ρ={r0:.2f} CI=({lo0:.2f},{hi0:.2f})", lo0 < 0 < hi0)

    # ICC: 세 평정자가 공통 신호 공유 → 높은 ICC
    mat = np.column_stack(experts)
    icc, nn, kk = icc_2k(mat)
    check(f"ICC(2,k) 높음 icc={icc:.2f} (≥0.7 기대, n={nn} k={kk})", icc >= 0.7)

    # 무신뢰 대조: 완전 무작위 평정 → 낮은 ICC
    junk = rng.normal(0, 1, (n, 3))
    icc_j, _, _ = icc_2k(junk)
    check(f"무작위 평정 ICC 낮음 icc={icc_j:.2f} (<0.5 기대)", icc_j < 0.5)

    # BH: 강신호 2 + 잡음 3 → 강신호만 살아남음
    reject = benjamini_hochberg([0.0001, 0.002, 0.30, 0.55, 0.80])
    check(f"BH: 강신호 2개만 기각 {reject}", reject[:2] == [True, True] and not any(reject[2:]))

    # 기지-집단: 경험자(높은 잠재) vs 초심자 → 유의한 집단차, δ>0
    med = np.median(latent)
    a = fit[latent >= med]; b = fit[latent < med]
    u, delta, pg = mann_whitney(a, b)
    check(f"집단차 유의 & δ>0  δ={delta:.2f} p={pg:.4f}", delta > 0 and pg < 0.05)

    print(f"\n자기검증 {'전체 통과 ✓' if ok else '실패 ✗'} — 파이프라인은 오늘 실행 가능합니다.")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="4-Fit 측정 타당성 분석 (Study A)")
    ap.add_argument("--fit", help="/admin export.csv")
    ap.add_argument("--ratings", help="전문가 블라인드 채점 CSV")
    ap.add_argument("--out", help="Fit별 결과 CSV 저장 경로")
    ap.add_argument("--selftest", action="store_true", help="합성 데이터로 파이프라인 검증")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.fit or not args.ratings:
        ap.error("--fit 과 --ratings 를 지정하거나 --selftest 를 쓰세요.")
    analyze(args.fit, args.ratings, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
