import asyncio
import base64
import json
from types import SimpleNamespace
import numpy as np
from pydantic import SecretStr
from app.ai.stt.base import WhisperProvider
from app.services import voice_analysis
from app.ai import voice_measurement


def test_regions_preserve_timestamps_and_exclude_other_audio(monkeypatch):
    import faster_whisper.audio
    monkeypatch.setattr(faster_whisper.audio, 'decode_audio', lambda *a, **k: np.ones(160000, dtype=np.float32))
    provider = WhisperProvider.__new__(WhisperProvider)
    sizes = []
    def decode(samples):
        sizes.append(len(samples))
        return [{'word': '확인', 'start': .1, 'end': .5, 'conf': .9}]
    monkeypatch.setattr(provider, '_transcribe_audio', decode)
    words = provider.transcribe_regions('test.wav', [(3, 4), (7, 9)])
    assert sizes == [16000, 32000]
    assert [w['start'] for w in words] == [3.1, 7.1]
    assert [w['end'] for w in words] == [3.5, 7.5]


def test_elevenlabs_stream_yields_audio_before_receiving_the_final_chunk(monkeypatch):
    from app.core.config import settings
    from app.services.tts import stream_elevenlabs

    received = []
    messages = iter([
        {"audio": base64.b64encode(b"\x01\x00" * 100).decode()},
        {"audio": base64.b64encode(b"\x02\x00" * 100).decode(), "is_final": True},
    ])
    class Socket:
        async def send(self, _message): pass
        async def recv(self):
            message = next(messages)
            received.append(message)
            return json.dumps(message)
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass

    monkeypatch.setattr(settings, "elevenlabs_api_key", SecretStr("test-key"))
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    monkeypatch.setattr("websockets.asyncio.client.connect", lambda *args, **kwargs: Socket())
    async def check():
        stream = stream_elevenlabs("알겠어요. 다시 말해 주세요.")
        try:
            assert await anext(stream) == b"\x01\x00" * 100
            assert len(received) == 1
            assert await anext(stream) == b"\x02\x00" * 100
            assert len(received) == 2
            # 완료 마커는 HTTP 응답 계층에서 제거한다.
            assert [chunk async for chunk in stream] == [b""]
        finally:
            await stream.aclose()
    asyncio.run(check())


def test_measurement_reuses_decoding_and_vad_without_merging_ai_audio(monkeypatch):
    calls = {"decode": 0, "vad": 0}
    regions = []
    def load(_path, *_args):
        calls["decode"] += 1
        return np.ones(32000) * .1, 16000, 1
    def detect(*_args):
        calls["vad"] += 1
        return [(0., 2.)]
    def transcribe(_path, windows):
        regions.extend(windows)
        return [{"word": "확인", "start": .1, "end": .5, "conf": .9}]
    monkeypatch.setattr(voice_measurement, "load_audio", load)
    monkeypatch.setattr(voice_measurement, "speech_segments", detect)
    monkeypatch.setattr(voice_measurement, "_rms", lambda *_: .1)
    monkeypatch.setattr(voice_analysis, "get_stt_provider", lambda: SimpleNamespace(transcribe_regions=transcribe))
    measurement, habits, log = voice_analysis._measure("answer.wav", 1, 2, None,
        {"excluded_intervals": [[.9, 1.1]]}, False)
    assert calls == {"decode": 1, "vad": 1}
    assert regions == [[0., .9], [1.1, 2.]]
    assert measurement["speech_segments"] == [{"start": 0., "end": .9}, {"start": 1.1, "end": 2.}]
    assert habits["transcript"] == "확인"
    assert log["status_code"] == 200


def test_silent_measurement_skips_whisper_and_reuses_vad(monkeypatch):
    calls = []
    monkeypatch.setattr(voice_measurement, "load_audio", lambda *_: (np.zeros(16000), 16000, 1))
    monkeypatch.setattr(voice_measurement, "speech_segments", lambda *_: calls.append("vad") or [])
    def unexpected():
        raise AssertionError("무음은 Whisper에 전달하지 않습니다")
    monkeypatch.setattr(voice_analysis, "get_stt_provider", unexpected)
    measurement, habits, log = voice_analysis._measure("silent.wav", 1, 2, None, {}, False)
    assert calls == ["vad"]
    assert measurement["quality_flags"] == ["no_speech"]
    assert habits is None
    assert log["skipped"] == "no_user_speech"


def test_vad_failure_keeps_its_measurement_reason(monkeypatch):
    monkeypatch.setattr(voice_measurement, "load_audio", lambda *_: (np.zeros(16000), 16000, 1))
    def failed(*_):
        raise RuntimeError("VAD unavailable")
    monkeypatch.setattr(voice_measurement, "speech_segments", failed)
    measurement, habits, log = voice_analysis._measure("answer.wav", 1, 2, None, {}, False)
    assert measurement["quality_flags"] == ["vad_unavailable"]
    assert habits is None
    assert log is None


def test_empty_elevenlabs_stream_returns_service_error(monkeypatch):
    from app.main import app
    from fastapi.testclient import TestClient

    async def empty_stream(_text):
        if False:
            yield b""

    monkeypatch.setattr("app.api.tts.stream_elevenlabs", empty_stream)
    response = TestClient(app).post("/api/tts", json={"text": "음성 확인", "voice": "female", "stream": True})
    assert response.status_code == 503
