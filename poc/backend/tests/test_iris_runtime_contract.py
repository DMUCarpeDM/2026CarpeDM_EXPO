"""Run with backend and iris-runtime on PYTHONPATH. No real model inference."""
from dataclasses import replace
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "iris-runtime"))
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient

runtime = importlib.import_module('services.voice_runtime.app')
tts = importlib.import_module('services.voice_runtime.tts_service')
from app.services import iris_tts as adapter
from services.voice_runtime.model_manager import PreparedVoiceClone, VoiceModelManager


def test_profile_and_runtime_to_backend_wav(tmp_path, monkeypatch):
    profile = runtime.tts_service.profile
    assert profile is not None and profile.dim == 1024
    assert profile.model_name == 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
    config = replace(runtime.CONFIG, iris_home_dir=tmp_path, mock_mode=False)
    monkeypatch.setattr(runtime, 'CONFIG', config)
    monkeypatch.setattr(tts, 'CONFIG', config)
    monkeypatch.setattr(runtime.tts_service, 'prepare_profile_prompt', lambda tone: PreparedVoiceClone('test:'+tone, {'fake': True}))

    class Model:
        def generate_voice_clone(self, **kwargs):
            assert kwargs['language'] == 'korean'
            return [np.array([0.1, -0.1] * 2400)], 24000

    monkeypatch.setattr(runtime.tts_service, '_ensure_tts_model', lambda name: Model())
    client = TestClient(runtime.app)
    monkeypatch.setattr(adapter.httpx, 'post', lambda url, **kw: client.post('/v1/audio/speech', json=kw['json']))
    monkeypatch.setattr(adapter.settings, 'iris_audio_dir', tmp_path/'audio')
    data = adapter.synthesize_iris('안녕하세요. 연결 검증입니다.')
    assert data.startswith(b'RIFF') and len(data) > 44


def test_mock_runtime_is_not_ready(monkeypatch):
    config = replace(runtime.CONFIG, mock_mode=True)
    monkeypatch.setattr(runtime, 'CONFIG', config)
    client = TestClient(runtime.app)
    monkeypatch.setattr(adapter.httpx, 'get', lambda *a, **kw: client.get('/health'))
    monkeypatch.setitem(adapter._CACHE, 'at', 0)
    assert adapter.iris_female_ready() is False


def test_pascal_loads_float32_sdpa(monkeypatch):
    captured = {}
    torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True, is_bf16_supported=lambda: False), float32='fp32', bfloat16='bf16')
    monkeypatch.setitem(sys.modules, 'torch', torch)
    class Model:
        @staticmethod
        def from_pretrained(name, **kwargs):
            captured.update(kwargs)
            return object()
    monkeypatch.setitem(sys.modules, 'qwen_tts', SimpleNamespace(Qwen3TTSModel=Model))
    tts.TTSService(VoiceModelManager())._ensure_tts_model('test')
    assert captured == {'device_map': 'cuda:0', 'dtype': 'fp32', 'attn_implementation': 'sdpa'}
