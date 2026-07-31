"""예비 human agreement 측정 (S-B2B-JUDGE 3겹 구조의 3층) — Krippendorff's alpha.

judge 채점이 사람의 판단과 얼마나 일치하는지 예비 측정한다. 절차는
docs/plan/b2b/playtest-protocol.md 참조 (팀원 2인 + 지인 1인 채점 권장).

사용법:
  1) 채점 시트 템플릿 생성 (완료 세션에서 대화 전문 포함):
     ./.venv/Scripts/python.exe scripts/measure_agreement.py template ratings.csv
  2) 사람 채점 후(0~100 정수, rater 열에 채점자 이름) alpha 계산:
     ./.venv/Scripts/python.exe scripts/measure_agreement.py alpha ratings.csv

CSV 형식: session_id,rater,score  (한 행 = 한 채점자의 한 세션 점수)
'judge' rater 행을 포함하면 judge↔사람 일치도까지 계산된다.

해석(관례): alpha >= 0.8 신뢰 가능, >= 0.667 잠정 채택, 그 미만이면 루브릭을
수정하고 재측정한다. 수치가 낮아도 괜찮다 — 측정하고 있다는 것 자체가 자산이고,
낮은 alpha는 루브릭 문구를 고칠 근거가 된다 (논문 트랙과 데이터 공유).
"""
import csv
import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def krippendorff_alpha_interval(ratings: dict[str, dict[str, float]]) -> float | None:
    """구간(interval) 데이터용 Krippendorff's alpha.

    ratings: {unit(session_id): {rater: score}} — 결측 허용(채점자마다 다른 부분집합).
    구현: 관측 불일치 Do = 단위 내 쌍별 제곱차 평균, 기대 불일치 De = 전체 값
    쌍별 제곱차 평균. alpha = 1 - Do/De. (표준 정의의 계수 형태 그대로)
    """
    # 2명 이상이 채점한 단위만 사용 (짝지을 수 없는 단독 채점은 정의상 제외)
    units = {u: rs for u, rs in ratings.items() if len(rs) >= 2}
    if not units:
        return None
    values = [v for rs in units.values() for v in rs.values()]
    n_pairable = len(values)
    if n_pairable < 4:
        return None

    # 관측 불일치 Do: 단위 내 쌍별 제곱차를 (m_u - 1)로 정규화해 합산 / 값 수
    do = sum(
        sum((a - b) ** 2 for a, b in combinations(rs.values(), 2)) * 2 / (len(rs) - 1)
        for rs in units.values()
    ) / n_pairable

    # 기대 불일치 De: 전체 값 풀에서의 쌍별 제곱차 평균
    de = sum((a - b) ** 2 for a, b in combinations(values, 2)) * 2 / (
        n_pairable * (n_pairable - 1)
    )
    if de == 0:
        return 1.0
    return 1.0 - do / de


def cmd_template(out_path: str) -> None:
    """완료 세션에서 채점 시트 생성 — 대화 전문과 judge 점수(있으면)를 함께 담는다."""
    from app.core.database import SessionLocal
    from app.models import AnalysisResult, FitType, RoleplaySession, SessionStatus

    db = SessionLocal()
    try:
        sessions = (
            db.query(RoleplaySession)
            .filter(RoleplaySession.status == SessionStatus.completed)
            .order_by(RoleplaySession.id.desc())
            .limit(30)
            .all()
        )
        with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["session_id", "rater", "score", "transcript"])
            for s in sessions:
                transcript = " / ".join(
                    f"Q: {t.question_text[:60]} A: {t.response_text[:80]}"
                    for t in s.turns if t.response_text
                )
                if not transcript:
                    continue  # 미저장 동의로 발화가 파기된 세션은 채점 불가
                judge_row = (
                    db.query(AnalysisResult)
                    .filter_by(session_id=s.id, turn_id=None, fit_type=FitType.response)
                    .first()
                )
                judge = (judge_row.raw_metrics or {}).get("judge") if judge_row else None
                if judge:
                    writer.writerow([s.id, "judge", judge.get("median", ""), transcript])
                writer.writerow([s.id, "", "", transcript])  # 사람 채점자가 채울 행
        print(f"채점 시트 생성: {out_path} (rater·score를 채워 alpha를 계산하세요)")
    finally:
        db.close()


def cmd_alpha(csv_path: str) -> None:
    ratings: dict[str, dict[str, float]] = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rater = (row.get("rater") or "").strip()
            score = (row.get("score") or "").strip()
            if not rater or not score:
                continue
            ratings.setdefault(row["session_id"], {})[rater] = float(score)

    alpha_all = krippendorff_alpha_interval(ratings)
    humans_only = {
        u: {r: v for r, v in rs.items() if r != "judge"} for u, rs in ratings.items()
    }
    alpha_humans = krippendorff_alpha_interval(humans_only)

    n_units = len([u for u, rs in ratings.items() if len(rs) >= 2])
    print(f"채점 단위(2인 이상): {n_units}")
    print(f"alpha (사람만): {alpha_humans if alpha_humans is None else round(alpha_humans, 3)}")
    print(f"alpha (judge 포함): {alpha_all if alpha_all is None else round(alpha_all, 3)}")
    print("해석: >=0.8 신뢰 가능 / >=0.667 잠정 채택 / 미만이면 루브릭 수정 후 재측정")
    print("점수 표기 전환 조건은 docs/plan/b2b/score-display-policy.md 참조")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("template", "alpha"):
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == "template":
        cmd_template(sys.argv[2])
    else:
        cmd_alpha(sys.argv[2])
