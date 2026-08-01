"""점수 정규화 유틸 (S-BFSXTJ 0~100 변환, S-KUSYMO 결과 객체).

band_score: 이상 구간 안이면 100점, 한계 구간 밖이면 0점, 사이는 선형 보간.
모든 Fit 점수는 이 함수로 원시 지표를 0~100으로 변환한 뒤 가중 평균한다.
"""

# 점수 산식 버전 — 밴드 기준·가중치·측정 방법이 바뀌면 반드시 올린다.
# 백분위·추이 비교는 동일 버전 표본끼리만 수행한다 (analysis_results/reports에 스냅샷).
#
# v2: MVP 프론트가 누락하던 지표를 복원해 측정 방법이 바뀌었다.
#   - posture_sway / tilt_drift_deg 실측 (v1에서는 기본값 0.0 → 상수 만점이었다)
#   - head_down_ratio를 코-어깨 거리로 측정 (v1은 eyeLookDown blendshape = 눈동자 하향)
#   - 어깨 기울기를 3D 월드 랜드마크로 계산 (몸 회전에 불변)
#   - 듣기/말하기 응시 분리·응시 리듬 전달 → score_eye가 v2 경로로 동작
#   - 표정 판정을 개인 무표정 기저 대비로 전환 (v1은 절대 임계 → 사람마다 오판)
#     smile_ratio·mouth_press_ratio·brow_down_ratio의 분포가 달라진다 (관찰 지표)
#
# v3 (2026-08-01): 산식이 아니라 '표본 로트'를 가르기 위한 버전 증가.
#   2026-07-31에 LLM judge 혼합(0.7×결정적 + 0.3×judge 중앙값)이 기본 ON으로 들어가
#   Response 세션 점수가 바뀌었는데 버전을 올리지 않아, 그 구간 표본이 순수 결정적
#   v2 표본과 같은 백분위 풀에 섞였다(api/reports.py가 engine_version으로 거른다).
#   judge를 기본 비활성으로 되돌리면서(config.judge_samples=0) 이후 표본을 그
#   오염 구간과 분리한다. v3의 산식 자체는 v2의 결정적 경로와 동일하다.
#
# v4 (2026-08-01): 3번째 점수 축을 시선(eye)→표정(expression)으로 교체 +
#   균등 평균이던 총점을 축별 가중 평균으로 전환(SCORED_FIT_WEIGHTS).
#   축 세트와 총점 산식이 둘 다 바뀌므로 v3 이하 표본과 백분위·추이를 섞지 않는다.
ENGINE_VERSION = "4"

# 4-Fit 총점의 축별 가중치 (설계서: 표정·자세가 최저 가중치, 응답·음성이 상위).
# 시선(gaze)은 점수 축이 아니라 보조 관찰 신호이므로 여기에 없다.
# ⚠️ 정확한 가중치는 4fit-scoring-design.md에서 미확정(α 검증 후 확정) — 잠정값이다.
# 측정 안 된 축이 있으면 weighted_mean이 남은 축의 가중치로 자동 재정규화한다.
SCORED_FIT_WEIGHTS = {
    "response": 0.35,
    "voice": 0.30,
    "expression": 0.175,
    "posture": 0.175,
}


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def band_score(
    value: float,
    ideal_low: float,
    ideal_high: float,
    hard_low: float,
    hard_high: float,
) -> float:
    """value가 [ideal_low, ideal_high] 안이면 100, [hard_low, hard_high] 밖이면 0."""
    if ideal_low <= value <= ideal_high:
        return 100.0
    if value < ideal_low:
        if value <= hard_low:
            return 0.0
        return 100.0 * (value - hard_low) / (ideal_low - hard_low)
    if value >= hard_high:
        return 0.0
    return 100.0 * (hard_high - value) / (hard_high - ideal_high)


def weighted_mean(pairs: list[tuple[float, float]]) -> float:
    """[(score, weight)] → 가중 평균. 빈 리스트면 0."""
    total_w = sum(w for _, w in pairs)
    if total_w == 0:
        return 0.0
    return sum(s * w for s, w in pairs) / total_w
