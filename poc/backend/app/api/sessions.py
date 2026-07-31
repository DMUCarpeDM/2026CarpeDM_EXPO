import secrets
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_session
from app.api.scenarios import to_scenario_out
from app.core.config import settings
from app.core.database import get_db
from app.models import (
    Consent,
    Episode,
    RoleplaySession,
    Scenario,
    SessionStatus,
    SurveyResponse,
    Turn,
    User,
    utcnow,
)
from app.schemas import (
    HistoryTurnOut,
    NextTurnOut,
    ProgressOut,
    ResponseIn,
    SessionClaimIn,
    SessionClaimOut,
    SessionCreateIn,
    SessionOut,
    SessionResumeOut,
    SurveyIn,
    TurnOut,
    TurnSignalsOut,
)
from app.services.analysis import run_analysis
from app.services.dialogue import QuestionSpec, get_dialogue_provider
from app.services.dialogue.availability import ollama_dialogue_ready
from app.services.dialogue import emotion, reactions
from app.services.session_fsm import InvalidTransition, transition

router = APIRouter(prefix="/sessions", tags=["sessions"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 업로드 오디오 상한 — DoS 차단 (한 턴 wav 실측 대비 관대)
# 실시간 받아쓰기 조각 상한 — 3~4초 48kHz mono 16bit WAV(~400KB) 대비 관대하되 턴 오디오보다 훨씬 작게
MAX_LIVE_STT_BYTES = 4 * 1024 * 1024


def _stored_difficulty(db: Session, difficulty: str) -> str:
    """기존 전시 DB의 난이도 제약과 새 초압박 모드를 함께 지원한다."""
    if difficulty != "ultra_pressure":
        return difficulty
    schema = db.execute(text(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'roleplay_sessions'"
    )).scalar() or ""
    return "ultra_pressure" if "ultra_pressure" in schema else "pressure"


def _episode_title(db: Session, episode_id: int) -> str:
    ep = db.get(Episode, episode_id)
    return ep.title if ep else ""


def _selected_episodes(session: RoleplaySession, scenario: Scenario) -> list[Episode]:
    """선택 장면이 있으면 그 장면만, 없으면 기존 전체 시나리오를 사용한다."""
    if not session.selected_episode_id:
        return list(scenario.episodes)
    return [episode for episode in scenario.episodes if episode.id == session.selected_episode_id]


def _character_for(scenario: Scenario, character_id: str) -> dict:
    """시나리오에 저장된 캐릭터 페르소나를 찾는다."""
    return next((character for character in scenario.characters if character["id"] == character_id), {})


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
    # 시작 게이트(설정 가능): 개인화 없는 시작을 막을지는 운영 정책이다. 단 이 게이트를
    # 통과한 뒤에는 Ollama가 죽어도 세션이 끊기지 않는다 — 아래 개인화 실패는 전부
    # 템플릿 폴백으로 계속 진행한다 (부스에서 진행 중 체험이 벽돌이 되는 것이 최악).
    if settings.dialogue_require_ollama and not ollama_dialogue_ready():
        raise HTTPException(status_code=503, detail="Ollama 대화 모델을 준비한 뒤 연습을 시작해 주세요")

    # NFC 시작 (S-B2B-NFC): 태그된 카드가 직무·시나리오를 결정한다.
    # 등록되지 않은 카드는 404 — 프론트가 수동 카드 선택 폴백을 띄운다.
    card = None
    card_org_id = None
    scenario_slug = body.scenario_slug
    job_role = body.job_role
    if body.nfc_uid:
        from app.api.nfc import DEFAULT_PACK_BY_ROLE, _normalize_uid
        from app.models import NfcCard
        from app.services import nfc_bridge

        card = db.query(NfcCard).filter_by(uid=_normalize_uid(body.nfc_uid)).first()
        if card is None or card.status != "active":
            raise HTTPException(status_code=404, detail="등록되지 않았거나 폐기된 카드입니다")
        card.last_seen_at = utcnow()
        job_role = card.job_role or job_role
        if not scenario_slug:
            scenario_slug = card.scenario_slug or DEFAULT_PACK_BY_ROLE.get(card.job_role, "")
        # 기관 스탬프는 '최근 실물 태그 증거'가 있을 때만 인정한다. 카드 UID는
        # 비밀이 아니라(휴대폰으로 읽힘) UID 지식만으로 기관 귀속을 허용하면
        # 익명 공격자가 타 기관 대시보드·KPI에 세션을 무한 주입할 수 있다.
        # 증거가 없어도 체험은 그대로 진행된다(직무·시나리오는 민감하지 않음) —
        # 익명 세션으로 시작하고, 귀속은 영수증 QR 클레임이 담당한다.
        if nfc_bridge.recent_tap_matches(body.nfc_uid):
            card_org_id = card.institution_id

    # 직무 검증 — 다른 모든 job_role 입력 경로(signup·/orgs/join·PATCH /me·nfc/issue)와
    # 같은 화이트리스트를 쓴다. 무검증 스탬프는 기관 대시보드의 직무 필터·KPI 집계에서
    # 오타 세션이 조용히 빠지는 구멍이 된다.
    if job_role:
        from app.api.orgs import JOB_ROLES

        if job_role not in JOB_ROLES:
            raise HTTPException(status_code=422, detail="알 수 없는 직무입니다")

    query = db.query(Scenario).filter_by(is_active=True)
    scenario = (
        query.filter_by(slug=scenario_slug).first()
        if scenario_slug else query.first()
    )
    if scenario is None:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")
    # 직무 미지정이면 시나리오 팩의 직무를 따른다 (팩 기반 세션의 대시보드 집계 축)
    if not job_role:
        job_role = scenario.job_role or ""

    client_key = body.client_key or str(uuid.uuid4())
    mode = body.mode if body.mode in (5, 10) else 5
    selected_episode = None
    if body.selected_episode_id:
        selected_episode = next(
            (episode for episode in scenario.episodes if episode.id == body.selected_episode_id),
            None,
        )
        if selected_episode is None:
            raise HTTPException(status_code=400, detail="선택한 장면이 시나리오에 없습니다")
        if mode not in selected_episode.modes:
            raise HTTPException(status_code=400, detail="선택한 장면은 현재 연습 시간에 사용할 수 없습니다")
    stored_difficulty = _stored_difficulty(db, body.difficulty)
    # 회차 기록 (KPI '2차 수행률'·'1차→2차 개선') — 같은 참여자×시나리오×모드 기준
    prev_attempts = (
        db.query(func.count(RoleplaySession.id))
        .filter_by(client_key=client_key, scenario_id=scenario.id, mode=mode)
        .scalar() or 0
    )
    session = RoleplaySession(
        scenario_id=scenario.id,
        selected_episode_id=selected_episode.id if selected_episode else None,
        user_id=user.id if user else None,
        client_key=client_key,
        access_token=secrets.token_urlsafe(24),
        # 영수증 QR 클레임 토큰 (S-B2B-CLAIM) — 계정 귀속 전용 능력 토큰.
        # access_token(데이터 열람권)과 분리해 QR 노출 반경을 귀속 행위로 한정한다.
        claim_token=secrets.token_urlsafe(24),
        mode=mode,
        difficulty=stored_difficulty,
        attempt_no=prev_attempts + 1,
        job_role=job_role,
        # 기관 스탬프: 로그인 사용자의 소속 > (태그 증거 있는) NFC 카드의 소속
        institution_id=(user.institution_id if user else None) or card_org_id,
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
    # 감정 상태 머신 초기화 (S-B2B-EMOTION) — 프로파일 있는 팩만 활성화된다
    emotion.ensure_state(session)
    db.flush()

    provider = get_dialogue_provider()
    spec = provider.first_question(session, _selected_episodes(session, scenario))
    first_episode = db.get(Episode, spec.episode_id)
    # 감정 시나리오(고객 페르소나)의 도입 대사는 각본을 유지한다 (S-B2B-EMOTION).
    # 직전 답변이 없는 첫 턴은 개인화가 더할 맥락이 없고, 소형 LLM이 역할을
    # 뒤집는 사고(격앙한 고객이 직원처럼 사과하는 첫마디 — 리허설 실측)가
    # 도입 몰입을 깨뜨린다. 2턴부터는 직전 답변 기반 개인화가 정상 동작한다.
    personalized = None
    if not emotion.profile_of(session):
        personalized = provider.personalize_question(
            spec, first_episode.situation if first_episode else "", "", _character_for(scenario, spec.character_id), session.difficulty,
        )
    # 개인화 실패(Ollama 다운·타임아웃·형식 불량)는 오류가 아니다 — 전문가가 쓴
    # 템플릿 문장을 그대로 쓴다. 체험 시작을 LLM에 인질로 잡히게 하지 않는다.
    if personalized:
        spec.question_text = personalized
    turn = _create_turn(db, session, spec, order=1)

    return SessionOut(
        id=session.id,
        status=session.status.value,
        mode=session.mode,
        difficulty=session.difficulty,
        selected_episode_id=session.selected_episode_id,
        scenario=to_scenario_out(scenario),
        current_turn=_turn_out(db, turn),
        access_token=session.access_token,
    )


@router.get("/mine")
def my_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = 20,
):
    """수강생 본인 연습 이력 (S-B2B-ORG) — 웹앱 '내 결과' 페이지의 데이터 소스.

    점수 표기 방침(S-B2B-SCORE): 본인 화면은 등급 중심 — 원점수는 함께 주되
    프론트가 등급을 기본 표기로 쓴다.
    """
    from app.models import Report
    from app.services.score_policy import grade_of

    rows = (
        db.query(RoleplaySession, Scenario, Report)
        .join(Scenario, RoleplaySession.scenario_id == Scenario.id)
        .outerjoin(Report, Report.session_id == RoleplaySession.id)
        .filter(RoleplaySession.user_id == user.id)
        .order_by(RoleplaySession.id.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    return [
        {
            "id": session.id,
            "scenario_title": scenario.title,
            "job_role": session.job_role or "",
            "mode": session.mode,
            "difficulty": session.difficulty,
            "status": session.status.value,
            "started_at": session.started_at.isoformat() if session.started_at else "",
            "grade": grade_of(report.total_score if report else None),
            "total_score": report.total_score if report else None,
            "fit_scores": (report.fit_scores or {}) if report else {},
        }
        for session, scenario, report in rows
    ]


# ---- 세션 클레임 (S-B2B-CLAIM: 영수증 QR → 계정 귀속) ----
# 주의: "/claim" 경로는 "/{session_id}"보다 먼저 등록되어야 한다 (경로 매칭 순서).

def _claim_summary(db: Session, session: RoleplaySession, already: bool) -> SessionClaimOut:
    from app.services.score_policy import grade_of

    report = session.report
    return SessionClaimOut(
        session_id=session.id,
        scenario_title=session.scenario.title if session.scenario else "",
        started_at=session.started_at.isoformat() if session.started_at else "",
        total_score=report.total_score if report else None,
        # 점수 표기 방침(S-B2B-SCORE): 수강생 화면은 등급 — 원점수는 관리자·연구 트랙만
        grade=grade_of(report.total_score if report else None),
        already_claimed=already,
    )


@router.get("/claim/{claim_token}")
def preview_claim(claim_token: str, db: Session = Depends(get_db)):
    """클레임 미리보기 — 웹앱이 로그인 전에 '어떤 연습인지'를 보여줄 때 사용.

    claim_token 자체가 능력 토큰이라 별도 인증 없이 요약(제목·일시·등급)만 준다.
    발화·리포트 본문은 여기서 절대 노출하지 않는다.
    """
    session = db.query(RoleplaySession).filter_by(claim_token=claim_token).first()
    if session is None or not claim_token:
        raise HTTPException(status_code=404, detail="유효하지 않은 클레임 코드입니다")
    return _claim_summary(db, session, already=session.user_id is not None)


@router.post("/claim")
def claim_session(
    body: SessionClaimIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """영수증 QR 클레임 — 익명 체험 세션을 로그인 계정에 귀속시킨다.

    귀속되면 세션은 사용자의 소속 기관 스코프로 들어가 기관 대시보드에 나타난다.
    같은 사용자의 재요청은 멱등, 다른 사용자가 이미 귀속한 세션은 409.
    """
    session = db.query(RoleplaySession).filter_by(claim_token=body.claim_token).first()
    if session is None:
        raise HTTPException(status_code=404, detail="유효하지 않은 클레임 코드입니다")
    if session.user_id is not None and session.user_id != user.id:
        raise HTTPException(status_code=409, detail="이미 다른 계정에 귀속된 세션입니다")
    already = session.user_id == user.id
    session.user_id = user.id
    # 클레임은 '개인 귀속'이 본질 — 기관 스탬프도 클레이머의 소속으로 재기록한다.
    # NFC 카드가 남긴 타 기관 스탬프를 유지하면, 그 기관 대시보드에 클레이머의
    # 이름·이메일이 노출된다(동의 없는 제3자 개인정보 제공). 카드 기관은
    # 키오스크 포인터일 뿐 데이터 소유 근거가 아니다.
    if not already:
        session.institution_id = user.institution_id
    if not session.job_role and user.job_role:
        session.job_role = user.job_role
    db.commit()
    return _claim_summary(db, session, already=already)


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
        selected_episode_id=session.selected_episode_id,
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
    turn.answered_at = utcnow()

    # 리액션 비트 + 수행도 갱신 — 이 답변이 상대의 반응과 하루의 전개를 결정한다
    episode = db.get(Episode, turn.episode_id)
    signals = reactions.classify(turn.response_text, episode.checklist if episode else [])
    reactions.update_rapport(session, signals["case"])
    # 감정 상태 전이 (S-B2B-EMOTION) — 대응 품질이 상대의 감정 온도를 실제로 움직인다
    emotion.update(session, signals["case"], turn.order)
    db.flush()

    provider = get_dialogue_provider()
    spec = provider.plan_next(session, _selected_episodes(session, session.scenario), list(session.turns))
    signals_out = TurnSignalsOut(
        case=signals["case"], coverage=signals["coverage"], risk_hits=signals["risk_hits"],
        emotion=emotion.signals_payload(session),
    )
    if spec is None:
        db.commit()
        return NextTurnOut(finished=True, turn_signals=signals_out)

    next_episode = db.get(Episode, spec.episode_id)
    personalized = provider.personalize_question(
        spec,
        next_episode.situation if next_episode else "",
        turn.response_text,
        _character_for(session.scenario, spec.character_id),
        session.difficulty,
        emotion_directive=emotion.directive_for(session, spec.character_id),
    )
    # 진행 중 개인화 실패 → 템플릿 대본으로 계속. 예전처럼 rollback+503으로 끊으면
    # 방금 말한 답변이 통째로 버려지고, Ollama가 죽어 있는 동안 체험이 벽돌이 된다.
    if personalized:
        spec.question_text = personalized

    # 반응하는 인물 = 방금 답변을 들은 사람 (에피소드가 넘어가도 반응은 직전 화자의 몫)
    reaction = reactions.pick_reaction(session, turn.character_id, signals["case"])
    character = _character_for(session.scenario, turn.character_id) if reaction else {}
    db.commit()  # pick_reaction이 갱신한 used_reactions 저장

    # 질문은 위에서 Ollama로 생성했다. 짧은 반응 문장만 병렬로 다듬는다.
    # ORM 객체는 스레드에 넘기지 않고 평문 데이터만 사용한다.
    response_text = turn.response_text
    reaction_directive = emotion.directive_for(session, turn.character_id)
    # 무례한 답변에는 준비된 단호한 문장을 그대로 사용한다. Ollama가 말투를
    # 완화해 버리면 사용자가 받아야 할 경계 신호가 사라질 수 있다.
    if settings.dialogue_provider == "ollama" and reaction and signals["case"] != "risky":
        with ThreadPoolExecutor(max_workers=2) as pool:
            reaction_future = pool.submit(
                reactions.personalize_reaction, reaction, character, response_text,
                reaction_directive,
            )
            reaction = reaction_future.result()

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
    # 텍스트 필드처럼 오디오도 상한을 건다 — 무제한 read()는 메모리·디스크 DoS 벡터.
    # 10분 모드 한 턴의 16kHz 16bit mono wav도 수 MB 수준이라 25MB면 충분히 관대하다.
    data = await file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="오디오 파일이 허용 크기를 초과했습니다")
    dest = settings.media_dir / f"session{session_id}_turn{turn_id}.wav"
    await run_in_threadpool(dest.write_bytes, data)
    turn.audio_path = str(dest)

    # 브라우저 STT가 없는(오프라인) 턴은 서버가 즉시 변환 — 대화 엔진이 바로 사용
    transcript = ""
    if not turn.response_text:
        from app.ai.stt import get_stt_provider

        provider = get_stt_provider()
        if provider:
            try:
                # CPU 바운드 전사를 스레드풀로 — 이벤트 루프에서 돌리면 전사가
                # 끝날 때까지 다른 방문객의 진행률 폴링·헬스체크까지 함께 멈춘다
                transcript = await run_in_threadpool(provider.transcribe, str(dest))
            except Exception:
                transcript = ""
            if transcript:
                turn.response_text = transcript
                turn.stt_source = provider.name
    db.commit()
    return {"ok": True, "path": str(dest), "transcript": transcript}


@router.post("/{session_id}/stt")
async def live_stt(
    session_id: int,
    file: UploadFile,
    session: RoleplaySession = Depends(require_session),
):
    """연습 중 실시간 받아쓰기 폴백 — 브라우저 Web Speech가 없거나(오프라인 Chrome 등)
    실패할 때, 프론트가 3초 안팎의 WAV 조각을 보내 입력창을 채운다.
    턴 상태는 건드리지 않는다 — 최종 제출·분석은 기존 /audio + /response 경로가 담당한다."""
    from app.ai.stt import get_stt_provider

    provider = get_stt_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="서버 음성 인식을 사용할 수 없습니다")
    data = await file.read(MAX_LIVE_STT_BYTES + 1)
    if len(data) > MAX_LIVE_STT_BYTES:
        raise HTTPException(status_code=413, detail="음성 조각이 허용 크기를 초과했습니다")
    # 조각은 전사 즉시 삭제한다 — 세션 오디오 보존 정책(media_retention)과 무관한 임시물
    tmp = settings.media_dir / f"live_stt_{session_id}_{uuid.uuid4().hex}.wav"
    await run_in_threadpool(tmp.write_bytes, data)
    # 저지연 경로가 있으면 우선 사용 (whisper: beam 1 탐욕 디코딩 — 체감 지연 절반)
    transcribe = getattr(provider, "transcribe_live", provider.transcribe)
    try:
        # CPU 바운드 전사는 스레드풀로 — 이벤트 루프를 막으면 다른 방문객 요청까지 멈춘다
        transcript = await run_in_threadpool(transcribe, str(tmp))
    except Exception:
        transcript = ""
    finally:
        tmp.unlink(missing_ok=True)
    return {"text": transcript.strip(), "provider": provider.name}


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
    session.ended_at = utcnow()
    session.analysis_progress = {"stage": "queued", "pct": 0, "at": time.time()}
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
    session.analysis_progress = {"stage": "queued", "pct": 0, "at": time.time()}
    db.commit()
    background.add_task(run_analysis, session_id)
    return ProgressOut(status=session.status.value, stage="queued", pct=0)


@router.post("/{session_id}/survey", status_code=201)
def submit_survey(
    session_id: int,
    body: SurveyIn,
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    """리포트 후 만족도 설문 저장 — 재제출 시 덮어쓴다 (세션당 1건).

    다른 세션 API와 동일하게 능력 토큰을 요구한다 — id 열거로 타인 세션의
    KPI 설문을 위조·덮어쓰기하는 IDOR를 막는다."""
    survey = db.query(SurveyResponse).filter_by(session_id=session_id).first()
    if survey is None:
        survey = SurveyResponse(session_id=session_id)
        db.add(survey)
    survey.q_clarity = body.q_clarity
    survey.q_empathy = body.q_empathy
    survey.q_personalization = body.q_personalization
    survey.comment = body.comment.strip()
    db.commit()
    return {"ok": True}


# 진행률 정체 임계 — 정상 분석은 수십 초 안에 끝난다. 이 시간 동안 갱신이 없으면
# 분석 스레드가 죽은 것으로 보고 복구 가능한 오류로 전환한다 (재시도 허용).
ANALYSIS_STALL_SEC = 180


@router.get("/{session_id}/progress", response_model=ProgressOut)
def get_progress(
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    progress = dict(session.analysis_progress or {})
    stage = progress.get("stage", "")
    if session.status == SessionStatus.analyzing and stage not in ("", "done", "error"):
        now = time.time()
        at = progress.get("at")
        if at is None:
            # 구버전 진행률(시각 없음) — 지금부터 정체 시계를 시작한다
            progress["at"] = now
            session.analysis_progress = progress
            db.commit()
        elif now - at > ANALYSIS_STALL_SEC:
            # 스레드가 except에도 못 닿고 죽은 경우: 서버 재시작 없이 복구할 수
            # 있도록 error로 전환한다 — 프론트가 재시도 UI를 띄운다
            progress = {"stage": "error", "pct": 0, "at": now}
            session.analysis_progress = progress
            db.commit()
    return ProgressOut(
        status=session.status.value,
        stage=progress.get("stage", ""),
        pct=progress.get("pct", 0),
    )
