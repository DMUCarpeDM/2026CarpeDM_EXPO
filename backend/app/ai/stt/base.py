"""STT 제공자 — 전시장 오프라인 대비 서버 음성 인식.

기본 흐름은 브라우저 Web Speech API가 클라이언트에서 텍스트를 만들어 보내지만,
Web Speech는 인터넷이 필요하다(Chrome은 서버 인식). 전시장 네트워크가 불안하면
서버 STT가 폴백으로 동작한다.

우선순위:
1. faster-whisper  — 정확도 높음. Python 3.12 이하에서 `pip install faster-whisper`
2. Vosk            — Python 3.14에서도 동작. `python scripts/setup_offline_stt.py`로
                     한국어 모델(~82MB)을 받아두면 자동 감지된다. 완전 오프라인.
"""
from functools import lru_cache
from typing import Protocol

import numpy as np

from app.core.config import settings

VOSK_SAMPLE_RATE = 16000


class SttProvider(Protocol):
    name: str

    def transcribe(self, audio_path: str) -> str: ...


class WhisperProvider:
    name = "whisper"

    def __init__(self, model_size: str = "base"):
        from faster_whisper import WhisperModel  # 선택 의존성

        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")

    def transcribe(self, audio_path: str) -> str:
        segments, _info = self._model.transcribe(audio_path, language="ko")
        return " ".join(seg.text.strip() for seg in segments)


class VoskProvider:
    name = "vosk"

    def __init__(self):
        import vosk

        vosk.SetLogLevel(-1)
        model_dir = settings.stt_model_dir
        if not (model_dir / "am").exists() and not (model_dir / "conf").exists():
            raise FileNotFoundError(f"Vosk 모델이 없습니다: {model_dir}")
        self._vosk = vosk
        self._model = vosk.Model(str(model_dir))

    def transcribe(self, audio_path: str) -> str:
        import json as _json

        import soundfile as sf

        samples, sr = sf.read(audio_path, dtype="float32", always_2d=False)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if sr != VOSK_SAMPLE_RATE:  # 선형 보간 리샘플 (STT 용도로 충분)
            duration = len(samples) / sr
            n_target = int(duration * VOSK_SAMPLE_RATE)
            samples = np.interp(
                np.linspace(0, len(samples) - 1, n_target),
                np.arange(len(samples)),
                samples,
            )
        pcm16 = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()

        rec = self._vosk.KaldiRecognizer(self._model, VOSK_SAMPLE_RATE)
        chunk = VOSK_SAMPLE_RATE * 2  # 1초 단위
        texts = []
        for i in range(0, len(pcm16), chunk):
            if rec.AcceptWaveform(pcm16[i:i + chunk]):
                texts.append(_json.loads(rec.Result()).get("text", ""))
        texts.append(_json.loads(rec.FinalResult()).get("text", ""))
        return " ".join(t for t in texts if t).strip()


@lru_cache(maxsize=1)
def get_stt_provider() -> SttProvider | None:
    """사용 가능한 첫 제공자를 캐시해 반환 (모델 로드는 1회)."""
    try:
        return WhisperProvider()
    except ImportError:
        pass
    try:
        return VoskProvider()
    except Exception:
        return None
