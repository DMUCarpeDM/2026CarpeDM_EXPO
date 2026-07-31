"""실기기 스모크 — 장치를 열고 N초간 자세 지표를 찍는다.

    .venv/Scripts/python -m app.kinect.smoke [초]

카메라 앞에 서서 (1) 어깨를 한쪽으로 기울이기 (2) 몸을 옆으로 틀기
(3) 고개 숙이기 를 해보면 각 지표가 독립적으로 움직이는지 눈으로 확인된다.
"""
from __future__ import annotations

import sys
import time

import numpy as np

from app.kinect import geometry
from app.kinect import k4a as _k
from app.kinect.device import KinectDevice, nearest_body


def main(duration_sec: float = 12.0) -> int:
    try:
        _k.load()
    except _k.KinectUnavailable as exc:
        print(f"[불가] {exc}")
        return 2

    model = _k.model_path()
    print(f"장치 수: {_k.installed_count()} · BT 모델: {model or '기본 탐색'}")

    chest_history: list[np.ndarray] = []
    frames = tracked = static_frames = 0
    first_frame_at = None       # 트래커 워밍업(cuDNN 자동튜닝) 종료 시점
    steady_started = None       # 워밍업 이후 정상 처리 시작
    steady_frames = 0
    started = time.perf_counter()

    try:
        with KinectDevice() as dev:
            print(f"S/N {dev.serial} · WFOV_2X2BINNED @30fps · 바디트래킹 {dev.processing_mode}"
                  f" · GPU 런타임 {'적재됨' if _k.gpu_runtime_ready else '미적재'}")
            print(f"{'t':>5} {'bodies':>6} {'거리cm':>7} {'어깨°':>7} {'몸통yaw°':>9} "
                  f"{'고개pitch°':>10} {'중력정렬':>8}")
            print("-" * 62)
            last_print = 0.0

            while (elapsed := time.perf_counter() - started) < duration_sec:
                frame = dev.poll(timeout_ms=1000)
                if frame is None:
                    continue
                frames += 1
                if first_frame_at is None:
                    first_frame_at = elapsed
                # 첫 프레임 뒤 1초는 여전히 워밍업 구간 — 정상 처리율에서 제외한다
                if steady_started is None and elapsed - first_frame_at >= 1.0:
                    steady_started = time.perf_counter()
                elif steady_started is not None:
                    steady_frames += 1
                if frame.acc_raw is not None and geometry.is_static(frame.acc_raw):
                    static_frames += 1

                body = nearest_body(frame.bodies)
                rotation = frame.world_rotation
                if body is None or rotation is None:
                    if elapsed - last_print >= 1.0:
                        last_print = elapsed
                        print(f"{elapsed:5.1f} {len(frame.bodies):6d}        (사람 없음)")
                    continue

                tracked += 1
                world = geometry.to_world(body.joints_mm, rotation)
                sl, sr = _k.JOINT["SHOULDER_LEFT"], _k.JOINT["SHOULDER_RIGHT"]
                neck, head = _k.JOINT["NECK"], _k.JOINT["HEAD"]
                chest = _k.JOINT["SPINE_CHEST"]

                tilt = yaw = pitch = None
                if body.all_observed(sl, sr):
                    tilt = geometry.shoulder_tilt_deg(world[sl], world[sr])
                    yaw = geometry.torso_yaw_deg(world[sl], world[sr])
                if body.all_observed(neck, head):
                    pitch = geometry.head_pitch_deg(world[neck], world[head])
                if body.observed(chest):
                    chest_history.append(world[chest])

                if elapsed - last_print >= 0.5:
                    last_print = elapsed
                    fmt = lambda v: f"{v:7.1f}" if v is not None else "      -"  # noqa: E731
                    print(f"{elapsed:5.1f} {len(frame.bodies):6d} "
                          f"{body.distance_mm / 10:7.1f} {fmt(tilt)} {fmt(yaw):>9} "
                          f"{fmt(pitch):>10} {'OK' if rotation is not None else '-':>8}")
    except _k.KinectUnavailable as exc:
        print(f"[불가] {exc}")
        return 2
    except KeyboardInterrupt:
        print("\n중단됨")

    wall = time.perf_counter() - started
    print("-" * 62)
    if first_frame_at is not None:
        print(f"첫 프레임까지 {first_frame_at:.1f}초 (트래커 워밍업 — 전시에서는 "
              f"관람객 도착 전에 미리 띄워둬야 한다)")
    if steady_started is not None and steady_frames:
        steady_wall = time.perf_counter() - steady_started
        print(f"정상 처리율: {steady_frames / max(steady_wall, 1e-6):.1f} fps "
              f"({steady_frames}프레임 / {steady_wall:.1f}초)")
    print(f"전체: {frames}프레임 / {wall:.1f}초 = {frames / max(wall, 1e-6):.1f} fps")
    print(f"바디 추적 성공률: {tracked}/{frames} = {100 * tracked / max(frames, 1):.0f}%")
    print(f"정지(중력만) 프레임: {static_frames}/{frames} — 낮으면 리그가 흔들리는 중")
    if len(chest_history) >= 2:
        print(f"가슴 좌우 흔들림: {geometry.sway_cm(np.array(chest_history)):.2f} cm")
    return 0 if frames else 1


if __name__ == "__main__":
    sys.exit(main(float(sys.argv[1]) if len(sys.argv) > 1 else 12.0))
