from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from app.core.config import settings

from app.schemas import TtsIn
from app.services.iris_tts import synthesize_iris, stream_iris
from app.services.tts import SpeechSynthesisError, stream_elevenlabs

router = APIRouter(prefix="/tts", tags=["speech"])


@router.post("")
async def create_speech(body: TtsIn) -> Response:
    """선택된 서버 음성을 스트리밍하고, 남성 화자는 브라우저 음성을 사용한다."""
    if body.voice == "male":
        raise HTTPException(status_code=503, detail="서버 남성 음성이 준비되지 않았어요. 브라우저 음성으로 전환합니다.")
    if settings.tts_provider == "elevenlabs" or body.stream:
        stream = stream_elevenlabs(body.text) if settings.tts_provider == "elevenlabs" else stream_iris(body.text)
        try:
            first = await anext(stream)
        except (SpeechSynthesisError, StopAsyncIteration) as error:
            await stream.aclose()
            raise HTTPException(status_code=503, detail="음성 합성 서버 연결을 확인해 주세요.") from error
        async def chunks():
            try:
                yield first
                async for chunk in stream:
                    yield chunk
            finally:
                await stream.aclose()
        return StreamingResponse(chunks(), media_type="audio/pcm", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
    try:
        audio = await run_in_threadpool(synthesize_iris, body.text)
    except SpeechSynthesisError as error:
        raise HTTPException(status_code=503, detail="AI 음성을 만들 수 없어요. 브라우저 음성으로 전환합니다.") from error
    return Response(content=audio, media_type="audio/wav")
