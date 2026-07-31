"""관절 좌표 → 자세 지표. 순수 numpy라 하드웨어 없이 테스트한다.

좌표계 주의 (통합 실패의 단골 원인):
  - k4abt 관절은 **뎁스 카메라 좌표계**의 밀리미터다: +X 오른쪽, +Y 아래, +Z 전방.
  - 카메라를 미러 상단에 아래로 틸트해 달면 raw Y축은 수직이 아니다. 이 상태로
    어깨 기울기를 재면 **거치 각도가 점수에 그대로 섞인다.**
  - 그래서 IMU 가속도계로 중력을 구해 세계 좌표계(+Y = 진짜 위)로 옮긴 뒤 잰다.
  - 가속도계는 뎁스 카메라와 다른 좌표계를 쓴다. 캘리브레이션의
    extrinsics[ACCEL][DEPTH] 회전으로 변환해야 한다 (문서 값 추정 금지).
"""
from __future__ import annotations

import math

import numpy as np

# 어깨너비가 이보다 좁으면 정규화·각도 계산이 불안정하다 (mm)
MIN_SHOULDER_SPAN_MM = 80.0


def rotation_from_extrinsics(rotation9) -> np.ndarray:
    """k4a_calibration_extrinsics_t.rotation (행 우선 3x3)을 numpy 행렬로."""
    return np.asarray(rotation9, dtype=float).reshape(3, 3)


def up_in_depth(acc_sample, r_accel_to_depth: np.ndarray) -> np.ndarray | None:
    """가속도계 표본을 뎁스 카메라 좌표계의 단위 **위** 벡터로 변환.

    가속도계는 중력이 아니라 그 반작용(proper acceleration)을 읽는다 — 정지
    상태에서 벡터는 '아래'가 아니라 **'위'**를 가리킨다. 이 부호를 착각하면
    세계 좌표계가 통째로 뒤집혀 고개 각도가 180도 어긋난다.

    실측 확인(2026-07-27, S/N 000246214712, 정지 60표본):
      - 수평 거치 가정의 위(0,-1,0)와 내적 +0.999
      - 관절 기반 정답(머리-골반)과 내적 +0.999
    두 근거가 독립적으로 '위'를 가리켰다.

    움직이는 중이면 크기가 9.8에서 벗어나므로, 크기 검사는 호출부가
    is_static()으로 하도록 여기서는 정규화만 한다.
    """
    v = r_accel_to_depth @ np.asarray(acc_sample, dtype=float)
    norm = float(np.linalg.norm(v))
    if norm < 1e-6:
        return None
    return v / norm


def is_static(acc_sample, tolerance: float = 1.5) -> bool:
    """중력만 받고 있는가 — 벗어나면 리그가 흔들리는 중이라 기준이 오염된다."""
    return abs(float(np.linalg.norm(np.asarray(acc_sample, dtype=float))) - 9.81) <= tolerance


def world_frame(up_depth: np.ndarray) -> np.ndarray:
    """중력정렬 회전 R — v_world = R @ v_depth.

    입력은 up_in_depth()가 준 **위** 벡터다 (중력 벡터가 아니다 — 부호 주의).

    세계축(오른손, cross(up, fwd) = right):
      +Y  위 (중력 반대)
      +Z  카메라 광축의 수평 성분 — 카메라에서 **멀어지는** 방향
      +X  cross(up, fwd). 뎁스 +X의 반대이므로, 카메라를 마주 본 사람 기준
          '그 사람의 오른쪽'이 된다. 덕분에 정면을 볼 때 torso_yaw가 0이다.
    """
    up = np.asarray(up_depth, dtype=float)
    up = up / np.linalg.norm(up)

    optical_axis = np.array([0.0, 0.0, 1.0])  # 뎁스 좌표계의 광축
    fwd = optical_axis - np.dot(optical_axis, up) * up  # 수평면에 투영
    if np.linalg.norm(fwd) < 1e-3:
        # 카메라가 거의 수직으로 아래/위를 볼 때 — 광축이 중력과 나란해 투영이 소멸.
        # 미러 거치에서는 나오지 않지만 수치 폭주를 막기 위한 폴백.
        fwd = np.array([0.0, 0.0, 1.0]) - np.dot(np.array([0.0, 0.0, 1.0]), up) * up
        if np.linalg.norm(fwd) < 1e-6:
            fwd = np.cross(up, np.array([1.0, 0.0, 0.0]))
    fwd = fwd / np.linalg.norm(fwd)
    right = np.cross(up, fwd)
    return np.stack([right, up, fwd])


def to_world(joints_mm: np.ndarray, rotation: np.ndarray) -> np.ndarray:
    """(N,3) 관절을 중력정렬 세계 좌표계로. 단위는 mm 유지."""
    return np.asarray(joints_mm, dtype=float) @ rotation.T


def shoulder_span_mm(shoulder_left: np.ndarray, shoulder_right: np.ndarray) -> float:
    return float(np.linalg.norm(np.asarray(shoulder_right) - np.asarray(shoulder_left)))


def shoulder_tilt_deg(shoulder_left: np.ndarray, shoulder_right: np.ndarray) -> float | None:
    """어깨선의 수평 대비 기울기(도). 양수 = 오른쪽 어깨가 높다.

    2D 투영과 달리 **몸통 회전(yaw)에 불변**하다 — 비스듬히 선 사람의 어깨가
    기울어 보이는 MediaPipe의 고질적 오차가 여기서 사라진다.
    """
    v = np.asarray(shoulder_right, dtype=float) - np.asarray(shoulder_left, dtype=float)
    span = float(np.linalg.norm(v))
    if span < MIN_SHOULDER_SPAN_MM:
        return None
    return math.degrees(math.asin(float(np.clip(v[1] / span, -1.0, 1.0))))


def torso_yaw_deg(shoulder_left: np.ndarray, shoulder_right: np.ndarray) -> float | None:
    """어깨선이 정면에서 얼마나 돌아갔는가(도). 0 = 카메라 정면.

    MediaPipe로는 낼 수 없는 축이다 — 2D에서는 '어깨폭 축소'로만 보여서
    뒤로 물러난 것과 구분되지 않는다. 거울 앞에서 몸을 트는 건 회피 신호다.
    """
    v = np.asarray(shoulder_right, dtype=float) - np.asarray(shoulder_left, dtype=float)
    if float(np.linalg.norm(v)) < MIN_SHOULDER_SPAN_MM:
        return None
    return math.degrees(math.atan2(float(v[2]), float(v[0])))


def head_pitch_deg(neck: np.ndarray, head: np.ndarray) -> float | None:
    """고개 앞뒤 기울기(도). 0 = 목 위로 곧게, 양수 = 앞으로(카메라 쪽) 숙임.

    세계 +Z가 카메라에서 멀어지는 방향이므로, 카메라를 마주 본 사람이 고개를
    숙이면 머리는 -Z로 간다 → 부호를 뒤집어 '숙임 = 양수'로 맞춘다.

    기존 MediaPipe 경로의 head_down_ratio는 eyeLookDown blendshape(=안구 방향)
    이었다. 이것은 실제 고개 각도로, 물리량 자체가 다르다.
    """
    v = np.asarray(head, dtype=float) - np.asarray(neck, dtype=float)
    if float(np.linalg.norm(v)) < 1e-6:
        return None
    return math.degrees(math.atan2(-float(v[2]), float(v[1])))


def lean_cm(chest: np.ndarray, baseline_z_mm: float) -> float:
    """기준 대비 상체 전후 이동(cm). 양수 = 카메라 쪽으로 다가옴.

    기존 lean_drift_pct는 어깨폭 프록시라 체격에 따라 스케일이 달라 사람 간
    비교가 불가능했다. 뎁스는 절대 거리를 준다.
    """
    return (baseline_z_mm - float(np.asarray(chest, dtype=float)[2])) / 10.0


def sway_cm(chest_positions: np.ndarray) -> float:
    """좌우 흔들림 — 가슴 중심 x의 표준편차(cm).

    어깨너비로 정규화한 비율이 아니라 실제 cm라 리포트에 그대로 쓸 수 있다
    ("답변 중 평균 4.2cm 흔들림").
    """
    xs = np.asarray(chest_positions, dtype=float)
    if xs.ndim == 2:
        xs = xs[:, 0]
    if xs.size < 2:
        return 0.0
    return float(np.std(xs)) / 10.0


def gesture_speed_ms(wrist_positions: np.ndarray, dt_sec: float) -> float | None:
    """손목 평균 속도(m/s) — 제스처 에너지. 표본 2개 미만이면 None."""
    pts = np.asarray(wrist_positions, dtype=float)
    if pts.shape[0] < 2 or dt_sec <= 0:
        return None
    steps = np.linalg.norm(np.diff(pts, axis=0), axis=1) / 1000.0  # mm → m
    return float(np.mean(steps) / dt_sec)
