"""시선 존 히트맵 집계(마스터리 ④) — 표본 게이트·정규화·부호 중화 코멘트.

원칙 검증: 표본 10초 미만 보류, 좌/우 단정 금지(실기기 부호 검증 전 —
DIR_LABEL과 같은 '옆' 중화 관례), 결손 페이로드 관용.
"""
from types import SimpleNamespace

from app.services.report import _gaze_map


def _session(*zone_lists):
    turns = [
        SimpleNamespace(nonverbal_metrics={"gaze_zones": z} if z is not None else None)
        for z in zone_lists
    ]
    return SimpleNamespace(turns=turns)


def test_gaze_map_withheld_below_sample_gate():
    # 합계 50프레임(10초) 미만 → 지도 자체를 생략 (판정 보류 원칙)
    assert _gaze_map(_session([0, 0, 0, 0, 49, 0, 0, 0, 0])) is None


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
