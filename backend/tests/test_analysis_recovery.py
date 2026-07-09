"""분석 재실행 멱등성 — 크래시·재시작 후 재큐잉이 결과를 중복 적재하지 않는다.

run_analysis는 시작 시 이전 실행의 부분 결과(AnalysisResult·Report)를 지우므로,
기동 복구(_recover_interrupted_analyses)와 재시도 API가 몇 번을 다시 돌려도
리포트는 정확히 하나여야 한다.
"""
from app.core.database import SessionLocal
from app.models import AnalysisResult, Report, RoleplaySession, Scenario, SessionStatus, Turn
from app.seed.run import seed
from app.services.analysis import run_analysis


def _make_analyzing_session(db) -> int:
    scenario = db.query(Scenario).first()
    episode = scenario.episodes[0]
    session = RoleplaySession(scenario_id=scenario.id, status=SessionStatus.analyzing)
    db.add(session)
    db.flush()
    db.add(Turn(
        session_id=session.id, episode_id=episode.id, order=1,
        question_type="initial", question_text=episode.initial_question,
        character_id=episode.character_id, stt_source="text",
        response_text=(
            "안녕하세요, 신입 김지연입니다. 플랫폼팀 업무를 맡았고 "
            "오늘 목표는 온보딩 파악입니다. 잘 부탁드립니다."
        ),
    ))
    db.commit()
    return session.id


def test_rerun_after_interruption_does_not_duplicate_results():
    seed()
    db = SessionLocal()
    try:
        session_id = _make_analyzing_session(db)
    finally:
        db.close()

    run_analysis(session_id)

    db = SessionLocal()
    try:
        first_count = db.query(AnalysisResult).filter_by(session_id=session_id).count()
        assert first_count > 0
        assert db.query(Report).filter_by(session_id=session_id).count() == 1
        # 크래시 시뮬레이션: 분석 도중 상태로 되돌린다 (기동 복구가 만나는 모습)
        session = db.get(RoleplaySession, session_id)
        session.status = SessionStatus.analyzing
        session.analysis_progress = {"stage": "voice", "pct": 45}
        db.commit()
    finally:
        db.close()

    run_analysis(session_id)

    db = SessionLocal()
    try:
        assert db.query(AnalysisResult).filter_by(session_id=session_id).count() == first_count
        assert db.query(Report).filter_by(session_id=session_id).count() == 1
        assert db.get(RoleplaySession, session_id).status == SessionStatus.completed
    finally:
        db.close()
