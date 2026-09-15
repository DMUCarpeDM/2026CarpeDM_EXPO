"""Whisper 모델 경로, 간투어 프롬프트, 실패 시 미측정 계약."""
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


def test_whisper_load_failure_returns_none(monkeypatch):
    class Broken:
        def __init__(self):
            raise ValueError("모델 경로 오류")
    monkeypatch.setattr(base, "WhisperProvider", Broken)
    assert base.get_stt_provider() is None


def test_filler_prompt_and_word_timestamps(monkeypatch):
    import numpy as np
    import faster_whisper.audio
    monkeypatch.setattr(faster_whisper.audio, "decode_audio", lambda *args, **kwargs: np.ones(16000, dtype=np.float32) * .1)
    from types import SimpleNamespace
    from app.core.config import settings
    calls = []
    class Model:
        def transcribe(self, path, **kwargs):
            calls.append(kwargs)
            return [SimpleNamespace(words=[SimpleNamespace(word=" 음 ", start=0, end=.3, probability=.9)])], None
    provider = base.WhisperProvider.__new__(base.WhisperProvider)
    provider._model = Model()
    monkeypatch.setattr(settings, "stt_filler_prompt", "어, 음, 반복을 포함합니다.")
    assert provider.transcribe_words("x.wav")[0]["word"] == "음"
    assert calls[0]["initial_prompt"] == settings.stt_filler_prompt
    assert calls[0]["word_timestamps"] is True
    assert calls[0]["condition_on_previous_text"] is False


def test_digital_silence_never_reaches_whisper_decoder(monkeypatch):
    import numpy as np
    import faster_whisper.audio
    monkeypatch.setattr(faster_whisper.audio, "decode_audio", lambda *args, **kwargs: np.zeros(16000, dtype=np.float32))
    provider = base.WhisperProvider.__new__(base.WhisperProvider)
    # 모델이 없어도 반환되어야 한다: 디코더 호출 자체를 막는다.
    assert provider.transcribe_words("silent.wav") == []
