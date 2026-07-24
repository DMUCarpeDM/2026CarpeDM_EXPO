"""코호트·백분위 표본에서 데모(리허설) 세션 격리 — 회귀 방지.

리허설용 `demo_data.py` 시드(client_key='demo-*')가 방문자 대면 백분위를
오염시키던 결함(reports.py의 percentile_top·cohort 쿼리가 데모를 제외하지
않던 문제)의 회귀 테스트. 전시장에서 리허설 시드를 한 번이라도 돌리면 모든
실방문자의 '상위 N%'가 가짜 점수로 왜곡되던 버그다.

전략: 절대 수치가 아니라 **차등**을 검증한다 — 리포트를 한 번 조회해 기준값을
잡고, 극단 점수의 데모 세션을 대량 삽입한 뒤 다시 조회해 값이 **변하지 않음**을
확인한다. 다른 테스트 모듈이 같은 test DB에 남긴 실세션에 영향받지 않는다.
"""
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models import (
    DEMO_CLIENT_KEY_PREFIX,
    AnalysisResult,
    FitType,
    Report,
    RoleplaySession,
    Scenario,
    SessionStatus,
)
from app.seed.run import seed

client = TestClient(app)

FITS = ["response", "voice", "expression", "posture"]  # 4-Fit 점수 축 (시선은 관찰이라 제외)


def _insert_completed(db, scenario_id, client_key, per_fit_score, *, token=""):
    """완료 세션 + 세션레벨 4-Fit 분석결과 + 리포트를 실제 파이프라인과 같은
    이중 구조로 직접 삽입 (demo_data._make_results와 동형)."""
    session = RoleplaySession(
        scenario_id=scenario_id,
        client_key=client_key,
        mode=5,
        status=SessionStatus.completed,
        access_token=token,
    )
    db.add(session)
    db.flush()
    fit_scores = {}
    for fit in FITS:
        db.add(AnalysisResult(
            session_id=session.id, turn_id=None, fit_type=FitType(fit),
            raw_metrics={}, score=per_fit_score,
        ))
        fit_scores[fit] = {"score": per_fit_score, "label": fit, "summary": ""}
    db.add(Report(
        session_id=session.id,
        total_score=per_fit_score,
        fit_scores=fit_scores,
    ))
    return session


def _fetch(session_id, token):
    r = client.get(
        f"/api/sessions/{session_id}/report",
        headers={"X-Session-Token": token},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    cohort = ((body.get("deep_analysis") or {}).get("cohort") or {}).get("rows", [])
    # 결정적 비교를 위해 fit별로 정렬된 (top_pct, n) 튜플로 환원
    cohort_key = sorted((row["fit"], row["top_pct"], row["n"]) for row in cohort)
    return body["percentile_top"], cohort_key


def test_demo_sessions_do_not_pollute_percentile_or_cohort():
    seed()
    db = SessionLocal()
    try:
        scenario_id = db.query(Scenario).first().id

        # 실세션 22건: 절반은 subject(50) 아래, 절반은 위 — 코호트 활성(≥20)이자
        # 데모가 섞이면 순위가 눈에 띄게 흔들리도록 subject를 중간에 둔다.
        for i in range(22):
            per_fit = 30.0 if i < 11 else 70.0
            _insert_completed(db, scenario_id, f"coh-real-{i:02d}", per_fit)

        subject = _insert_completed(
            db, scenario_id, "coh-subject", 50.0, token="coh-token",
        )
        db.commit()
        subject_id = subject.id
    finally:
        db.close()

    # 기준값 — 데모 없는 상태의 방문자 대면 수치
    pct_before, cohort_before = _fetch(subject_id, "coh-token")
    assert pct_before is not None, "실세션 표본이 충분하면 백분위가 나와야 한다"
    assert cohort_before, "실세션 20+이면 코호트 행이 있어야 한다(비교가 유의미)"

    # 극단 점수(99)의 데모 세션 15건 투입 — 버그가 있으면 순위를 끌어내린다.
    db = SessionLocal()
    try:
        scenario_id = db.query(Scenario).first().id
        for i in range(15):
            _insert_completed(
                db, scenario_id, f"{DEMO_CLIENT_KEY_PREFIX}zz-{i:02d}", 99.0,
            )
        db.commit()
    finally:
        db.close()

    pct_after, cohort_after = _fetch(subject_id, "coh-token")

    # 핵심 단언: 데모 세션은 표본에 전혀 들어오지 않으므로 수치가 불변이어야 한다.
    assert pct_after == pct_before, (
        f"데모 세션이 백분위를 오염시켰다: {pct_before} → {pct_after}"
    )
    assert cohort_after == cohort_before, (
        f"데모 세션이 코호트를 오염시켰다: {cohort_before} → {cohort_after}"
    )
