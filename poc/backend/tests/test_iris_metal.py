"""Metal 경로가 Iris의 화자·ICL 정보를 생략하거나 저정밀 양자화하지 않는지 확인."""
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "iris-runtime"))
from services.voice_runtime.tts_metal import MetalVoiceCloneModel


class Tensor:
    def __init__(self, data):
        self.data = np.asarray(data)

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.data


def test_metal_preserves_full_icl_reference():
    calls = []
    runtime = SimpleNamespace(synthesize=lambda **kw: (calls.append(kw) or np.array([0.1]), 24000))
    codes = np.arange(48).reshape(3, 16)
    prompt = SimpleNamespace(ref_spk_embedding=Tensor([0.1, 0.2]), ref_code=Tensor(codes),
                             icl_mode=True, ref_text="원본 참고 음성")
    wavs, sr = MetalVoiceCloneModel(runtime).generate_voice_clone(
        text="새 문장", language="korean", voice_clone_prompt=[prompt], non_streaming_mode=True,
    )
    assert sr == 24000 and len(wavs) == 1
    np.testing.assert_array_equal(calls[0]["ref_codes"], codes.T)
    np.testing.assert_allclose(calls[0]["ref_spk_emb"], [0.1, 0.2])
    assert calls[0]["ref_text"] == "원본 참고 음성"
    assert calls[0]["lang"] == "korean"
    assert calls[0]["subtalker_do_sample"] is True


def test_metal_loads_original_precision_without_network(monkeypatch):
    monkeypatch.setenv("GGML_BACKEND", "MTL0")
    captured = []
    class Runtime:
        def __init__(self, *paths, **kwargs):
            pass
    def download(repo, **kwargs):
        captured.append(kwargs)
        return kwargs["filename"]
    monkeypatch.setitem(sys.modules, "qwentts_cpp", SimpleNamespace(QwenTTS=Runtime))
    monkeypatch.setitem(sys.modules, "huggingface_hub", SimpleNamespace(hf_hub_download=download))
    MetalVoiceCloneModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-Base")
    assert [row["filename"] for row in captured] == ["qwen-talker-0.6b-base-BF16.gguf", "qwen-tokenizer-12hz-F32.gguf"]
    assert all(row["local_files_only"] for row in captured)


def test_missing_metal_falls_back_to_existing_cpu_model(monkeypatch):
    from services.voice_runtime import tts_service
    from services.voice_runtime.model_manager import VoiceModelManager
    def missing(*_):
        raise FileNotFoundError("Metal weights not installed")
    monkeypatch.setattr(MetalVoiceCloneModel, "from_pretrained", missing)
    monkeypatch.setattr(tts_service.sys, "platform", "darwin")
    monkeypatch.delenv("IRIS_TTS_BACKEND", raising=False)
    captured = {}
    class Model:
        @staticmethod
        def from_pretrained(name, **kwargs):
            captured.update(kwargs)
            return object()
    monkeypatch.setitem(sys.modules, "qwen_tts", SimpleNamespace(Qwen3TTSModel=Model))
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: False), float32="fp32",
    ))
    tts_service.TTSService(VoiceModelManager())._ensure_tts_model("test")
    assert captured == {"device_map": "cpu", "dtype": "fp32"}


def test_runtime_warms_voice_before_serving_first_request(monkeypatch, tmp_path):
    import importlib
    from dataclasses import replace
    from fastapi.testclient import TestClient
    from services.voice_runtime import tts_metal
    runtime = importlib.import_module("services.voice_runtime.app")
    monkeypatch.setattr(runtime, "CONFIG", replace(runtime.CONFIG, mock_mode=False))
    monkeypatch.setattr(runtime.sys, "platform", "darwin")
    monkeypatch.delenv("IRIS_TTS_BACKEND", raising=False)
    monkeypatch.setattr(tts_metal, "METAL_MODEL_DIR", tmp_path)
    warmed = []
    monkeypatch.setattr(runtime.tts_service, "synthesize_speech", lambda **kw: warmed.append(kw))
    with TestClient(runtime.app) as client:
        assert len(warmed) == 1
        assert warmed[0]["force_regenerate"] is True
        assert client.get("/health").status_code == 200
