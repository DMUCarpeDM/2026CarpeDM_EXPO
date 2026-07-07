"""Posture 마스터(③) — 제스처 경직/과다·체중 이동 카드와 composure 제스처 위축.

원칙 검증: 가시성 게이트(손·하체가 안 보이면 판정 보류), 표본 게이트(30초),
중간 지대 침묵, 구 페이로드 하위 호환.
"""
from types import SimpleNamespace

from app.services.deep_analysis import build_composure
from app.services.report import _habit_segments


def _turn(order=1, question_type="initial", **nv):
    base = {"frames": 200, "smile_ratio": 0.0}
    base.update(nv)
    return SimpleNamespace(
        id=order, order=order, question_type=question_type,
        nonverbal_metrics=base, answered_at="2026-07-07T09:00:00",
    )


def _session(*turns):
    return SimpleNamespace(turns=list(turns))


# ---- 제스처 경직/과다 ----

def test_frozen_gesture_observed():
    # 손이 보이는데(0.8) 활동 3% — 경직 카드
    segs = _habit_segments(_session(_turn(
        gesture_active_ratio=0.03, gesture_energy=0.01, hands_visible_ratio=0.8,
    )))
    assert any("거의 움직이지 않았어요" in g["observed"] for g in segs)


def test_excessive_gesture_observed():
    segs = _habit_segments(_session(_turn(
        gesture_active_ratio=0.85, gesture_energy=0.6, hands_visible_ratio=0.9,
    )))
    assert any("쉬지 않고" in g["observed"] for g in segs)


def test_moderate_gesture_stays_silent():
    # 중간 지대는 지적하지 않는다 — 보수적 관찰
    assert _habit_segments(_session(_turn(
        gesture_active_ratio=0.3, gesture_energy=0.25, hands_visible_ratio=0.9,
    ))) == []


def test_frozen_withheld_when_hands_unseen():
    # 손이 화면에 거의 없으면(0.2) '경직'이 아니라 측정 불가 — 판정 보류
    assert _habit_segments(_session(_turn(
        gesture_active_ratio=0.02, gesture_energy=0.01, hands_visible_ratio=0.2,
    ))) == []


def test_frozen_withheld_on_short_session():
    # 합계 30초(150프레임) 미만이면 경직을 단정하지 않는다
    assert _habit_segments(_session(_turn(
        frames=100, gesture_active_ratio=0.02, gesture_energy=0.01, hands_visible_ratio=0.9,
    ))) == []


def test_gesture_withheld_on_old_payload():
    # 구 페이로드(제스처 필드 없음) → 카드 없음 (하위 호환)
    assert _habit_segments(_session(_turn())) == []


# ---- 체중 이동 (전신 — 하체 가시 게이트) ----

def test_weight_shift_observed_when_standing():
    segs = _habit_segments(_session(_turn(hip_sway=0.15, lower_visible_ratio=0.8)))
    assert any("무게중심" in g["observed"] for g in segs)


def test_weight_shift_withheld_at_desk():
    # 책상 웹 모드(하체 미가시)에서는 골반 추정이 잡음 — 판정 보류
    assert _habit_segments(_session(_turn(hip_sway=0.15, lower_visible_ratio=0.3))) == []


# ---- composure: 제스처 위축 (압박에서 얼어붙는 반응) ----

def _pair(energy):
    return ({"front_gaze_ratio": 0.9, "gesture_energy": energy}, {})


def test_composure_detects_gesture_shrink():
    c = build_composure([_pair(0.05)], [_pair(0.3), _pair(0.35)])
    assert c["level"] == "회복형"
    assert "제스처 위축" in c["comment"]


def test_composure_skips_gesture_on_old_payload():
    old = ({"front_gaze_ratio": 0.9}, {})
    c = build_composure([old], [old])
    assert all("제스처" not in r["label"] for r in c["rows"])
