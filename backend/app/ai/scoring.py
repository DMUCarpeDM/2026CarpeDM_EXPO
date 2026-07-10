"""점수 정규화 유틸 (S-BFSXTJ 0~100 변환, S-KUSYMO 결과 객체).

band_score: 이상 구간 안이면 100점, 한계 구간 밖이면 0점, 사이는 선형 보간.
모든 Fit 점수는 이 함수로 원시 지표를 0~100으로 변환한 뒤 가중 평균한다.
"""

# 점수 산식 버전 — 밴드 기준·가중치·측정 방법이 바뀌면 반드시 올린다.
# 백분위·추이 비교는 동일 버전 표본끼리만 수행한다 (analysis_results/reports에 스냅샷).
ENGINE_VERSION = "1"


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
