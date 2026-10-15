from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.schemas import TtsIn
from app.services.tts import SpeechSynthesisError, stream_elevenlabs

router = APIRouter(prefix="/tts", tags=["speech"])


@router.post("")
async def create_speech(body: TtsIn) -> Response:
    """ElevenLabs 여성 음성을 스트리밍한다."""
    if body.voice == "male":
        raise HTTPException(status_code=503, detail="서버 남성 음성이 준비되지 않았어요. 브라우저 음성으로 전환합니다.")
    stream = stream_elevenlabs(body.text)
    try:
        first = await anext(stream)
    except (SpeechSynthesisError, StopAsyncIteration) as error:
        await stream.aclose()
        if getattr(error, "code", None) == "payment_required":
            raise HTTPException(status_code=402, detail="현재 API 키의 계정은 Free로 판정되어 Voice Library 목소리를 사용할 수 없어요. 구독한 계정에서 발급한 키인지 확인해 주세요.") from error
        raise HTTPException(status_code=503, detail="ElevenLabs 키·Voice ID·모델 접근 권한을 확인해 주세요.") from error
    async def chunks():
        try:
            yield first
            async for chunk in stream:
                yield chunk
        finally:
            await stream.aclose()
    return StreamingResponse(chunks(), media_type="audio/pcm", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-TTS-Provider": "elevenlabs"})
