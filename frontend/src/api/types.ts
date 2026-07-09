export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  speech_style: string;
  tts: { rate: number; pitch: number };
}

export interface EpisodeBriefing {
  title: string;
  situation: string;
  intent: string;
  points: string[];
  character_id: string;
  modes: string;
}

export interface Scenario {
  id: number;
  slug: string;
  title: string;
  description: string;
  world_setting: {
    company: string;
    service: string;
    situation: string;
    user_role: string;
  };
  characters: Character[];
  episode_titles: Record<string, string[]>;
  episodes: EpisodeBriefing[];
}

export interface Turn {
  id: number;
  order: number;
  question_type: 'initial' | 'followup' | 'pressure' | 'deepening'; // deepening = 잘한 답에도 이어지는 장면 전개 질문
  question_text: string;
  character_id: string;
  episode_id: number;
  episode_title: string;
  reaction_text: string; // 직전 답변에 대한 상대의 반응 — 질문 TTS 전에 재생
  reaction_character_id: string; // 반응하는 인물 (직전 질문의 화자)
  virtual_time: string; // 에피소드 가상 시각 "09:04" — 하루 프레이밍
}

export interface RoleplaySession {
  id: number;
  status: string;
  mode: number;
  difficulty: 'basic' | 'pressure';
  scenario: Scenario;
  current_turn: Turn | null;
  access_token: string; // 세션 능력 토큰 (생성 응답에만 값, 복구 응답은 빈 문자열)
}

export interface NonverbalMetrics {
  front_gaze_ratio: number;
  gaze_off_count: number;
  avg_shoulder_tilt_deg: number;
  head_down_ratio: number;
  posture_sway: number;
  frames: number;
  longest_off_sec: number; // 최장 연속 시선 이탈
  blink_per_min: number; // 깜빡임 빈도 (긴장 지표)
  blink_base_per_min: number | null; // 브리핑 중 깜빡임 기저선 — 급증 판정의 개인 기준 (표본 10초 미만 null)
  gaze_off_dir: 'down' | 'up' | 'left' | 'right' | null; // 지배적 이탈 방향
  tilt_drift_deg: number; // 후반-전반 어깨 기울기 변화 (자세 붕괴 추세)
  front_drift_pct: number; // 후반-전반 정면 응시 변화 (%p)
  smile_ratio: number; // 미소 표현 프레임 비율
  smile_duchenne_ratio: number | null; // 미소 중 눈 참여 비율(진정성 미소 근사) — 미소 2초 미만이면 null
  expr_recover_sec: number; // 긴장 표정(압축·찡그림) 에피소드 평균 지속 초 — 표정 복구, 교차 분석 재료
  head_roll_deg: number; // 고개 갸웃(눈선 각도) 평균 편차
  mouth_press_ratio: number; // 입술 압축(긴장) 프레임 비율 — 관찰 지표
  brow_down_ratio: number; // 찡그림 프레임 비율 — 관찰 지표
  hand_face_sec: number; // 손-얼굴 터치 누적 초 (무의식 습관)
  arm_cross_ratio: number; // 팔짱 자세 프레임 비율 (무의식 습관)
  gaze_dirs: Record<'down' | 'up' | 'left' | 'right', number>; // 시선 이탈 방향 분포
  iris_ratio: number; // 홍채(눈-머리 보상) 추적 가동 프레임 비율
  iris_v_ratio: number; // 수직 홍채가 상하 판정에 쓰인 프레임 비율 (능력 플래그)
  listening_front_ratio: number | null; // 듣기(상대 TTS) 중 정면 응시율
  answering_front_ratio: number | null; // 말하기(답변) 중 정면 응시율
  contact_bout_mean_sec: number; // 연속 응시 구간 평균 길이 (응시 리듬)
  onset_aversion_sec: number; // 답변 개시 2.5초 유예 구간의 시선 회피 (감점 제외 근거)
  gaze_zones: number[]; // 3×3 시선 존 분포 (위/중/아래 × 좌/중/우)
  // 교차 분석용 2초 빈 타임라인 — 빈당 집계 숫자만 (영상·좌표 미전송)
  timeline: { t: number; front: number | null; press: number | null; tilt: number | null }[]; // press=긴장(입술 압축∥찡그림)
  gaze_stability: number; // 정면 내 시선 흔들림 표준편차 (스캐닝 습관)
  gaze_recover_sec: number; // 이탈 후 정면 복귀 평균 시간 (회복 탄력)
  lean_drift_pct: number; // 후반 어깨폭 변화 % (+는 다가옴, -는 물러남)
  // ---- Posture 마스터 ③: 3D 월드·제스처·전신 (관찰 지표) ----
  world_ratio: number; // 3D 월드 랜드마크(거리 불변) 기울기 가동 프레임 비율
  gesture_energy: number | null; // 손목 평균 속도 m/s (골반 원점 월드) — 표본 5초 미만 null
  gesture_active_ratio: number | null; // 움직인(>0.1m/s) 표본 비율 — 경직 감지 근거
  hands_visible_ratio: number; // 손목이 보인 프레임 비율 (경직 판정의 게이트)
  hip_sway: number | null; // 골반 중심 좌우 흔들림(어깨너비 정규화 std) — 체중 이동 습관
  lower_visible_ratio: number; // 무릎 가시 비율 — 서 있는 미러 vs 책상 웹 구분
  guard_dropped_frames: number; // 다인 가드로 자세 집계에서 제외된 프레임
  // ---- 경청 자세 (듣기 페이즈 — 관찰 지표) ----
  nod_count: number; // 듣는 동안 끄덕임 근사 횟수 (진폭 게이트, 긍정 신호 전용)
  listen_sec: number; // 듣기 페이즈 누적 초 — 경청 판정의 표본 게이트
  listen_lean_pct: number | null; // 기준 어깨폭 대비 듣기 중 전진(+)/후퇴(-) %
  sample_ms: number; // 측정 샘플링 주기 ms — 기본 200, 운영자 튜닝 가능 (§2.5)
  answer_offset_sec: number | null; // 턴 시작→답변 녹음 시작 초 (교차 분석 시계 정합)
  calibrated: boolean; // 정면 기준 캘리브레이션 적용 여부
  tips: string[]; // 턴 중 발생한 실시간 코칭 문구
}

export interface TurnSignals {
  case: 'excellent' | 'covered' | 'missing' | 'short' | 'risky';
  coverage: number;
  risk_hits: number;
}

export interface NextTurnResult {
  finished: boolean;
  next_turn: Turn | null;
  turn_signals: TurnSignals | null; // 라이브 오라(Response 축)용 경량 즉시 신호
}

export interface Progress {
  status: string;
  stage: string;
  pct: number;
}

export interface FitScore {
  score: number | null;
  label: string;
  summary: string;
  metrics?: { label: string; value: string }[]; // 세부 실측값 행
  // 시선 존 히트맵 (Eye 카드 전용): 3×3 비율 지도 (위/중/아래 × 좌/중/우), 표본 10초+
  gaze_map?: { zones: number[]; frames: number; comment: string };
}

export interface EvidenceSegment {
  turn_id: number;
  turn_order: number;
  fit_type: string;
  quote: string;
  observed: string;
  interpretation: string;
  suggestion: string;
}

export interface Headline {
  sentence: string;
  fit_type: string;
  context: string;
}

export interface Report {
  session_id: number;
  total_score: number;
  fit_scores: Record<string, FitScore>;
  strengths: string[];
  improvements: string[];
  evidence_segments: EvidenceSegment[];
  headline: Headline | Record<string, never>;
  rebuild: {
    turn_order?: number;
    episode_title?: string;
    quote?: string;
    items?: { label: string; sentence: string; covered: boolean }[];
  };
  speech_stats: {
    turns?: number;
    total_syllables?: number;
    banned_count?: number;
    banned_phrases?: string[];
    recommended_count?: number;
    formal_pct?: number | null;
    avg_speech_rate?: number | null;
    measurement?: { frames: number; audio_sec: number; level: string };
  };
  day_ending: {
    level?: 'high' | 'mid' | 'low';
    label?: string;
    character_id?: string;
    text?: string;
  };
  deep_analysis: {
    delivery?: {
      title: string;
      rows: { label: string; value: string }[];
      comment: string;
      confidence?: { level: string; n: number };
    };
    composure?: {
      title: string;
      level: string;
      rows: { label: string; value: string }[];
      comment: string;
      confidence?: { level: string; n: number };
    };
    adaptation?: {
      title: string;
      trend: 'up' | 'flat' | 'down';
      points: { turn_order: number; score: number }[];
      comment: string;
      confidence?: { level: string; n: number };
    };
    // 결정적 순간 — 시간 정렬 교차 감지 (그때 하던 말 인용 포함)
    moments?: {
      turn_order: number;
      at_sec: number;
      kinds: string[];
      composite: boolean;
      description: string;
      quote: string | null;
      pressure_context: boolean;
    }[];
    // 현장 코호트 백분위 (표본 20+에서만)
    cohort?: {
      title: string;
      rows: { fit: string; label: string; top_pct: number; n: number }[];
    };
    // 재방문 성장 델타
    growth?: { from: string; to: string; improved: boolean; comment: string };
  };
  percentile_top: number | null;
  turn_breakdown: {
    turn_order: number;
    question_type: string;
    episode_title: string;
    question: string;
    scores: Record<string, number>;
  }[];
  analysis_ms: number;
  mode: number;
  difficulty: string;
  previous: {
    session_id: number;
    total_score: number;
    fit_scores: Record<string, number | null>;
  } | null;
}

export interface AdminMetrics {
  sessions_total: number;
  sessions_completed: number;
  completion_rate: number;
  retry_rate: number;
  avg_total_score: number | null;
  avg_analysis_ms: number | null;
  avg_fit_scores: Record<string, number>;
  // 관측성 — 폴백 발동률·측정 가동률 (조용한 품질 강등 감시)
  observability?: {
    voice_turns: number;
    voice_estimated_turns: number;
    voice_alignment_rate: number | null;
    semantic_rescue_rate: number | null;
    iris_active_rate: number | null;
    world_3d_rate: number | null;
    guard_dropped_frames: number;
  };
}
