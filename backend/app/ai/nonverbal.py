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
# 듣기 응시: 듣는 사람의 아이컨택 권장치는 말할 때보다 높다(70~80%+) —
# 말하기는 생각 정리를 위한 시선 이탈이 자연스럽지만, 듣기의 이탈은 무관심으로 읽힌다.
LISTEN_GAZE_BANDS = (0.75, 1.0, 0.25, 1.01)
# 시선 이탈 빈도: 분당 4회 이하는 자연스러운 시선 이동, 15회 이상은 산만한 인상.
GAZE_OFF_PER_MIN_BANDS = (0.0, 4.0, 0.0, 15.0)
# 최장 연속 이탈: 2.5초까지는 생각하는 시선, 8초 이상 지속되면 회피로 읽힌다.
LONGEST_OFF_BANDS = (0.0, 2.5, 0.0, 8.0)
# 응시 리듬(연속 응시 평균 길이): 대면 대화의 자연스러운 응시 구간은 3~8초 —
# 1초 미만은 눈맞춤이 성립하지 않고, 지나치게 긴 무단절 응시(>15초)는 부담을 준다.
CONTACT_BOUT_BANDS = (3.0, 8.0, 0.4, 18.0)
# 답변 개시 직후 시선 회피 관용: 생각을 정리하는 회피는 인지적으로 정상 행동 —
# 최장 이탈에서 이 시간만큼(최대 2초) 감점을 면제한다.
ONSET_FORGIVENESS_CAP = 2.0
# 어깨 기울기: 좌우 어깨 높이차 6° 이내는 정상 자세 편차,
# 10°를 넘으면 관찰자가 비대칭을 인지하기 시작하고 20°는 명확히 기운 자세.
SHOULDER_TILT_BANDS = (0.0, 6.0, 0.0, 20.0)
# 고개 숙임 비율: 발화 중 20% 이내의 시선 하강(메모 확인 등)은 자연스럽지만,
# 70% 이상 고개가 내려가 있으면 위축·자신감 부족으로 읽힌다.
HEAD_DOWN_BANDS = (0.0, 0.2, 0.0, 0.7)
# 상체 흔들림(어깨 중심 x 표준편차/어깨너비): 5% 이내는 정지 자세로 인지,
# 22% 이상은 몸을 흔드는 습관으로 보인다.
SWAY_BANDS = (0.0, 0.05, 0.0, 0.22)
# ---- 3D 월드 포즈 밴드 (미터 단위 — 카메라 거리와 무관) ----
# 몸통 수직 정렬: 개인 중립 자세 대비 6° 이내는 자연 변동, 15°+ 는 확연히
# 기울어진/구부정한 자세로 관찰자가 인지한다.
TORSO_LEAN_BANDS = (0.0, 6.0, 0.0, 15.0)
# 좌우 체중 이동(골반 x 표준편차): 서서 말할 때 2.5cm 이내는 안정,
# 7cm+ 반복 이동은 초조한 몸짓으로 읽힌다.
WEIGHT_SHIFT_BANDS = (0.0, 2.5, 0.0, 7.0)

MIN_FRAMES = 5  # 이보다 적으면 신뢰 불가로 미측정 처리


def score_eye(metrics: dict, duration_sec: float) -> float | None:
    """Eye-Fit v2 — 듣기/말하기 분리 + 응시 리듬 + 개시 회피 관용.

    v1 페이로드(분리 지표 없음)에는 v1과 동일하게 동작한다(하위 호환).
    v2 페이로드에서는:
    - 말하기 응시(answering)와 듣기 응시(listening)를 다른 기준으로 채점
    - 응시 리듬(연속 응시 평균 길이)으로 '자연스러운 눈맞춤'을 평가
    - 답변 개시 직후의 시선 회피(생각 정리)는 최장 이탈에서 면제
    """
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None

    answering = metrics.get("answering_front_ratio")
    listening = metrics.get("listening_front_ratio")
    parts: list[tuple[float, float]] = []
    if answering is not None or listening is not None:
        # v2: 말하기 응시가 주(가중 0.35), 듣기 응시가 부(0.20) —
        # 한쪽이 없으면 나머지가 전체 응시 몫을 흡수한다
        if answering is not None and listening is not None:
            parts.append((band_score(answering, *FRONT_GAZE_BANDS), 0.35))
            parts.append((band_score(listening, *LISTEN_GAZE_BANDS), 0.20))
        elif answering is not None:
            parts.append((band_score(answering, *FRONT_GAZE_BANDS), 0.55))
        else:
            parts.append((band_score(metrics.get("front_gaze_ratio", 0.0), *FRONT_GAZE_BANDS), 0.35))
            parts.append((band_score(listening, *LISTEN_GAZE_BANDS), 0.20))
    else:
        parts.append((band_score(metrics.get("front_gaze_ratio", 0.0), *FRONT_GAZE_BANDS), 0.55))

    if duration_sec > 1:
        off_per_min = metrics.get("gaze_off_count", 0) / (duration_sec / 60)
        parts.append((band_score(off_per_min, *GAZE_OFF_PER_MIN_BANDS), 0.25))
    if "longest_off_sec" in metrics:
        # 개시 회피 관용 — 답변 시작 직후의 회피는 인지 정상 행동이므로 면제
        forgiven = min(metrics.get("onset_aversion_sec", 0.0), ONSET_FORGIVENESS_CAP)
        longest = max(0.0, metrics["longest_off_sec"] - forgiven)
        parts.append((band_score(longest, *LONGEST_OFF_BANDS), 0.20))
    bout = metrics.get("contact_bout_mean_sec", 0)
    if bout:
        parts.append((band_score(bout, *CONTACT_BOUT_BANDS), 0.15))
    return clamp(weighted_mean(parts))


def score_posture(metrics: dict) -> float | None:
    """Posture-Fit v2 — 3D 월드 지표(몸통 정렬·체중 이동)가 있으면 반영.

    v1 페이로드(2D만)에는 v1과 동일하게 동작한다(하위 호환).
    3D 지표는 카메라 거리 불변이므로, 있으면 더 신뢰할 수 있는 축이 된다.
    제스처(경직/과다)는 관찰 지표 — 점수에 넣지 않는다 (개인차가 커서 오판 위험).
    """
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    torso = metrics.get("torso_lean_deg", 0)
    weight = metrics.get("weight_shift_cm", 0)
    has_3d = bool(torso) or bool(weight)
    if has_3d:
        parts = [
            (band_score(metrics.get("avg_shoulder_tilt_deg", 0.0), *SHOULDER_TILT_BANDS), 0.25),
            (band_score(torso, *TORSO_LEAN_BANDS), 0.25),
            (band_score(metrics.get("head_down_ratio", 0.0), *HEAD_DOWN_BANDS), 0.20),
            (band_score(metrics.get("posture_sway", 0.0), *SWAY_BANDS), 0.15),
            (band_score(weight, *WEIGHT_SHIFT_BANDS), 0.15),
        ]
    else:
        parts = [
            (band_score(metrics.get("avg_shoulder_tilt_deg", 0.0), *SHOULDER_TILT_BANDS), 0.4),
            (band_score(metrics.get("head_down_ratio", 0.0), *HEAD_DOWN_BANDS), 0.35),
            (band_score(metrics.get("posture_sway", 0.0), *SWAY_BANDS), 0.25),
        ]
    return clamp(weighted_mean(parts))
