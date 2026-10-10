from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import CONFIG
from .model_manager import VoiceModelManager
from .stt_service import STTService
from .tts_service import TTSService, clear_generated_audio_cache
from .tts_stream import (
    DEFAULT_TTS_MODEL,
    StreamSynthRequest,
    fast_backend_diagnostics,
    iter_pcm_events,
    schedule_faster_qwen_warmup,
    warmup_faster_qwen,
)
from .voice_dataset import analyze_folder, load_manifest, recommend_reference_samples


app = FastAPI(title="Iris Light Voice Runtime")
LOGGER = logging.getLogger(__name__)
model_manager = VoiceModelManager()
stt_service = STTService(model_manager)
tts_service = TTSService(model_manager)

_shutdown_lock = threading.RLock()
_speech_lock = threading.Lock()
_should_exit = False


class HealthResponse(BaseModel):
    status: str
    pid: int
    mock_mode: bool
    faster_qwen: bool = False
    fast_model_loaded: bool = False
    fast_model_warmed: bool = False
    fast_model_warming: bool = False
    stream_backend: str = "qwen_tts_fallback"


@app.get("/health", response_model=HealthResponse)
def health() -> Any:
    return HealthResponse(
        status="ok",
        pid=os.getpid(),
        mock_mode=CONFIG.mock_mode,
        **fast_backend_diagnostics(tts_service),
    )


class TTSWarmupRequest(BaseModel):
    tts_model_name: str = DEFAULT_TTS_MODEL
    # False면 runtime daemon thread가 로드/CUDA graph capture를 수행한다.
    wait: bool = False


class TTSWarmupResponse(BaseModel):
    accepted: bool
    scheduled: bool = False
    faster_qwen: bool = False
    fast_model_loaded: bool = False
    fast_model_warmed: bool = False
    fast_model_warming: bool = False
    stream_backend: str = "qwen_tts_fallback"


@app.post("/v1/audio/warmup", response_model=TTSWarmupResponse)
def tts_warmup(req: TTSWarmupRequest) -> Any:
    status = fast_backend_diagnostics(tts_service, req.tts_model_name)
    if CONFIG.mock_mode or not status["faster_qwen"]:
        LOGGER.warning("SLOW FALLBACK ACTIVE: Faster Qwen warmup skipped (mock mode or package unavailable)")
        return TTSWarmupResponse(accepted=False, **status)
    if req.wait:
        try:
            status = warmup_faster_qwen(tts_service, req.tts_model_name)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return TTSWarmupResponse(accepted=True, **status)
    scheduled = schedule_faster_qwen_warmup(tts_service, req.tts_model_name)
    return TTSWarmupResponse(
        accepted=True,
        scheduled=scheduled,
        **fast_backend_diagnostics(tts_service, req.tts_model_name),
    )


class TranscribeRequest(BaseModel):
    audio_b64: str = Field(..., description="wav pcm16 bytes encoded as base64")
    filename_hint: str = "audio.wav"
    model_name: str = "small"
    language: str = "ko"
    vad_filter: bool = True
    beam_size: int = 5
    condition_on_previous_text: bool = False
    compute_type: str | None = None


class TranscribeResponse(BaseModel):
    text: str
    language: str
    language_probability: float


@app.post("/v1/audio/transcriptions", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest) -> Any:
    try:
        res = stt_service.transcribe_b64(
            req.audio_b64,
            filename_hint=req.filename_hint,
            model_name=req.model_name,
            language=req.language,
            vad_filter=req.vad_filter,
            beam_size=req.beam_size,
            condition_on_previous_text=req.condition_on_previous_text,
            compute_type=req.compute_type,
        )
        return TranscribeResponse(
            text=res.text,
            language=res.language,
            language_probability=res.language_probability,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/v1/audio/transcriptions/raw", response_model=TranscribeResponse)
async def transcribe_raw(
    request: Request,
    model_name: str = "small",
    language: str = "ko",
    vad_filter: bool = True,
    beam_size: int = 5,
    condition_on_previous_text: bool = False,
) -> Any:
    try:
        wav_bytes = await request.body()
        res = stt_service.transcribe_wav_bytes(
            wav_bytes,
            model_name=model_name,
            language=language,
            vad_filter=vad_filter,
            beam_size=beam_size,
            condition_on_previous_text=condition_on_previous_text,
        )
        return TranscribeResponse(
            text=res.text,
            language=res.language,
            language_probability=res.language_probability,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


class STTWarmupRequest(BaseModel):
    model_name: str = "small"
    wait: bool = False


class STTWarmupResponse(BaseModel):
    accepted: bool
    scheduled: bool = False
    loaded: bool = False
    already: bool = False
    mock: bool = False


_STT_WARMUPS: set[str] = set()
_STT_WARMUP_LOCK = threading.Lock()


def schedule_stt_warmup(model_name: str) -> bool:
    with _STT_WARMUP_LOCK:
        if model_name in _STT_WARMUPS or stt_service.is_loaded(model_name):
            return False
        _STT_WARMUPS.add(model_name)

    def _run() -> None:
        try:
            stt_service.warmup(model_name)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("STT warmup failed (%s): %s", model_name, exc)
        finally:
            with _STT_WARMUP_LOCK:
                _STT_WARMUPS.discard(model_name)

    threading.Thread(target=_run, name="iris-stt-warmup", daemon=True).start()
    return True


@app.post("/v1/audio/stt/warmup", response_model=STTWarmupResponse)
def stt_warmup(req: STTWarmupRequest) -> Any:
    if CONFIG.mock_mode:
        return STTWarmupResponse(accepted=True, loaded=True, already=True, mock=True)
    if req.wait:
        try:
            status = stt_service.warmup(req.model_name)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return STTWarmupResponse(**status, scheduled=False)
    scheduled = schedule_stt_warmup(req.model_name)
    return STTWarmupResponse(
        accepted=True,
        scheduled=scheduled,
        loaded=stt_service.is_loaded(req.model_name),
        already=stt_service.is_loaded(req.model_name) and not scheduled,
        mock=False,
    )


class VoicePrepareRequest(BaseModel):
    ref_audio_path: str
    ref_text: str
    tts_model_name: str = DEFAULT_TTS_MODEL
    voice_prompt_hash: str | None = None


class VoicePrepareResponse(BaseModel):
    voice_prompt_hash: str


@app.post("/v1/voice/prepare", response_model=VoicePrepareResponse)
def voice_prepare(req: VoicePrepareRequest) -> Any:
    try:
        prepared = tts_service.prepare_voice_clone_prompt(
            ref_audio_path=req.ref_audio_path,
            ref_text=req.ref_text,
            tts_model_name=req.tts_model_name,
            voice_prompt_hash=req.voice_prompt_hash,
        )
        return VoicePrepareResponse(voice_prompt_hash=prepared.voice_prompt_hash)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


class SpeechRequest(BaseModel):
    text: str
    # 비우면 커밋된 보이스 프로필을 쓰고 톤은 텍스트에서 추론한다.
    voice_prompt_hash: str = ""
    tts_model_name: str = DEFAULT_TTS_MODEL
    tone: str | None = None
    engine: str = "qwen"
    custom_speaker: str = "iris"
    custom_model_path: str = ""
    gpt_sovits_url: str = "http://127.0.0.1:9880"
    voice_data_dir: str = ""
    tone_routing: bool = True


class SpeechResponse(BaseModel):
    audio_path: str
    text: str
    tone: str = ""


@app.post("/v1/audio/speech", response_model=SpeechResponse)
def speech(req: SpeechRequest) -> Any:
    try:
        out_dir = CONFIG.iris_home_dir / "audio" / "generated"
        # 6GB GPU에서 동시 합성의 메모리 사용이 겹치지 않게 한다.
        with _speech_lock:
            result = tts_service.synthesize_speech(
                text=req.text,
                voice_prompt_hash=req.voice_prompt_hash,
                tts_model_name=req.tts_model_name,
                output_dir=out_dir,
                tone=req.tone,
            )
        return SpeechResponse(
            audio_path=result.audio_path, text=result.text, tone=result.tone
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


def _ndjson(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")


@app.post("/v1/audio/speech/stream")
def speech_stream(req: SpeechRequest) -> Any:
    synth = StreamSynthRequest(
        text=req.text,
        engine=req.engine,
        voice_prompt_hash=req.voice_prompt_hash,
        tts_model_name=req.tts_model_name,
        tone=req.tone,
        custom_speaker=req.custom_speaker,
        custom_model_path=req.custom_model_path,
        gpt_sovits_url=req.gpt_sovits_url,
        voice_data_dir=req.voice_data_dir,
        tone_routing=req.tone_routing,
    )

    def _gen() -> Any:
        try:
            for event in iter_pcm_events(tts_service, synth):
                yield _ndjson(event)
        except Exception as exc:  # noqa: BLE001
            yield _ndjson({"type": "error", "message": str(exc)})

    return StreamingResponse(_gen(), media_type="application/x-ndjson")


@app.get("/v1/voice/profile")
def voice_profile() -> Any:
    """커밋된 보이스 프로필 정보. 설정창에서 적용 여부를 보여주는 데 쓴다."""
    return tts_service.profile_info()


class ToneClassifyRequest(BaseModel):
    text: str


@app.post("/v1/voice/tone")
def voice_tone(req: ToneClassifyRequest) -> Any:
    return {"tone": tts_service.resolve_tone(req.text)}


class VoiceAnalyzeRequest(BaseModel):
    root: str
    with_transcript: bool = True
    stt_model_name: str = "small"
    language: str = "ko"


@app.post("/v1/voice/analyze")
def voice_analyze(req: VoiceAnalyzeRequest) -> Any:
    root = Path(req.root).expanduser()
    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"녹음 폴더가 없습니다: {root}")

    def _transcribe(path: Path) -> dict[str, Any]:
        if not req.with_transcript:
            return {"text": "", "language": "ko", "language_probability": 0.0}
        try:
            res = stt_service.transcribe_file(
                path,
                model_name=req.stt_model_name,
                language=req.language,
            )
            return {
                "text": res.text,
                "language": res.language,
                "language_probability": res.language_probability,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "text": "",
                "language": "ko",
                "language_probability": 0.0,
                "error": str(exc),
            }

    try:
        samples, recommendations = analyze_folder(
            root,
            jsonl_path=CONFIG.voice_manifest_jsonl,
            csv_path=CONFIG.voice_manifest_csv,
            transcribe_fn=_transcribe if req.with_transcript else None,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "count": len(samples),
        "manifest_jsonl": str(CONFIG.voice_manifest_jsonl),
        "manifest_csv": str(CONFIG.voice_manifest_csv),
        "items": [asdict(s) for s in samples],
        "recommendations": [asdict(s) for s in recommendations],
    }


@app.get("/v1/voice/references")
def voice_references() -> Any:
    samples = load_manifest(CONFIG.voice_manifest_jsonl)
    picks = recommend_reference_samples(samples, top_k=5)
    return {"items": [asdict(s) for s in picks]}


class VoiceReferenceSetRequest(BaseModel):
    ref_audio_path: str
    ref_text: str
    voice_prompt_hash: str | None = None


@app.post("/v1/voice/reference")
def voice_reference(req: VoiceReferenceSetRequest) -> Any:
    if not Path(req.ref_audio_path).is_file():
        raise HTTPException(status_code=400, detail=f"기준 음성 파일이 없습니다: {req.ref_audio_path}")
    CONFIG.voice_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "ref_audio_path": req.ref_audio_path,
        "ref_text": req.ref_text,
        "voice_prompt_hash": req.voice_prompt_hash,
        "updated_at": time.time(),
    }
    CONFIG.voice_selection_path.write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )
    return {"ok": True}


class CacheClearRequest(BaseModel):
    max_age_sec: float = 7 * 24 * 3600


@app.post("/v1/voice/cache/clear")
def cache_clear(req: CacheClearRequest) -> Any:
    removed = clear_generated_audio_cache(max_age_sec=float(req.max_age_sec))
    return {"ok": True, "removed": removed}


@app.post("/shutdown")
def shutdown() -> Any:
    global _should_exit  # noqa: PLW0603
    with _shutdown_lock:
        _should_exit = True

    def _kill() -> None:
        time.sleep(0.25)
        os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=_kill, daemon=True).start()
    return {"ok": True}


def _run_uvicorn() -> None:
    import uvicorn

    uvicorn.run(
        "services.voice_runtime.app:app",
        host=CONFIG.api_host,
        port=CONFIG.api_port,
        log_level="info",
    )


if __name__ == "__main__":
    _run_uvicorn()
