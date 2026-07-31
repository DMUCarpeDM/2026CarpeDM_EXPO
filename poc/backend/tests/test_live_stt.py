"""실시간 받아쓰기 폴백(/sessions/{id}/stt) — 능력 토큰 보호·전사 반환·임시 파일 정리.

브라우저 Web Speech가 없는(오프라인 Chrome 등) 전시 환경에서 프론트가 3초 안팎의
WAV 조각을 보내 입력창을 채우는 경로다. 턴 상태는 건드리지 않는다.
"""
from fastapi.testclient import TestClient
import pytest

import app.ai.stt as stt_module
from app.core.config import settings
from app.main import app
from app.seed.run import seed

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


class _FakeStt:
    name = "fake"

    def transcribe(self, audio_path: str) -> str:
        return " 내일까지 마무리하겠습니다 "


def _create() -> dict:
    return client.post(
        "/api/sessions",
        json={"mode": 5, "difficulty": "basic", "consent": CONSENT},
    ).json()


def test_live_stt_requires_token_and_returns_transcript(monkeypatch):
    seed()
    a = _create()
    monkeypatch.setattr(stt_module, "get_stt_provider", lambda: _FakeStt())
    files = {"file": ("live.wav", b"RIFF-fake-wav-bytes", "audio/wav")}
    # 다른 세션 API와 동일한 능력 토큰 보호 (IDOR 차단)
    assert client.post(f"/api/sessions/{a['id']}/stt", files=files).status_code == 403
    r = client.post(
        f"/api/sessions/{a['id']}/stt", files=files,
        headers={"X-Session-Token": a["access_token"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "내일까지 마무리하겠습니다"  # strip 확인
    assert body["provider"] == "fake"
    # 조각 임시 파일은 전사 직후 삭제된다 — 보존 정책 대상이 아니다
    assert not list(settings.media_dir.glob(f"live_stt_{a['id']}_*.wav"))


def test_live_stt_503_when_no_provider(monkeypatch):
    seed()
    a = _create()
    monkeypatch.setattr(stt_module, "get_stt_provider", lambda: None)
    files = {"file": ("live.wav", b"x", "audio/wav")}
    r = client.post(
        f"/api/sessions/{a['id']}/stt", files=files,
        headers={"X-Session-Token": a["access_token"]},
    )
    assert r.status_code == 503


def test_live_stt_prefers_low_latency_path(monkeypatch):
    """transcribe_live가 있는 제공자(whisper)는 저지연 경로를 쓴다."""
    seed()
    a = _create()

    class _FastStt:
        name = "fast"

        def transcribe(self, audio_path: str) -> str:  # pragma: no cover - 호출되면 안 됨
            raise AssertionError("저지연 경로가 있으면 일반 경로를 쓰지 않는다")

        def transcribe_live(self, audio_path: str) -> str:
            return "빠른 전사"

    monkeypatch.setattr(stt_module, "get_stt_provider", lambda: _FastStt())
    files = {"file": ("live.wav", b"RIFF-fake", "audio/wav")}
    r = client.post(
        f"/api/sessions/{a['id']}/stt", files=files,
        headers={"X-Session-Token": a["access_token"]},
    )
    assert r.status_code == 200
    assert r.json()["text"] == "빠른 전사"


def test_live_stt_rejects_oversized_chunk(monkeypatch):
    seed()
    a = _create()
    monkeypatch.setattr(stt_module, "get_stt_provider", lambda: _FakeStt())
    from app.api.sessions import MAX_LIVE_STT_BYTES

    files = {"file": ("live.wav", b"\x00" * (MAX_LIVE_STT_BYTES + 1), "audio/wav")}
    r = client.post(
        f"/api/sessions/{a['id']}/stt", files=files,
        headers={"X-Session-Token": a["access_token"]},
    )
    assert r.status_code == 413
