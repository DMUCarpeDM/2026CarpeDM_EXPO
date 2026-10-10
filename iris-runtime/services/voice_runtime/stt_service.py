from __future__ import annotations

import base64
import io
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .config import CONFIG
from .model_manager import VoiceModelManager


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str
    language_probability: float


def _detect_compute_type() -> str:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            return "float16"
    except Exception:
        pass
    return "int8"


def _wav_bytes_to_float32(wav_bytes: bytes) -> np.ndarray:
    """WAV 또는 raw int16 16k mono → float32 1D @ 16 kHz."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            channels = max(1, wf.getnchannels())
            width = wf.getsampwidth()
            rate = max(1, wf.getframerate())
            frames = wf.readframes(wf.getnframes())
    except Exception:
        pcm = np.frombuffer(wav_bytes, dtype=np.int16)
        return pcm.astype(np.float32) / 32768.0

    if width == 2:
        pcm = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif width == 4:
        pcm = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        pcm = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        pcm = (pcm - 128.0) / 128.0
    if channels > 1:
        n = (pcm.size // channels) * channels
        pcm = pcm[:n].reshape(-1, channels).mean(axis=1)
    if rate != 16000 and pcm.size:
        n_out = max(1, int(round(pcm.size * 16000 / rate)))
        x_old = np.linspace(0.0, 1.0, num=pcm.size, endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
        pcm = np.interp(x_new, x_old, pcm).astype(np.float32)
    return np.asarray(pcm, dtype=np.float32)


class STTService:
    def __init__(self, model_manager: VoiceModelManager) -> None:
        self._mm = model_manager

    def _get_model_key(self, model_name: str, compute_type: str) -> str:
        return f"{model_name}:{compute_type}"

    def _load_model(self, model_name: str, compute_type: str) -> Any:
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "faster-whisper가 설치되지 않았습니다. "
                "scripts/setup_voice_runtime 으로 .venv-voice를 구성하세요."
            ) from exc

        device = "cuda" if compute_type == "float16" else "cpu"
        try:
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(CONFIG.stt_models_dir),
            )
        except Exception as exc:  # noqa: BLE001
            if compute_type == "float16":
                return self._load_model(model_name, "int8")
            raise RuntimeError(f"STT 모델 로딩 실패 ({model_name}/{compute_type}): {exc}") from exc
        return model

    def _ensure_model(self, model_name: str, compute_type: str) -> Any:
        key = self._get_model_key(model_name, compute_type)
        existing = self._mm.get_stt(key)
        if existing is not None:
            return existing
        model = self._load_model(model_name, compute_type)
        self._mm.set_stt(key, model)
        self._mm.set_stt(self._get_model_key(model_name, "int8"), model)
        return model

    def is_loaded(self, model_name: str, compute_type: str | None = None) -> bool:
        compute_type = compute_type or _detect_compute_type()
        return self._mm.get_stt(self._get_model_key(model_name, compute_type)) is not None

    def warmup(self, model_name: str = "small") -> dict[str, Any]:
        if CONFIG.mock_mode:
            return {"accepted": True, "loaded": True, "already": True, "mock": True}
        compute_type = _detect_compute_type()
        already = self.is_loaded(model_name, compute_type)
        model = self._ensure_model(model_name, compute_type)
        if not already:
            dummy = np.zeros(8000, dtype=np.float32)
            list(model.transcribe(dummy, language="ko", vad_filter=False, beam_size=1))
        return {"accepted": True, "loaded": True, "already": already, "mock": False}

    def transcribe_audio(
        self,
        audio: np.ndarray,
        *,
        model_name: str = "small",
        language: str = "ko",
        vad_filter: bool = True,
        beam_size: int = 5,
        condition_on_previous_text: bool = False,
        compute_type: str | None = None,
    ) -> TranscriptionResult:
        if CONFIG.mock_mode:
            return TranscriptionResult(
                text="[mock stt] (음성 인식 결과)",
                language="ko",
                language_probability=0.99,
            )
        compute_type = compute_type or _detect_compute_type()
        model = self._ensure_model(model_name, compute_type)
        lang_arg: str | None = None if (language or "").strip().lower() in ("", "auto") else language
        segments, info = model.transcribe(
            np.asarray(audio, dtype=np.float32),
            language=lang_arg,
            vad_filter=vad_filter,
            beam_size=beam_size,
            condition_on_previous_text=condition_on_previous_text,
        )
        text = " ".join(s.text for s in segments).strip()
        language_out = getattr(info, "language", None) or (lang_arg or "ko")
        prob = float(getattr(info, "language_probability", 0.0) or 0.0)
        return TranscriptionResult(
            text=text or "",
            language=str(language_out),
            language_probability=prob,
        )

    def transcribe_wav_bytes(
        self,
        wav_bytes: bytes,
        *,
        model_name: str = "small",
        language: str = "ko",
        vad_filter: bool = True,
        beam_size: int = 5,
        condition_on_previous_text: bool = False,
        compute_type: str | None = None,
    ) -> TranscriptionResult:
        audio = _wav_bytes_to_float32(wav_bytes)
        return self.transcribe_audio(
            audio,
            model_name=model_name,
            language=language,
            vad_filter=vad_filter,
            beam_size=beam_size,
            condition_on_previous_text=condition_on_previous_text,
            compute_type=compute_type,
        )

    def transcribe_b64(
        self,
        audio_b64: str,
        *,
        filename_hint: str = "audio.wav",
        model_name: str = "small",
        language: str = "ko",
        vad_filter: bool = True,
        beam_size: int = 5,
        condition_on_previous_text: bool = False,
        compute_type: str | None = None,
    ) -> TranscriptionResult:
        del filename_hint
        wav_bytes = base64.b64decode(audio_b64)
        return self.transcribe_wav_bytes(
            wav_bytes,
            model_name=model_name,
            language=language,
            vad_filter=vad_filter,
            beam_size=beam_size,
            condition_on_previous_text=condition_on_previous_text,
            compute_type=compute_type,
        )

    def transcribe_file(
        self,
        path: Path,
        *,
        model_name: str = "small",
        language: str = "ko",
    ) -> TranscriptionResult:
        return self.transcribe_wav_bytes(
            path.read_bytes(),
            model_name=model_name,
            language=language,
        )
