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

    # 선택 능력: 단어 타임스탬프 — 텍스트-음성 정렬 분석(voice_align)의 재료.
    # 지원 여부는 hasattr로 확인한다.
    #   transcribe_words(audio_path) -> [{"word", "start", "end", "conf"}]


class WhisperProvider:
    name = "whisper"

    def __init__(self, model_size: str | None = None):
        from faster_whisper import WhisperModel  # 선택 의존성

        self._model = WhisperModel(
            model_size or settings.stt_whisper_model, device="cpu", compute_type="int8",
        )

    def transcribe(self, audio_path: str) -> str:
        segments, _info = self._model.transcribe(audio_path, language="ko")
        return " ".join(seg.text.strip() for seg in segments)

    def transcribe_words(self, audio_path: str) -> list[dict]:
        segments, _info = self._model.transcribe(
            audio_path, language="ko", word_timestamps=True,
        )
        return [
            {"word": w.word.strip(), "start": w.start, "end": w.end,
             "conf": getattr(w, "probability", 1.0)}
            for seg in segments for w in (seg.words or [])
            if w.word.strip()
        ]


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

    @staticmethod
    def _load_pcm16(audio_path: str) -> bytes:
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
        return (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()

    def _run(self, audio_path: str, with_words: bool) -> tuple[str, list[dict]]:
        import json as _json

        pcm16 = self._load_pcm16(audio_path)
        rec = self._vosk.KaldiRecognizer(self._model, VOSK_SAMPLE_RATE)
        if with_words:
            rec.SetWords(True)
        chunk = VOSK_SAMPLE_RATE * 2  # 1초 단위
        texts: list[str] = []
        words: list[dict] = []

        def _collect(payload: dict) -> None:
            if payload.get("text"):
                texts.append(payload["text"])
            for w in payload.get("result", []):
                words.append({
                    "word": w.get("word", ""), "start": w.get("start", 0.0),
                    "end": w.get("end", 0.0), "conf": w.get("conf", 1.0),
                })

        for i in range(0, len(pcm16), chunk):
            if rec.AcceptWaveform(pcm16[i:i + chunk]):
                _collect(_json.loads(rec.Result()))
        _collect(_json.loads(rec.FinalResult()))
        return " ".join(texts).strip(), words

    def transcribe(self, audio_path: str) -> str:
        text, _ = self._run(audio_path, with_words=False)
        return text

    def transcribe_words(self, audio_path: str) -> list[dict]:
        """단어 타임스탬프 — 텍스트-음성 정렬 분석(voice_align)의 재료."""
        _, words = self._run(audio_path, with_words=True)
        return words


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
