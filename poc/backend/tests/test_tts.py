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


def test_tts_endpoint_returns_audio_mpeg_when_synthesis_succeeds(monkeypatch):
    monkeypatch.setattr("app.api.tts.synthesize_elevenlabs", lambda _text: b"fake-mp3")

    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요."})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"fake-mp3"
