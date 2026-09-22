"""직장 대화의 진행·평가·대체 대사 계약을 실제 API와 함께 검증한다."""
from random import Random

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, settings
from app.core.database import SessionLocal
from app.main import app
from app.models import Scenario
from app.seed.run import seed
from app.services import interaction, interaction_scoring, judgments
from app.services.dialogue import availability
from app.services.dialogue.gemini_provider import _call_gemini
from app.services.dialogue.openai_provider import DialogueGenerationError
from app.services.workplace import act_bridge_line, build_fallback_plan, continuous_fallback_line, enrich_plan_fallback_pools, flatten_plan_items
from types import SimpleNamespace


def test_bridge_consumes_opening_before_next_fallback():
    opening = "이 자료를 오늘까지 확인해 주세요."
    character = {"reactions": {"covered": ["확인한 내용을 조금 더 설명해 주세요."]}}
    item = {"text": opening, "fallback_pool": [opening]}
    bridge = act_bridge_line(character, "자료 확인하겠습니다", item)
    line = continuous_fallback_line(character, [SimpleNamespace(question_text=bridge, response_text="네")], item, "covered")
    assert line == character["reactions"]["covered"][0]


def test_existing_installations_keep_openai_default():
    assert Settings.model_fields["dialogue_provider"].default == "openai"


def test_fallback_pool_preserves_anchor_character_and_assessment():
    seed()
    with SessionLocal() as db:
        scenario = db.query(Scenario).filter_by(slug="workplace-conversation").one()
        plan = build_fallback_plan(scenario, scenario.episodes, 5, Random(7))
        for act in plan["acts"]:
            anchor = next(ep for ep in scenario.episodes if ep.id == act["episode_id"])
            assert act["fallback_pool"] == [anchor.initial_question[:180]]
            assert act["character_id"] == anchor.character_id
            act["fallback_pool"] = ["다른 캐릭터의 상황입니다"]
        enrich_plan_fallback_pools(plan, scenario, scenario.episodes)
        for act in plan["acts"]:
            assert act["fallback_pool"] == [act["opening_line"][:180]]


def test_repeated_beats_share_one_scoring_goal():
    seed()
    with SessionLocal() as db:
        scenario = db.query(Scenario).filter_by(slug="workplace-conversation").one()
        items = flatten_plan_items(build_fallback_plan(scenario, scenario.episodes, 5, Random(7)))
    results = []
    for index in range(4):
        goals = interaction.assessment_goals({"mode": "workplace_continuous", "items": items, "index": index})
        assert len(goals) == 1
        results.append({"measured": ["response"], "events": [judgments.event(
            index + 1, "response", "goal_met", "positive", {"goal_id": goals[0]["id"]}, "목표 충족") ]})
    assert len({item["id"] for item in items[:4]}) == 4
    assert len({item["assessment_id"] for item in items[:4]}) == 1
    assert interaction_scoring.calculate(results)["scores"]["response"] == 78


@pytest.mark.parametrize("provider", ["openai", "gemini"])
def test_continuous_api_finishes_and_resumes_with_provider_outage(monkeypatch, provider):
    monkeypatch.setattr(settings, "dialogue_provider", provider)
    monkeypatch.setattr(settings, "openai_api_key", SecretStr(""))
    monkeypatch.setattr(settings, "gemini_api_key", SecretStr(""))
    observed_goals = []

    def unavailable(current, history, goals, requested):
        observed_goals.append((goals, requested))
        return [], [], "unavailable"

    monkeypatch.setattr("app.services.response_judgment.analyze", unavailable)
    seed()
    client = TestClient(app)
    response = client.post("/api/sessions", json={
        "service_mode": "workplace", "scenario_slug": "workplace-conversation", "mode": 5,
        "consent": {"agreed": True, "storage_policy": "none"},
    })
    assert response.status_code == 200, response.text
    session = response.json()
    token = {"X-Session-Token": session["access_token"]}
    turn = session["current_turn"]
    categories = []
    for index in range(12):
        resumed = client.get(f"/api/sessions/{session['id']}", headers=token).json()
        assert resumed["current_turn"]["id"] == turn["id"]
        assert resumed["interaction"]["index"] == index
        categories.append(resumed["interaction"]["briefing"]["category_id"])
        response = client.post(f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
            headers=token, json={"text": "자료를 확인하고 이해한 방향을 먼저 공유하겠습니다.", "stt_source": "text"})
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["finished"] == (index == 11)
        turn = payload["next_turn"]
    assert turn is None
    assert categories == ["morning"] * 4 + ["work"] * 5 + ["leaving"] * 3
    assert all(len(goals) == 1 and requested == [goals[0]["id"]] for goals, requested in observed_goals)


def test_gemini_transport_keeps_credentials_out_of_url_and_logs(monkeypatch, caplog):
    monkeypatch.setattr(settings, "gemini_api_key", SecretStr("test-not-a-real-key"))
    def fail(url, **kwargs):
        assert "params" not in kwargs
        assert kwargs["headers"]["x-goog-api-key"] == "test-not-a-real-key"
        raise httpx.ConnectError("test-not-a-real-key must not be logged")
    monkeypatch.setattr(httpx, "post", fail)
    with pytest.raises(DialogueGenerationError):
        _call_gemini("system", "user", max_tokens=30, temperature=0)
    assert "test-not-a-real-key" not in caplog.text


@pytest.mark.parametrize("status,ready", [(200, True), (403, False)])
def test_gemini_readiness_checks_access(monkeypatch, status, ready):
    monkeypatch.setattr(settings, "dialogue_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", SecretStr("test-not-a-real-key"))
    monkeypatch.setattr(httpx, "get", lambda url, **kwargs: httpx.Response(status, request=httpx.Request("GET", url)))
    assert availability.gemini_dialogue_ready() is ready
