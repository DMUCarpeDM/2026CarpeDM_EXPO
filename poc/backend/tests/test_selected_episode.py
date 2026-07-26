"""선택 단계가 서버의 실제 장면으로 이어지는지 검증한다."""
from fastapi.testclient import TestClient

from app.main import app
from app.api import sessions
from app.core.config import settings
from app.seed.run import seed
from app.services.dialogue.ollama_provider import OllamaDialogueProvider


client = TestClient(app)
CONSENT = {"agreed": True, "storage_policy": "none"}


def test_selected_episode_starts_with_that_episode(monkeypatch) -> None:
    # Given: 활성 시나리오의 5분용 고객성공 담당자 장면
    seed()
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(sessions, "ollama_dialogue_ready", lambda: True)
    monkeypatch.setattr(
        OllamaDialogueProvider,
        "personalize_question",
        lambda _self, spec, *_args, **_kwargs: spec.question_text,
    )
    scenarios = client.get("/api/scenarios").json()
    scenario = scenarios[0]
    episode = next(
        item for item in scenario["episodes"]
        if item["character_id"] == "han_cs" and 5 in item["modes"]
    )

    # When: 해당 장면을 지정해 세션을 시작하면
    response = client.post(
        "/api/sessions",
        json={
            "scenario_slug": scenario["slug"],
            "selected_episode_id": episode["id"],
            "mode": 5,
            "difficulty": "basic",
            "consent": CONSENT,
        },
    )

    # Then: 서버의 첫 질문도 선택한 장면과 동일하다.
    assert response.status_code == 200
    body = response.json()
    assert body["selected_episode_id"] == episode["id"]
    assert body["current_turn"]["episode_id"] == episode["id"]
    assert body["current_turn"]["character_id"] == "han_cs"
