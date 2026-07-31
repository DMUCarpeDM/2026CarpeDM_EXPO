"""키넥트 동작(모션) 측정 계층 — app/kinect/motion.py.

geometry 테스트와 같은 이유로 하드웨어가 필요 없다: motion은 순수 numpy이고
관절 인덱스 표만 k4a에서 가져오는데, 그 import는 DLL을 적재하지 않는다
(적재는 k4a.load() 안에서만 일어난다). CI(ubuntu)에서도 그대로 돈다.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.kinect.k4a import JOINT, K4ABT_JOINT_COUNT
from app.kinect.motion import (
    GESTURE_ACTIVE_MS,
    HAND_FACE_MM,
    MIN_MOTION_SAMPLES,
    BodyLock,
    MotionTracker,
    _median3,
    is_torso_glitch,
)

FPS = 30.0
DT = 1.0 / FPS
SPAN_MM = 300.0  # 어깨너비 — 정규화 지표의 분모


class FakeBody:
    """BodyLock이 보는 최소 인터페이스 (id·distance_mm)."""

    def __init__(self, body_id: int, distance_mm: float):
        self.id = body_id
        self.distance_mm = distance_mm


def make_joints(*, head_y=300.0, wrist_left=None, wrist_right=None,
                pelvis_x=0.0, chest_x=0.0) -> np.ndarray:
    """중력정렬 세계 좌표(mm)의 (32,3) 관절 한 벌. 지정 안 한 관절은 원점 근처."""
    joints = np.zeros((K4ABT_JOINT_COUNT, 3), dtype=float)
    joints[JOINT["SHOULDER_LEFT"]] = (-SPAN_MM / 2, 0.0, 0.0)
    joints[JOINT["SHOULDER_RIGHT"]] = (SPAN_MM / 2, 0.0, 0.0)
    joints[JOINT["HEAD"]] = (0.0, head_y, 0.0)
    joints[JOINT["PELVIS"]] = (pelvis_x, -400.0, 0.0)
    joints[JOINT["SPINE_CHEST"]] = (chest_x, -150.0, 0.0)
    joints[JOINT["WRIST_LEFT"]] = wrist_left if wrist_left is not None else (-250.0, -350.0, 0.0)
    joints[JOINT["WRIST_RIGHT"]] = wrist_right if wrist_right is not None else (250.0, -350.0, 0.0)
    joints[JOINT["KNEE_LEFT"]] = (-100.0, -800.0, 0.0)
    joints[JOINT["KNEE_RIGHT"]] = (100.0, -800.0, 0.0)
    return joints


def all_seen() -> np.ndarray:
    return np.ones(K4ABT_JOINT_COUNT, dtype=bool)


def feed(tracker: MotionTracker, frames: list[np.ndarray], seen=None, start=0.0) -> None:
    for i, joints in enumerate(frames):
        tracker.update(start + i * DT, joints, all_seen() if seen is None else seen, SPAN_MM)


# ---------------------------------------------------------------------------
# 글리치 가드 — 평활이 아니라 '표본 제외'라는 점이 핵심
# ---------------------------------------------------------------------------

def test_torso_glitch_passes_human_motion_and_catches_teleport():
    # 사람이 한 프레임(1/30초)에 낼 수 있는 몸통 이동 — 통과해야 한다
    assert not is_torso_glitch((0, 0, 1500), (20, 0, 1500), DT)
    # 대상 뒤바뀜: 한 프레임에 40cm 순간이동 = 12 m/s — 사람이 아니다
    assert is_torso_glitch((0, 0, 1500), (400, 0, 1500), DT)


def test_torso_glitch_refuses_to_judge_without_evidence():
    """판정 불가를 '이상 있음'으로 바꾸면 정상 프레임까지 버린다."""
    assert not is_torso_glitch(None, (0, 0, 1500), DT)
    assert not is_torso_glitch((0, 0, 1500), None, DT)
    assert not is_torso_glitch((0, 0, 1500), (400, 0, 1500), 0.0)


def test_median3_kills_single_spike_but_keeps_trend():
    spiked = np.array([0.0, 1.0, 99.0, 3.0, 4.0])
    out = _median3(spiked)
    assert out[2] == pytest.approx(3.0)  # 스파이크 제거
    assert out[0] == 0.0 and out[-1] == 4.0  # 끝은 지어내지 않는다
    ramp = np.arange(6, dtype=float)
    assert _median3(ramp) == pytest.approx(ramp)  # 추세는 그대로


# ---------------------------------------------------------------------------
# BodyLock — 전시 부스에서 관람객이 몰릴 때의 측정 신뢰
# ---------------------------------------------------------------------------

def test_body_lock_holds_target_against_marginally_closer_rival():
    lock = BodyLock()
    assert lock.select([FakeBody(1, 1200)], 0.0).id == 1
    # 뒤에서 들여다보는 관람객이 10cm 더 가까워도 뺏기지 않는다 (LEAD_MM=15cm)
    held = lock.select([FakeBody(1, 1200), FakeBody(2, 1100)], DT)
    assert held.id == 1
    assert lock.switches == 0


def test_body_lock_switches_only_when_decisively_closer():
    lock = BodyLock()
    lock.select([FakeBody(1, 1200)], 0.0)
    switched = lock.select([FakeBody(1, 1200), FakeBody(2, 900)], DT)
    assert switched.id == 2
    assert lock.switches == 1


def test_body_lock_waits_out_brief_dropouts_instead_of_relocking():
    """한두 프레임 관측 실패는 흔하다 — 그때마다 대상을 바꾸면 지표가 잡음이 된다."""
    lock = BodyLock()
    lock.select([FakeBody(1, 1200)], 0.0)
    assert lock.select([FakeBody(2, 1100)], 0.2) is None  # 유예 중 — 측정 보류
    assert lock.select([FakeBody(1, 1200)], 0.4).id == 1  # 돌아오면 그대로 유지
    assert lock.switches == 0


def test_body_lock_relocks_after_grace_expires():
    lock = BodyLock()
    lock.select([FakeBody(1, 1200)], 0.0)
    assert lock.select([FakeBody(2, 1100)], 0.5) is None
    new = lock.select([FakeBody(2, 1100)], 2.0)  # GRACE_SEC(1.0) 경과
    assert new.id == 2
    assert lock.switches == 1


def test_body_lock_first_acquisition_is_not_a_switch():
    lock = BodyLock()
    lock.select([], 0.0)
    assert lock.select([FakeBody(7, 1300)], 0.1).id == 7
    assert lock.switches == 0


# ---------------------------------------------------------------------------
# MotionTracker — 표본 게이트
# ---------------------------------------------------------------------------

def test_motion_holds_metrics_until_minimum_samples():
    tracker = MotionTracker()
    feed(tracker, [make_joints() for _ in range(MIN_MOTION_SAMPLES - 1)])
    snap = tracker.snapshot()
    assert snap["samples"] == MIN_MOTION_SAMPLES - 1
    # 표본 부족은 0이 아니라 '측정 보류'다 — 숫자를 만들지 않는다
    assert snap["gesture_speed_ms"] is None
    assert snap["hip_sway_norm"] is None
    assert snap["hands_visible_ratio"] is None


def test_motion_window_drops_samples_older_than_window():
    tracker = MotionTracker(window_sec=1.0)
    feed(tracker, [make_joints() for _ in range(90)])  # 3초 분량
    assert tracker.snapshot()["samples"] <= 31


# ---------------------------------------------------------------------------
# 제스처 — 손목 3D 실측
# ---------------------------------------------------------------------------

def test_still_hands_score_zero_gesture_energy():
    tracker = MotionTracker()
    feed(tracker, [make_joints() for _ in range(60)])
    snap = tracker.snapshot()
    assert snap["gesture_speed_ms"] == pytest.approx(0.0, abs=1e-6)
    assert snap["gesture_active_ratio"] == 0.0
    assert snap["hands_visible_ratio"] == 1.0


def test_moving_wrist_measures_real_speed_in_meters_per_second():
    """오른손만 0.6 m/s로 움직인다 — 뎁스는 정규화 프록시가 아니라 실제 m/s를 낸다."""
    step_mm = 600.0 * DT  # 0.6 m/s
    frames = [
        make_joints(wrist_right=(250.0 + step_mm * i, -350.0, 0.0))
        for i in range(60)
    ]
    tracker = MotionTracker()
    feed(tracker, frames)
    snap = tracker.snapshot()
    # 좌(정지)·우(0.6m/s) 표본이 섞이므로 평균은 그 사이
    assert 0.0 < snap["gesture_speed_ms"] < 0.6
    assert snap["gesture_active_ratio"] == pytest.approx(0.5, abs=0.1)
    assert snap["gesture_two_handed_ratio"] == 0.0  # 한 손만 움직였다


def test_two_handed_ratio_counts_frames_where_both_wrists_move():
    step_mm = 600.0 * DT
    frames = [
        make_joints(wrist_left=(-250.0 - step_mm * i, -350.0, 0.0),
                    wrist_right=(250.0 + step_mm * i, -350.0, 0.0))
        for i in range(60)
    ]
    tracker = MotionTracker()
    feed(tracker, frames)
    assert tracker.snapshot()["gesture_two_handed_ratio"] == 1.0


def test_gesture_amplitude_is_absolute_centimeters():
    """뎁스는 절대 거리를 주므로 체격 프록시가 아니라 cm로 서술할 수 있다."""
    tracker = MotionTracker()
    feed(tracker, [make_joints(wrist_left=(-300.0, 0.0, 0.0),
                               wrist_right=(300.0, 0.0, 0.0)) for _ in range(30)])
    # 어깨중심(원점)에서 30cm 뻗은 상태 — 양손 평균도 30cm
    assert tracker.snapshot()["gesture_amplitude_cm"] == pytest.approx(30.0, abs=0.2)


def test_hidden_wrists_lower_visibility_and_hold_gesture_metrics():
    """손이 안 보이면 '제스처 0'이 아니라 '측정 보류'다 — 경직으로 오진하면 안 된다."""
    seen = all_seen()
    seen[JOINT["WRIST_LEFT"]] = False
    seen[JOINT["WRIST_RIGHT"]] = False
    tracker = MotionTracker()
    feed(tracker, [make_joints() for _ in range(60)], seen=seen)
    snap = tracker.snapshot()
    assert snap["hands_visible_ratio"] == 0.0
    assert snap["gesture_speed_ms"] is None
    assert snap["gesture_amplitude_cm"] is None


# ---------------------------------------------------------------------------
# 끄덕임 · 손-얼굴 · 체중 이동
# ---------------------------------------------------------------------------

def nod_frames(cycles: int, amplitude_mm: float = 25.0, steps: int = 5) -> list[np.ndarray]:
    """머리를 내렸다 올리는 동작을 cycles번. 어깨는 고정 — 고개만 움직인다."""
    frames = []
    direction = -1
    for _ in range(cycles * 2):  # 반쪽(내림/올림) 단위
        for s in range(steps):
            offset = direction * amplitude_mm * (s + 1) / steps
            frames.append(make_joints(head_y=300.0 + offset if direction < 0 else
                                      300.0 - amplitude_mm + amplitude_mm * (s + 1) / steps))
        direction *= -1
    return frames


def test_nod_counts_only_gated_reversals():
    tracker = MotionTracker()
    feed(tracker, nod_frames(cycles=3))
    # 반전 2회 = 끄덕임 1회. 왕복 3회면 반전 5~6회 → 2~3회로 센다
    assert 2 <= tracker.nod_count <= 3


def test_micro_tremor_is_not_counted_as_nodding():
    """지터 eps 아래의 미세 떨림을 끄덕임으로 세면 '경청 신호'가 거짓이 된다."""
    frames = [make_joints(head_y=300.0 + (1.0 if i % 2 else -1.0)) for i in range(60)]
    tracker = MotionTracker()
    feed(tracker, frames)
    assert tracker.nod_count == 0


def test_slow_posture_drift_is_not_counted_as_nodding():
    """3초에 걸친 느린 고개 하강은 끄덕임이 아니라 자세 변화다 (NOD_MAX_SWING_SEC)."""
    frames = [make_joints(head_y=300.0 - i * 0.6) for i in range(100)]
    frames += [make_joints(head_y=300.0 - 60.0 + i * 0.6) for i in range(100)]
    tracker = MotionTracker(window_sec=10.0)
    feed(tracker, frames)
    assert tracker.nod_count == 0


def test_nod_total_is_monotonic_across_reset():
    """브라우저가 턴 시작·끝의 차이를 취하므로 reset 후에도 줄면 안 된다."""
    tracker = MotionTracker()
    feed(tracker, nod_frames(cycles=3))
    before = tracker.nod_count
    tracker.reset()
    assert tracker.snapshot()["nod_total"] == before


def test_hand_near_face_is_detected_by_real_distance():
    near = make_joints(wrist_right=(0.0, 300.0 - HAND_FACE_MM / 2, 0.0))
    tracker = MotionTracker()
    feed(tracker, [near for _ in range(30)])
    assert tracker.snapshot()["hand_face_ratio"] == 1.0

    tracker_far = MotionTracker()
    feed(tracker_far, [make_joints() for _ in range(30)])
    assert tracker_far.snapshot()["hand_face_ratio"] == 0.0


def test_hip_sway_is_normalized_by_shoulder_span():
    """골반만 좌우로 옮기는 습관 — 상체 흔들림과 다른 축이다."""
    frames = [make_joints(pelvis_x=30.0 * (1 if i % 2 else -1)) for i in range(60)]
    tracker = MotionTracker()
    feed(tracker, frames)
    # 진폭 30mm 구형파의 표준편차는 30mm → 어깨너비 300mm로 나눠 0.1
    assert tracker.snapshot()["hip_sway_norm"] == pytest.approx(0.1, abs=0.01)


def test_glitch_counter_is_reported_for_measurement_transparency():
    tracker = MotionTracker()
    feed(tracker, [make_joints() for _ in range(30)])
    tracker.note_glitch()
    tracker.note_glitch()
    assert tracker.snapshot()["glitch_total"] == 2
