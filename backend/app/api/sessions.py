import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user, require_session
from app.api.scenarios import to_scenario_out
from app.core.config import settings
from app.core.database import get_db
from app.models import Consent, Episode, RoleplaySession, Scenario, SessionStatus, Turn, User
from app.schemas import (
    HistoryTurnOut,
    NextTurnOut,
    ProgressOut,
    ResponseIn,
    SessionCreateIn,
    SessionOut,
    SessionResumeOut,
    TurnOut,
    TurnSignalsOut,
)
from app.services.analysis import run_analysis
from app.services.dialogue import QuestionSpec, get_dialogue_provider
from app.services.dialogue import reactions
from app.services.session_fsm import InvalidTransition, transition

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _episode_title(db: Session, episode_id: int) -> str:
    ep = db.get(Episode, episode_id)
    return ep.title if ep else ""


def _create_turn(
    db: Session,
    session: RoleplaySession,
    spec: QuestionSpec,
    order: int,
    reaction_text: str = "",
    reaction_character_id: str = "",
) -> Turn:
    turn = Turn(
        session_id=session.id,
        episode_id=spec.episode_id,
        order=order,
        question_type=spec.question_type,
        question_text=spec.question_text,
        character_id=spec.character_id,
        reaction_text=reaction_text,
        reaction_character_id=reaction_character_id,
    )
    db.add(turn)
    db.commit()
    return turn


def _turn_out(db: Session, turn: Turn) -> TurnOut:
    out = TurnOut.model_validate(turn)
    ep = db.get(Episode, turn.episode_id)
    out.episode_title = ep.title if ep else ""
    out.virtual_time = (ep.virtual_time or "") if ep else ""
    return out


@router.post("", response_model=SessionOut)
def create_session(
    body: SessionCreateIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    # 개인정보 처리 동의 게이트 (PIPA — 수집 전 동의). 정상 흐름은 항상 동의 후 호출된다.
    if not body.consent.agreed:
        raise HTTPException(status_code=400, detail="개인정보 처리에 대한 동의가 필요합니다")

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
        access_token=secrets.token_urlsafe(24),
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
        access_token=session.access_token,
    )


@router.get("/{session_id}", response_model=SessionResumeOut)
def get_session(
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    """세션 복구 — 새로고침·크래시 후 재진입 시 진행 상태와 턴 이력을 돌려준다.

    프론트는 in_progress + current_turn이면 역할극을 이어가고, current_turn이
    없으면(대화 종료 후 finish 전에 끊김) 마무리 요청 후 리포트로 보낸다.
    """
    turns = list(session.turns)
    current = next((t for t in turns if t.answered_at is None), None)
    history = []
    for t in turns:
        if t.answered_at is None:
            continue
        item = HistoryTurnOut.model_validate(t)
        ep = db.get(Episode, t.episode_id)
        item.episode_title = ep.title if ep else ""
        item.virtual_time = (ep.virtual_time or "") if ep else ""
        history.append(item)

    started = session.started_at
    if started.tzinfo is None:  # SQLite는 naive로 저장한다
        started = started.replace(tzinfo=timezone.utc)
    elapsed = max(0, int((datetime.now(timezone.utc) - started).total_seconds()))

    return SessionResumeOut(
        id=session.id,
        status=session.status.value,
        mode=session.mode,
        difficulty=session.difficulty,
        scenario=to_scenario_out(session.scenario),
        current_turn=_turn_out(db, current) if current else None,
        history=history,
        elapsed_sec=elapsed,
    )


@router.post("/{session_id}/turns/{turn_id}/response", response_model=NextTurnOut)
def submit_response(
    session_id: int,
    turn_id: int,
    body: ResponseIn,
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    if session.status != SessionStatus.in_progress:
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

    # 리액션 비트 + 수행도 갱신 — 이 답변이 상대의 반응과 하루의 전개를 결정한다
    episode = db.get(Episode, turn.episode_id)
    signals = reactions.classify(turn.response_text, episode.checklist if episode else [])
    reactions.update_rapport(session, signals["case"])
    db.commit()

    provider = get_dialogue_provider()
    spec = provider.plan_next(session, session.scenario.episodes, list(session.turns))
    signals_out = TurnSignalsOut(
        case=signals["case"], coverage=signals["coverage"], risk_hits=signals["risk_hits"],
    )
    if spec is None:
        return NextTurnOut(finished=True, turn_signals=signals_out)

    # 반응하는 인물 = 방금 답변을 들은 사람 (에피소드가 넘어가도 반응은 직전 화자의 몫)
    reaction = reactions.pick_reaction(session, turn.character_id, signals["case"])
    character = next(
        (c for c in session.scenario.characters if c["id"] == turn.character_id), {},
    ) if reaction else {}
    db.commit()  # pick_reaction이 갱신한 used_reactions 저장

    # LLM 개인화 2건(질문 다듬기·리액션 다듬기)을 병렬 실행 — 순차 실행 시 최악
    # 타임아웃×2가 체험자 대기가 된다. 스레드에는 평문 데이터만 넘긴다
    # (ORM/DB Session은 스레드 안전하지 않다 — 재료 추출은 요청 스레드에서).
    response_text = turn.response_text
    personalize_q = spec.question_type != "initial"
    situation = ""
    if personalize_q:
        ep = db.get(Episode, spec.episode_id)
        situation = ep.situation if ep else ""
    if settings.dialogue_provider == "ollama" and (personalize_q or reaction):
        with ThreadPoolExecutor(max_workers=2) as pool:
            q_future = (
                pool.submit(provider.personalize_question, spec, situation, response_text)
                if personalize_q else None
            )
            r_future = (
                pool.submit(reactions.personalize_reaction, reaction, character, response_text)
                if reaction else None
            )
            if q_future is not None and (personalized := q_future.result()):
                spec.question_text = personalized
            if r_future is not None:
                reaction = r_future.result()

    next_turn = _create_turn(
        db, session, spec, order=turn.order + 1,
        reaction_text=reaction, reaction_character_id=turn.character_id if reaction else "",
    )
    return NextTurnOut(finished=False, next_turn=_turn_out(db, next_turn), turn_signals=signals_out)


@router.post("/{session_id}/turns/{turn_id}/audio")
async def upload_audio(
    session_id: int,
    turn_id: int,
    file: UploadFile,
    session: RoleplaySession = Depends(require_session),
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
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    try:
        transition(session, SessionStatus.analyzing)
    except InvalidTransition as e:
        raise HTTPException(status_code=409, detail=str(e))
    session.ended_at = datetime.now(timezone.utc)
    session.analysis_progress = {"stage": "queued", "pct": 0}
    db.commit()
    background.add_task(run_analysis, session_id)
    return ProgressOut(status=session.status.value, stage="queued", pct=0)


@router.post("/{session_id}/retry-analysis", response_model=ProgressOut, status_code=202)
def retry_analysis(
    session_id: int,
    background: BackgroundTasks,
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    """분석 실패 시 재시도 (S-TLJZWB) — analyzing 상태에서 error로 멈춘 세션만 재큐잉."""
    progress = session.analysis_progress or {}
    if session.status != SessionStatus.analyzing or progress.get("stage") != "error":
        raise HTTPException(status_code=409, detail="재시도할 수 있는 상태가 아닙니다")
    session.analysis_progress = {"stage": "queued", "pct": 0}
    db.commit()
    background.add_task(run_analysis, session_id)
    return ProgressOut(status=session.status.value, stage="queued", pct=0)


@router.get("/{session_id}/progress", response_model=ProgressOut)
def get_progress(session: RoleplaySession = Depends(require_session)):
    progress = session.analysis_progress or {}
    return ProgressOut(
        status=session.status.value,
        stage=progress.get("stage", ""),
        pct=progress.get("pct", 0),
    )
