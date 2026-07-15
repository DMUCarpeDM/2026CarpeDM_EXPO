"""전체 도메인 모델.

세션 상태 흐름: ready → in_progress → analyzing → completed (중단 시 aborted)
4-Fit: response / voice / eye / posture
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    # SQLite DATETIME은 tz를 보존하지 않아 읽으면 naive가 된다.
    # aware/naive 혼용 비교(TypeError)를 막기 위해 저장·비교 모두 naive UTC로 통일.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SessionStatus(str, enum.Enum):
    ready = "ready"
    in_progress = "in_progress"
    analyzing = "analyzing"
    completed = "completed"
    aborted = "aborted"


class FitType(str, enum.Enum):
    response = "response"
    voice = "voice"
    eye = "eye"
    posture = "posture"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100), default="")
    role: Mapped[str] = mapped_column(String(10), default="user")  # user | admin (기관 운영자)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sessions: Mapped[list["RoleplaySession"]] = relationship(back_populates="user")


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (
        # 누구의 동의인지 알 수 없는 행 방지
        CheckConstraint("session_id IS NOT NULL OR user_id IS NOT NULL", name="ck_consents_subject"),
        CheckConstraint(
            "storage_policy IN ('none', 'anonymous', 'account')", name="ck_consents_policy"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("roleplay_sessions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # storage_policy: none(미저장) / anonymous(익명 저장) / account(계정 저장)
    storage_policy: Mapped[str] = mapped_column(String(20), default="none")
    agreed: Mapped[bool] = mapped_column(default=False)
    agreed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # 회사 세계관: {company, service, situation, user_role}
    world_setting: Mapped[dict] = mapped_column(JSON, default=dict)
    # 등장인물 4인: [{id, name, role, personality, speech_style, tts: {rate, pitch}}]
    characters: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(default=True)

    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="scenario", order_by="Episode.order",
        cascade="all, delete-orphan", passive_deletes=True,
    )


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("scenario_id", "order", name="uq_episodes_scenario_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"))
    order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    situation: Mapped[str] = mapped_column(Text, default="")
    character_id: Mapped[str] = mapped_column(String(50))  # scenario.characters[].id
    # 포함 모드(분): [5, 10] 또는 [10] (10분 모드 전용)
    modes: Mapped[list] = mapped_column(JSON, default=lambda: [5, 10])
    initial_question: Mapped[str] = mapped_column(Text)
    # 하루 프레이밍: 에피소드가 벌어지는 가상 시각 "09:04" (S-미러 서사)
    virtual_time: Mapped[str] = mapped_column(String(10), default="")
    # 수행도 분기: {"high": "...", "low": "..."} — 기본 initial_question이 보통(mid)
    intro_variants: Mapped[dict] = mapped_column(JSON, default=dict)
    question_intent: Mapped[str] = mapped_column(Text, default="")
    # [{id, label, keywords: [...], followup, weight}] — 누락 항목이 후속 질문 트리거
    checklist: Mapped[list] = mapped_column(JSON, default=list)
    # 압박 난이도용 후속 질문 [{text, trigger: checklist_id | "any"}]
    pressure_questions: Mapped[list] = mapped_column(JSON, default=list)
    # 심화 질문 [{text, intent}] — 잘한 답에도 장면을 이어가는 전개 질문.
    # 후속(followup)이 누락 '교정'이라면 심화는 장면 '전개' — 상황당 1답변 증발 방지
    deepening_questions: Mapped[list] = mapped_column(JSON, default=list)
    max_turns: Mapped[int] = mapped_column(Integer, default=2)

    scenario: Mapped["Scenario"] = relationship(back_populates="episodes")


# 데모/리허설 세션 격리 접두사 — demo_data.py가 이 접두사로 세션을 만들고,
# 방문자 대면 백분위/코호트 표본은 이 접두사를 제외한다. 실제 체험 세션은
# UUID(또는 프론트 localStorage 키)라 이 접두사를 갖지 않는다.
DEMO_CLIENT_KEY_PREFIX = "demo-"


class RoleplaySession(Base):
    __tablename__ = "roleplay_sessions"
    __table_args__ = (
        CheckConstraint("mode IN (5, 10)", name="ck_sessions_mode"),
        CheckConstraint("difficulty IN ('basic', 'pressure')", name="ck_sessions_difficulty"),
        CheckConstraint("attempt_no >= 1", name="ck_sessions_attempt"),
        # /history 최근 10회·직전 세션 비교 — 둘 다 client_key 선두 + id 정렬
        Index("ix_sessions_client_id", "client_key", "id"),
        # 1클릭 초기화: 활성 세션은 항상 소수 — 부분 인덱스
        Index(
            "ix_sessions_active", "status",
            sqlite_where=text("status IN ('ready', 'in_progress', 'analyzing')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # 익명 연속성: 프론트 localStorage UUID (QR/익명 ID 연동의 기반)
    client_key: Mapped[str] = mapped_column(String(64), default="", index=True)
    # 세션 접근 능력 토큰 — 생성 시 발급, 세션 데이터 조회에 요구 (순차 id 열거 IDOR 차단)
    access_token: Mapped[str] = mapped_column(String(64), default="")
    # 기관 배포 확장(Phase 1 전방 호환) — 단일 테넌트(전시)는 NULL. Phase 2에서 테넌트 스코프에 사용.
    # nullable이라 _migrate_columns가 기존 DB에 무손실 추가하고 현행 동작은 바뀌지 않는다.
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("institutions.id"), nullable=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    mode: Mapped[int] = mapped_column(Integer, default=5)  # 5 | 10 (분)
    difficulty: Mapped[str] = mapped_column(String(20), default="basic")  # basic | pressure
    # 같은 참여자×시나리오×모드 내 회차 — KPI '2차 수행률'·'1차→2차 개선'의 집계 기반
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.ready)
    # {stage: str, pct: int} — 분석 진행률 (S-TTQEUS)
    analysis_progress: Mapped[dict] = mapped_column(JSON, default=dict)
    # 수행도 상태 — 리액션·도입 변주·하루의 결말 분기의 심장.
    # {"points": float, "answered": int, "used_reactions": [str]}
    rapport: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User | None"] = relationship(back_populates="sessions")
    scenario: Mapped["Scenario"] = relationship()
    turns: Mapped[list["Turn"]] = relationship(
        back_populates="session", order_by="Turn.order",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    report: Mapped["Report | None"] = relationship(
        back_populates="session", uselist=False,
        cascade="all, delete-orphan", passive_deletes=True,
    )


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (
        UniqueConstraint("session_id", "order", name="uq_turns_session_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("roleplay_sessions.id", ondelete="CASCADE"))
    # 시나리오 재시드 시 에피소드가 교체되므로 함께 정리 (리포트/추이는 세션에 남는다)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer)
    question_type: Mapped[str] = mapped_column(String(20), default="initial")  # initial | followup | pressure
    question_text: Mapped[str] = mapped_column(Text)
    character_id: Mapped[str] = mapped_column(String(50))
    # 직전 답변에 대한 상대의 반응 — 질문 전에 재생된다 (챗봇 탈피의 핵심)
    reaction_text: Mapped[str] = mapped_column(Text, default="")
    # 반응하는 인물 — 직전 질문의 화자 (에피소드 전환 시 질문 화자와 다를 수 있음)
    reaction_character_id: Mapped[str] = mapped_column(String(50), default="")
    response_text: Mapped[str] = mapped_column(Text, default="")
    stt_source: Mapped[str] = mapped_column(String(20), default="")  # webspeech | whisper | text
    response_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    audio_path: Mapped[str] = mapped_column(String(500), default="")
    # 클라이언트 MediaPipe 집계: {front_gaze_ratio, gaze_off_count, avg_shoulder_tilt_deg,
    #                            head_down_ratio, posture_sway, frames}
    nonverbal_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    asked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session: Mapped["RoleplaySession"] = relationship(back_populates="turns")
    episode: Mapped["Episode"] = relationship()


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    __table_args__ = (
        # 분석 재시도가 결과를 이중으로 쌓는 것을 막는 마지막 방어선 (재시도 시 기존 행 삭제 전제)
        UniqueConstraint("session_id", "turn_id", "fit_type", name="uq_analysis_turn_fit"),
        # SQLite UNIQUE는 NULL을 서로 다른 값으로 보므로 세션 레벨(turn_id IS NULL)은 부분 인덱스로 강제
        Index(
            "uq_analysis_session_fit", "session_id", "fit_type",
            unique=True, sqlite_where=text("turn_id IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("roleplay_sessions.id", ondelete="CASCADE"))
    turn_id: Mapped[int | None] = mapped_column(
        ForeignKey("turns.id", ondelete="CASCADE"), nullable=True
    )  # null = 세션 레벨
    fit_type: Mapped[FitType] = mapped_column(Enum(FitType))
    raw_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0~100
    # 점수 산식 버전 — 산식 변경 후에도 백분위·추이 비교가 동일 표본 내에서 이뤄지도록
    engine_version: Mapped[str] = mapped_column(String(20), default="1")
    # 근거 구간: [{turn_id, turn_order, observed, interpretation, suggestion}]
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("roleplay_sessions.id", ondelete="CASCADE"), unique=True
    )
    total_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)  # 백분위 계산용
    engine_version: Mapped[str] = mapped_column(String(20), default="1")
    # {response: {score, summary}, voice: ..., eye: ..., posture: ...}
    fit_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    improvements: Mapped[list] = mapped_column(JSON, default=list)
    # [{turn_order, fit_type, quote, observed, interpretation, suggestion}]
    evidence_segments: Mapped[list] = mapped_column(JSON, default=list)
    # 오늘의 한 문장: {sentence(따라 말할 처방 문장), fit_type, context(왜 이 문장인지)}
    headline: Mapped[dict] = mapped_column(JSON, default=dict)
    # 코치와 다시 쓰기: {turn_order, episode_title, quote, items: [{label, sentence, covered}]}
    rebuild: Mapped[dict] = mapped_column(JSON, default=dict)
    # 말하기 데이터: {total_syllables, banned_count, recommended_count, formal_pct, ...}
    speech_stats: Mapped[dict] = mapped_column(JSON, default=dict)
    # 하루의 결말 (수행도 분기): {level, label, character_id, text}
    day_ending: Mapped[dict] = mapped_column(JSON, default=dict)
    # 심층 교차 분석: {delivery(담화 구조), composure(압박 내성), adaptation(적응 곡선)}
    deep_analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped["RoleplaySession"] = relationship(back_populates="report")


class SurveyResponse(Base):
    """리포트 후 만족도 설문 — PRD KPI 3종 (이해도 · 인간다움/공감 · 개인화 체감)."""
    __tablename__ = "survey_responses"
    __table_args__ = (
        CheckConstraint("q_clarity BETWEEN 1 AND 5", name="ck_survey_clarity"),
        CheckConstraint("q_empathy BETWEEN 1 AND 5", name="ck_survey_empathy"),
        CheckConstraint("q_personalization BETWEEN 1 AND 5", name="ck_survey_personalization"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("roleplay_sessions.id", ondelete="CASCADE"), unique=True
    )
    q_clarity: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 왜/어떻게가 명확했나
    q_empathy: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 인간다움/공감
    q_personalization: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 내 상황에 맞았나
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditEvent(Base):
    """운영 감사 로그 — 초기화·내보내기 등 파괴적/유출성 행위 기록."""
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # null = 무인증 운영 기간
    action: Mapped[str] = mapped_column(String(50))  # exhibition_reset | export_csv | ...
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---- 기관 대시보드용 골격 (추후 확장) ----

class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(50), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200))
    last_ping_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_reset_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AnonymousId(Base):
    """체험 코드 (F-SFIWUO) — 개인정보 없이 client_key를 코드로 이어주는 매핑.

    코드만 알면 다른 기기/재방문에서도 연습 기록(추이)을 이어갈 수 있다.
    이메일·이름 등 식별 정보는 저장하지 않는다.
    """
    __tablename__ = "anonymous_ids"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # 한 client_key에 코드가 중복 발급되지 않도록 DB 수준에서 보장 (동시 요청 대비)
    client_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
