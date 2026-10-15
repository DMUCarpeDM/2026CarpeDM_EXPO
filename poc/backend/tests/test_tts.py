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


def test_elevenlabs_stream_identifies_its_provider(monkeypatch):
    monkeypatch.setattr(settings, "tts_provider", "elevenlabs")
    async def fake_stream(_text):
        yield b"pcm-bytes"
    monkeypatch.setattr("app.api.tts.stream_elevenlabs", fake_stream)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요.", "voice": "female"})
    assert response.status_code == 200
    assert response.headers["x-tts-provider"] == "elevenlabs"
    assert response.content == b"pcm-bytes"


def test_subscription_error_is_distinct_from_generic_tts_failure(monkeypatch):
    from app.services.tts import SpeechSynthesisError
    async def unavailable(_text):
        raise SpeechSynthesisError("blocked", code="payment_required")
        yield
    monkeypatch.setattr("app.api.tts.stream_elevenlabs", unavailable)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요."})
    assert response.status_code == 402
    assert "Free" in response.json()["detail"]


def test_unknown_stream_error_remains_unavailable(monkeypatch):
    from app.services.tts import SpeechSynthesisError
    async def unavailable(_text):
        raise SpeechSynthesisError("offline")
        yield
    monkeypatch.setattr("app.api.tts.stream_elevenlabs", unavailable)
    response = TestClient(app).post("/api/tts", json={"text": "안녕하세요."})
    assert response.status_code == 503


def test_stream_preserves_upstream_payment_error(monkeypatch):
    import asyncio, json
    from app.services.tts import stream_elevenlabs, SpeechSynthesisError
    class Socket:
        async def send(self, _message): pass
        async def recv(self): return json.dumps({"error": "payment_required", "message": "Free users cannot use library voices"})
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    monkeypatch.setattr(settings, "elevenlabs_api_key", SecretStr("test-key"))
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    monkeypatch.setattr("websockets.asyncio.client.connect", lambda *args, **kwargs: Socket())
    async def check():
        stream = stream_elevenlabs("테스트")
        try:
            await anext(stream)
        except SpeechSynthesisError as error:
            assert error.code == "payment_required"
        else:
            raise AssertionError("expected provider error")
        finally:
            await stream.aclose()
    asyncio.run(check())


def test_http_audio_ends_before_provider_connection_cleanup(monkeypatch):
    import asyncio
    from app.api.tts import create_speech
    from app.schemas import TtsIn

    async def check():
        closing = asyncio.Event()
        release_close = asyncio.Event()
        messages = []

        async def stream(_text):
            try:
                yield b"last-pcm"
                yield b""
            finally:
                closing.set()
                await release_close.wait()

        monkeypatch.setattr("app.api.tts.stream_elevenlabs", stream)
        response = await create_speech(TtsIn(text="테스트", voice="female"))

        async def send(message):
            messages.append(message)

        async def receive():
            await asyncio.Future()

        task = asyncio.create_task(response({"type": "http", "asgi": {"spec_version": "2.4"}}, receive, send))
        try:
            await asyncio.wait_for(closing.wait(), 1)
            assert not task.done()  # Slow provider cleanup is still running.
            assert messages[-1] == {"type": "http.response.body", "body": b"", "more_body": False}
            assert b"".join(m.get("body", b"") for m in messages) == b"last-pcm"
        finally:
            release_close.set()
            await task

    asyncio.run(check())


def test_provider_completion_marker_precedes_slow_socket_close(monkeypatch):
    import asyncio, json
    from app.services.tts import stream_elevenlabs

    async def check():
        closing = False
        class Socket:
            async def send(self, _message): pass
            async def recv(self): return json.dumps({"audio": "AABAQA==", "is_final": True})
            async def __aenter__(self): return self
            async def __aexit__(self, *args):
                nonlocal closing
                closing = True
        monkeypatch.setattr(settings, "elevenlabs_api_key", SecretStr("test-key"))
        monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
        monkeypatch.setattr("websockets.asyncio.client.connect", lambda *args, **kwargs: Socket())
        stream = stream_elevenlabs("테스트")
        assert await anext(stream) == b"\x00\x00@@"
        assert await anext(stream) == b""
        assert not closing
        await stream.aclose()
        assert closing

    asyncio.run(check())
