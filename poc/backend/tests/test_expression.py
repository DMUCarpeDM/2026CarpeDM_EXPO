"""표정 축 — Expression-Fit 점수(시선→표정 교체)와 관찰 레이어(마스터리 ⑤).

원칙 검증: 감점 없는 관찰, 표본 부족 시 판정 보류(null), 중간 지대 침묵,
카드 상한에서 행동 교정형 카드가 우선.
"""
from types import SimpleNamespace

from app.ai.nonverbal import score_expression
from app.services.report import _habit_segments


# ---- Expression-Fit 점수 축 (시선→표정 교체, ⚠️ α 검증 전 참고용) ----

def test_expression_score_lively_beats_rigid():
    lively = score_expression({
        "frames": 100, "blink_per_min": 15, "brow_raise_ratio": 0.3,
        "mouth_press_ratio": 0.02, "expr_recover_sec": 0.2,
        "smile_ratio": 0.2, "smile_duchenne_ratio": 0.7,
    })
    rigid = score_expression({
        "frames": 100, "blink_per_min": 15, "brow_raise_ratio": 0.0,
        "mouth_press_ratio": 0.5, "expr_recover_sec": 2.5,
        "smile_ratio": 0.2, "smile_duchenne_ratio": 0.05,
    })
    assert lively is not None and rigid is not None
    assert lively > rigid


def test_expression_score_frame_gate():
    # 표본 부족 → 미측정(None), 무표정 0점 아님
    assert score_expression({"frames": 2, "blink_per_min": 15, "brow_raise_ratio": 0.3}) is None


def test_expression_score_requires_tracked_face():
    # 얼굴이 안 잡힌(깜빡임 0) 포즈-only 턴은 '무표정 0점'이 아니라 미측정(None)
    assert score_expression({"frames": 100, "blink_per_min": 0, "brow_raise_ratio": 0.3}) is None


def test_expression_score_old_payload_withheld():
    # 표정 신호(brow_raise_ratio)가 없는 구 페이로드는 미측정 (무표정 오판 방지)
    assert score_expression({"frames": 100, "blink_per_min": 15}) is None


def test_expression_score_calm_face_not_penalized():
    # 미소 없는 침착한 표정은 진정성 미소 부재로 감점되지 않는다 (미소 있을 때만 진정성 평가)
    calm = score_expression({
        "frames": 100, "blink_per_min": 15, "brow_raise_ratio": 0.2,
        "mouth_press_ratio": 0.02, "expr_recover_sec": 0.2,
        "smile_ratio": 0.0, "smile_duchenne_ratio": None,
    })
    assert calm is not None and calm >= 80


def _turn(order=1, question_type="initial", **nv):
    base = {"frames": 100, "smile_ratio": 0.0}
    base.update(nv)
    return SimpleNamespace(
        id=order, order=order, question_type=question_type,
        nonverbal_metrics=base, answered_at="2026-07-07T09:00:00",
    )


def _session(*turns):
    return SimpleNamespace(turns=list(turns))


def test_service_smile_observed():
    # 미소는 많은데 눈 참여가 거의 없음 → 의례적 미소 관찰 카드
    segs = _habit_segments(_session(_turn(smile_ratio=0.4, smile_duchenne_ratio=0.05)))
    assert any("눈 주변 근육" in g["observed"] for g in segs)


def test_duchenne_smile_praised():
    segs = _habit_segments(_session(_turn(smile_ratio=0.3, smile_duchenne_ratio=0.8)))
    assert any("눈까지 함께 웃는" in g["observed"] for g in segs)


def test_duchenne_withheld_without_sample():
    # 미소 표본 부족 → 프론트가 null 전송 → 카드 자체가 없다 (판정 보류 원칙)
    assert _habit_segments(_session(_turn(smile_ratio=0.02, smile_duchenne_ratio=None))) == []


def test_moderate_duchenne_stays_silent():
    # 중간 지대(0.15~0.6)는 지적도 칭찬도 하지 않는다 — 보수적 관찰
    assert _habit_segments(_session(_turn(smile_ratio=0.3, smile_duchenne_ratio=0.4))) == []


def test_habit_cap_prefers_actionable_cards():
    # 손-얼굴·긴장 표정 카드가 이미 2장이면 미소 카드는 상한에 밀린다 (과잉 지적 방지)
    segs = _habit_segments(_session(_turn(
        smile_ratio=0.4, smile_duchenne_ratio=0.05,
        hand_face_sec=6.0, mouth_press_ratio=0.3,
    )))
    assert len(segs) == 2
    assert not any("눈 주변 근육" in g["observed"] for g in segs)
