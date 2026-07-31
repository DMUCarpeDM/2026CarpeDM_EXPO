"""녹화(.mkv) 재생 — 라이브 장치와 동일한 Frame을 내는 대체 소스.

왜 필요한가: 지표 코드를 고칠 때마다 사람을 카메라 앞에 다시 세울 수는 없다.
같은 입력을 반복 재생하면 (1) 수정 전후를 공정하게 비교할 수 있고,
(2) 밴드·임계값을 실측 기반으로 튜닝할 수 있으며, (3) CI에 넣을 수도 있다.

KinectDevice와 poll() 시그니처가 같으므로 분석 코드는 라이브/녹화를 구분하지
않는다. 녹화는 k4arecorder로 만든다 (컬러+뎁스+IMU 전부 보존):

    k4arecorder.exe -l 10 -c 1080p -d WFOV_2X2BINNED -r 30 --imu ON out.mkv
"""
from __future__ import annotations

from ctypes import byref, c_void_p
from pathlib import Path

import numpy as np

from app.kinect import geometry
from app.kinect import k4a as _k
from app.kinect.device import MODE_NAMES, Body, Frame, _processing_mode


class KinectPlayback:
    """녹화 파일을 프레임 단위로 재생하며 바디 트래킹을 돌린다."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._handle: c_void_p | None = None
        self._tracker: c_void_p | None = None
        self.calibration = _k.k4a_calibration_t()
        self.processing_mode = ""
        self._r_accel_to_depth: np.ndarray | None = None
        self._last_acc: np.ndarray | None = None

    def __enter__(self) -> KinectPlayback:
        _k.load()
        if _k.k4arecord is None:
            raise _k.KinectUnavailable(
                "k4arecord.dll을 찾지 못해 녹화 재생을 쓸 수 없습니다 (Sensor SDK 설치 확인)."
            )
        if not self.path.is_file():
            raise _k.KinectUnavailable(f"녹화 파일이 없습니다: {self.path}")

        handle = c_void_p()
        rc = _k.k4arecord.k4a_playback_open(str(self.path).encode("utf-8"), byref(handle))
        if rc != _k.K4A_RESULT_SUCCEEDED:
            raise _k.KinectUnavailable(f"녹화 열기 실패 (k4a_result={rc}): {self.path}")
        self._handle = handle
        try:
            rc = _k.k4arecord.k4a_playback_get_calibration(handle, byref(self.calibration))
            if rc != _k.K4A_RESULT_SUCCEEDED:
                raise _k.KinectUnavailable(f"녹화 캘리브레이션 조회 실패 (k4a_result={rc})")
            self._r_accel_to_depth = geometry.rotation_from_extrinsics(
                self.calibration.extrinsics[_k.K4A_CALIBRATION_TYPE_ACCEL][
                    _k.K4A_CALIBRATION_TYPE_DEPTH].rotation
            )
            self._tracker = self._create_tracker()
        except Exception:
            self.close()
            raise
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def close(self) -> None:
        if self._tracker is not None:
            _k.k4abt.k4abt_tracker_shutdown(self._tracker)
            _k.k4abt.k4abt_tracker_destroy(self._tracker)
            self._tracker = None
        if self._handle is not None:
            _k.k4arecord.k4a_playback_close(self._handle)
            self._handle = None

    def _create_tracker(self) -> c_void_p:
        """라이브와 같은 폴백 체인 — 녹화 검증 결과가 실기기와 어긋나지 않게."""
        model = _k.model_path()
        encoded = str(model).encode("utf-8") if model else None
        chain = [_processing_mode()]
        for fallback in (_k.K4ABT_TRACKER_PROCESSING_MODE_GPU_DIRECTML,
                         _k.K4ABT_TRACKER_PROCESSING_MODE_CPU):
            if fallback not in chain:
                chain.append(fallback)
        for mode in chain:
            config = _k.k4abt_tracker_configuration_t()
            config.sensor_orientation = _k.K4ABT_SENSOR_ORIENTATION_DEFAULT
            config.processing_mode = mode
            config.gpu_device_id = 0
            config.model_path = encoded
            tracker = c_void_p()
            if _k.k4abt.k4abt_tracker_create(
                    byref(self.calibration), config, byref(tracker)) == _k.K4A_RESULT_SUCCEEDED:
                self.processing_mode = MODE_NAMES.get(mode, str(mode))
                return tracker
        raise _k.KinectUnavailable("녹화 재생용 바디 트래커 생성 실패")

    def _advance_imu(self, count: int = 64) -> None:
        """IMU 커서를 캡처 속도에 맞춰 전진시킨다.

        IMU는 카메라보다 훨씬 빠르게 기록되므로, 프레임당 여러 표본을 소비해야
        영상과 시간이 어긋나지 않는다. 마지막 표본을 그 프레임의 자세로 쓴다.
        """
        sample = _k.k4a_imu_sample_t()
        for _ in range(count):
            rc = _k.k4arecord.k4a_playback_get_next_imu_sample(self._handle, byref(sample))
            if rc != _k.K4A_STREAM_RESULT_SUCCEEDED:
                break
            self._last_acc = np.array(
                [sample.acc_sample.xyz.x, sample.acc_sample.xyz.y, sample.acc_sample.xyz.z],
                dtype=float,
            )

    def poll(self, timeout_ms: int = 1000) -> Frame | None:
        """다음 프레임. 파일 끝이면 None (라이브의 타임아웃과 같은 취급)."""
        if self._handle is None or self._tracker is None:
            raise _k.KinectUnavailable("재생이 열려 있지 않습니다 (with 블록 안에서 쓰세요).")

        capture = c_void_p()
        rc = _k.k4arecord.k4a_playback_get_next_capture(self._handle, byref(capture))
        if rc != _k.K4A_STREAM_RESULT_SUCCEEDED:
            return None
        try:
            if _k.k4abt.k4abt_tracker_enqueue_capture(
                    self._tracker, capture, timeout_ms) != _k.K4A_WAIT_RESULT_SUCCEEDED:
                return None
        finally:
            _k.k4a.k4a_capture_release(capture)

        frame = c_void_p()
        if _k.k4abt.k4abt_tracker_pop_result(
                self._tracker, byref(frame), timeout_ms) != _k.K4A_WAIT_RESULT_SUCCEEDED:
            return None
        try:
            bodies = self._read_bodies(frame)
        finally:
            _k.k4abt.k4abt_frame_release(frame)

        self._advance_imu()
        up = (geometry.up_in_depth(self._last_acc, self._r_accel_to_depth)
              if self._last_acc is not None and self._r_accel_to_depth is not None else None)
        return Frame(bodies=bodies, up_depth=up, acc_raw=self._last_acc)

    def _read_bodies(self, frame: c_void_p) -> list[Body]:
        count = int(_k.k4abt.k4abt_frame_get_num_bodies(frame))
        out: list[Body] = []
        skeleton = _k.k4abt_skeleton_t()
        for index in range(count):
            if _k.k4abt.k4abt_frame_get_body_skeleton(
                    frame, index, byref(skeleton)) != _k.K4A_RESULT_SUCCEEDED:
                continue
            joints = np.empty((_k.K4ABT_JOINT_COUNT, 3), dtype=float)
            confidence = np.empty(_k.K4ABT_JOINT_COUNT, dtype=int)
            for j in range(_k.K4ABT_JOINT_COUNT):
                pos = skeleton.joints[j].position.xyz
                joints[j] = (pos.x, pos.y, pos.z)
                confidence[j] = skeleton.joints[j].confidence_level
            out.append(Body(
                id=int(_k.k4abt.k4abt_frame_get_body_id(frame, index)),
                joints_mm=joints,
                confidence=confidence,
                index=index,
            ))
        return out
