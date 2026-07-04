"""전체 도메인 모델.

세션 상태 흐름: ready → in_progress → analyzing → completed (중단 시 aborted)
4-Fit: response / voice / eye / posture
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


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

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sessions: Mapped[list["RoleplaySession"]] = relationship(back_populates="user")


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("roleplay_sessions.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
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

    episodes: Mapped[list["Episode"]] = relationship(back_populates="scenario", order_by="Episode.order")


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    situation: Mapped[str] = mapped_column(Text, default="")
    character_id: Mapped[str] = mapped_column(String(50))  # scenario.characters[].id
    # 포함 모드: "5,10" 또는 "10" (10분 모드 전용)
    modes: Mapped[str] = mapped_column(String(20), default="5,10")
    initial_question: Mapped[str] = mapped_column(Text)
    question_intent: Mapped[str] = mapped_column(Text, default="")
    # [{id, label, keywords: [...], followup, weight}] — 누락 항목이 후속 질문 트리거
    checklist: Mapped[list] = mapped_column(JSON, default=list)
    # 압박 난이도용 후속 질문 [{text, trigger: checklist_id | "any"}]
    pressure_questions: Mapped[list] = mapped_column(JSON, default=list)
    max_turns: Mapped[int] = mapped_column(Integer, default=2)

    scenario: Mapped["Scenario"] = relationship(back_populates="episodes")


class RoleplaySession(Base):
    __tablename__ = "roleplay_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 익명 연속성: 프론트 localStorage UUID (QR/익명 ID 연동의 기반)
    client_key: Mapped[str] = mapped_column(String(64), default="", index=True)
    mode: Mapped[int] = mapped_column(Integer, default=5)  # 5 | 10 (분)
    difficulty: Mapped[str] = mapped_column(String(20), default="basic")  # basic | pressure
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.ready)
    # {stage: str, pct: int} — 분석 진행률 (S-TTQEUS)
    analysis_progress: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User | None"] = relationship(back_populates="sessions")
    scenario: Mapped["Scenario"] = relationship()
    turns: Mapped[list["Turn"]] = relationship(back_populates="session", order_by="Turn.order")
    report: Mapped["Report | None"] = relationship(back_populates="session", uselist=False)


class Turn(Base):
    __tablename__ = "turns"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("roleplay_sessions.id"))
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"))
    order: Mapped[int] = mapped_column(Integer)
    question_type: Mapped[str] = mapped_column(String(20), default="initial")  # initial | followup | pressure
    question_text: Mapped[str] = mapped_column(Text)
    character_id: Mapped[str] = mapped_column(String(50))
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

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("roleplay_sessions.id"))
    turn_id: Mapped[int | None] = mapped_column(ForeignKey("turns.id"), nullable=True)  # null = 세션 레벨
    fit_type: Mapped[FitType] = mapped_column(Enum(FitType))
    raw_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0~100
    # 근거 구간: [{turn_id, turn_order, observed, interpretation, suggestion}]
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("roleplay_sessions.id"), unique=True)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    # {response: {score, summary}, voice: ..., eye: ..., posture: ...}
    fit_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    improvements: Mapped[list] = mapped_column(JSON, default=list)
    # [{turn_order, fit_type, quote, observed, interpretation, suggestion}]
    evidence_segments: Mapped[list] = mapped_column(JSON, default=list)
    # 오늘의 한 문장: {sentence(따라 말할 처방 문장), fit_type, context(왜 이 문장인지)}
    headline: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped["RoleplaySession"] = relationship(back_populates="report")


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
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("institutions.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    last_ping_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_reset_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AnonymousId(Base):
    __tablename__ = "anonymous_ids"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("institutions.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
