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


# ---- 경청 자세 (듣기 페이즈 — 정밀화 패스) ----

def test_listening_nods_praised():
    segs = _habit_segments(_session(
        _turn(order=1, nod_count=2, listen_sec=15),
        _turn(order=2, nod_count=2, listen_sec=15),
    ))
    assert any("끄덕이며" in g["observed"] for g in segs)


def test_nods_withheld_below_gates():
    # 끄덕임 3회 미만 또는 듣기 표본 20초 미만이면 침묵 (보수 게이트)
    assert _habit_segments(_session(_turn(nod_count=2, listen_sec=30))) == []
    assert _habit_segments(_session(_turn(nod_count=5, listen_sec=10))) == []


def test_listen_lean_back_observed():
    segs = _habit_segments(_session(_turn(listen_lean_pct=-12)))
    assert any("물러나" in g["observed"] for g in segs)


def test_listen_lean_forward_praised():
    segs = _habit_segments(_session(_turn(listen_lean_pct=12)))
    assert any("앞으로 기울" in g["observed"] for g in segs)


def test_listen_lean_moderate_silent():
    # 중간 지대(±8% 미만)와 기준 없음(null)은 지적도 칭찬도 하지 않는다
    assert _habit_segments(_session(_turn(listen_lean_pct=3))) == []


def test_composure_detects_listen_lean_retreat():
    def pair(lean):
        return ({"front_gaze_ratio": 0.9, "listen_lean_pct": lean}, {})
    c = build_composure([pair(-10)], [pair(0), pair(1)])
    assert c["level"] == "회복형"
    assert "듣기 자세(리닝)" in " ".join(r["label"] for r in c["rows"])


# ---- score_posture v2: 자세 유지력 (v1 하위 호환) ----

def test_posture_v2_penalizes_collapse_not_improvement():
    from app.ai.nonverbal import score_posture
    base = {"avg_shoulder_tilt_deg": 2, "head_down_ratio": 0.05, "posture_sway": 0.02, "frames": 40}
    v1 = score_posture(dict(base))  # tilt_drift_deg 없음 = v1 페이로드
    collapsed = score_posture({**base, "tilt_drift_deg": 8.0})
    improved = score_posture({**base, "tilt_drift_deg": -5.0})
    assert collapsed < v1  # 좋게 시작해 무너지는 자세는 평균만으로는 안 보인다
    assert improved >= v1  # 후반에 좋아진 자세(음수 드리프트)는 감점하지 않는다


# ---- 표현 동작 확장 ⑤: 표정 생동감·머리 흔들림 습관 카드 ----

def test_expression_flat_observed():
    # 얼굴이 잡힌(깜빡임>0) 세션에서 눈썹이 거의 안 움직이면 무표정 관찰 카드
    segs = _habit_segments(_session(_turn(brow_raise_ratio=0.0, blink_per_min=18)))
    assert any("표정 변화" in g["observed"] for g in segs)


def test_expression_flat_withheld_without_face():
    # 얼굴 추적 근거(깜빡임)가 없으면 '무표정'으로 오판하지 않는다 (포즈만 잡힌 턴 배제)
    assert _habit_segments(_session(_turn(brow_raise_ratio=0.0, blink_per_min=0))) == []


def test_expression_lively_praised():
    segs = _habit_segments(_session(_turn(brow_raise_ratio=0.3, blink_per_min=18)))
    assert any("살아 있었어요" in g["observed"] for g in segs)


def test_expression_withheld_on_old_payload():
    # brow_raise_ratio 키가 없는 구 페이로드는 무표정으로 판정하지 않는다
    assert _habit_segments(_session(_turn(blink_per_min=18))) == []


def test_head_motion_restless_observed():
    segs = _habit_segments(_session(_turn(head_motion=0.08, blink_per_min=18)))
    assert any("머리가 자잘하게" in g["observed"] for g in segs)


def test_head_motion_steady_stays_silent():
    # 낮은 흔들림(0.02)은 지적하지 않는다
    assert _habit_segments(_session(_turn(head_motion=0.02, blink_per_min=18))) == []
