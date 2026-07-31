"""타당성 예비 분석 (S-B2B-JUDGE·S-B2B-SCORE) — 쌓인 세션 데이터에서 세 가지 증거를 뽑는다.

1) judge   : LLM judge 중앙값 ↔ 결정적 파이프라인 점수의 상관 (수렴 증거)
             — 두 값은 분석 시 세션 레벨 AnalysisResult.raw_metrics.judge에 병기 저장된다.
2) retest  : 같은 참여자×시나리오×모드의 1차→2차 총점 (안정성 + 학습 효과)
             — attempt_no 인프라가 이미 쌓아 온 데이터를 그대로 사용.
3) axes    : 4-Fit 축 간 상관 행렬 (수렴/변별 참고 — 축들이 서로 다른 걸 재는지)

사용법 (완료 세션이 쌓인 DB에서):
  ./.venv/Scripts/python.exe scripts/analyze_validity.py judge
  ./.venv/Scripts/python.exe scripts/analyze_validity.py retest
  ./.venv/Scripts/python.exe scripts/analyze_validity.py axes
  ./.venv/Scripts/python.exe scripts/analyze_validity.py all

표본이 부족하면 결론을 내리지 않고 '보류'를 출력한다 — 없는 증거를 있는 척
하지 않는 것이 이 스크립트의 존재 이유다. 데모 세션(demo-*)은 표본에서 제외.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

MIN_N_CORR = 8    # 상관을 숫자로 말하는 최소 표본 (그 미만은 보류)
MIN_N_RETEST = 5


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < MIN_N_CORR:
        return None
    x, y = np.array(xs), np.array(ys)
    if x.std() == 0 or y.std() == 0:
        return None
    return float(np.corrcoef(x, y)[0, 1])


def cmd_judge() -> None:
    from app.core.database import SessionLocal
    from app.models import DEMO_CLIENT_KEY_PREFIX, AnalysisResult, FitType, RoleplaySession

    db = SessionLocal()
    try:
        rows = (
            db.query(AnalysisResult)
            .join(RoleplaySession, AnalysisResult.session_id == RoleplaySession.id)
            .filter(
                AnalysisResult.turn_id.is_(None),
                AnalysisResult.fit_type == FitType.response,
                ~RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%"),
            )
            .all()
        )
    finally:
        db.close()
    pairs = []
    for r in rows:
        judge = (r.raw_metrics or {}).get("judge") or {}
        if judge.get("median") is not None and judge.get("deterministic") is not None:
            pairs.append((float(judge["deterministic"]), float(judge["median"])))
    print(f"[judge ↔ 결정적] 표본: {len(pairs)}건 (judge가 실제 실행된 세션만)")
    if not pairs:
        print("  보류 — judge가 반영된 세션이 아직 없습니다 (Ollama 가동 상태에서 세션을 쌓으세요).")
        return
    det = [p[0] for p in pairs]
    med = [p[1] for p in pairs]
    r_value = _pearson(det, med)
    diff = np.array(med) - np.array(det)
    print(f"  평균 차이(judge - 결정적): {diff.mean():+.1f} (judge의 관대/엄격 성향 방향)")
    if r_value is None:
        print(f"  상관: 보류 — 표본 {MIN_N_CORR}건 미만이거나 분산 없음.")
    else:
        print(f"  Pearson r = {r_value:.3f}")
        print("  해석: 높으면 독립적 두 방법의 수렴 증거. 낮으면 human agreement(α)로")
        print("  어느 쪽이 사람 판단과 더 일치하는지 판정해 혼합 비중(judge_blend_weight)을 조정.")


def cmd_retest() -> None:
    from app.core.database import SessionLocal
    from app.models import DEMO_CLIENT_KEY_PREFIX, Report, RoleplaySession, SessionStatus

    db = SessionLocal()
    try:
        rows = (
            db.query(RoleplaySession, Report)
            .join(Report, Report.session_id == RoleplaySession.id)
            .filter(
                RoleplaySession.status == SessionStatus.completed,
                RoleplaySession.attempt_no.in_((1, 2)),
                ~RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%"),
            )
            .all()
        )
    finally:
        db.close()
    by_key: dict[tuple, dict[int, float]] = {}
    for session, report in rows:
        key = (session.client_key, session.scenario_id, session.mode)
        by_key.setdefault(key, {})[session.attempt_no] = report.total_score
    pairs = [(v[1], v[2]) for v in by_key.values() if 1 in v and 2 in v]
    print(f"[재도전 1차→2차] 쌍: {len(pairs)}건")
    if len(pairs) < MIN_N_RETEST:
        print(f"  보류 — 쌍 {MIN_N_RETEST}건 미만. 전시에서 재도전 세션이 쌓이면 다시 실행.")
        return
    first = [p[0] for p in pairs]
    second = [p[1] for p in pairs]
    delta = np.array(second) - np.array(first)
    r_value = _pearson(first, second)
    print(f"  평균 개선: {delta.mean():+.1f}점 (양수면 학습 효과 — KPI '1차→2차 개선'과 동일 축)")
    print(f"  순위 안정성 r = {'보류' if r_value is None else f'{r_value:.3f}'}")
    print("  해석: 개선 평균은 코칭 효과의 방향 증거, 상관은 측정 안정성(잘한 사람이")
    print("  재도전에서도 잘하는가)의 증거. 단 학습 효과와 측정 오차는 이 설계로 완전 분리되지 않는다.")


def cmd_axes() -> None:
    from app.core.database import SessionLocal
    from app.models import DEMO_CLIENT_KEY_PREFIX, Report, RoleplaySession

    db = SessionLocal()
    try:
        reports = (
            db.query(Report)
            .join(RoleplaySession, Report.session_id == RoleplaySession.id)
            .filter(~RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%"))
            .all()
        )
    finally:
        db.close()
    axes = ["response", "voice", "eye", "posture"]
    vectors: dict[str, list[float]] = {a: [] for a in axes}
    complete = 0
    for report in reports:
        scores = {
            a: (report.fit_scores or {}).get(a, {}).get("score") for a in axes
        }
        if any(v is None for v in scores.values()):
            continue  # 4축 전부 측정된 세션만 (결측 혼입 시 상관이 왜곡)
        complete += 1
        for a in axes:
            vectors[a].append(float(scores[a]))
    print(f"[4-Fit 축 간 상관] 4축 완전 측정 세션: {complete}건")
    if complete < MIN_N_CORR:
        print(f"  보류 — {MIN_N_CORR}건 미만.")
        return
    print("        " + "  ".join(f"{a:>8}" for a in axes))
    for a in axes:
        cells = []
        for b in axes:
            r_value = _pearson(vectors[a], vectors[b])
            cells.append("   1.000" if a == b else (f"{r_value:8.3f}" if r_value is not None else "    보류"))
        print(f"{a:>8}" + "  ".join(cells))
    print("  해석: 축 간 상관이 전부 0.8+면 사실상 하나를 재는 것(변별 실패 신호),")
    print("  전부 0 근처면 종합 점수의 의미가 약해진다. 중간 수준(0.2~0.6)이 4축 설계의 기대치.")


if __name__ == "__main__":
    commands = {"judge": cmd_judge, "retest": cmd_retest, "axes": cmd_axes}
    arg = sys.argv[1] if len(sys.argv) == 2 else ""
    if arg == "all":
        for name, fn in commands.items():
            fn()
            print()
    elif arg in commands:
        commands[arg]()
    else:
        print(__doc__)
        sys.exit(1)
