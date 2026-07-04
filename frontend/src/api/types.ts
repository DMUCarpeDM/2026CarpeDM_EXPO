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
  question_type: 'initial' | 'followup' | 'pressure';
  question_text: string;
  character_id: string;
  episode_id: number;
  episode_title: string;
}

export interface RoleplaySession {
  id: number;
  status: string;
  mode: number;
  difficulty: 'basic' | 'pressure';
  scenario: Scenario;
  current_turn: Turn | null;
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
  gaze_off_dir: 'down' | 'up' | 'left' | 'right' | null; // 지배적 이탈 방향
  tilt_drift_deg: number; // 후반-전반 어깨 기울기 변화 (자세 붕괴 추세)
  front_drift_pct: number; // 후반-전반 정면 응시 변화 (%p)
  smile_ratio: number; // 미소 표현 프레임 비율
  head_roll_deg: number; // 고개 갸웃(눈선 각도) 평균 편차
  calibrated: boolean; // 정면 기준 캘리브레이션 적용 여부
  tips: string[]; // 턴 중 발생한 실시간 코칭 문구
}

export interface NextTurnResult {
  finished: boolean;
  next_turn: Turn | null;
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
}
