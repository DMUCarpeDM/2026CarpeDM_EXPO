"""비언어 점수화: 클라이언트 MediaPipe 집계 지표를 0~100으로 (S-FBTBXY, S-IPXYRD).

점수 축: Expression(표정)·Posture(자세). 시선(score_eye)은 점수 축이 아니라 보조 관찰
신호로 계산해 리포트 관찰(gaze_map·깜빡임)·실시간 넛지에만 쓴다(총점 제외).

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
# 자세 유지력(후반-전반 어깨 기울기 증가): 3° 이내는 자연스러운 이완,
# 10° 이상 무너지면 관찰자가 인지하는 명확한 붕괴. 음수(개선)는 감점하지 않는다.
TILT_DRIFT_BANDS = (0.0, 3.0, 0.0, 10.0)

# -- 표정(Expression) 밴드 근거 (설계서: '감정 분류' 아님, '경직↔생동' 반응성만) --
# 눈썹 올림 비율 = 표정 생동감. 완전 무표정(0)은 경직 신호지만 '무표정≠무능'이므로
# 넓은 이상 구간(0.05~0.6)을 두고 과도(>0.6)만 완만히 감점 — 부적절만 감점 원칙.
BROW_RAISE_BANDS = (0.05, 0.6, 0.0, 0.95)
# 입술 압축(긴장) 비율: 낮을수록 좋다. 12% 이내는 자연스러운 편차, 55%↑는 굳은 긴장.
MOUTH_PRESS_BANDS = (0.0, 0.12, 0.0, 0.55)
# 긴장 표정 복구 시간(초): 낮을수록 좋다. 0.8초 이내면 즉시 회복, 3초↑면 오래 굳음.
EXPR_RECOVER_BANDS = (0.0, 0.8, 0.0, 3.0)
# 진정성 미소(Duchenne 근사): 미소 중 눈둘레근 동시 활성 비율 — 미소가 있을 때만 평가.
DUCHENNE_BANDS = (0.5, 1.0, 0.0, 1.01)
MIN_SMILE_FOR_DUCHENNE = 0.1  # 미소 표본이 이보다 적으면 진정성 판정 보류(감점 아님)

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
    """Posture v2 — 자세 유지력(후반 붕괴 추세) 통합.

    tilt_drift_deg가 없는 v1 페이로드에는 v1과 동일하게 동작한다(하위 호환).
    이번에 신설된 관찰 지표(제스처·골반 스웨이·경청 자세)는 원칙대로 점수 밖 —
    실기기 보정 전에는 습관 카드·교차 분석만 소비한다.
    """
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    parts = [
        (band_score(metrics.get("avg_shoulder_tilt_deg", 0.0), *SHOULDER_TILT_BANDS), 0.4),
        (band_score(metrics.get("head_down_ratio", 0.0), *HEAD_DOWN_BANDS), 0.35),
        (band_score(metrics.get("posture_sway", 0.0), *SWAY_BANDS), 0.25),
    ]
    if "tilt_drift_deg" in metrics:
        # 유지력: 좋게 시작해 무너지는 자세는 평균 기울기만으로는 안 보인다
        parts.append((band_score(max(0.0, metrics["tilt_drift_deg"]), *TILT_DRIFT_BANDS), 0.15))
    return clamp(weighted_mean(parts))


def score_expression(metrics: dict) -> float | None:
    """Expression-Fit — 표정 표현력(생동감·긴장·복구·진정성 미소)을 0~100으로.

    설계서 프레이밍: '감정 분류'가 아니라 '상황에 맞게 살아있고 반응하는가(경직↔생동)'.
    감점은 부적절(경직·긴장·굳은 표정)만 하고 무표정을 무능으로 과벌하지 않는다
    (이상 구간을 넓게 둔다). 미소는 있을 때만 진정성을 평가하고, 미소 부재는 감점하지 않는다.

    입력은 이미 프론트가 보내는 blendshape 집계(brow_raise_ratio·mouth_press_ratio·
    expr_recover_sec·smile_ratio·smile_duchenne_ratio)만 쓴다 — 프론트 변경 불필요.
    ⚠️ 이 축은 α 검증(10월) 전 '참고용' 지표다 (설계서 철칙).
    """
    if not metrics or metrics.get("frames", 0) < MIN_FRAMES:
        return None
    # 얼굴이 실제로 잡힌 턴에서만 채점 — 포즈만 잡힌(카메라 오프/하체) 턴을 '무표정 0점'으로
    # 오판하지 않는다. brow_raise_ratio는 표정 페이로드 존재 신호, 깜빡임은 얼굴 추적 신호.
    brow = metrics.get("brow_raise_ratio")
    if brow is None or metrics.get("blink_per_min", 0) <= 0:
        return None

    parts: list[tuple[float, float]] = [
        (band_score(brow, *BROW_RAISE_BANDS), 0.35),
    ]
    press = metrics.get("mouth_press_ratio")
    if press is not None:
        parts.append((band_score(press, *MOUTH_PRESS_BANDS), 0.25))
    recover = metrics.get("expr_recover_sec")
    if recover is not None:
        parts.append((band_score(recover, *EXPR_RECOVER_BANDS), 0.20))
    # 진정성 미소: 실제로 미소가 있었던 턴만 평가 (미소 없는 침착한 표정을 감점하지 않는다)
    smile = metrics.get("smile_ratio", 0.0)
    duchenne = metrics.get("smile_duchenne_ratio")
    if smile >= MIN_SMILE_FOR_DUCHENNE and duchenne is not None:
        parts.append((band_score(duchenne, *DUCHENNE_BANDS), 0.20))
    return clamp(weighted_mean(parts))
