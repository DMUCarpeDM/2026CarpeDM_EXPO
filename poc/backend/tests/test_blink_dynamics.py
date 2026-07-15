"""깜빡임 동역학(마스터리 ④) — 개인 기저선 대비 급증 판정과 절대 폴백.

원칙 검증: 안정 깜빡임은 개인차가 커서(분당 10~30회) 절대 임계는 오판을 만든다.
기저선이 있으면 상대 판정만(기저 높은 사람 구제), 없으면 절대 32 폴백,
잡음 기저선(5 미만)은 신뢰하지 않는다.
"""
from types import SimpleNamespace

from app.services.report import _eye_evidence


def _result(**metrics):
    base = {
        "front_gaze_ratio": 0.8, "gaze_off_count": 2, "longest_off_sec": 1.5,
        "blink_per_min": 15,
    }
    base.update(metrics)
    return SimpleNamespace(turn_id=1, score=70.0, raw_metrics=base)


def test_blink_surge_vs_personal_baseline():
    # 기저선 12 → 답변 중 24 (2배): 절대 임계 32 미만이어도 급증으로 짚는다
    seg = _eye_evidence([_result(blink_per_min=24, blink_base_per_min=12)])
    assert "브리핑 때 분당 12회" in seg["observed"]
    assert "24회" in seg["observed"]


def test_high_baseline_person_rescued():
    # 원래 깜빡임이 많은 사람(기저 25)의 34회는 1.6배 미만 — 절대 32를 넘어도 지적하지 않는다
    seg = _eye_evidence([_result(blink_per_min=34, blink_base_per_min=25)])
    assert "깜빡임" not in seg["observed"]


def test_absolute_fallback_without_baseline():
    # 구 페이로드·짧은 브리핑(기저선 null) → 기존 절대 임계 32 유지 (하위 호환)
    seg = _eye_evidence([_result(blink_per_min=35)])
    assert "분당 35회" in seg["observed"]
    assert "깜빡임" not in _eye_evidence([_result(blink_per_min=24)])["observed"]


def test_noise_baseline_falls_back_to_absolute():
    # 기저선 5 미만은 표본 잡음 — 분당 2회 기저로 20회를 '10배 급증' 오판하지 않는다
    seg = _eye_evidence([_result(blink_per_min=20, blink_base_per_min=2)])
    assert "깜빡임" not in seg["observed"]


def test_absolute_floor_under_relative_judgement():
    # 기저선이 낮아도(8) 절대 20회 미만이면 급증으로 보지 않는다 (둘 다 평온한 수준)
    seg = _eye_evidence([_result(blink_per_min=15, blink_base_per_min=8)])
    assert "깜빡임" not in seg["observed"]
