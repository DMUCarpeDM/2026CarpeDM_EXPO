"""⚠️ 시연/리허설 전용 데모 데이터 시더.

운영 대시보드가 비어 보이지 않도록 가상의 체험 세션 30건을 생성한다.
client_key가 'demo-'로 시작하므로 실제 체험 데이터와 구분되며,
재실행 시 기존 데모 데이터를 지우고 다시 만든다 (멱등).

실행:   python -m app.seed.demo_data
제거:   python -m app.seed.demo_data --clean

실제 KPI 발표에는 반드시 실사용 데이터(CSV 내보내기)를 사용할 것.
"""
import random
import sys
from datetime import timedelta

from app.core.database import Base, SessionLocal, engine
from app.models import (
    DEMO_CLIENT_KEY_PREFIX,
    AnalysisResult,
    FitType,
    Report,
    RoleplaySession,
    Scenario,
    SessionStatus,
    SurveyResponse,
    utcnow,
)

FIT_LABELS = {
    "response": "Response-Fit (응답 적절성)",
    "voice": "Voice-Fit (발화 안정성)",
    "eye": "Eye-Fit (시선 유지)",
    "posture": "Posture-Fit (자세 안정)",
}


def _make_results(db, session: RoleplaySession, base: float, rng: random.Random) -> None:
    """리포트(화면용 문서) + 세션 레벨 분석 결과(집계용 단일 진실)를 함께 생성 —
    실제 분석 파이프라인과 동일한 이중 구조를 유지해야 대시보드 SQL 집계가 데모에서도 동작한다."""
    fits = {}
    scores = []
    for fit in FIT_LABELS:
        score = round(max(20, min(98, rng.gauss(base, 9))), 1)
        fits[fit] = {"score": score, "label": FIT_LABELS[fit], "summary": ""}
        scores.append(score)
        db.add(AnalysisResult(
            session_id=session.id, turn_id=None, fit_type=FitType(fit),
            raw_metrics={}, score=score,
        ))
    db.add(Report(
        session_id=session.id,
        total_score=round(sum(scores) / len(scores), 1),
        fit_scores=fits,
        strengths=[],
        improvements=[],
        evidence_segments=[],
        headline={},
        analysis_ms=rng.randint(1400, 3600),
    ))
    if rng.random() < 0.7:  # 설문 응답률 70% 가정
        db.add(SurveyResponse(
            session_id=session.id,
            q_clarity=rng.randint(3, 5),
            q_empathy=rng.randint(3, 5),
            q_personalization=rng.randint(2, 5),
        ))


def clean(db) -> int:
    demo_sessions = db.query(RoleplaySession).filter(
        RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%")
    ).all()
    ids = [s.id for s in demo_sessions]
    if ids:
        db.query(Report).filter(Report.session_id.in_(ids)).delete(synchronize_session=False)
        db.query(RoleplaySession).filter(RoleplaySession.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return len(ids)


def seed_demo() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    rng = random.Random(42)
    try:
        removed = clean(db)
        if removed:
            print(f"기존 데모 세션 {removed}건 제거")
        scenario = db.query(Scenario).first()
        if scenario is None:
            print("시나리오가 없습니다 — 서버를 한 번 기동해 시드를 먼저 실행하세요.")
            return

        now = utcnow()
        created = 0
        for visitor in range(15):
            key = f"{DEMO_CLIENT_KEY_PREFIX}{visitor:02d}"
            attempts = 2 if visitor % 2 == 0 else 1  # 절반은 재도전
            base = rng.uniform(52, 72)
            # 재도전 KPI(2차 수행률·개선 폭)가 정확히 잡히도록 방문자별 모드를 고정
            mode = 5 if rng.random() < 0.75 else 10
            for attempt in range(attempts):
                session = RoleplaySession(
                    scenario_id=scenario.id,
                    client_key=key,
                    mode=mode,
                    difficulty="basic" if rng.random() < 0.8 else "pressure",
                    attempt_no=attempt + 1,
                    status=SessionStatus.completed,
                    started_at=now - timedelta(hours=rng.uniform(1, 72)),
                )
                db.add(session)
                db.flush()
                # 재도전은 평균 +9점 (개선 체감 스토리)
                _make_results(db, session, base + attempt * 9, rng)
                created += 1
        db.commit()
        print(f"데모 세션 {created}건 생성 완료 (client_key: demo-*)")
    finally:
        db.close()


if __name__ == "__main__":
    if "--clean" in sys.argv:
        db = SessionLocal()
        print(f"데모 세션 {clean(db)}건 제거")
        db.close()
    else:
        seed_demo()
