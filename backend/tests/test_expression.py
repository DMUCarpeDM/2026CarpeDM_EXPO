"""표정 레이어 검증 — 무의식 습관 카드(진정성 미소·표정 복구)의 판정 계약."""
from datetime import datetime, timezone

from app.models import RoleplaySession, Turn
from app.services.report import _habit_segments


def turn(order: int, qtype: str, nv: dict) -> Turn:
    return Turn(
        id=order, session_id=1, episode_id=1, order=order,
        question_type=qtype, question_text="q", character_id="kim_teamlead",
        response_text="답", nonverbal_metrics=nv,
        answered_at=datetime.now(timezone.utc),
    )


def session_with(turns: list[Turn]) -> RoleplaySession:
    s = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="pressure")
    s.turns = turns
    return s


BASE_NV = {
    "hand_face_sec": 0, "arm_cross_ratio": 0, "mouth_press_ratio": 0.05,
    "smile_ratio": 0.0, "weight_shift_cm": 0.5, "tension_episodes": 0,
    "expr_recover_sec": 0,
}


def test_service_smile_under_pressure_flagged():
    # 압박 중 미소 多 + 진정성 低 → '입가에만 머무는 미소' 카드
    s = session_with([
        turn(1, "pressure", {**BASE_NV, "smile_ratio": 0.5, "smile_genuine_ratio": 0.1}),
    ])
    segs = _habit_segments(s)
    assert any("입가에만" in x["observed"] for x in segs)


def test_genuine_smile_under_pressure_gets_softer_card():
    # 진정성 높은 미소는 '서비스 미소' 지적 대신 일반 타이밍 카드
    s = session_with([
        turn(1, "pressure", {**BASE_NV, "smile_ratio": 0.5, "smile_genuine_ratio": 0.8}),
    ])
    segs = _habit_segments(s)
    assert not any("입가에만" in x["observed"] for x in segs)
    assert any("미소 표정이 길게" in x["observed"] for x in segs)


def test_slow_expression_recovery_flagged():
    nv = {**BASE_NV, "tension_episodes": 2, "expr_recover_sec": 5.5}
    s = session_with([turn(1, "initial", dict(nv)), turn(2, "followup", dict(nv))])
    segs = _habit_segments(s)
    assert any("풀리지 않는 긴장" in x["interpretation"] for x in segs)


def test_quick_recovery_not_flagged():
    nv = {**BASE_NV, "tension_episodes": 2, "expr_recover_sec": 1.5}
    s = session_with([turn(1, "initial", dict(nv)), turn(2, "followup", dict(nv))])
    segs = _habit_segments(s)
    assert not any("풀리지 않는" in x["interpretation"] for x in segs)


def test_stable_face_under_pressure_praised():
    s = session_with([
        turn(1, "pressure", {**BASE_NV, "smile_ratio": 0.0, "mouth_press_ratio": 0.05}),
    ])
    segs = _habit_segments(s)
    assert any("안정적이었어요" in x["observed"] for x in segs)


def test_habit_cards_capped_at_two():
    # 습관이 아무리 많아도 카드 2장 — 과잉 지적 금지
    nv = {**BASE_NV, "hand_face_sec": 6, "arm_cross_ratio": 0.5,
          "mouth_press_ratio": 0.4, "tension_episodes": 3, "expr_recover_sec": 6.0,
          "weight_shift_cm": 6.0, "smile_ratio": 0.5, "smile_genuine_ratio": 0.1,
          "gesture_freeze_ratio": 0.95}
    s = session_with([
        turn(1, "pressure", dict(nv)), turn(2, "followup", dict(nv)),
    ])
    assert len(_habit_segments(s)) == 2
