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
    # 브리핑용 에피소드 상세: [{title, situation, intent, points, character_id, modes}]
    episodes: list = []


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
    # 직전 답변에 대한 상대의 반응 — 프론트는 질문 TTS 전에 이것을 먼저 재생한다
    reaction_text: str = ""
    reaction_character_id: str = ""
    virtual_time: str = ""  # 에피소드 가상 시각 (하루 프레이밍)

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
    longest_off_sec: float = 0.0  # 최장 연속 시선 이탈
    blink_per_min: float = 0.0  # 깜빡임 빈도 (긴장 관찰 지표 — 감점 없음)
    blink_base_per_min: float | None = None  # 브리핑 중 기저선 — 깜빡임 동역학의 개인 기준
    gaze_off_dir: str | None = None  # down | up | left | right
    tilt_drift_deg: float = 0.0  # 후반-전반 어깨 기울기 변화
    front_drift_pct: float = 0.0  # 후반-전반 정면 응시 변화 (%p)
    smile_ratio: float = 0.0  # 미소 표현 비율 (관찰 지표)
    smile_duchenne_ratio: float | None = None  # 미소 중 눈 참여(진정성 미소 근사) — 표본 부족 시 null
    expr_recover_sec: float = 0.0  # 긴장 표정 에피소드 평균 지속 초 (표정 복구 — 교차 분석 재료)
    head_roll_deg: float = 0.0  # 고개 갸웃 평균 편차
    mouth_press_ratio: float = 0.0  # 입술 압축(긴장) 비율 — 관찰 지표, 감점 없음
    brow_down_ratio: float = 0.0  # 찡그림 비율 — 관찰 지표
    hand_face_sec: float = 0.0  # 손-얼굴 터치 누적 초 (무의식 습관)
    arm_cross_ratio: float = 0.0  # 팔짱 자세 비율 (무의식 습관)
    gaze_dirs: dict = {}  # 시선 이탈 방향 분포 {down,up,left,right: frames}
    iris_ratio: float = 0.0  # 홍채(눈-머리 보상) 추적 가동 비율
    listening_front_ratio: float | None = None  # 듣기 중 정면 응시율
    answering_front_ratio: float | None = None  # 말하기 중 정면 응시율
    contact_bout_mean_sec: float = 0.0  # 연속 응시 평균 길이 (응시 리듬)
    onset_aversion_sec: float = 0.0  # 답변 개시 유예 구간 회피 (감점 제외 근거)
    gaze_zones: list[int] = []  # 3×3 시선 존 (위/중/아래 × 좌/중/우)
    # 교차 분석 타임라인: [{t, front, press, tilt}] — 2초 빈당 집계 숫자만
    # (press = 긴장 표정 비율: 입술 압축 ∥ 찡그림)
    timeline: list[dict] = []
    gaze_stability: float = 0.0  # 정면 내 시선 흔들림 표준편차 (스캐닝 습관)
    gaze_recover_sec: float = 0.0  # 이탈 후 정면 복귀 평균 시간 (회복 탄력)
    lean_drift_pct: float = 0.0  # 후반 어깨폭 변화 % (+ 다가옴 / - 물러남)
    # ---- Posture 마스터 ③: 3D 월드·제스처·전신 (관찰 지표 — 감점 없음) ----
    world_ratio: float = 0.0  # 3D 월드(거리 불변) 기울기 가동 비율
    gesture_energy: float | None = None  # 손목 평균 속도 m/s (표본 5초 미만 보류)
    gesture_active_ratio: float | None = None  # 움직인(>0.1m/s) 표본 비율 — 경직 감지
    hands_visible_ratio: float = 0.0  # 손목 가시 프레임 비율 (경직 판정 게이트)
    hip_sway: float | None = None  # 골반 좌우 흔들림(어깨너비 정규화 std) — 체중 이동
    lower_visible_ratio: float = 0.0  # 무릎 가시 비율 — 스탠딩/데스크 구분
    guard_dropped_frames: int = 0  # 다인 가드 제외 프레임 (측정 투명성)
    # ---- 경청 자세 (듣기 페이즈 — 관찰 지표) ----
    nod_count: int = 0  # 듣는 동안 끄덕임 근사 (진폭 게이트, 긍정 신호 전용)
    listen_sec: float = 0.0  # 듣기 페이즈 누적 초 (경청 판정 표본 게이트)
    listen_lean_pct: float | None = None  # 기준 어깨폭 대비 듣기 리닝 % (+전진/-후퇴)
    calibrated: bool = False  # 정면 기준 캘리브레이션 적용 여부
    tips: list[str] = []  # 턴 중 발생한 실시간 코칭 (S-JKEYHS 리포트 연동)


class ResponseIn(BaseModel):
    text: str = ""
    stt_source: str = "webspeech"  # webspeech | text
    duration_ms: int = 0
    nonverbal: NonverbalIn | None = None


class TurnSignalsOut(BaseModel):
    """제출 직후의 경량 즉시 신호 — 미러 라이브 오라(Response 축)용.
    전체 분석은 기존대로 세션 종료 후 파이프라인이 수행한다."""
    case: str  # excellent | covered | missing | short | risky
    coverage: float
    risk_hits: int


class NextTurnOut(BaseModel):
    finished: bool
    next_turn: TurnOut | None = None
    turn_signals: TurnSignalsOut | None = None


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
    rebuild: dict = {}  # 코치와 다시 쓰기 {episode_title, quote, items}
    speech_stats: dict = {}  # 말하기 데이터 요약
    percentile_top: int | None = None  # 현장 체험자 상위 N%
    turn_breakdown: list = []  # 턴별 점수 [{turn_order, question_type, scores}]
    day_ending: dict = {}  # 하루의 결말 (수행도 분기): {level, label, character_id, text}
    deep_analysis: dict = {}  # 심층 교차 분석 {delivery, composure, adaptation}
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
