"""Kinect 장치 수명 관리 + 바디 트래킹 루프.

기본 설정은 전시 미러(체험자가 약 1m 앞에 서는 키오스크) 기준이다:
  - WFOV_2X2BINNED — 1m에서 수직 3.46m를 덮어 전신이 들어온다. NFOV는 1.27m라
    허리에서 잘리고, k4abt는 전신 실루엣으로 학습된 모델이라 하반신이 잘리면
    PELVIS·SPINE_NAVEL이 관측이 아니라 외삽으로 채워진다.
  - 30fps — 실측 CUDA 23.4ms/프레임(≈43fps)이라 여유가 있다.
  - CUDA — Windows 기본값은 DirectML이지만 이 하드웨어(RTX 3060)에서는 CUDA가 빠르다.
"""
from __future__ import annotations

import ctypes
import os
from ctypes import byref, c_void_p
from dataclasses import dataclass

import numpy as np

from app.kinect import k4a as _k
from app.kinect import geometry

DEFAULT_DEPTH_MODE = _k.K4A_DEPTH_MODE_WFOV_2X2BINNED
DEFAULT_FPS = _k.K4A_FRAMES_PER_SECOND_30
# 키오스크 유효 거리(mm) — 이 밖의 바디는 관람객/지나가는 사람으로 본다.
#
# 근거리 하한 1000mm의 근거(실측 2026-07-27, 700프레임, 43~207cm): 100cm 미만에서는
# 골반이 프레임에서 잘려 몸통 띠 정의가 깨지고 지표가 무의미해진다 —
# 척추 편차가 100cm 이상에서 26.9~32.8mm로 평탄한데, 그 아래에서는
# -31.7~+57.4mm로 요동쳤다. 전시 설계가 '미러 앞 1m'이므로 경계선에 해당하니
# 리그 완성 후 실제 높이에서 재확인이 필요하다.
# 책상 위 개발 환경은 거리를 자유롭게 못 잡으므로 환경변수로 조정 가능하게 둔다.
KIOSK_NEAR_MM = float(os.environ.get("MIRROR_TING_KINECT_NEAR_MM", 1000))
KIOSK_FAR_MM = float(os.environ.get("MIRROR_TING_KINECT_FAR_MM", 2000))

MODE_NAMES = {
    _k.K4ABT_TRACKER_PROCESSING_MODE_GPU: "GPU(auto)",
    _k.K4ABT_TRACKER_PROCESSING_MODE_CPU: "CPU",
    _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_CUDA: "CUDA",
    _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_TENSORRT: "TensorRT",
    _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_DIRECTML: "DirectML",
}


@dataclass(frozen=True)
class Body:
    """한 사람의 스켈레톤. joints_mm은 뎁스 카메라 좌표계(mm)."""

    id: int
    joints_mm: np.ndarray      # (32, 3)
    confidence: np.ndarray     # (32,) k4abt_joint_confidence_level_t
    # 프레임 내 순번 — 바디 인덱스 맵의 픽셀 값이 이것이다(id가 아니다).
    # 표면 점을 고를 때 id를 쓰면 다른 사람의 픽셀을 집는다.
    index: int = 0

    def observed(self, joint: int) -> bool:
        """관측된 관절인가 — LOW는 '가려져서 예측만 한' 값이라 지표에 쓰면 안 된다."""
        return bool(self.confidence[joint] >= _k.K4ABT_JOINT_CONFIDENCE_MEDIUM)

    def all_observed(self, *joints: int) -> bool:
        return all(self.observed(j) for j in joints)

    @property
    def distance_mm(self) -> float:
        """카메라로부터의 거리 — 가슴 z. 관람객 분리 판정에 쓴다."""
        return float(self.joints_mm[_k.JOINT["SPINE_CHEST"], 2])


@dataclass(frozen=True)
class Frame:
    bodies: list[Body]
    up_depth: np.ndarray | None  # 뎁스 좌표계 단위 '위' 벡터 (없으면 IMU 미확보)
    acc_raw: np.ndarray | None
    # 시각화·표면 측정용 원본 (capture_images=True일 때만 채워진다)
    depth_mm: np.ndarray | None = None  # (H, W) uint16, 밀리미터
    ir: np.ndarray | None = None        # (H, W) uint16, 능동 IR 밝기
    # 포인트 클라우드 — 관절 32개가 아닌 실제 측정 원본 (최대 26만 점)
    xyz_mm: np.ndarray | None = None    # (H, W, 3) int16, 뎁스 좌표계
    body_index_map: np.ndarray | None = None  # (H, W) uint8, 255=배경

    @property
    def world_rotation(self) -> np.ndarray | None:
        if self.up_depth is None:
            return None
        return geometry.world_frame(self.up_depth)


def nearest_body(bodies: list[Body],
                 near_mm: float = KIOSK_NEAR_MM,
                 far_mm: float = KIOSK_FAR_MM) -> Body | None:
    """유효 거리 안에서 가장 가까운 바디 하나.

    전시 부스에서 관람객이 몰리면 브라우저 MediaPipe(numFaces:1)는 잡히는 얼굴을
    아무거나 측정한다. 뎁스는 바디별 3D 위치를 주므로 '거울 앞에 선 사람'만
    고를 수 있다 — 현장에서 가장 크게 체감되는 차이다.
    """
    candidates = [
        b for b in bodies
        if b.observed(_k.JOINT["SPINE_CHEST"]) and near_mm <= b.distance_mm <= far_mm
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda b: b.distance_mm)


def image_to_array(image, dtype, channels: int = 1) -> np.ndarray | None:
    """k4a_image_t → numpy 배열. 반드시 복사한다 (release 후 버퍼는 무효)."""
    if not image:
        return None
    width = _k.k4a.k4a_image_get_width_pixels(image)
    height = _k.k4a.k4a_image_get_height_pixels(image)
    size = int(_k.k4a.k4a_image_get_size(image))
    buffer = _k.k4a.k4a_image_get_buffer(image)
    if width <= 0 or height <= 0 or size <= 0 or not buffer:
        return None
    raw = np.ctypeslib.as_array(buffer, shape=(size,))
    shape = (height, width) if channels == 1 else (height, width, channels)
    return raw.view(dtype).reshape(shape).copy()


def project_to_depth_2d(calibration, point_mm: np.ndarray) -> tuple[float, float] | None:
    """뎁스 좌표계 3D 점 → 뎁스 이미지 픽셀. FOV 밖이면 None.

    직접 핀홀 투영을 짜지 않고 SDK를 쓰는 이유: Brown-Conrady 왜곡 계수를
    반영해야 가장자리에서 어긋나지 않는다. WFOV는 120도라 왜곡이 크다.
    """
    src = _k.k4a_float3_t()
    src.xyz.x, src.xyz.y, src.xyz.z = (float(v) for v in point_mm)
    dst = _k.k4a_float2_t()
    valid = ctypes.c_int(0)
    rc = _k.k4a.k4a_calibration_3d_to_2d(
        ctypes.byref(calibration), ctypes.byref(src),
        _k.K4A_CALIBRATION_TYPE_DEPTH, _k.K4A_CALIBRATION_TYPE_DEPTH,
        ctypes.byref(dst), ctypes.byref(valid),
    )
    if rc != _k.K4A_RESULT_SUCCEEDED or not valid.value:
        return None
    return float(dst.xy.x), float(dst.xy.y)


def _check(result: int, what: str) -> None:
    if result != _k.K4A_RESULT_SUCCEEDED:
        raise _k.KinectUnavailable(f"{what} 실패 (k4a_result={result})")


def _processing_mode() -> int:
    name = os.environ.get("MIRROR_TING_KINECT_BT_MODE", "cuda").lower()
    return {
        "cuda": _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_CUDA,
        "directml": _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_DIRECTML,
        "tensorrt": _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_TENSORRT,
        "cpu": _k.K4ABT_TRACKER_PROCESSING_MODE_CPU,
        "gpu": _k.K4ABT_TRACKER_PROCESSING_MODE_GPU,
    }.get(name, _k.K4ABT_TRACKER_PROCESSING_MODE_GPU_CUDA)


class KinectDevice:
    """컨텍스트 매니저 — with 블록을 벗어나면 카메라·트래커를 반드시 닫는다."""

    def __init__(self, depth_mode: int = DEFAULT_DEPTH_MODE, fps: int = DEFAULT_FPS,
                 color_resolution: int = _k.K4A_COLOR_RESOLUTION_OFF,
                 device_index: int = 0, capture_images: bool = False):
        self.depth_mode = depth_mode
        self.fps = fps
        self.color_resolution = color_resolution
        self.device_index = device_index
        # 뎁스/IR 배열을 Frame에 실어 보낼지 — 뷰어에만 필요, 복사 비용이 있다
        self.capture_images = capture_images
        self._device: c_void_p | None = None
        self._tracker: c_void_p | None = None
        self._transformation: c_void_p | None = None
        self._xyz_image: c_void_p | None = None  # 재사용 — 프레임마다 만들면 낭비다
        self.processing_mode = ""  # 실제로 성공한 바디트래킹 모드 (폴백 결과 확인용)
        self.calibration = _k.k4a_calibration_t()
        self.serial = ""
        self._r_accel_to_depth: np.ndarray | None = None

    # -- 수명 --------------------------------------------------------------

    def __enter__(self) -> KinectDevice:
        _k.load()
        if _k.installed_count() <= self.device_index:
            raise _k.KinectUnavailable(
                "Azure Kinect가 연결되어 있지 않습니다 (USB3 포트·전원 어댑터 확인)."
            )
        device = c_void_p()
        _check(_k.k4a.k4a_device_open(self.device_index, byref(device)), "장치 열기")
        self._device = device
        try:
            self.serial = self._read_serial()
            # 컬러를 스트리밍하지 않더라도 1080p 기준 캘리브레이션을 받아둔다 —
            # 이후 MediaPipe 융합(색상 픽셀 → 뎁스 → 3D)에 색상 내부 파라미터가 필요하다.
            calib_color = (self.color_resolution if self.color_resolution != _k.K4A_COLOR_RESOLUTION_OFF
                           else _k.K4A_COLOR_RESOLUTION_1080P)
            _check(
                _k.k4a.k4a_device_get_calibration(
                    device, self.depth_mode, calib_color, byref(self.calibration)),
                "캘리브레이션 조회",
            )
            self._r_accel_to_depth = geometry.rotation_from_extrinsics(
                self.calibration.extrinsics[_k.K4A_CALIBRATION_TYPE_ACCEL][
                    _k.K4A_CALIBRATION_TYPE_DEPTH].rotation
            )
            # 뎁스 → 포인트 클라우드 변환기. 실패해도 관절 경로는 살아야 하므로
            # 예외로 올리지 않는다 (표면 지표만 None이 된다).
            if self.capture_images:
                handle = _k.k4a.k4a_transformation_create(byref(self.calibration))
                self._transformation = c_void_p(handle) if handle else None

            config = _k.k4a_device_configuration_t()
            config.color_format = _k.K4A_IMAGE_FORMAT_COLOR_MJPG
            config.color_resolution = self.color_resolution
            config.depth_mode = self.depth_mode
            config.camera_fps = self.fps
            config.synchronized_images_only = self.color_resolution != _k.K4A_COLOR_RESOLUTION_OFF
            config.depth_delay_off_color_usec = 0
            config.wired_sync_mode = _k.K4A_WIRED_SYNC_MODE_STANDALONE
            config.subordinate_delay_off_master_usec = 0
            config.disable_streaming_indicator = False
            _check(_k.k4a.k4a_device_start_cameras(device, byref(config)), "카메라 시작")
            _check(_k.k4a.k4a_device_start_imu(device), "IMU 시작")

            self._tracker = self._create_tracker()
        except Exception:
            self.close()
            raise
        return self

    def _create_tracker(self) -> c_void_p:
        """설정 모드로 트래커 생성, 실패하면 단계적으로 폴백한다.

        전시 중 드라이버 업데이트 하나로 부스가 죽어서는 안 된다.
        CUDA → DirectML(내장 GPU 포함) → CPU 순으로 내려간다. CPU는 훨씬
        느리지만 '자세 측정 없음'보다는 낫다.
        """
        model = _k.model_path()
        encoded_model = str(model).encode("utf-8") if model else None

        chain = [_processing_mode()]
        for fallback in (_k.K4ABT_TRACKER_PROCESSING_MODE_GPU_DIRECTML,
                         _k.K4ABT_TRACKER_PROCESSING_MODE_CPU):
            if fallback not in chain:
                chain.append(fallback)

        attempted: list[str] = []
        for mode in chain:
            config = _k.k4abt_tracker_configuration_t()
            config.sensor_orientation = _k.K4ABT_SENSOR_ORIENTATION_DEFAULT
            config.processing_mode = mode
            config.gpu_device_id = 0
            # 모델 경로를 명시해 작업 디렉터리 의존을 없앤다 (서비스로 띄울 때 중요)
            config.model_path = encoded_model
            tracker = c_void_p()
            rc = _k.k4abt.k4abt_tracker_create(byref(self.calibration), config, byref(tracker))
            if rc == _k.K4A_RESULT_SUCCEEDED:
                self.processing_mode = MODE_NAMES.get(mode, str(mode))
                return tracker
            attempted.append(MODE_NAMES.get(mode, str(mode)))
        raise _k.KinectUnavailable(
            "바디 트래커를 생성하지 못했습니다 (시도: " + " → ".join(attempted) + "). "
            "NVIDIA 드라이버와 Body Tracking SDK 설치를 확인하세요."
        )

    def __exit__(self, *_exc) -> None:
        self.close()

    def _grab_images(self, capture):
        """뎁스·IR·포인트 클라우드를 한 번에 꺼낸다 (capture를 놓기 전에 호출)."""
        depth_mm = ir = xyz = None
        depth_image = _k.k4a.k4a_capture_get_depth_image(capture)
        if depth_image:
            depth_mm = image_to_array(depth_image, np.uint16)
            xyz = self._point_cloud(depth_image)
            _k.k4a.k4a_image_release(depth_image)
        ir_image = _k.k4a.k4a_capture_get_ir_image(capture)
        if ir_image:
            ir = image_to_array(ir_image, np.uint16)
            _k.k4a.k4a_image_release(ir_image)
        return depth_mm, ir, xyz

    def _point_cloud(self, depth_image) -> np.ndarray | None:
        """뎁스 이미지 → (H, W, 3) int16 XYZ(mm). 출력 이미지를 재사용한다."""
        if self._transformation is None:
            return None
        width = _k.k4a.k4a_image_get_width_pixels(depth_image)
        height = _k.k4a.k4a_image_get_height_pixels(depth_image)
        if width <= 0 or height <= 0:
            return None
        if self._xyz_image is None:
            image = c_void_p()
            # XYZ가 각각 int16 → 픽셀당 6바이트
            if _k.k4a.k4a_image_create(_k.K4A_IMAGE_FORMAT_CUSTOM, width, height,
                                       width * 6, byref(image)) != _k.K4A_RESULT_SUCCEEDED:
                return None
            self._xyz_image = image
        if _k.k4a.k4a_transformation_depth_image_to_point_cloud(
                self._transformation, depth_image, _k.K4A_CALIBRATION_TYPE_DEPTH,
                self._xyz_image) != _k.K4A_RESULT_SUCCEEDED:
            return None
        return image_to_array(self._xyz_image, np.int16, channels=3)

    def _body_index_map(self, frame) -> np.ndarray | None:
        """픽셀 단위 인체 분할. 값은 바디의 프레임 내 순번, 255는 배경."""
        image = _k.k4abt.k4abt_frame_get_body_index_map(frame)
        if not image:
            return None
        try:
            return image_to_array(image, np.uint8)
        finally:
            _k.k4a.k4a_image_release(image)

    def close(self) -> None:
        if self._xyz_image is not None:
            _k.k4a.k4a_image_release(self._xyz_image)
            self._xyz_image = None
        if self._transformation is not None:
            _k.k4a.k4a_transformation_destroy(self._transformation)
            self._transformation = None
        if self._tracker is not None:
            _k.k4abt.k4abt_tracker_shutdown(self._tracker)
            _k.k4abt.k4abt_tracker_destroy(self._tracker)
            self._tracker = None
        if self._device is not None:
            _k.k4a.k4a_device_stop_imu(self._device)
            _k.k4a.k4a_device_stop_cameras(self._device)
            _k.k4a.k4a_device_close(self._device)
            self._device = None

    def _read_serial(self) -> str:
        size = ctypes.c_size_t(0)
        _k.k4a.k4a_device_get_serialnum(self._device, None, byref(size))
        buf = (ctypes.c_uint8 * size.value)()
        _k.k4a.k4a_device_get_serialnum(self._device, buf, byref(size))
        return bytes(buf).rstrip(b"\x00").decode("ascii", "replace")

    # -- 폴링 --------------------------------------------------------------

    def _latest_imu(self) -> np.ndarray | None:
        """IMU 큐를 비워 가장 최신 표본을 얻는다.

        IMU는 카메라보다 훨씬 빠르게 쌓이므로, 한 번만 읽으면 수백 ms 뒤처진
        표본을 쓰게 된다. TIMEOUT이 날 때까지 비운 뒤 마지막 것을 쓴다.
        """
        sample = _k.k4a_imu_sample_t()
        latest = None
        for _ in range(256):  # 무한 루프 방지 상한
            rc = _k.k4a.k4a_device_get_imu_sample(self._device, byref(sample), 0)
            if rc != _k.K4A_WAIT_RESULT_SUCCEEDED:
                break
            latest = np.array(
                [sample.acc_sample.xyz.x, sample.acc_sample.xyz.y, sample.acc_sample.xyz.z],
                dtype=float,
            )
        return latest

    def poll(self, timeout_ms: int = 1000) -> Frame | None:
        """한 캡처를 받아 바디 트래킹까지 돌린다. 타임아웃이면 None."""
        if self._device is None or self._tracker is None:
            raise _k.KinectUnavailable("장치가 열려 있지 않습니다 (with 블록 안에서 쓰세요).")

        capture = c_void_p()
        rc = _k.k4a.k4a_device_get_capture(self._device, byref(capture), timeout_ms)
        if rc != _k.K4A_WAIT_RESULT_SUCCEEDED:
            return None
        depth_mm = ir = xyz = None
        try:
            # 이미지는 capture를 놓기 전에 꺼내야 한다
            if self.capture_images:
                depth_mm, ir, xyz = self._grab_images(capture)
            rc = _k.k4abt.k4abt_tracker_enqueue_capture(self._tracker, capture, timeout_ms)
            if rc != _k.K4A_WAIT_RESULT_SUCCEEDED:
                return None
        finally:
            _k.k4a.k4a_capture_release(capture)

        frame = c_void_p()
        rc = _k.k4abt.k4abt_tracker_pop_result(self._tracker, byref(frame), timeout_ms)
        if rc != _k.K4A_WAIT_RESULT_SUCCEEDED:
            return None
        try:
            bodies = self._read_bodies(frame)
            index_map = self._body_index_map(frame) if self.capture_images else None
        finally:
            _k.k4abt.k4abt_frame_release(frame)

        acc = self._latest_imu()
        up = (geometry.up_in_depth(acc, self._r_accel_to_depth)
              if acc is not None and self._r_accel_to_depth is not None else None)
        return Frame(bodies=bodies, up_depth=up, acc_raw=acc, depth_mm=depth_mm, ir=ir,
                     xyz_mm=xyz, body_index_map=index_map)

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
