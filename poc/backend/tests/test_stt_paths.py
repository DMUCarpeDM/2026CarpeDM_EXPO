"""서버 STT 경로 해석·폴백 강등 회귀 테스트.

배경: 전시 PC에서 저장소 폴더명이 바뀌자 .env의 Whisper 절대 경로가 낡아
HFValidationError가 그대로 전파, /api/health까지 500이 났다. 폴백 계층
원칙(어떤 실패든 Vosk → 없음 순으로 강등)이 지켜지는지 여기서 고정한다.
"""
from pathlib import Path

import pytest

from app.ai.stt import base


@pytest.fixture(autouse=True)
def _clear_provider_cache():
    base.get_stt_provider.cache_clear()
    yield
    base.get_stt_provider.cache_clear()


def test_absolute_existing_dir_resolves_to_itself(tmp_path):
    model_dir = tmp_path / "whisper-small"
    model_dir.mkdir()
    assert base._resolve_local_dir(model_dir) == model_dir.resolve()


def test_relative_dir_resolves_against_backend_root(tmp_path, monkeypatch):
    backend_root = tmp_path / "backend"
    (backend_root / "models" / "whisper-small").mkdir(parents=True)
    monkeypatch.setattr(base, "BACKEND_ROOT", backend_root)
    elsewhere = tmp_path / "elsewhere"  # CWD에 models/가 없어도 찾아야 한다
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    resolved = base._resolve_local_dir("./models/whisper-small")
    assert resolved == (backend_root / "models" / "whisper-small").resolve()


def test_stale_absolute_path_rescued_by_models_tail(tmp_path, monkeypatch):
    """폴더명 변경으로 낡은 절대 경로 — models/ 이하를 backend 루트에 재접합."""
    monkeypatch.setattr(base, "BACKEND_ROOT", tmp_path)
    (tmp_path / "models" / "whisper-small").mkdir(parents=True)
    # OS별로 절대 경로 형태가 다르다 (Windows는 드라이브 문자 필요)
    import os
    prefix = "C:/없어진-폴더" if os.name == "nt" else "/없어진-폴더"
    stale = Path(f"{prefix}/poc/backend/models/whisper-small")
    assert stale.is_absolute() and not stale.exists()
    resolved = base._resolve_local_dir(stale)
    assert resolved == (tmp_path / "models" / "whisper-small").resolve()


def test_size_name_is_not_a_local_dir():
    assert base._resolve_local_dir("small") is None


def test_missing_dir_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(base, "BACKEND_ROOT", tmp_path)
    monkeypatch.chdir(tmp_path)
    assert base._resolve_local_dir("./models/없는-모델") is None


def test_whisper_load_failure_falls_back_to_vosk(monkeypatch):
    """Whisper가 ImportError가 아닌 오류로 죽어도 Vosk로 강등돼야 한다."""

    class _BrokenWhisper:
        def __init__(self):
            raise ValueError("모델 경로가 낡았다")

    class _FakeVosk:
        name = "vosk"

    monkeypatch.setattr(base, "WhisperProvider", _BrokenWhisper)
    monkeypatch.setattr(base, "VoskProvider", _FakeVosk)
    provider = base.get_stt_provider()
    assert provider is not None and provider.name == "vosk"


def test_both_providers_dead_returns_none(monkeypatch):
    class _Broken:
        def __init__(self):
            raise RuntimeError("죽음")

    monkeypatch.setattr(base, "WhisperProvider", _Broken)
    monkeypatch.setattr(base, "VoskProvider", _Broken)
    assert base.get_stt_provider() is None


def test_hotword_prompt_applied_to_final_transcribe_only(monkeypatch):
    """핫워드 부스팅 (STT 최적화 R1) — 도메인 어휘가 최종 전사에만 조건화된다.

    실시간 조각(live)은 짧아 조건화가 환청을 증폭시킬 수 있어 제외 —
    이 비대칭이 회귀로 무너지지 않게 고정한다.
    """
    from app.core.config import settings

    calls = []

    class _FakeModel:
        def transcribe(self, path, **kwargs):
            calls.append(kwargs)
            return [], None

    provider = base.WhisperProvider.__new__(base.WhisperProvider)
    provider._model = _FakeModel()

    monkeypatch.setattr(settings, "stt_initial_prompt", "카페 온도, 온도라떼")
    provider.transcribe("x.wav")
    provider.transcribe_words("x.wav")
    provider.transcribe_live("x.wav")
    assert calls[0]["initial_prompt"] == "카페 온도, 온도라떼"
    assert calls[1]["initial_prompt"] == "카페 온도, 온도라떼"
    assert "initial_prompt" not in calls[2], "실시간 조각에는 조건화하지 않는다"

    # 비우면 완전 비활성 (기존 동작과 동일)
    calls.clear()
    monkeypatch.setattr(settings, "stt_initial_prompt", "")
    provider.transcribe("x.wav")
    assert "initial_prompt" not in calls[0]
