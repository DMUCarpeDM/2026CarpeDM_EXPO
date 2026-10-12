"""GTX 1060용 FP32 CUDA Graph 추론과 CPU의 대형 텍스트 임베딩.

음색 프로필·ICL·codec 참조를 보존한다. 고정 KV 캐시가 부족한 문장은
같은 모델의 일반 생성으로 처리하여 두 모델을 GPU에 올리지 않는다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
from pathlib import Path

import torch
from torch import nn

LOGGER = logging.getLogger(__name__)
DEFAULT_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MAX_SEQUENCE_LENGTH = 512
GENERATION_RESERVE = 256
CODEC_FRAMES_PER_SECOND = 24000 / 1920
_CUDA_WORKER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="iris-cuda")
_CUDA_THREAD = threading.local()


def _on_cuda_worker(function):
    """CUDA 핸들과 작업 공간을 한 스레드에서 재사용하며 중첩 호출도 허용한다."""
    @wraps(function)
    def dispatch(*args, **kwargs):
        if getattr(_CUDA_THREAD, "active", False):
            return function(*args, **kwargs)

        def run():
            _CUDA_THREAD.active = True
            try:
                return function(*args, **kwargs)
            finally:
                _CUDA_THREAD.active = False

        return _CUDA_WORKER.submit(run).result()
    return dispatch


class CpuTextEmbedding(nn.Module):
    """CPU에서 원본 가중치를 조회하고 필요한 행만 추론 장치로 복사한다."""

    def __init__(self, embedding: nn.Module, output_device="cuda:0"):
        super().__init__()
        self.embedding = embedding.to("cpu")
        self.output_device = torch.device(output_device)

    @property
    def weight(self):
        return self.embedding.weight

    def forward(self, input_ids):
        return self.embedding(input_ids.to("cpu")).to(self.output_device)


class CudaVoiceCloneModel:
    backend_name = "cuda_graph_fp32"

    def __init__(self, model):
        self.model = model
        self._lock = threading.RLock()
        self._warmed_up = False

    @classmethod
    @_on_cuda_worker
    def from_pretrained(cls, model_name):
        from faster_qwen3_tts import FasterQwen3TTS
        from huggingface_hub import snapshot_download
        from huggingface_hub.errors import LocalEntryNotFoundError

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA Graph Iris requires an available CUDA device")
        if model_name != DEFAULT_MODEL and not Path(model_name).is_dir():
            raise ValueError("GTX 1060 설정은 Qwen3-TTS 0.6B Base용입니다.")
        torch.set_num_threads(1)
        source = model_name
        if not Path(model_name).is_dir():
            try:
                source = snapshot_download(model_name, local_files_only=True)
            except LocalEntryNotFoundError:
                # 설치 단계에서 아직 모델이 없는 경우 기존 HF 다운로드 경로를 허용한다.
                source = model_name
        fast = FasterQwen3TTS.from_pretrained(
            source, device="cuda:0", dtype=torch.float32,
            attn_implementation="sdpa", max_seq_len=MAX_SEQUENCE_LENGTH,
        )
        talker = fast.model.model.talker
        talker.model.text_embedding = CpuTextEmbedding(talker.get_text_embeddings())
        fast.model.model.speaker_encoder.to("cpu")
        fast.speech_tokenizer.model.encoder.to("cpu")
        # 설치/로딩 중 생긴 미사용 할당도 반환한다.
        torch.cuda.empty_cache()
        return cls(fast)

    @_on_cuda_worker
    def warmup(self):
        with self._lock:
            if not self._warmed_up:
                self.model.warmup()
                self._warmed_up = True

    @_on_cuda_worker
    def create_voice_clone_prompt(self, **kwargs):
        """새 기준 녹음 분석 동안만 원본 encoder를 GPU로 돌려 놓는다."""
        with self._lock:
            speaker = self.model.model.model.speaker_encoder
            encoder = self.model.speech_tokenizer.model.encoder
            try:
                speaker.to("cuda:0")
                encoder.to("cuda:0")
                return self.model.model.create_voice_clone_prompt(**kwargs)
            finally:
                speaker.to("cpu")
                encoder.to("cpu")

    @_on_cuda_worker
    def generate_voice_clone(self, *, text, language, voice_clone_prompt=None,
                             non_streaming_mode=True, **kwargs):
        try:
            return self._generate_voice_clone(
                text=text, language=language, voice_clone_prompt=voice_clone_prompt,
                non_streaming_mode=non_streaming_mode, **kwargs,
            )
        finally:
            # 완성된 WAV는 CPU에 있다. 그래프/가중치는 유지하고 미사용 할당만
            # 반환하여 전시 Chrome과 GPU 메모리를 공유한다.
            torch.cuda.empty_cache()

    def _generate_voice_clone(self, *, text, language, voice_clone_prompt=None,
                              non_streaming_mode=True, **kwargs):
        with self._lock, torch.inference_mode():
            request = dict(text=text, language=language,
                           voice_clone_prompt=voice_clone_prompt,
                           non_streaming_mode=non_streaming_mode,
                           max_new_tokens=8192)
            request.update(kwargs)
            # 원본 라이브러리 옵션을 빠른 경로에서 무시하지 않는다.
            supported = {"max_new_tokens", "min_new_tokens", "temperature", "top_k",
                         "top_p", "do_sample", "repetition_penalty", "x_vector_only_mode"}
            if (not non_streaming_mode or voice_clone_prompt is None
                    or set(kwargs) - supported
                    or not isinstance(text, str)):
                return self._generate_base(request)
            if isinstance(voice_clone_prompt, list) and len(voice_clone_prompt) != 1:
                return self._generate_base(request)
            self.warmup()
            fast_request = dict(request)
            xvec_only = bool(fast_request.pop("x_vector_only_mode", False))
            fast_request["xvec_only"] = xvec_only
            prepared = self.model._prepare_generation(
                text=text, language=language, voice_clone_prompt=voice_clone_prompt,
                non_streaming_mode=True, xvec_only=xvec_only,
            )
            prefill = int(prepared[3].shape[1])
            del prepared
            capacity = int(self.model.talker_graph.max_seq_len)
            if prefill + GENERATION_RESERVE > capacity:
                LOGGER.info("Iris full-context fallback: prefill=%s capacity=%s", prefill, capacity)
                return self._generate_base(request)
            wavs, rate = self.model.generate_voice_clone(**fast_request)
            # Faster 0.3.2는 고정 캐시 한계에서 조용히 멈춘다. 오디오의 codec
            # 프레임 수로 한계 도달을 보수적으로 감지하고 원본 모델로 재생성한다.
            frame_limit = capacity - prefill - 1
            reached_limit = any(
                len(wav) * CODEC_FRAMES_PER_SECOND / rate >= frame_limit - 0.01
                for wav in wavs
            )
            if reached_limit:
                LOGGER.warning("Iris reached fixed KV capacity; regenerating full text")
                return self._generate_base(request)
            return wavs, rate

    def _generate_base(self, request):
        # 이미 준비된 프로필이면 encoder는 계속 CPU에 있고 ICL은 전부 유지된다.
        if request.get("voice_clone_prompt") is not None:
            return self.model.model.generate_voice_clone(**request)
        speaker = self.model.model.model.speaker_encoder
        encoder = self.model.speech_tokenizer.model.encoder
        try:
            speaker.to("cuda:0")
            encoder.to("cuda:0")
            return self.model.model.generate_voice_clone(**request)
        finally:
            speaker.to("cpu")
            encoder.to("cpu")
