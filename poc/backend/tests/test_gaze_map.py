"""시선 존 히트맵 집계(마스터리 ④) — 표본 게이트·정규화·부호 중화 코멘트.

원칙 검증: 표본 10초 미만 보류, 좌/우 단정 금지(실기기 부호 검증 전 —
DIR_LABEL과 같은 '옆' 중화 관례), 결손 페이로드 관용.
"""
from types import SimpleNamespace

from app.services.report import _gaze_map


def _session(*zone_lists, sample_ms=None):
    turns = []
    for z in zone_lists:
        if z is None:
            turns.append(SimpleNamespace(nonverbal_metrics=None))
            continue
        nv = {"gaze_zones": z}
        if sample_ms is not None:
            nv["sample_ms"] = sample_ms
        turns.append(SimpleNamespace(nonverbal_metrics=nv))
    return SimpleNamespace(turns=turns)


def test_gaze_map_withheld_below_sample_gate():
    # 합계 49프레임 × 200ms = 9.8초 < 10초 → 지도 생략 (판정 보류 원칙)
    assert _gaze_map(_session([0, 0, 0, 0, 49, 0, 0, 0, 0])) is None


def test_gaze_map_gate_is_time_based_not_frame_based():
    # 샘플링 100ms(10Hz)에서는 같은 60프레임이 6초 → 여전히 보류.
    # 프레임 수가 아니라 시간(sample_ms 환산)으로 게이트한다는 계약.
    withheld = _gaze_map(_session([0, 0, 0, 0, 60, 0, 0, 0, 0], sample_ms=100))  # 6초
    assert withheld is None
    passed = _gaze_map(_session([0, 0, 0, 0, 120, 0, 0, 0, 0], sample_ms=100))  # 12초
    assert passed is not None


def test_gaze_map_sums_turns_and_normalizes():
    m = _gaze_map(_session(
        [0, 0, 0, 0, 30, 0, 0, 10, 0],
        [0, 0, 0, 0, 50, 0, 0, 10, 0],
    ))
    assert m is not None
    assert m["frames"] == 100
    assert m["zones"][4] == 0.8
    assert abs(sum(m["zones"]) - 1.0) < 0.01


def test_gaze_map_center_praised():
    m = _gaze_map(_session([0, 0, 0, 0, 80, 0, 0, 20, 0]))
    assert "대부분 상대" in m["comment"]


def test_gaze_map_flags_downward_habit():
    m = _gaze_map(_session([0, 0, 0, 0, 60, 0, 10, 20, 10]))  # 아래 행 40%
    assert "아래쪽" in m["comment"]


def test_gaze_map_side_comment_is_sign_neutral():
    # 좌/우 부호는 실기기 검증 전 — 어느 쪽 열이 달아올라도 '옆'으로만 말한다
    left = _gaze_map(_session([0, 0, 0, 40, 60, 0, 0, 0, 0]))
    right = _gaze_map(_session([0, 0, 0, 0, 60, 40, 0, 0, 0]))
    assert "옆으로" in left["comment"] and "옆으로" in right["comment"]
    for c in (left["comment"], right["comment"]):
        assert "왼" not in c and "오른" not in c


def test_gaze_map_tolerates_missing_and_malformed_zones():
    # 카메라 없는 턴(None)·구 페이로드(길이 다름)는 조용히 건너뛴다
    m = _gaze_map(_session(None, [1, 2], [0, 0, 0, 0, 100, 0, 0, 0, 0]))
    assert m is not None and m["frames"] == 100
