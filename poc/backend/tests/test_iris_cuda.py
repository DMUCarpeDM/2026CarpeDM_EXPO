"""CUDA 어댑터 계약. 실제 GPU·다운로드·모델 추론은 사용하지 않는다."""
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "iris-runtime"))
from services.voice_runtime.tts_cuda import (
    CODEC_FRAMES_PER_SECOND, CudaVoiceCloneModel, CpuTextEmbedding, DEFAULT_MODEL,
)


def test_cpu_text_lookup_keeps_every_weight_and_exact_values():
    embedding = torch.nn.Embedding(10, 4)
    ids = torch.tensor([[1, 6, 1]])
    expected = embedding(ids).detach().clone()
    weights = embedding.weight
    wrapped = CpuTextEmbedding(embedding, output_device="cpu")
    assert wrapped.weight is weights
    assert wrapped.weight.device.type == "cpu"
    torch.testing.assert_close(wrapped(ids), expected, rtol=0, atol=0)


def fake_fast(prefill=100, frames=40):
    calls = {"base": [], "fast": [], "prepare": [], "warm": 0}

    def base(**kwargs):
        calls["base"].append(kwargs)
        return [np.array([0.4, -0.4])], 24000

    def generate(**kwargs):
        calls["fast"].append(kwargs)
        return [np.ones(int(frames * 24000 / CODEC_FRAMES_PER_SECOND))], 24000

    def prepare(**kwargs):
        calls["prepare"].append(kwargs)
        return (None, None, None, SimpleNamespace(shape=(1, prefill, 4)))

    def warm():
        calls["warm"] += 1

    fast = SimpleNamespace(
        model=SimpleNamespace(generate_voice_clone=base),
        talker_graph=SimpleNamespace(max_seq_len=512),
        generate_voice_clone=generate, _prepare_generation=prepare, warmup=warm,
    )
    return fast, calls


def test_capacity_fallback_uses_same_model_and_full_prompt():
    fast, calls = fake_fast(prefill=300)
    prompt = [object()]
    result = CudaVoiceCloneModel(fast).generate_voice_clone(
        text="긴 원문 전체를 빠뜨리지 않고 읽습니다.", language="korean",
        voice_clone_prompt=prompt,
    )
    assert not calls["fast"]
    assert calls["base"][0]["voice_clone_prompt"] is prompt
    assert calls["base"][0]["max_new_tokens"] == 8192
    assert calls["base"][0]["non_streaming_mode"] is True
    np.testing.assert_array_equal(result[0][0], [0.4, -0.4])


def test_short_generation_preserves_prompt_and_warms_once():
    fast, calls = fake_fast()
    prompt = [object()]
    adapter = CudaVoiceCloneModel(fast)
    for _ in range(2):
        adapter.generate_voice_clone(text="실제 새 답변", language="korean", voice_clone_prompt=prompt)
    assert calls["warm"] == 1
    assert adapter._warmed_up is True
    assert not calls["base"]
    assert all(row["voice_clone_prompt"] is prompt for row in calls["fast"])
    assert all(row["voice_clone_prompt"] is prompt for row in calls["prepare"])
    assert all(row["non_streaming_mode"] is True for row in calls["fast"])
    assert all(row["max_new_tokens"] == 8192 for row in calls["fast"])


def test_possible_fixed_cache_truncation_regenerates_full_sentence():
    fast, calls = fake_fast(prefill=100, frames=411)
    prompt = [object()]
    CudaVoiceCloneModel(fast).generate_voice_clone(
        text="끝 문장까지 모두 읽어야 합니다.", language="korean", voice_clone_prompt=prompt,
    )
    assert len(calls["fast"]) == len(calls["base"]) == 1
    assert calls["base"][0]["voice_clone_prompt"] is prompt
    assert calls["base"][0]["text"] == calls["fast"][0]["text"]


def test_loader_uses_fp32_sdpa_cached_source_and_offloads(monkeypatch):
    from services.voice_runtime import tts_cuda
    captured = {}
    moved = []
    original_embedding = torch.nn.Embedding(10, 4)
    core = SimpleNamespace(text_embedding=original_embedding)
    speaker = SimpleNamespace(to=lambda device: moved.append(("speaker", device)))
    encoder = SimpleNamespace(to=lambda device: moved.append(("encoder", device)))
    talker = SimpleNamespace(model=core, get_text_embeddings=lambda: core.text_embedding)
    fast = SimpleNamespace(model=SimpleNamespace(model=SimpleNamespace(talker=talker, speaker_encoder=speaker)),
                           speech_tokenizer=SimpleNamespace(model=SimpleNamespace(encoder=encoder)))

    def load(source, **kwargs):
        captured.update(source=source, **kwargs)
        return fast

    def snapshot(name, **kwargs):
        assert name == DEFAULT_MODEL
        assert kwargs == {"local_files_only": True}
        return "cached-snapshot"

    monkeypatch.setitem(sys.modules, "faster_qwen3_tts", SimpleNamespace(
        FasterQwen3TTS=SimpleNamespace(from_pretrained=load)))
    import huggingface_hub
    monkeypatch.setattr(huggingface_hub, "snapshot_download", snapshot)
    monkeypatch.setattr(tts_cuda.torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(tts_cuda.torch.cuda, "empty_cache", lambda: None)
    monkeypatch.setattr(tts_cuda.torch, "set_num_threads", lambda count: captured.update(threads=count))
    adapter = CudaVoiceCloneModel.from_pretrained(DEFAULT_MODEL)
    assert adapter.model is fast
    assert captured == {"source": "cached-snapshot", "threads": 1, "device": "cuda:0",
                        "dtype": torch.float32, "attn_implementation": "sdpa", "max_seq_len": 512}
    assert isinstance(core.text_embedding, CpuTextEmbedding)
    assert core.text_embedding.weight is original_embedding.weight
    assert moved == [("speaker", "cpu"), ("encoder", "cpu")]


def test_reference_encoders_return_to_cpu_after_preparation_failure():
    moved = []
    speaker = SimpleNamespace(to=lambda device: moved.append(("speaker", device)))
    encoder = SimpleNamespace(to=lambda device: moved.append(("encoder", device)))

    def fail(**kwargs):
        raise RuntimeError("bad reference audio")

    fast = SimpleNamespace(
        model=SimpleNamespace(model=SimpleNamespace(speaker_encoder=speaker), create_voice_clone_prompt=fail),
        speech_tokenizer=SimpleNamespace(model=SimpleNamespace(encoder=encoder)),
    )
    with pytest.raises(RuntimeError, match="bad reference"):
        CudaVoiceCloneModel(fast).create_voice_clone_prompt(ref_audio="ref.wav", ref_text="참고 음성")
    assert moved == [("speaker", "cuda:0"), ("encoder", "cuda:0"),
                     ("speaker", "cpu"), ("encoder", "cpu")]


def test_all_requests_share_one_worker_and_nested_warmup_does_not_deadlock(monkeypatch):
    from services.voice_runtime import tts_cuda
    fast, calls = fake_fast()
    events = []
    for name in ("warmup", "_prepare_generation", "generate_voice_clone"):
        original = getattr(fast, name)

        def record(*args, _name=name, _original=original, **kwargs):
            events.append((_name, threading.get_ident()))
            return _original(*args, **kwargs)

        setattr(fast, name, record)
    monkeypatch.setattr(tts_cuda.torch.cuda, "empty_cache",
                        lambda: events.append(("cleanup", threading.get_ident())))
    adapter = CudaVoiceCloneModel(fast)
    caller_thread = threading.get_ident()
    with ThreadPoolExecutor(max_workers=2) as callers:
        futures = [callers.submit(adapter.generate_voice_clone, text="전체 문장입니다.",
                                  language="korean", voice_clone_prompt=[object()])
                   for _ in range(3)]
        for future in futures:
            assert future.result(timeout=10)[1] == 24000
    assert calls["warm"] == 1  # generate -> warmup is a nested worker dispatch.
    assert len({thread for _, thread in events}) == 1
    assert events[0][1] != caller_thread
    assert sum(name == "cleanup" for name, _ in events) == 3
    assert all(events[index][0] == "cleanup" for index in (3, 6, 9))
