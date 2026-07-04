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

# -- 밴드 근거 --
# 정면 응시 비율: 면접·프레젠테이션 코칭에서 통용되는 아이컨택 권장치는
# 발화 시간의 60~70% 이상이다(응시 100%는 오히려 부담을 주므로 감점하지 않음).
FRONT_GAZE_BANDS = (0.65, 1.0, 0.15, 1.01)
# 시선 이탈 빈도: 분당 4회 이하는 자연스러운 시선 이동, 15회 이상은 산만한 인상.
GAZE_OFF_PER_MIN_BANDS = (0.0, 4.0, 0.0, 15.0)
# 최장 연속 이탈: 2.5초까지는 생각하는 시선, 8초 이상 지속되면 회피로 읽힌다.
LONGEST_OFF_BANDS = (0.0, 2.5, 0.0, 8.0)
# 어깨 기울기: 좌우 어깨 높이차 6° 이내는 정상 자세 편차,
# 10°를 넘으면 관찰자가 비대칭을 인지하기 시작하고 20°는 명확히 기운 자세.
SHOULDER_TILT_BANDS = (0.0, 6.0, 0.0, 20.0)
# 고개 숙임 비율: 발화 중 20% 이내의 시선 하강(메모 확인 등)은 자연스럽지만,
# 70% 이상 고개가 내려가 있으면 위축·자신감 부족으로 읽힌다.
HEAD_DOWN_BANDS = (0.0, 0.2, 0.0, 0.7)
# 상체 흔들림(어깨 중심 x 표준편차/어깨너비): 5% 이내는 정지 자세로 인지,
# 22% 이상은 몸을 흔드는 습관으로 보인다.
SWAY_BANDS = (0.0, 0.05, 0.0, 0.22)

MIN_FRAMES = 5  # 이보다 적으면 신뢰 불가로 미측정 처리


def score_eye(metrics: dict, duration_sec: float) -> float | None:
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    parts = [(band_score(metrics.get("front_gaze_ratio", 0.0), *FRONT_GAZE_BANDS), 0.55)]
    if duration_sec > 1:
        off_per_min = metrics.get("gaze_off_count", 0) / (duration_sec / 60)
        parts.append((band_score(off_per_min, *GAZE_OFF_PER_MIN_BANDS), 0.25))
    if "longest_off_sec" in metrics:
        parts.append((band_score(metrics["longest_off_sec"], *LONGEST_OFF_BANDS), 0.20))
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
