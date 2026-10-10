"""NonverbalIn 서버측 살균 — 클라이언트 지표는 신뢰하지 않고 상식 범위로 강제한다.

영상이 서버로 오지 않는 설계라 값 재계산 검증은 불가능하다(자체 감사 C6).
대신 물리적으로 불가능한 값(음수 프레임, 비율 9999)을 클램프하고, 리스트
페이로드 폭주를 상한으로 막는다. 거부(422)가 아니라 클램프인 이유: 클라이언트
집계 버그 하나가 전시장에서 턴 제출을 죽여선 안 된다.
"""
from app.schemas import NonverbalIn


def test_ratios_and_ranges_are_clamped():
    nv = NonverbalIn(
        smile_ratio=-3.0,
        blink_per_min=100000.0,
        avg_shoulder_tilt_deg=-45.0,
        frames=-100,
        lean_drift_pct=5000.0,
    )
    assert nv.smile_ratio == 0.0
    assert nv.blink_per_min == 300.0
    assert nv.avg_shoulder_tilt_deg == 0.0
    assert nv.frames == 0
    assert nv.lean_drift_pct == 100.0


def test_nullable_fields_stay_null():
    nv = NonverbalIn()
    assert nv.smile_duchenne_ratio is None
    assert nv.answer_offset_sec is None
    assert nv.gesture_energy is None


def test_timeline_is_truncated_and_type_cleaned():
    dirty = [{"t": i * 2, "press": 0.1, "tilt": 3.0} for i in range(500)]
    dirty[0] = {"t": "2", "front": 0.5}          # 문자열 t → 빈 통째 폐기
    dirty[1] = {"t": 2, "front": "junk", "extra": "x"}  # 비숫자 값 → null, 모르는 키 제거
    nv = NonverbalIn(timeline=dirty)
    assert len(nv.timeline) <= 150
    assert all(set(b) == {"t", "press", "tilt"} for b in nv.timeline)
    # 첫 유효 빈 = 정리된 dirty[1]: 비숫자·누락 값은 null, 모르는 키는 제거
    assert nv.timeline[0] == {"t": 2, "press": None, "tilt": None}
    assert nv.timeline[1] == {"t": 4, "press": 0.1, "tilt": 3.0}


def test_valid_payload_passes_through_unchanged():
    nv = NonverbalIn(
        avg_shoulder_tilt_deg=2.5,
        blink_per_min=18.0,
        timeline=[{"t": 0, "press": 0.0, "tilt": 2.0}],
        answer_offset_sec=4.2,
        sample_ms=80,
    )
    assert nv.timeline == [{"t": 0, "press": 0.0, "tilt": 2.0}]
    assert nv.answer_offset_sec == 4.2
    assert nv.sample_ms == 80


def test_tips_are_capped():
    nv = NonverbalIn(tips=["팁" * 500] * 100)
    assert len(nv.tips) == 20
    assert all(len(t) <= 300 for t in nv.tips)


def test_removed_observation_fields_are_not_accepted_or_returned():
    nv = NonverbalIn(front_gaze_ratio=0.8, gaze_zones=[0] * 9,
                     timeline=[{"t": 0, "front": 0.8, "press": 0, "tilt": 2}])
    data = nv.model_dump()
    assert "front_gaze_ratio" not in data
    assert "gaze_zones" not in data
    assert data["timeline"] == [{"t": 0, "press": 0, "tilt": 2}]
