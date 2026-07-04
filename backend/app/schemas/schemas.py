from pydantic import BaseModel, EmailStr, Field


# ---- auth ----

class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}


# ---- scenarios ----

class ScenarioOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    world_setting: dict
    characters: list
    episode_titles: dict[str, list[str]] = {}  # {"5": [...], "10": [...]}


# ---- sessions / turns ----

class ConsentIn(BaseModel):
    agreed: bool = False
    storage_policy: str = "none"  # none | anonymous | account


class SessionCreateIn(BaseModel):
    scenario_slug: str | None = None  # 없으면 기본(첫) 시나리오
    mode: int = Field(default=5, description="5 | 10 (분)")
    difficulty: str = Field(default="basic", pattern="^(basic|pressure)$")
    client_key: str = ""
    consent: ConsentIn = ConsentIn()


class TurnOut(BaseModel):
    id: int
    order: int
    question_type: str
    question_text: str
    character_id: str
    episode_id: int
    episode_title: str = ""

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: int
    status: str
    mode: int
    difficulty: str
    scenario: ScenarioOut
    current_turn: TurnOut | None = None


class NonverbalIn(BaseModel):
    front_gaze_ratio: float = 0.0
    gaze_off_count: int = 0
    avg_shoulder_tilt_deg: float = 0.0
    head_down_ratio: float = 0.0
    posture_sway: float = 0.0
    frames: int = 0


class ResponseIn(BaseModel):
    text: str = ""
    stt_source: str = "webspeech"  # webspeech | text
    duration_ms: int = 0
    nonverbal: NonverbalIn | None = None


class NextTurnOut(BaseModel):
    finished: bool
    next_turn: TurnOut | None = None


class ProgressOut(BaseModel):
    status: str
    stage: str = ""
    pct: int = 0


# ---- report ----

class ReportOut(BaseModel):
    session_id: int
    total_score: float
    fit_scores: dict
    strengths: list
    improvements: list
    evidence_segments: list
    headline: dict = {}  # 오늘의 한 문장 {sentence, fit_type, context}
    turn_breakdown: list = []  # 턴별 점수 [{turn_order, question_type, scores}]
    analysis_ms: int
    mode: int
    difficulty: str
    previous: dict | None = None  # 직전 세션 비교 {total_score, fit_scores}


# ---- admin ----

class AdminMetricsOut(BaseModel):
    sessions_total: int
    sessions_completed: int
    completion_rate: float
    retry_rate: float
    avg_total_score: float | None
    avg_analysis_ms: float | None
    avg_fit_scores: dict
