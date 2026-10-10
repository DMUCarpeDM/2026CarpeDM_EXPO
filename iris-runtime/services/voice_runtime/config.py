from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _bounded_int_env(name: str, default: int, *, minimum: int, maximum: int) -> int:
    """환경값이 깨져도 음성 스트림이 안전한 범위를 벗어나지 않게 한다."""
    try:
        value = int(os.environ.get(name, str(default)).strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class VoiceRuntimeConfig:
    api_host: str = "127.0.0.1"
    # ponytail: 8765는 다른 로컬 서비스와 충돌한 적 있음 → voice 전용 포트
    api_port: int = 18765

    iris_home_dir: Path = Path.home() / ".iris-light"
    voice_dir: Path = iris_home_dir / "voice"
    models_dir: Path = iris_home_dir / "models"
    stt_models_dir: Path = models_dir / "stt"
    tts_models_dir: Path = models_dir / "tts"

    voice_manifest_jsonl: Path = voice_dir / "manifest.jsonl"
    voice_manifest_csv: Path = voice_dir / "manifest.csv"
    voice_selection_path: Path = voice_dir / "selection.json"

    # 앱/테스트에서 실제 모델 다운로드를 피하기 위한 기본값.
    mock_mode: bool = os.environ.get("VOICE_RUNTIME_MOCK", "1").strip() in ("1", "true", "True")

    # Faster Qwen의 codec step 수. 2는 더 낮은 첫 음성 지연, 8은 처리량 우선.
    tts_stream_chunk_size: int = _bounded_int_env(
        "IRIS_TTS_STREAM_CHUNK_SIZE", 4, minimum=2, maximum=8
    )


CONFIG = VoiceRuntimeConfig()

