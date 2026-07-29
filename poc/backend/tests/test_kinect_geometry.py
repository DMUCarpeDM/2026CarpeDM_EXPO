"""Kinect 자세 기하 — 하드웨어 없이 도는 순수 수학 테스트.

app.kinect.geometry는 ctypes를 import하지 않으므로 macOS 개발기에서도 돈다
(바인딩 app.kinect.k4a는 Windows 전용이라 여기서 건드리지 않는다).
"""
import math

import numpy as np
import pytest

from app.kinect import geometry

IDENTITY = np.eye(3)


def rot_x(deg: float) -> np.ndarray:
    """카메라를 아래로 틸트한 상황을 만드는 x축 회전 (뎁스 좌표계)."""
    a = math.radians(deg)
    return np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])


# ---- 중력 정렬 -------------------------------------------------------------


def test_수평_카메라에서_가속도계는_뎁스_Y축_위를_가리킨다():
    """가속도계는 중력이 아니라 그 반작용을 읽는다 — 정지 시 '위'다.

    뎁스 +Y가 아래이므로, 수평 거치한 카메라의 가속도계는 (0, -1, 0)이 된다.
    이 부호를 착각하면 세계 좌표계가 통째로 뒤집힌다.
    """
    up = geometry.up_in_depth([0.0, -9.81, 0.0], IDENTITY)
    assert np.allclose(up, [0.0, -1.0, 0.0])

    world = geometry.world_frame(up)
    assert np.allclose(world[1], [0.0, -1.0, 0.0])  # 세계 '위' = 뎁스 -Y


def test_실측_가속도계는_위를_가리킨다_회귀():
    """실기기 실측 회귀 — 부호를 되돌리면 고개 각도가 180도 어긋난다.

    2026-07-27 S/N 000246214712, 수평 거치, 정지 60표본 평균(뎁스 좌표계).
    독립 근거 둘 다 '위'를 지목: 수평거치 가정과 내적 +0.999,
    관절 기반 정답(머리-골반)과 내적 +0.999.
    """
    measured = np.array([-0.012, -0.999, -0.049])
    up = geometry.world_frame(measured)[1]
    assert float(np.dot(up, measured)) > 0.99  # 반전 없이 그대로 '위'
    assert up[1] < 0  # 세계 '위'는 뎁스 -Y 쪽


def test_가속도계_좌표계_변환이_적용된다():
    # 가속도계가 뎁스와 다른 축을 쓰는 경우 — extrinsics 회전이 반영돼야 한다
    r = np.array([[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
    up = geometry.up_in_depth([0.0, -9.81, 0.0], r)
    assert np.allclose(up, [0.0, 0.0, -1.0])


def test_정지_판정은_중력_크기로_한다():
    assert geometry.is_static([0.0, 9.81, 0.0])
    assert not geometry.is_static([0.0, 3.0, 0.0])   # 자유낙하/충격
    assert not geometry.is_static([5.0, 9.81, 5.0])  # 리그를 친 순간


def test_아래로_틸트한_카메라의_거치각도가_흡수된다():
    """이 테스트가 이 모듈의 존재 이유다.

    카메라를 20도 아래로 틸트해 달면, 정렬 없이는 수평인 어깨가 20도 기운
    것으로 측정된다 — 거치 각도가 그대로 점수에 섞인다.
    """
    tilt_deg = 20.0
    mount = rot_x(tilt_deg)  # 카메라를 아래로 20도

    # 실제로는 수평인 어깨 (세계 좌표계에서 좌우로만 벌어짐)
    sl_world_truth = np.array([-150.0, 0.0, 1000.0])
    sr_world_truth = np.array([150.0, 0.0, 1000.0])
    # 카메라가 보는 좌표(뎁스)로 되돌린다: 세계 +X는 뎁스 -X이므로 부호가 뒤집힌다
    to_depth = np.array([[-1.0, 0, 0], [0, -1.0, 0], [0, 0, 1.0]])
    sl_depth = mount @ (to_depth @ sl_world_truth)
    sr_depth = mount @ (to_depth @ sr_world_truth)

    # 정렬 없이 재면 기운 것으로 나온다
    naive = geometry.shoulder_tilt_deg(sl_depth, sr_depth)
    assert naive is not None

    # IMU로 중력 정렬하면 0으로 돌아온다 (수평 거치 가속도계 = (0,-9.81,0))
    up = geometry.up_in_depth(mount @ np.array([0.0, -9.81, 0.0]), IDENTITY)
    rotation = geometry.world_frame(up)
    world = geometry.to_world(np.stack([sl_depth, sr_depth]), rotation)
    corrected = geometry.shoulder_tilt_deg(world[0], world[1])
    assert corrected == pytest.approx(0.0, abs=1e-6)


# ---- 어깨 기울기 -----------------------------------------------------------


def test_오른쪽_어깨가_높으면_양수다():
    sl = np.array([-150.0, 0.0, 1000.0])
    sr = np.array([150.0, 100.0, 1000.0])
    assert geometry.shoulder_tilt_deg(sl, sr) == pytest.approx(18.43, abs=0.01)
    # 좌우를 바꾸면 부호가 뒤집힌다
    assert geometry.shoulder_tilt_deg(sr, sl) == pytest.approx(-18.43, abs=0.01)


@pytest.mark.parametrize("yaw_deg", [0, 15, 30, 45, 60, -30])
def test_어깨_기울기는_몸통_회전에_불변이다(yaw_deg):
    """2D 투영의 고질병 — 비스듬히 선 사람의 어깨가 기울어 보이는 문제가 없어야 한다."""
    span, rise = 300.0, 100.0
    a = math.radians(yaw_deg)
    sl = np.array([0.0, 0.0, 1000.0])
    sr = sl + np.array([span * math.cos(a), rise, span * math.sin(a)])
    expected = math.degrees(math.asin(rise / math.hypot(span, rise)))
    assert geometry.shoulder_tilt_deg(sl, sr) == pytest.approx(expected, abs=1e-9)


def test_어깨가_너무_좁으면_측정_보류():
    sl = np.array([0.0, 0.0, 1000.0])
    sr = np.array([50.0, 0.0, 1000.0])  # 5cm — 옆모습이거나 추적 실패
    assert geometry.shoulder_tilt_deg(sl, sr) is None
    assert geometry.torso_yaw_deg(sl, sr) is None


# ---- 몸통 회전 -------------------------------------------------------------


def test_몸통_회전은_정면에서_0이고_틀면_커진다():
    sl = np.array([-150.0, 0.0, 1000.0])
    facing = np.array([150.0, 0.0, 1000.0])
    assert geometry.torso_yaw_deg(sl, facing) == pytest.approx(0.0, abs=1e-9)

    turned = sl + np.array([300.0 * math.cos(math.radians(40)), 0.0,
                            300.0 * math.sin(math.radians(40))])
    assert geometry.torso_yaw_deg(sl, turned) == pytest.approx(40.0, abs=1e-9)


# ---- 고개 각도 -------------------------------------------------------------


def test_고개_숙임은_양수_젖힘은_음수():
    neck = np.array([0.0, 1400.0, 1000.0])
    upright = neck + np.array([0.0, 200.0, 0.0])
    assert geometry.head_pitch_deg(neck, upright) == pytest.approx(0.0, abs=1e-9)

    # 카메라를 마주 본 사람이 숙이면 머리는 세계 -Z(카메라 쪽)로 간다
    bowed = neck + np.array([0.0, 190.0, -60.0])
    assert geometry.head_pitch_deg(neck, bowed) > 0

    leaning_back = neck + np.array([0.0, 190.0, 60.0])
    assert geometry.head_pitch_deg(neck, leaning_back) < 0


# ---- 거리 기반 지표 --------------------------------------------------------


def test_lean은_다가오면_양수다():
    baseline_z = 1200.0
    assert geometry.lean_cm(np.array([0.0, 0.0, 1100.0]), baseline_z) == pytest.approx(10.0)
    assert geometry.lean_cm(np.array([0.0, 0.0, 1300.0]), baseline_z) == pytest.approx(-10.0)


def test_sway는_cm_단위_표준편차다():
    # ±10mm 구형파 → 표준편차 10mm = 1cm
    xs = np.array([[1000.0 + (10 if i % 2 == 0 else -10), 0.0, 1000.0] for i in range(20)])
    assert geometry.sway_cm(xs) == pytest.approx(1.0, abs=1e-9)
    assert geometry.sway_cm(np.array([[0.0, 0.0, 0.0]])) == 0.0


def test_제스처_속도는_ms_단위다():
    # 프레임당 30mm 이동, 30fps → 0.03m / (1/30)s = 0.9 m/s
    pts = np.array([[i * 30.0, 0.0, 0.0] for i in range(10)])
    assert geometry.gesture_speed_ms(pts, 1 / 30) == pytest.approx(0.9, abs=1e-9)
    assert geometry.gesture_speed_ms(pts[:1], 1 / 30) is None
