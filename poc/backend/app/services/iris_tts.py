"""명시적으로 선택한 Iris 런타임에서 합성된 WAV를 읽는다."""

import hashlib
import io
import wave
import time
from functools import lru_cache
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.tts import SpeechSynthesisError

PREPARED_SPEECH_DIR = Path(__file__).resolve().parents[4] / "iris-runtime/iris/assets/prepared-speech"


def prepared_speech_path(text: str) -> Path:
    return PREPARED_SPEECH_DIR / (hashlib.sha256(text.strip().encode()).hexdigest() + ".wav")


_CACHE = {"at": 0.0, "ready": False}
_CACHE_SEC = 15.0


def _audio_root() -> Path:
    return settings.iris_audio_dir.expanduser().resolve()


def _is_iris_wav(path: Path) -> bool:
    try:
        resolved = path.resolve()
    except OSError:
        return False
    return resolved.suffix.lower() == ".wav" and resolved.is_relative_to(_audio_root())


def iris_female_ready() -> bool:
    """사전 합성 WAV 또는 실제 Iris 런타임을 사용한다. mock 런타임은 제외한다."""
    if PREPARED_SPEECH_DIR.is_dir() and any(PREPARED_SPEECH_DIR.glob("*.wav")):
        return True
    now = time.monotonic()
    if now - _CACHE["at"] < _CACHE_SEC:
        return bool(_CACHE["ready"])
    ready = False
    try:
        response = httpx.get(
            f"{settings.iris_voice_base_url.rstrip('/')}/health",
            timeout=1.0,
        )
        response.raise_for_status()
        body = response.json()
        ready = body.get("status") == "ok" and body.get("mock_mode") is False
        if ready:
            profile_response = httpx.get(
                f"{settings.iris_voice_base_url.rstrip('/')}/v1/voice/profile",
                timeout=1.0,
            )
            profile_response.raise_for_status()
            ready = profile_response.json().get("available") is True
    except (httpx.HTTPError, AttributeError, TypeError, ValueError):
        ready = False
    _CACHE["at"] = now
    _CACHE["ready"] = ready
    return ready


def with_playback_tail(data: bytes) -> bytes:
    """합성된 발화를 자르지 않고 재생 종료 전 600ms의 여유를 둔다."""
    try:
        with wave.open(io.BytesIO(data), "rb") as source:
            params = source.getparams()
            frames = source.readframes(source.getnframes())
        output = io.BytesIO()
        with wave.open(output, "wb") as target:
            target.setparams(params)
            target.writeframes(frames)
            silent_sample = b"\x80" if params.sampwidth == 1 else b"\x00" * params.sampwidth
            target.writeframes(silent_sample * params.nchannels * round(params.framerate * .6))
        return output.getvalue()
    except (wave.Error, EOFError) as error:
        raise SpeechSynthesisError("아이리스 음성 파일 형식이 올바르지 않습니다") from error


def synthesize_iris(text: str) -> bytes:
    return _synthesize_cached(text.strip())


async def stream_iris(text: str):
    """Yield each sentence as 24-kHz PCM before waiting for the next sentence."""
    import math
    import re
    import numpy as np
    from scipy.signal import resample_poly
    from fastapi.concurrency import run_in_threadpool
    sentences = re.findall(r'.+?(?:[.!?。！？]+(?=\s|$)|$)', text.strip())
    for sentence in sentences:
        data = await run_in_threadpool(synthesize_iris, sentence.strip())
        with wave.open(io.BytesIO(data), 'rb') as audio:
            rate, channels, width = audio.getframerate(), audio.getnchannels(), audio.getsampwidth()
            if width != 2:
                raise SpeechSynthesisError('Iris PCM 형식이 올바르지 않습니다')
            samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float64)
        samples = samples.reshape(-1, channels).mean(axis=1)
        if rate != 24000:
            divisor = math.gcd(rate, 24000)
            samples = resample_poly(samples, 24000 // divisor, rate // divisor)
        yield np.clip(np.rint(samples), -32768, 32767).astype('<i2').tobytes()


@lru_cache(maxsize=128)
def _synthesize_cached(text: str) -> bytes:
    """빈 voice_prompt_hash로 아이리스 프로필(톤 자동) 합성을 요청하고 wav를 읽는다."""
    spoken = text.strip()
    if not spoken:
        raise SpeechSynthesisError("읽을 문장이 없습니다")
    prepared = prepared_speech_path(spoken)
    if prepared.is_file():
        return with_playback_tail(prepared.read_bytes())
    try:
        response = httpx.post(
            f"{settings.iris_voice_base_url.rstrip('/')}/v1/audio/speech",
            json={"text": spoken, "voice_prompt_hash": ""},
            timeout=settings.iris_voice_timeout_sec,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise SpeechSynthesisError("아이리스 음성을 만들지 못했습니다") from error

    if not isinstance(payload, dict):
        raise SpeechSynthesisError("아이리스 응답 형식이 올바르지 않습니다")
    audio_path = Path(str(payload.get("audio_path") or ""))
    if not _is_iris_wav(audio_path) or not audio_path.is_file():
        raise SpeechSynthesisError("아이리스 음성 파일을 찾지 못했습니다")
    try:
        data = audio_path.read_bytes()
    except OSError as error:
        raise SpeechSynthesisError("아이리스 음성 파일을 읽을 수 없습니다") from error
    if not data:
        raise SpeechSynthesisError("아이리스 음성이 비어 있습니다")
    return with_playback_tail(data)
