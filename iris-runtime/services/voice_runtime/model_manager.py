from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class PreparedVoiceClone:
    voice_prompt_hash: str
    voice_clone_prompt: Any  # qwen-tts 모델 내부 프롬프트 타입(모델이 없으면 Any)


class VoiceModelManager:
    """
    STT/TTS 모델 로딩과 캐시를 담당.

    - lazy load: 최초 요청 시에만 로드
    - voice clone prompt 캐시: ref_audio/ref_text 변경 시 hash가 바뀔 때만 재생성
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._tts_load_lock = threading.RLock()
        self._stt_models: dict[str, Any] = {}
        self._tts_models: dict[str, Any] = {}
        self._prepared_voices: dict[str, PreparedVoiceClone] = {}

    def get_stt(self, key: str) -> Any | None:
        with self._lock:
            return self._stt_models.get(key)

    def set_stt(self, key: str, model: Any) -> None:
        with self._lock:
            self._stt_models[key] = model

    def get_tts(self, key: str) -> Any | None:
        with self._lock:
            return self._tts_models.get(key)

    def set_tts(self, key: str, model: Any) -> None:
        with self._lock:
            self._tts_models[key] = model

    def get_or_load_tts(self, key: str, loader: Callable[[], Any]) -> Any:
        """동일 모델의 동시 로드를 막고 프로세스 수명 동안 한 번만 캐시한다."""
        with self._tts_load_lock:
            cached = self.get_tts(key)
            if cached is not None:
                return cached
            model = loader()
            self.set_tts(key, model)
            return model

    def get_prepared_voice(self, voice_prompt_hash: str) -> PreparedVoiceClone | None:
        with self._lock:
            return self._prepared_voices.get(voice_prompt_hash)

    def set_prepared_voice(self, prepared: PreparedVoiceClone) -> None:
        with self._lock:
            self._prepared_voices[prepared.voice_prompt_hash] = prepared

