import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed
from app.core.database import SessionLocal
from app.models import Scenario, RoleplaySession
from app.services import prompt_scenario
from app.services.dialogue import DialogueGenerationError

PROMPT = "개발자로서 팀장과 신규 기능의 범위와 출시 일정을 협의하고 싶습니다."


def plan(mode="workplace"):
    return prompt_scenario.Plan(title="새 기능 출시 협의", situation="출시까지 2주 남았지만 추가 기능을 요청받았습니다.",
        user_role="개발자", company="가상의 제품팀", conflict="품질 유지와 일정 준수가 충돌합니다.",
        persona=prompt_scenario.Persona(name="최지안", role="팀장", background="일정을 관리해온 팀장", goal="실행할 수 있는 배포안을 합의한다",
            relationship="같은 팀에서 일정과 범위를 협의하는 동료", personality="근거를 듣고 협의한다", speech_style="정중한 존댓말"),
        goals=[prompt_scenario.Goal(label=label, keywords=["일정", "범위"], followup="가능한 대안을 설명해주시겠어요?") for label in ["자신의 요구 설명", "상대 제약 확인", "실행안 제시"]],
        opening_line="출시일을 지키면서 어떤 범위까지 개발할 수 있을까요?",
        interview_questions=[f"프로젝트 경험 {i}에서 본인의 역할은 무엇이었나요?" for i in range(6)] if mode == "interview" else [])


def payload(**extra):
    return {"scenario_prompt": PROMPT, "service_mode": "workplace", "difficulty": "basic", "mode": 5,
        "consent": {"agreed": True, "storage_policy": "none"}, **extra}


@pytest.mark.parametrize("mode", ["workplace", "interview"])
def test_generated_scenario_is_private_and_drives_the_first_and_next_turn(monkeypatch, mode):
    seed()
    calls = []
    def generate(prompt, service, difficulty):
        calls.append((prompt, service, difficulty))
        return plan(service)
    monkeypatch.setattr(prompt_scenario, "generate_plan", generate)
    client = TestClient(app)
    response = client.post("/api/sessions", json=payload(service_mode=mode))
    assert response.status_code == 200, response.text
    result = response.json()
    assert calls == [(PROMPT, mode, "basic")]
    assert result["scenario"]["world_setting"]["source"] == "user_prompt"
    assert result["scenario"]["characters"][0]["name"] == "최지안"
    assert result["current_turn"]["question_text"] == (plan(mode).interview_questions[0] if mode == "interview" else plan().opening_line)
    assert result["scenario"]["slug"] not in {s["slug"] for s in client.get("/api/scenarios").json()}
    assert client.get(f"/api/scenarios/{result['scenario']['slug']}").status_code == 404
    assert client.get(f"/api/sessions/{result['id']}").status_code == 403
    token = {"X-Session-Token": result["access_token"]}
    assert client.get(f"/api/sessions/{result['id']}", headers=token).json()["scenario"]["title"] == "새 기능 출시 협의"
    with SessionLocal() as db:
        session = db.get(RoleplaySession, result["id"])
        assert session.scenario.is_active is False
        assert len(session.scenario.episodes) == 1


def test_consent_and_exclusive_input_are_checked_before_generation(monkeypatch):
    def unexpected(*_):
        raise AssertionError("must not call model")
    monkeypatch.setattr(prompt_scenario, "generate_plan", unexpected)
    client = TestClient(app)
    assert client.post("/api/sessions", json=payload(consent={"agreed": False})).status_code == 400
    for extra in [{"scenario_slug": "workplace-conversation"}, {"nfc_uid": "AABB"}, {"exhibition": True}, {"selected_episode_id": 1}]:
        assert client.post("/api/sessions", json=payload(**extra)).status_code == 422
    assert client.post("/api/sessions", json=payload(scenario_prompt=" " * 15)).status_code == 422


def test_model_failure_never_starts_a_seeded_session(monkeypatch):
    def fail(*_):
        raise DialogueGenerationError("offline")
    monkeypatch.setattr(prompt_scenario, "generate_plan", fail)
    with SessionLocal() as db:
        before = db.query(RoleplaySession).count()
        scenarios = db.query(Scenario).count()
    response = TestClient(app).post("/api/sessions", json=payload())
    assert response.status_code == 503
    with SessionLocal() as db:
        assert db.query(RoleplaySession).count() == before
        assert db.query(Scenario).count() == scenarios


def test_openai_plan_contract_rejects_incomplete_or_malformed_output(monkeypatch):
    from pydantic import SecretStr
    from app.core.config import settings
    monkeypatch.setattr(settings, "dialogue_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    class Response:
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"finish_reason": "length", "message": {"content": plan().model_dump_json()}}]}
    monkeypatch.setattr(prompt_scenario.httpx, "post", lambda *a, **k: Response())
    with pytest.raises(DialogueGenerationError):
        prompt_scenario.generate_plan(PROMPT, "workplace", "basic")


def test_vocational_catalog_and_new_sessions_are_removed(monkeypatch):
    seed()
    from app.seed.packs import load_pack_files
    retired = {"cafe-order-taking", "ondo-cafe-crew", "ondo-cs-agent"}
    assert not retired.intersection(p["slug"] for p in load_pack_files())
    with SessionLocal() as db:
        db.add(Scenario(slug="cafe-order-taking", title="retired", is_active=True,
            world_setting={"service_modes": ["training"]}))
        db.commit()
    client = TestClient(app)
    assert not retired.intersection(s["slug"] for s in client.get("/api/scenarios").json())
    assert client.get("/api/scenarios/cafe-order-taking").status_code == 404
    assert client.post("/api/sessions", json=payload(service_mode="training")).status_code == 422
    body = payload(scenario_prompt=None, scenario_slug="cafe-order-taking")
    assert client.post("/api/sessions", json=body).status_code == 410
