"""Apple Silicon에서 원본 정밀도와 Iris ICL 프로필을 사용하는 Metal 추론."""

import os
from pathlib import Path

import numpy as np

METAL_MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "metal"
METAL_MODEL_REPO = "Serveurperso/Qwen3-TTS-GGUF"
METAL_MODEL_REVISION = "b7ee2e8c7459c3bea99da23e3d178125a7d1713c"
METAL_MODEL_FILES = ("qwen-talker-0.6b-base-BF16.gguf", "qwen-tokenizer-12hz-F32.gguf")


class MetalVoiceCloneModel:
    backend_name = "metal"

    def __init__(self, runtime):
        self.runtime = runtime

    @classmethod
    def from_pretrained(cls, model_name):
        from qwentts_cpp import QwenTTS
        from huggingface_hub import hf_hub_download

        if model_name != "Qwen/Qwen3-TTS-12Hz-0.6B-Base":
            raise ValueError("설치된 Metal 모델은 Qwen3-TTS 0.6B Base입니다.")
        # 다운로드는 설치 단계에서만 한다. 서비스 요청은 준비된 모델만 읽는다.
        paths = [hf_hub_download(
            METAL_MODEL_REPO, filename=name, revision=METAL_MODEL_REVISION,
            cache_dir=METAL_MODEL_DIR, local_files_only=True,
        ) for name in METAL_MODEL_FILES]
        os.environ.setdefault("GGML_BACKEND", "MTL0")
        return cls(QwenTTS(*paths, log_level="warning"))

    def generate_voice_clone(self, *, text, language, voice_clone_prompt,
                             non_streaming_mode=True, **kwargs):
        if len(voice_clone_prompt) != 1:
            raise ValueError("Metal Iris 합성은 단일 화자만 지원합니다.")
        prompt = voice_clone_prompt[0]
        reference = {
            "ref_spk_emb": np.ascontiguousarray(
                prompt.ref_spk_embedding.detach().cpu().numpy(), dtype=np.float32,
            ),
        }
        if prompt.icl_mode:
            reference.update(
                ref_codes=np.ascontiguousarray(prompt.ref_code.detach().cpu().numpy().T, dtype=np.int32),
                ref_text=prompt.ref_text,
            )
        # 기존 Qwen generation_config와 같은 샘플링·최대 길이. 양자화·속도 변경 없음.
        audio, sample_rate = self.runtime.synthesize(
            text=text, lang=language, **reference,
            max_new_tokens=8192, do_sample=True, temperature=0.9, top_k=50, top_p=1.0,
            repetition_penalty=1.05, subtalker_do_sample=True,
            subtalker_temperature=0.9, subtalker_top_k=50, subtalker_top_p=1.0,
        )
        return [audio], sample_rate
