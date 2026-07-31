"""점수 표기 방침 (S-B2B-SCORE) — alpha 검증 전 등급 표기.

human agreement(Krippendorff's alpha) 예비 검증이 끝나기 전에는 B2B 수강생
화면에 원점수(0~100)를 그대로 노출하지 않는다. 수강생에게는 4단계 등급과
근거 코멘트를, 관리자 대시보드·연구 트랙에는 원점수를 함께 제공한다.
전시(mvp) 화면은 게이미피케이션 목적의 기존 점수 표기를 유지한다.
근거·전환 조건: docs/plan/b2b/score-display-policy.md
"""

# (하한, 등급) — 내림차순 평가
GRADE_BANDS = (
    (80.0, "우수"),
    (65.0, "양호"),
    (50.0, "보통"),
    (0.0, "연습 필요"),
)


def grade_of(score: float | None) -> str | None:
    """0~100 원점수 → 4단계 등급. None(리포트 없음)은 그대로 None."""
    if score is None:
        return None
    for floor, label in GRADE_BANDS:
        if score >= floor:
            return label
    return GRADE_BANDS[-1][1]
