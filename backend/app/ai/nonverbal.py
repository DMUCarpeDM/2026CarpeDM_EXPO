"""Eye-Fit / Posture-Fit: 클라이언트 MediaPipe 집계 지표를 점수화 (S-FBTBXY, S-IPXYRD).

원본 영상은 서버로 전송하지 않고, 브라우저에서 계산한 집계값만 받는다
(개인정보 최소화 원칙 — 기본 미저장·지표 중심).

턴별 nonverbal_metrics 스키마:
  front_gaze_ratio: 0~1  정면 응시 프레임 비율
  gaze_off_count:   시선 이탈 횟수
  avg_shoulder_tilt_deg: 평균 어깨 기울기(도)
  head_down_ratio:  0~1  고개 숙임 프레임 비율
  posture_sway:     어깨 중심 x 표준편차(정규화)
  frames:           집계 프레임 수
"""
from app.ai.scoring import band_score, clamp, weighted_mean

FRONT_GAZE_BANDS = (0.65, 1.0, 0.15, 1.01)
GAZE_OFF_PER_MIN_BANDS = (0.0, 4.0, 0.0, 15.0)
SHOULDER_TILT_BANDS = (0.0, 6.0, 0.0, 20.0)
HEAD_DOWN_BANDS = (0.0, 0.2, 0.0, 0.7)
SWAY_BANDS = (0.0, 0.05, 0.0, 0.22)

MIN_FRAMES = 5  # 이보다 적으면 신뢰 불가로 미측정 처리


def score_eye(metrics: dict, duration_sec: float) -> float | None:
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    parts = [(band_score(metrics.get("front_gaze_ratio", 0.0), *FRONT_GAZE_BANDS), 0.7)]
    if duration_sec > 1:
        off_per_min = metrics.get("gaze_off_count", 0) / (duration_sec / 60)
        parts.append((band_score(off_per_min, *GAZE_OFF_PER_MIN_BANDS), 0.3))
    return clamp(weighted_mean(parts))


def score_posture(metrics: dict) -> float | None:
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    parts = [
        (band_score(metrics.get("avg_shoulder_tilt_deg", 0.0), *SHOULDER_TILT_BANDS), 0.4),
        (band_score(metrics.get("head_down_ratio", 0.0), *HEAD_DOWN_BANDS), 0.35),
        (band_score(metrics.get("posture_sway", 0.0), *SWAY_BANDS), 0.25),
    ]
    return clamp(weighted_mean(parts))
