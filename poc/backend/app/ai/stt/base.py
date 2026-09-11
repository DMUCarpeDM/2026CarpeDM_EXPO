"""녹음 종료 후 간투어 분석용 Whisper. 실시간 받아쓰기는 Chrome이 담당한다."""
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import numpy as np

from app.core.config import settings

# base.py = app/ai/stt/ → 세 단계 위가 backend 루트
BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _resolve_local_dir(value: str | Path) -> Path | None:
    """설정값이 로컬 모델 디렉터리를 가리키면 절대 경로로 해석한다.

    상대 경로는 CWD가 아니라 backend 루트 기준으로도 찾아, uvicorn을 어디서
    띄우든 동작한다. 저장소 폴더명이 바뀌어 .env의 절대 경로가 낡은 경우
    (전시 PC에서 실제 발생)에도 `models/` 이하 꼬리를 backend 루트에 재접합해
    구제한다. 디렉터리가 아니면 None — 호출부가 크기 이름("small")으로 취급.
    """
    p = Path(value)
    candidates = [p] if p.is_absolute() else [p, BACKEND_ROOT / p]
    if p.is_absolute() and not p.exists() and "models" in p.parts:
        tail = Path(*p.parts[p.parts.index("models"):])
        candidates.append(BACKEND_ROOT / tail)
    for c in candidates:
        if c.is_dir():
            return c.resolve()
    return None


class SttProvider(Protocol):
    name: str

    def transcribe_words(self, audio_path: str) -> list[dict]: ...

    # 선택 능력: 단어 타임스탬프 — 텍스트-음성 정렬 분석(voice_align)의 재료.
    # 지원 여부는 hasattr로 확인한다.
    #   transcribe_words(audio_path) -> [{"word", "start", "end", "conf"}]


class WhisperProvider:
    name = "whisper"

    def __init__(self, model_size: str | None = None):
        from faster_whisper import WhisperModel  # 선택 의존성

        configured = model_size or settings.stt_whisper_model
        local_dir = _resolve_local_dir(configured)
        if local_dir is not None and str(local_dir) != str(configured):
            print(f"[stt] Whisper 로컬 모델 경로 해석: {configured} → {local_dir}")
        self._model = WhisperModel(
            str(local_dir) if local_dir else str(configured),
            device="cpu", compute_type="int8",
        )

    def transcribe_words(self, audio_path: str) -> list[dict]:
        from faster_whisper.audio import decode_audio

        audio = decode_audio(audio_path, sampling_rate=16000)
        # 디지털 무음에서 프롬프트가 없는 말을 생성하는 것을 막는다.
        # 짧은 간투어를 자르지 않도록 발화 구간별 VAD는 적용하지 않는다.
        if not audio.size or np.max(np.abs(audio)) < 1e-5:
            return []
        segments, _info = self._model.transcribe(
            audio, language="ko", word_timestamps=True,
            beam_size=5, condition_on_previous_text=False,
            initial_prompt=settings.stt_filler_prompt,
        )
        return [
            {"word": w.word.strip(), "start": w.start, "end": w.end,
             "conf": getattr(w, "probability", 1.0)}
            for seg in segments for w in (seg.words or [])
            if w.word.strip()
        ]


@lru_cache(maxsize=1)
def get_stt_provider() -> SttProvider | None:
    """Whisper를 한 번 로드한다. 실패하면 간투어는 미측정으로 남긴다."""
    try:
        return WhisperProvider()
    except Exception as exc:
        print(f"[stt] 간투어 분석 불가: {type(exc).__name__}: {exc}")
        return None
