import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user
from app.api.scenarios import to_scenario_out
from app.core.config import settings
from app.core.database import get_db
from app.models import Consent, Episode, RoleplaySession, Scenario, SessionStatus, Turn, User
from app.schemas import NextTurnOut, ProgressOut, ResponseIn, SessionCreateIn, SessionOut, TurnOut
from app.services.analysis import run_analysis
from app.services.dialogue import QuestionSpec, get_dialogue_provider
from app.services.session_fsm import InvalidTransition, transition

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _episode_title(db: Session, episode_id: int) -> str:
    ep = db.get(Episode, episode_id)
    return ep.title if ep else ""


def _create_turn(db: Session, session: RoleplaySession, spec: QuestionSpec, order: int) -> Turn:
    turn = Turn(
        session_id=session.id,
        episode_id=spec.episode_id,
        order=order,
        question_type=spec.question_type,
        question_text=spec.question_text,
        character_id=spec.character_id,
    )
    db.add(turn)
    db.commit()
    return turn


def _turn_out(db: Session, turn: Turn) -> TurnOut:
    out = TurnOut.model_validate(turn)
    out.episode_title = _episode_title(db, turn.episode_id)
    return out


@router.post("", response_model=SessionOut)
def create_session(
    body: SessionCreateIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    query = db.query(Scenario).filter_by(is_active=True)
    scenario = (
        query.filter_by(slug=body.scenario_slug).first()
        if body.scenario_slug else query.first()
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")

    session = RoleplaySession(
        scenario_id=scenario.id,
        user_id=user.id if user else None,
        client_key=body.client_key or str(uuid.uuid4()),
        mode=body.mode if body.mode in (5, 10) else 5,
        difficulty=body.difficulty,
    )
    db.add(session)
    db.flush()
    db.add(Consent(
        session_id=session.id,
        user_id=user.id if user else None,
        storage_policy=body.consent.storage_policy,
        agreed=body.consent.agreed,
    ))
    transition(session, SessionStatus.in_progress)
    db.commit()

    spec = get_dialogue_provider().first_question(session, scenario.episodes)
    turn = _create_turn(db, session, spec, order=1)

    return SessionOut(
        id=session.id,
        status=session.status.value,
        mode=session.mode,
        difficulty=session.difficulty,
        scenario=to_scenario_out(scenario),
        current_turn=_turn_out(db, turn),
    )


@router.post("/{session_id}/turns/{turn_id}/response", response_model=NextTurnOut)
def submit_response(
    session_id: int,
    turn_id: int,
    body: ResponseIn,
    db: Session = Depends(get_db),
):
    session = db.get(RoleplaySession, session_id)
    if session is None or session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=404, detail="진행 중인 세션이 아닙니다")
    turn = db.get(Turn, turn_id)
    if turn is None or turn.session_id != session_id:
        raise HTTPException(status_code=404, detail="턴을 찾을 수 없습니다")
    if turn.answered_at is not None:
        raise HTTPException(status_code=409, detail="이미 응답한 턴입니다")

    # 텍스트가 비어 있으면 오디오 업로드 시 서버 STT가 채운 텍스트를 유지
    incoming = body.text.strip()
    if incoming:
        turn.response_text = incoming
        turn.stt_source = body.stt_source
    elif not turn.response_text:
        raise HTTPException(status_code=422, detail="응답 텍스트가 비어 있습니다")
    turn.response_duration_ms = body.duration_ms
    if body.nonverbal:
        turn.nonverbal_metrics = body.nonverbal.model_dump()
    turn.answered_at = datetime.now(timezone.utc)
    db.commit()

    spec = get_dialogue_provider().next_question(session, session.scenario.episodes, list(session.turns))
    if spec is None:
        return NextTurnOut(finished=True)
    next_turn = _create_turn(db, session, spec, order=turn.order + 1)
    return NextTurnOut(finished=False, next_turn=_turn_out(db, next_turn))


@router.post("/{session_id}/turns/{turn_id}/audio")
async def upload_audio(
    session_id: int,
    turn_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
):
    turn = db.get(Turn, turn_id)
    if turn is None or turn.session_id != session_id:
        raise HTTPException(status_code=404, detail="턴을 찾을 수 없습니다")
    dest = settings.media_dir / f"session{session_id}_turn{turn_id}.wav"
    dest.write_bytes(await file.read())
    turn.audio_path = str(dest)

    # 브라우저 STT가 없는(오프라인) 턴은 서버가 즉시 변환 — 대화 엔진이 바로 사용
    transcript = ""
    if not turn.response_text:
        from app.ai.stt import get_stt_provider

        provider = get_stt_provider()
        if provider:
            try:
                transcript = provider.transcribe(str(dest))
            except Exception:
                transcript = ""
            if transcript:
                turn.response_text = transcript
                turn.stt_source = provider.name
    db.commit()
    return {"ok": True, "path": str(dest), "transcript": transcript}


@router.post("/{session_id}/finish", response_model=ProgressOut, status_code=202)
def finish_session(
    session_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    try:
        transition(session, SessionStatus.analyzing)
    except InvalidTransition as e:
        raise HTTPException(status_code=409, detail=str(e))
    session.ended_at = datetime.now(timezone.utc)
    session.analysis_progress = {"stage": "queued", "pct": 0}
    db.commit()
    background.add_task(run_analysis, session_id)
    return ProgressOut(status=session.status.value, stage="queued", pct=0)


@router.get("/{session_id}/progress", response_model=ProgressOut)
def get_progress(session_id: int, db: Session = Depends(get_db)):
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    progress = session.analysis_progress or {}
    return ProgressOut(
        status=session.status.value,
        stage=progress.get("stage", ""),
        pct=progress.get("pct", 0),
    )
