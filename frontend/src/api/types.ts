export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  speech_style: string;
  tts: { rate: number; pitch: number };
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
