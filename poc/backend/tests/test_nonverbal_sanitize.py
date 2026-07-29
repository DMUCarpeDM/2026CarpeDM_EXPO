"""NonverbalIn 서버측 살균 — 클라이언트 지표는 신뢰하지 않고 상식 범위로 강제한다.

영상이 서버로 오지 않는 설계라 값 재계산 검증은 불가능하다(자체 감사 C6).
대신 물리적으로 불가능한 값(음수 프레임, 비율 9999)을 클램프하고, 리스트
페이로드 폭주를 상한으로 막는다. 거부(422)가 아니라 클램프인 이유: 클라이언트
집계 버그 하나가 전시장에서 턴 제출을 죽여선 안 된다.
"""
from app.schemas import NonverbalIn


def test_ratios_and_ranges_are_clamped():
    nv = NonverbalIn(
        front_gaze_ratio=9999.0,
        smile_ratio=-3.0,
        blink_per_min=100000.0,
        avg_shoulder_tilt_deg=-45.0,
        gaze_off_count=-7,
        frames=-100,
        lean_drift_pct=5000.0,
    )
    assert nv.front_gaze_ratio == 1.0
    assert nv.smile_ratio == 0.0
    assert nv.blink_per_min == 300.0
    assert nv.avg_shoulder_tilt_deg == 0.0
    assert nv.gaze_off_count == 0
    assert nv.frames == 0
    assert nv.lean_drift_pct == 100.0


def test_nullable_fields_stay_null():
    nv = NonverbalIn()
    assert nv.smile_duchenne_ratio is None
    assert nv.answer_offset_sec is None
    assert nv.gesture_energy is None


def test_timeline_is_truncated_and_type_cleaned():
    dirty = [{"t": i * 2, "front": 0.5, "press": 0.1, "tilt": 3.0} for i in range(500)]
    dirty[0] = {"t": "2", "front": 0.5}          # 문자열 t → 빈 통째 폐기
    dirty[1] = {"t": 2, "front": "junk", "extra": "x"}  # 비숫자 값 → null, 모르는 키 제거
    nv = NonverbalIn(timeline=dirty)
    assert len(nv.timeline) <= 150
    assert all(set(b) == {"t", "front", "press", "tilt"} for b in nv.timeline)
    # 첫 유효 빈 = 정리된 dirty[1]: 비숫자·누락 값은 null, 모르는 키는 제거
    assert nv.timeline[0] == {"t": 2, "front": None, "press": None, "tilt": None}
    assert nv.timeline[1] == {"t": 4, "front": 0.5, "press": 0.1, "tilt": 3.0}


def test_malformed_gaze_payloads_are_dropped_whole():
    nv = NonverbalIn(
        gaze_dirs={"down": 3, "sideways": 1},   # 모르는 방향 키
        gaze_zones=[1, 2, 3],                   # 9칸이 아님
        gaze_off_dir="behind",                  # 정의 밖 방향
    )
    assert nv.gaze_dirs == {}
    assert nv.gaze_zones == []
    assert nv.gaze_off_dir is None


def test_valid_payload_passes_through_unchanged():
    nv = NonverbalIn(
        front_gaze_ratio=0.82,
        gaze_off_count=3,
        avg_shoulder_tilt_deg=2.5,
        blink_per_min=18.0,
        gaze_dirs={"down": 2, "left": 1},
        gaze_zones=[0, 1, 0, 2, 30, 1, 0, 3, 0],
        timeline=[{"t": 0, "front": 0.9, "press": 0.0, "tilt": 2.0}],
        answer_offset_sec=4.2,
        sample_ms=80,
    )
    assert nv.front_gaze_ratio == 0.82
    assert nv.gaze_dirs == {"down": 2, "left": 1}
    assert len(nv.gaze_zones) == 9
    assert nv.timeline == [{"t": 0, "front": 0.9, "press": 0.0, "tilt": 2.0}]
    assert nv.answer_offset_sec == 4.2
    assert nv.sample_ms == 80


def test_tips_are_capped():
    nv = NonverbalIn(tips=["팁" * 500] * 100)
    assert len(nv.tips) == 20
    assert all(len(t) <= 300 for t in nv.tips)
