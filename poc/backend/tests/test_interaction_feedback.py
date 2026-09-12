from types import SimpleNamespace as NS
from app.services import feedback, judgments, interaction_scoring


def test_feedback_priority_excludes_expressions():
    events = [judgments.event(1, "posture", "sway", "negative", {}, "자세"),
              judgments.event(1, "expression", "contradiction", "negative", {}, "표정"),
              judgments.event(1, "response", "missing_goal", "negative", {}, "목표")]
    assert feedback.select({"events": events})["message"] == "목표"


def test_role_feedback_has_repeat_gap_and_orders_by_turn():
    session = NS(rapport={})
    item = judgments.evaluate(1, duration_ms=4000, nonverbal={"frames": 25, "sample_ms": 200, "calibrated": True, "head_down_ratio": .8})
    assert feedback.assign(session, item, 1)
    assert not feedback.assign(session, item, 2)
    assert feedback.assign(session, item, 3)
    judgments.persist(session, {**item, "turn_id": 20})
    judgments.persist(session, {**item, "turn_id": 3})
    assert judgments.results(session)[-1]["turn_id"] == 20


def test_chrome_speed_tip_never_changes_score():
    result = judgments.evaluate(1, text="가" * 100, duration_ms=10000, voice_text=True)
    assert feedback.select(result)["rule"] == "fast_speech"
    assert interaction_scoring.calculate([result])["total"] is None


def test_observation_requires_owner_and_does_not_store(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    seed()
    client = TestClient(app)
    session = client.post('/api/sessions', json={"consent": {"agreed": True}}).json()
    sid, tid = session["id"], session["current_turn"]["id"]
    url = f'/api/sessions/{sid}/turns/{tid}/observation'
    assert client.post(url, json={}).status_code in (401, 403)
    auth = {"X-Session-Token": session["access_token"]}
    body = {"text": "", "duration_ms": 4000, "nonverbal": {"calibrated": True, "frames": 25, "sample_ms": 200, "head_down_ratio": .8}}
    response = client.post(url, json=body, headers=auth)
    assert response.status_code == 200 and response.json()["tip"]["rule"] == "head_down"
    with SessionLocal() as db:
        assert "judgments" not in db.get(RoleplaySession, sid).rapport
    assert client.post(f'/api/sessions/{sid}/turns/999999/observation', json=body, headers=auth).status_code == 409


def test_final_interview_conflict_gets_one_confirmation_without_extra_main_count(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import Scenario
    seed()
    with SessionLocal() as db:
        scenario = db.query(Scenario).first()
        slug = scenario.slug
        scenario.world_setting = {**scenario.world_setting, "interaction": {"interview_questions": [f"주요 질문 {i}" for i in range(6)]}}
        db.commit()
    def analyze(current, history, goals, requested):
        if current.order == 6:
            return [judgments.event(current.id, "response", "contradiction", "negative",
                {"fact_key": "담당", "previous_quote": "제가 담당자입니다", "quote": "담당자가 아닙니다", "previous_turn_id": history[0].id}, "모순 확인")], [], "completed"
        return [], [], "completed"
    monkeypatch.setattr('app.services.response_judgment.analyze', analyze)
    client = TestClient(app)
    session = client.post('/api/sessions', json={"scenario_slug": slug, "service_mode": "interview", "consent": {"agreed": True}}).json()
    sid, turn = session["id"], session["current_turn"]
    auth = {"X-Session-Token": session["access_token"]}
    for _ in range(6):
        response = client.post(f'/api/sessions/{sid}/turns/{turn["id"]}/response', headers=auth, json={"text": "답변입니다"})
        assert response.status_code == 200, response.text
        payload = response.json()
        turn = payload["next_turn"]
    assert not payload["finished"] and turn["question_type"] == "confirmation"
    assert payload["interaction"]["pending_confirmation"]
    assert payload["interaction"]["index"] == 6 and not payload["interaction"]["finished"]
    payload = client.post(f'/api/sessions/{sid}/turns/{turn["id"]}/response', headers=auth, json={"text": "변경된 내용입니다"}).json()
    assert payload["finished"] and payload["interaction"]["index"] == 6


def test_dialogue_failure_uses_prepared_goal(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.services.dialogue.openai_provider import DialogueGenerationError
    seed()
    def fail(*args, **kwargs):
        raise DialogueGenerationError("실패")
    monkeypatch.setattr('app.services.dialogue.openai_provider.OpenAIDialogueProvider.next_question', fail)
    monkeypatch.setattr('app.services.response_judgment.analyze', lambda *args: ([], [], "unavailable"))
    client = TestClient(app)
    session = client.post('/api/sessions', json={"consent": {"agreed": True}}).json()
    response = client.post(f'/api/sessions/{session["id"]}/turns/{session["current_turn"]["id"]}/response',
        headers={"X-Session-Token": session["access_token"]}, json={"text": "답변"})
    assert response.status_code == 200 and response.json()["next_turn"]["question_text"]
    assert response.json()["turn_signals"]["judgment"]["dialogue_status"] == "fallback"
