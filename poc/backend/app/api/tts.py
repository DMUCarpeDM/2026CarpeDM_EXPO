from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.schemas import TtsIn
from app.core.config import settings
from app.services.iris_tts import synthesize_iris
from app.services.tts import SpeechSynthesisError, synthesize_elevenlabs

router = APIRouter(prefix="/tts", tags=["speech"])


@router.post("")
def create_speech(body: TtsIn) -> Response:
    """AI 상대의 화면 발화를 MP3로 돌려준다. API 키는 서버에만 남는다."""
    try:
        audio = synthesize_iris(body.text) if settings.tts_provider == "iris" else synthesize_elevenlabs(body.text)
    except SpeechSynthesisError as error:
        raise HTTPException(status_code=503, detail="AI 음성을 만들 수 없어요. 브라우저 음성으로 전환합니다.") from error
    return Response(content=audio, media_type="audio/wav" if settings.tts_provider == "iris" else "audio/mpeg")
