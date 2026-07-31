from pydantic import BaseModel, EmailStr, Field, model_validator


# ---- auth ----

class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""
    # 초대 코드 가입 (S-B2B-ORG) — 있으면 가입과 동시에 기관 소속·역할이 결정된다
    invite_code: str = Field(default="", max_length=32)
    # 직무 트랙 (S-B2B-PACK) — NFC 없는 웹앱은 가입 시 직무를 직접 고른다.
    # 초대 코드 없이도 유효(개인 연습 사용자도 직무 기반 시나리오 추천을 받는다).
    job_role: str = Field(default="", max_length=30)


class JobRoleIn(BaseModel):
    """본인 직무 변경 (PATCH /auth/me) — 웹앱 프로필의 직무 선택."""
    job_role: str = Field(min_length=1, max_length=30)


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
    institution_id: int | None = None
    org_role: str = ""
    job_role: str = ""

    model_config = {"from_attributes": True}


# ---- orgs (S-B2B-ORG) ----

class OrgCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9\-]+$")


class InviteOut(BaseModel):
    code: str
    org_role: str
    is_active: bool

    model_config = {"from_attributes": True}


class OrgOut(BaseModel):
    id: int
    name: str
    code: str

    model_config = {"from_attributes": True}


class OrgDetailOut(OrgOut):
    """관리자/매니저용 상세 — 초대 코드 포함 (수강생에게는 노출하지 않는다)."""
    invites: list[InviteOut] = []
    member_count: int = 0


class OrgJoinIn(BaseModel):
    invite_code: str = Field(min_length=1, max_length=32)
    job_role: str = Field(default="", max_length=30)


class OrgMemberOut(BaseModel):
    id: int
    email: str
    name: str
    org_role: str
    job_role: str
    session_count: int = 0
    last_session_at: str | None = None


class OrgSessionOut(BaseModel):
    """기관 대시보드 세션 행 — 읽기 전용. 점수 표기 방침(S-B2B-SCORE)에 따라
    관리자에게는 원점수와 등급을 함께 준다 (수강생 화면은 등급만)."""
    id: int
    user_id: int | None = None
    user_name: str = ""
    user_email: str = ""
    job_role: str = ""
    scenario_title: str = ""
    mode: int = 5
    difficulty: str = "basic"
    status: str = ""
    started_at: str = ""
    total_score: float | None = None
    grade: str | None = None  # 우수 | 양호 | 보통 | 연습 필요 (리포트 있을 때만)
    fit_scores: dict = {}


class OrgSessionListOut(BaseModel):
    total: int
    items: list[OrgSessionOut]


# ---- NFC (S-B2B-NFC) ----

class NfcIssueIn(BaseModel):
    uid: str = Field(min_length=4, max_length=32, pattern=r"^[0-9A-Fa-f:\-]+$")
    job_role: str = Field(min_length=1, max_length=30)
    scenario_slug: str = Field(default="", max_length=50)
    institution_id: int | None = None


class NfcCardOut(BaseModel):
    uid: str
    job_role: str
    scenario_slug: str
    status: str
    issued_count: int

    model_config = {"from_attributes": True}


class NfcResolveIn(BaseModel):
    uid: str = Field(min_length=4, max_length=32)


class NfcResolveOut(BaseModel):
    uid: str
    job_role: str
    scenario_slug: str  # 발급 시 지정이 없으면 직무 기본 팩 슬러그
    job_role_label: str = ""


class NfcTapOut(BaseModel):
    """PC/SC 브리지의 마지막 태그 이벤트 — 프론트는 since(단조 증가 seq)로 폴링한다."""
    seq: int = 0
    uid: str = ""
    reader: str = ""  # kiosk | mirror
    at: float = 0.0


class NfcSimulateTapIn(BaseModel):
    uid: str = Field(min_length=4, max_length=32)
    reader: str = Field(default="mirror", pattern="^(kiosk|mirror)$")


# ---- 세션 클레임 (S-B2B-CLAIM: 영수증 QR → 계정 귀속) ----

class SessionClaimIn(BaseModel):
    claim_token: str = Field(min_length=8, max_length=64)


class SessionClaimOut(BaseModel):
    session_id: int
    scenario_title: str = ""
    started_at: str = ""
    total_score: float | None = None
    grade: str | None = None
    already_claimed: bool = False  # 같은 사용자가 이미 귀속한 경우 (멱등)


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
    # ---- 시나리오 팩 메타 (S-B2B-PACK) — NFC 없는 웹앱의 '직무 선택' 축 ----
    job_role: str = ""  # cafe_crew | cs_agent | office_admin
    domain: str = ""  # office | service
    brand: str = ""  # 무대 브랜드 (예: cafe-ondo)


# ---- sessions / turns ----

class ConsentIn(BaseModel):
    agreed: bool = False
    storage_policy: str = "none"  # none | anonymous | account


class SessionCreateIn(BaseModel):
    scenario_slug: str | None = None  # 없으면 기본(첫) 시나리오
    selected_episode_id: int | None = Field(default=None, gt=0)
    mode: int = Field(default=5, description="5 | 10 (분)")
    difficulty: str = Field(default="basic", pattern="^(basic|pressure|ultra_pressure)$")
    client_key: str = ""
    consent: ConsentIn = ConsentIn()
    # ---- B2B 확장 (S-B2B-SESSION / S-B2B-NFC) ----
    # 직무 트랙 — 수동 카드 선택 폴백이나 웹앱 연습에서 직접 지정
    job_role: str = Field(default="", max_length=30)
    # 미러 NFC 시작: 태그된 카드 uid — 카드의 직무·시나리오가 세션에 스탬프된다
    nfc_uid: str = Field(default="", max_length=32)


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
    selected_episode_id: int | None = None
    scenario: ScenarioOut
    current_turn: TurnOut | None = None
    # 세션 접근 능력 토큰 — 이후 세션 조회 시 X-Session-Token 헤더로 되돌려준다 (생성 응답에만 값)
    access_token: str = ""


class HistoryTurnOut(TurnOut):
    """복구용 턴 이력 — 이미 답한 턴의 응답 텍스트 포함."""
    response_text: str = ""


class SessionResumeOut(SessionOut):
    """세션 복구 응답 (새로고침·크래시 후 재진입) — 진행 이력과 경과 시간 포함."""
    history: list[HistoryTurnOut] = []
    elapsed_sec: int = 0


# NonverbalIn 살균 기준 (클래스 밖 상수 — pydantic 필드/프라이빗 속성 처리와 분리)
_NV_RATIO_FIELDS = (
    "front_gaze_ratio", "head_down_ratio", "smile_ratio", "smile_duchenne_ratio",
    "mouth_press_ratio", "brow_down_ratio", "arm_cross_ratio", "iris_ratio",
    "iris_v_ratio", "listening_front_ratio", "answering_front_ratio", "world_ratio",
    "gesture_active_ratio", "hands_visible_ratio", "lower_visible_ratio",
    "gesture_two_handed_ratio", "brow_raise_ratio",
)
_NV_RANGE_FIELDS = {
    "gaze_off_count": (0, 100_000), "frames": (0, 1_000_000),
    "guard_dropped_frames": (0, 1_000_000), "nod_count": (0, 10_000),
    "avg_shoulder_tilt_deg": (0.0, 90.0), "head_roll_deg": (0.0, 90.0),
    "tilt_drift_deg": (-90.0, 90.0), "posture_sway": (0.0, 10.0),
    "gaze_stability": (0.0, 10.0), "hip_sway": (0.0, 10.0),
    "longest_off_sec": (0.0, 3600.0), "expr_recover_sec": (0.0, 3600.0),
    "hand_face_sec": (0.0, 3600.0), "contact_bout_mean_sec": (0.0, 3600.0),
    "contact_streak_max_sec": (0.0, 3600.0), "onset_aversion_sec": (0.0, 3600.0),
    "gaze_recover_sec": (0.0, 3600.0), "listen_sec": (0.0, 3600.0),
    "answer_offset_sec": (0.0, 3600.0),
    "blink_per_min": (0.0, 300.0), "blink_base_per_min": (0.0, 300.0),
    "front_drift_pct": (-100.0, 100.0), "lean_drift_pct": (-100.0, 100.0),
    "listen_lean_pct": (-100.0, 100.0),
    "gesture_energy": (0.0, 10.0), "gesture_amplitude": (0.0, 300.0),
    "head_motion": (0.0, 10.0), "sample_ms": (40, 1000),
}
_NV_TIMELINE_MAX = 150  # 10분 모드(2초 빈 ≈ 300초+여유)도 덮는 상한
_NV_TIPS_MAX = 20


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
    iris_v_ratio: float = 0.0  # 수직 홍채 상하 판정 가동 비율 (능력 플래그)
    listening_front_ratio: float | None = None  # 듣기 중 정면 응시율
    answering_front_ratio: float | None = None  # 말하기 중 정면 응시율
    contact_bout_mean_sec: float = 0.0  # 연속 응시 평균 길이 (응시 리듬)
    contact_streak_max_sec: float = 0.0  # 최장 연속 응시 (아이컨택 스트릭 — 긍정 지표)
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
    sample_ms: int = 200  # 측정 샘플링 주기 — 프레임 수를 시간으로 해석할 때의 기준
    answer_offset_sec: float | None = None  # 턴 시작→답변 녹음 시작 초 (moments 시계 정합)
    calibrated: bool = False  # 정면 기준 캘리브레이션 적용 여부
    # ---- 표현 동작 확장 ⑤: 표정 생동감·제스처 크기/양손·머리 흔들림 (관찰 지표 — 감점 없음) ----
    brow_raise_ratio: float = 0.0  # 눈썹 올림(browInnerUp/OuterUp) 프레임 비율 — 표정 생동감
    gesture_amplitude: float | None = None  # 손목-어깨중심 평균 거리(cm, 월드) — 제스처 크기, 표본 부족 시 null
    gesture_two_handed_ratio: float | None = None  # 양손 동시 활동 비율 — 양손 강조, 표본 부족 시 null
    head_motion: float | None = None  # 말할 때 코 위치 표준편차(어깨너비 정규화) — 머리 흔들림, 표본 부족 시 null
    tips: list[str] = []  # 턴 중 발생한 실시간 코칭 (S-JKEYHS 리포트 연동)

    # ---- 서버측 살균 (C6 완화) ----
    # 원본 영상이 서버로 오지 않는 설계라 값 자체의 재계산 검증은 불가능하다.
    # 대신 물리적으로 가능한 범위를 강제해 (a) 위조 값의 영향 반경을 상식선으로
    # 제한하고 (b) 리스트 페이로드 폭주(DB 부풀리기)를 차단한다.
    # 거부(422)가 아니라 클램프인 이유: 클라이언트 집계 버그 하나가 전시장에서
    # 턴 제출을 통째로 죽여선 안 된다 — 지표는 관찰용, 제출은 생존이 우선.
    @model_validator(mode="after")
    def _sanitize(self):
        for name in _NV_RATIO_FIELDS:
            value = getattr(self, name)
            if value is not None:
                setattr(self, name, min(1.0, max(0.0, value)))
        for name, (lo, hi) in _NV_RANGE_FIELDS.items():
            value = getattr(self, name)
            if value is not None:
                setattr(self, name, min(hi, max(lo, value)))
        if self.gaze_off_dir not in (None, "down", "up", "left", "right"):
            self.gaze_off_dir = None
        # 시선 방향 분포·존은 형태가 어긋나면 통째로 버린다 (부분 신뢰 없음)
        known_dirs = {"down", "up", "left", "right"}
        if not (isinstance(self.gaze_dirs, dict) and set(self.gaze_dirs) <= known_dirs
                and all(isinstance(v, int) and 0 <= v <= 1_000_000 for v in self.gaze_dirs.values())):
            self.gaze_dirs = {}
        if not (len(self.gaze_zones) == 9
                and all(isinstance(z, int) and 0 <= z <= 1_000_000 for z in self.gaze_zones)):
            self.gaze_zones = []
        # 타임라인: 빈 수 상한 + 알려진 키만 + 숫자 아니면 null (moments의 타입 가드와 동일 계약)
        clean_bins = []
        for bin_ in self.timeline[:_NV_TIMELINE_MAX]:
            if not isinstance(bin_, dict):
                continue
            clean = {}
            for key in ("t", "front", "press", "tilt"):
                v = bin_.get(key)
                clean[key] = v if isinstance(v, (int, float)) and not isinstance(v, bool) else None
            if clean["t"] is not None:
                clean_bins.append(clean)
        self.timeline = clean_bins
        self.tips = [t[:300] for t in self.tips[:_NV_TIPS_MAX] if isinstance(t, str)]
        return self


class ResponseIn(BaseModel):
    text: str = Field(default="", max_length=4000)  # 발화 1턴 상한 — 무한 저장·DoS 차단
    stt_source: str = "webspeech"  # webspeech | text
    duration_ms: int = 0
    nonverbal: NonverbalIn | None = None


class TurnSignalsOut(BaseModel):
    """제출 직후의 경량 즉시 신호 — 미러 라이브 오라(Response 축)용.
    전체 분석은 기존대로 세션 종료 후 파이프라인이 수행한다."""
    case: str  # excellent | covered | missing | short | risky
    coverage: float
    risk_hits: int
    # 감정 상태 머신 (S-B2B-EMOTION): {state, label, temperature, eased} —
    # 프론트 온도 게이지·표정 연출용. 감정 프로파일이 없는 시나리오는 빈 dict.
    emotion: dict = {}


class NextTurnOut(BaseModel):
    finished: bool
    next_turn: TurnOut | None = None
    turn_signals: TurnSignalsOut | None = None


class ProgressOut(BaseModel):
    status: str
    stage: str = ""
    pct: int = 0


class SurveyIn(BaseModel):
    """리포트 후 만족도 설문 (PRD KPI: 이해도·공감·개인화 체감, 각 1~5점)."""
    q_clarity: int | None = Field(default=None, ge=1, le=5)
    q_empathy: int | None = Field(default=None, ge=1, le=5)
    q_personalization: int | None = Field(default=None, ge=1, le=5)
    comment: str = ""


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
    # ---- B2B 확장 ----
    grade: str | None = None  # 점수 표기 방침(S-B2B-SCORE) — 4단계 등급
    claim_url: str = ""  # 영수증 QR 클레임 링크 (S-B2B-CLAIM) — 프론트가 QR로 렌더
    coaching: list = []  # Before→After 코칭 카드 [{quote, issue, suggestion, manual_ref}]
    emotion_journey: dict = {}  # 감정 상태 머신 여정 {final_state, final_temperature, history}


# ---- admin ----

class AdminMetricsOut(BaseModel):
    sessions_total: int
    sessions_completed: int
    completion_rate: float
    retry_rate: float
    second_attempt_rate: float  # 2차 수행률 (KPI) — attempt_no 기반
    avg_total_score: float | None
    avg_analysis_ms: float | None
    avg_fit_scores: dict
    # 관측성: 폴백 발동률·측정 가동률 — 조용한 품질 강등의 현장 감시
    observability: dict = {}
    avg_improvement: float | None = None  # 1차→2차 평균 점수 개선 (KPI)
    survey_avg: dict = {}  # {clarity, empathy, personalization} 평균 (KPI 설문)
