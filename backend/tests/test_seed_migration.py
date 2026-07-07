"""시드 재실행 안전성 — 서버 재시작이 기존 세션의 에피소드 참조를 끊지 않는다.

과거 방식(에피소드 전체 delete 후 재삽입)은 SQLite가 FK를 강제하지 않는 틈에
기존 Turn.episode_id를 허공에 남겨, 재시작 이전 세션의 리포트 조회를 500으로
무너뜨렸다. 시드는 order 기준 제자리 갱신으로 id를 보존해야 한다.
"""
from app.core.database import SessionLocal
from app.models import Episode, RoleplaySession, Scenario, SessionStatus, Turn
from app.seed.run import seed


def test_reseed_preserves_episode_ids_and_turn_references():
    seed()
    db = SessionLocal()
    try:
        scenario = db.query(Scenario).first()
        eps_before = {
            ep.order: ep.id
            for ep in db.query(Episode).filter_by(scenario_id=scenario.id).all()
        }
        session = RoleplaySession(scenario_id=scenario.id, status=SessionStatus.completed)
        db.add(session)
        db.flush()
        turn = Turn(
            session_id=session.id, episode_id=eps_before[1], order=1,
            question_type="initial", question_text="q", character_id="c",
            response_text="답변",
        )
        db.add(turn)
        db.commit()
        turn_id = turn.id
    finally:
        db.close()

    seed()  # 서버 재시작 시뮬레이션 (lifespan은 기동마다 seed를 호출한다)

    db = SessionLocal()
    try:
        scenario = db.query(Scenario).first()
        eps_after = {
            ep.order: ep.id
            for ep in db.query(Episode).filter_by(scenario_id=scenario.id).all()
        }
        assert eps_before == eps_after, "재시드가 에피소드 id를 바꾸면 기존 턴 참조가 깨진다"
        turn = db.get(Turn, turn_id)
        assert turn.episode is not None
        assert turn.episode.order == 1
    finally:
        db.close()
