"""STT 제공자 인터페이스.

기본 흐름은 브라우저 Web Speech API가 클라이언트에서 텍스트를 만들어 보내므로
서버 STT는 선택 사항이다. 전시장 오프라인 대비로 faster-whisper를 설치하면
자동으로 감지해 오디오만 있고 텍스트가 없는 턴을 변환한다.

    pip install faster-whisper  (Python 3.12 이하 권장)
"""
from typing import Protocol


class SttProvider(Protocol):
    def transcribe(self, audio_path: str) -> str: ...


class WhisperProvider:
    def __init__(self, model_size: str = "base"):
        from faster_whisper import WhisperModel  # 선택 의존성

        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")

    def transcribe(self, audio_path: str) -> str:
        segments, _info = self._model.transcribe(audio_path, language="ko")
        return " ".join(seg.text.strip() for seg in segments)


def get_stt_provider() -> SttProvider | None:
    try:
        return WhisperProvider()
    except ImportError:
        return None
