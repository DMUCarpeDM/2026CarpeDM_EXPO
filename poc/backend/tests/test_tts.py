from pydantic import SecretStr
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_elevenlabs_tts_returns_mp3_bytes_when_configured(monkeypatch):
    from app.services.tts import synthesize_elevenlabs

    class FakeResponse:
        content = b"fake-mp3"

        def raise_for_status(self):
            return None

    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(settings, "elevenlabs_api_key", SecretStr("test-key"))
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "voice-123")
    monkeypatch.setattr("app.services.tts.httpx.post", fake_post)

    audio = synthesize_elevenlabs("안녕하세요.")

    assert audio == b"fake-mp3"
    assert captured["url"].endswith("/v1/text-to-speech/voice-123")
    assert captured["headers"]["xi-api-key"] == "test-key"
    assert captured["json"]["text"] == "안녕하세요."
    assert captured["json"]["model_id"] == settings.elevenlabs_model


def test_tts_endpoint_without_voice_uses_iris(monkeypatch):
    monkeypatch.setattr("app.api.tts.synthesize_iris", lambda _text: b"RIFFiris")

    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요."})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFFiris"


def test_female_tts_uses_iris_without_elevenlabs(monkeypatch):
    monkeypatch.setattr("app.api.tts.synthesize_iris", lambda _text: b"RIFFiris")

    def unexpected_elevenlabs(_text):
        raise AssertionError("Iris voice must not call ElevenLabs")

    monkeypatch.setattr("app.services.tts.synthesize_elevenlabs", unexpected_elevenlabs)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요.", "voice": "female"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFFiris"


def test_female_tts_unavailable_does_not_use_elevenlabs(monkeypatch):
    from app.services.tts import SpeechSynthesisError

    def unavailable(_text):
        raise SpeechSynthesisError("Iris offline")

    def unexpected_elevenlabs(_text):
        raise AssertionError("Iris fallback must use browser speech")

    monkeypatch.setattr("app.api.tts.synthesize_iris", unavailable)
    monkeypatch.setattr("app.services.tts.synthesize_elevenlabs", unexpected_elevenlabs)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요.", "voice": "female"})
    assert response.status_code == 503


def test_male_tts_uses_browser_without_server_synthesis(monkeypatch):
    def unexpected_synthesis(_text):
        raise AssertionError("Male voice must use browser speech")

    monkeypatch.setattr("app.api.tts.synthesize_iris", unexpected_synthesis)
    monkeypatch.setattr("app.services.tts.synthesize_elevenlabs", unexpected_synthesis)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요.", "voice": "male"})
    assert response.status_code == 503
