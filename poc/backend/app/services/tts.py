"""AI 상대 발화를 ElevenLabs 음성으로 변환한다."""

import httpx

from app.core.config import settings


class SpeechSynthesisError(RuntimeError):
    """외부 음성 생성 서비스를 사용할 수 없을 때 발생한다."""


def elevenlabs_ready() -> bool:
    """서버에서 ElevenLabs 음성 생성에 필요한 값이 모두 설정됐는지 확인한다."""
    return bool(settings.elevenlabs_api_key.get_secret_value() and settings.elevenlabs_voice_id)


def synthesize_elevenlabs(text: str) -> bytes:
    """한 문장의 AI 발화를 MP3 바이트로 변환한다."""
    if not elevenlabs_ready():
        raise SpeechSynthesisError("ElevenLabs 음성 설정이 필요합니다")

    try:
        response = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key.get_secret_value(),
                "Accept": "audio/mpeg",
            },
            json={"text": text.strip(), "model_id": settings.elevenlabs_model},
            timeout=settings.elevenlabs_timeout_sec,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise SpeechSynthesisError("ElevenLabs 음성을 만들지 못했습니다") from error

    if not response.content:
        raise SpeechSynthesisError("ElevenLabs가 빈 음성 데이터를 반환했습니다")
    return response.content
