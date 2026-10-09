"""명시적으로 선택한 Iris 런타임에서 합성된 WAV를 읽는다."""

import time
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.tts import SpeechSynthesisError

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
    """실모드 아이리스 런타임만 준비된 것으로 본다. mock은 무음 wav라 제외한다."""
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
        ready = body.get("status") == "ok" and not body.get("mock_mode")
    except (httpx.HTTPError, AttributeError, TypeError, ValueError):
        ready = False
    _CACHE["at"] = now
    _CACHE["ready"] = ready
    return ready


def synthesize_iris(text: str) -> bytes:
    """빈 voice_prompt_hash로 아이리스 프로필(톤 자동) 합성을 요청하고 wav를 읽는다."""
    spoken = text.strip()
    if not spoken:
        raise SpeechSynthesisError("읽을 문장이 없습니다")
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
    return data
