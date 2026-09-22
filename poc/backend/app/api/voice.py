"""Authenticated calibration for a consented session. Calibration audio is temporary."""
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from app.ai import voice_measurement as engine
from app.api.deps import require_session
from app.core.database import get_db
from app.models import RoleplaySession, SessionStatus

router = APIRouter(prefix="/sessions", tags=["voice"])


class CaptureSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    capture_id: str = Field(min_length=1, max_length=100)
    device_id: str = Field(min_length=1, max_length=200)
    sample_rate: int | None = Field(default=None, ge=8000, le=192000)
    channel_count: int | None = Field(default=None, ge=1, le=2)
    auto_gain_control: bool | None = None
    noise_suppression: bool | None = None
    echo_cancellation: bool | None = None


class VoiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    calibration_id: str | None = Field(default=None, max_length=100)
    capture: CaptureSettings | None = None
    excluded_intervals: list[tuple[float, float]] = Field(default_factory=list, max_length=100)


def parse_input(data):
    try:
        value = VoiceInput.model_validate_json(data)
        import math
        if any(not (math.isfinite(a) and math.isfinite(b) and 0 <= a < b <= 120) for a, b in value.excluded_intervals):
            raise ValueError("invalid intervals")
        return value.model_dump()
    except (ValidationError, ValueError):
        raise HTTPException(status_code=422, detail="녹음 설정 형식이 올바르지 않습니다") from None


@router.post("/{session_id}/voice/calibration")
async def calibrate_voice(session_id: int, noise: UploadFile, speech: UploadFile,
        capture: Annotated[str, Form(max_length=2000)],
        session: RoleplaySession = Depends(require_session), db: Session = Depends(get_db)):
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=409, detail="진행 중인 연습에서만 마이크를 확인할 수 있습니다")
    try:
        metadata = CaptureSettings.model_validate_json(capture).model_dump()
    except ValidationError:
        raise HTTPException(status_code=422, detail="마이크 설정을 다시 확인해 주세요") from None
    with TemporaryDirectory(prefix="mirror-voice-") as folder:
        for name, upload in (("noise", noise), ("speech", speech)):
            content = await upload.read(6 * 1024 * 1024 + 1)
            if len(content) > 6 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="마이크 검사 녹음이 너무 깁니다")
            Path(folder, name).write_bytes(content)
        result = await run_in_threadpool(engine.calibrate, Path(folder, "noise"), Path(folder, "speech"), metadata)
    db.refresh(session)
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=409, detail="진행 중인 연습이 아닙니다")
    session.rapport = {**(session.rapport or {}), "voice_engine_version": engine.VERSION,
        "voice_calibration_id": result["id"] if result["status"] == "measured" else None,
        "voice_calibrations": {**(session.rapport or {}).get("voice_calibrations", {}), result["id"]: result}}
    db.commit()
    return result


@router.delete("/{session_id}/voice/calibration")
def invalidate_voice(session_id: int, session: RoleplaySession = Depends(require_session), db: Session = Depends(get_db)):
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=409, detail="진행 중인 연습이 아닙니다")
    session.rapport = {**(session.rapport or {}), "voice_calibration_id": None}
    db.commit()
    return {"ok": True}
