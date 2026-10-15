import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.dialogue import get_dialogue_provider
from app.services.dialogue.availability import dialogue_ready
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.openai_provider import DialogueGenerationError


def response(data, status=200):
    return httpx.Response(status, json=data, request=httpx.Request("POST", "http://local/test"))


def test_ollama_selection_and_exact_tag(monkeypatch):
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "example:small")
    assert isinstance(get_dialogue_provider(), OllamaDialogueProvider)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: response({"models": [{"name": "example:large"}]}))
    assert not dialogue_ready()
    monkeypatch.setattr(httpx, "get", lambda *a, **k: response({"models": [{"name": "example:small"}]}))
    assert dialogue_ready()


@pytest.mark.parametrize("data", [[], {}, {"message": []}, {"message": {"content": ""}}])
def test_ollama_bad_payload_falls_back(monkeypatch, data):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response(data))
    with pytest.raises(DialogueGenerationError):
        OllamaDialogueProvider()._complete("system", "user", max_tokens=100, temperature=.4)


def test_ollama_json_and_timeout(monkeypatch):
    def post(url, json, timeout):
        assert json["format"] == "json"
        assert json["options"]["num_predict"] == 2048
        assert timeout == settings.ollama_timeout_sec
        return response({"message": {"content": "{}"}})
    monkeypatch.setattr(httpx, "post", post)
    assert OllamaDialogueProvider()._complete("s", "u", max_tokens=3000, temperature=.4, json_mode=True) == "{}"


def test_workplace_plan_uses_selected_ollama(monkeypatch):
    from app.services.interaction import _plan_workplace
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    plan = {"acts": []}
    monkeypatch.setattr(OllamaDialogueProvider, "plan_workplace_day", lambda *a: plan)
    monkeypatch.setattr("app.services.interaction.enrich_plan_fallback_pools", lambda value, *a: value)
    assert _plan_workplace(None, None, [], None) is plan
