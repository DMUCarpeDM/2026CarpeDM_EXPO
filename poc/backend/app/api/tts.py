from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.schemas import TtsIn
from app.services.iris_tts import synthesize_iris
from app.services.tts import SpeechSynthesisError

router = APIRouter(prefix="/tts", tags=["speech"])


@router.post("")
def create_speech(body: TtsIn) -> Response:
    """여성 화자는 Iris WAV를 사용하고 남성 화자는 브라우저 음성으로 넘긴다."""
    if body.voice == "male":
        raise HTTPException(status_code=503, detail="서버 남성 음성이 준비되지 않았어요. 브라우저 음성으로 전환합니다.")
    try:
        audio = synthesize_iris(body.text)
    except SpeechSynthesisError as error:
        raise HTTPException(status_code=503, detail="AI 음성을 만들 수 없어요. 브라우저 음성으로 전환합니다.") from error
    return Response(content=audio, media_type="audio/wav")
