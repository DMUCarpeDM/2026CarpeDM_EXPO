import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.dialogue import get_dialogue_provider
from app.services.dialogue.availability import dialogue_ready
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.openai_provider import DialogueGenerationError
from app.services.iris_tts import synthesize_iris
from app.services.tts import SpeechSynthesisError


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


@pytest.mark.parametrize("provider", ["iris", "elevenlabs"])
def test_tts_ignores_legacy_elevenlabs_setting(monkeypatch, provider):
    monkeypatch.setattr(settings, "tts_provider", provider)
    monkeypatch.setattr("app.api.tts.synthesize_iris", lambda text: b"iris")
    monkeypatch.setattr("app.services.tts.synthesize_elevenlabs", lambda text: b"legacy")
    r = TestClient(app).post("/api/tts", json={"text": "안녕하세요."})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.content == b"iris"


def test_iris_path_and_invalid_response(monkeypatch, tmp_path):
    root = tmp_path / "audio"
    root.mkdir()
    wav = root / "ok.wav"
    wav.write_bytes(b"RIFFaudio")
    monkeypatch.setattr(settings, "iris_audio_dir", root)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response({"audio_path": str(wav)}))
    assert synthesize_iris("안녕") == b"RIFFaudio"
    for data in [[], {}, {"audio_path": str(tmp_path / "outside.wav")}]:
        monkeypatch.setattr(httpx, "post", lambda *a, **k: response(data))
        with pytest.raises(SpeechSynthesisError):
            synthesize_iris("안녕")


def test_iris_failure_returns_browser_fallback(monkeypatch):
    monkeypatch.setattr(settings, "tts_provider", "iris")
    def fail(text):
        raise SpeechSynthesisError("offline")
    monkeypatch.setattr("app.api.tts.synthesize_iris", fail)
    assert TestClient(app).post("/api/tts", json={"text": "안녕"}).status_code == 503


def test_workplace_plan_uses_selected_ollama(monkeypatch):
    from app.services.interaction import _plan_workplace
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    plan = {"acts": []}
    monkeypatch.setattr(OllamaDialogueProvider, "plan_workplace_day", lambda *a: plan)
    monkeypatch.setattr("app.services.interaction.enrich_plan_fallback_pools", lambda value, *a: value)
    assert _plan_workplace(None, None, [], None) is plan


def test_iris_health_rejects_mock_and_bad_payload(monkeypatch):
    from app.services import iris_tts
    for payload, expected in [({"status": "ok", "mock_mode": False}, True),
                              ({"status": "ok", "mock_mode": True}, False), ([], False)]:
        monkeypatch.setattr(iris_tts, "_CACHE", {"at": 0.0, "ready": False})
        monkeypatch.setattr(httpx, "get", lambda url, **k: response({"available": True} if url.endswith("/v1/voice/profile") else payload))
        assert iris_tts.iris_female_ready() is expected
