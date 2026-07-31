"""감정 상태 머신 (S-B2B-EMOTION) — 전이 규칙·상태 주입·턴 신호 계약."""
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models import RoleplaySession, Scenario
from app.seed.run import seed
from app.services.dialogue import emotion

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


def _session_with_profile(db, enabled=True, initial=72.0):
    scenario = db.query(Scenario).filter_by(slug="ondo-cafe-crew").first()
    assert scenario is not None, "카페 크루 팩이 시드되어야 한다"
    if not enabled:
        scenario = db.query(Scenario).filter_by(slug="release-schedule-alignment").first()
    session = RoleplaySession(scenario_id=scenario.id)
    db.add(session)
    db.flush()
    return session


def test_temperature_bands_and_transitions():
    assert emotion.state_of_temperature(10) == "calm"
    assert emotion.state_of_temperature(50) == "displeased"
    assert emotion.state_of_temperature(80) == "agitated"


def test_update_moves_temperature_by_case():
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db)
        state = emotion.ensure_state(session)
        assert state["state"] == "agitated"  # 초기 72
        # 좋은 대응 → 온도 하강 + 완화 플래그 (72 → 54, displeased)
        state = emotion.update(session, "excellent", turn_order=1)
        assert state["temperature"] == 54.0
        assert state["state"] == "displeased"
        assert state["eased"] is True
        # 나쁜 대응 → 온도 급등 (54 → 76, agitated)
        state = emotion.update(session, "risky", turn_order=2)
        assert state["temperature"] == 76.0
        assert state["state"] == "agitated"
        assert state["eased"] is False
        # 이력이 남는다 (리포트 감정 여정)
        assert [h["case"] for h in state["history"]] == ["excellent", "risky"]
        # 경계 클램프
        for _ in range(5):
            state = emotion.update(session, "risky", turn_order=3)
        assert state["temperature"] == 100.0
    finally:
        db.rollback()
        db.close()


def test_inactive_without_profile():
    """감정 프로파일이 없는 기존 전시 시나리오는 상태 머신이 비활성 — 동작 무변화."""
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db, enabled=False)
        assert emotion.ensure_state(session) == {}
        assert emotion.update(session, "excellent", 1) == {}
        assert emotion.directive_for(session, "kim_teamlead") == ""
        assert emotion.signals_payload(session) == {}
    finally:
        db.rollback()
        db.close()


def test_directive_only_for_target_character():
    """상태 지시문은 감정 대상 캐릭터(진상 고객)에게만 주입된다."""
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db)
        emotion.ensure_state(session)
        assert "격앙" in emotion.directive_for(session, "angry_customer")
        assert emotion.directive_for(session, "jang_manager") == ""
        # 완화 시 지시문에 완화 문구가 붙는다
        emotion.update(session, "excellent", 1)
        directive = emotion.directive_for(session, "angry_customer")
        assert "누그러" in directive
    finally:
        db.rollback()
        db.close()


def test_turn_signals_carry_emotion_via_api():
    """관통: 팩 세션의 턴 제출 응답에 감정 게이지가 실린다."""
    seed()
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
        "scenario_slug": "ondo-cafe-crew",
    })
    assert created.status_code == 200, created.text
    session = created.json()
    headers = {"X-Session-Token": session["access_token"]}
    turn = session["current_turn"]
    resp = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers=headers,
        json={
            "text": "오래 기다리셨는데 음료까지 잘못 나가서 정말 죄송합니다. 온도라떼 바로 다시 만들어 드리고, 온도 포인트로 보상도 도와드리겠습니다.",
            "stt_source": "text", "duration_ms": 9000,
        },
    )
    assert resp.status_code == 200, resp.text
    signals = resp.json()["turn_signals"]
    assert signals["emotion"], "팩 세션은 감정 신호가 있어야 한다"
    assert signals["emotion"]["state"] in ("calm", "displeased", "agitated")
    assert 0 <= signals["emotion"]["temperature"] <= 100
    # 좋은 응대였다면 초기(72)보다 내려갔어야 한다
    assert signals["emotion"]["temperature"] < 72


def test_existing_scenario_has_no_emotion_signal():
    """기존 전시 시나리오 세션은 emotion이 빈 dict — 하위 호환."""
    seed()
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
        "scenario_slug": "release-schedule-alignment",
    })
    session = created.json()
    headers = {"X-Session-Token": session["access_token"]}
    turn = session["current_turn"]
    resp = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers=headers,
        json={"text": "안녕하세요, 오늘 합류한 신입입니다. 잘 부탁드립니다.", "stt_source": "text", "duration_ms": 4000},
    )
    assert resp.json()["turn_signals"]["emotion"] == {}
