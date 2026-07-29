"""Azure Kinect Sensor SDK + Body Tracking SDK의 ctypes 바인딩 (Windows).

커뮤니티 래퍼(pyk4a·pykinect_azure) 대신 직접 감는 이유: 실제로 쓰는 C API가
20개 남짓이라 감는 비용이 하루 수준인데, 전시 기간 중 서드파티 휠의 빌드·호환
문제로 장치가 안 열리는 리스크를 없앨 수 있다. 구조체 정의는 SDK 헤더
(k4atypes.h / k4abttypes.h v1.4.1 / v1.1.2)와 필드 순서까지 1:1로 맞췄다.

DLL 탐색: Python 3.8+ Windows는 PATH를 쓰지 않으므로 os.add_dll_directory로
SDK 디렉터리를 명시 등록한다. Body Tracking SDK의 tools 디렉터리에 k4a.dll·
k4abt.dll·depthengine·onnxruntime·cuDNN·ONNX 모델이 전부 모여 있어 그곳을
1순위로 삼는다.
"""
from __future__ import annotations

import ctypes
import os
import sys
from ctypes import (
    POINTER,
    Structure,
    Union,
    c_bool,
    c_char_p,
    c_float,
    c_int,
    c_int32,
    c_int64,
    c_size_t,
    c_uint8,
    c_uint32,
    c_uint64,
    c_void_p,
)
from pathlib import Path

# ---------------------------------------------------------------------------
# 상수 (헤더 enum 값)
# ---------------------------------------------------------------------------

K4A_RESULT_SUCCEEDED = 0
K4A_WAIT_RESULT_SUCCEEDED = 0
K4A_WAIT_RESULT_FAILED = 1
K4A_WAIT_RESULT_TIMEOUT = 2

# k4a_stream_result_t — 녹화 재생용
K4A_STREAM_RESULT_SUCCEEDED = 0
K4A_STREAM_RESULT_EOF = 1
K4A_STREAM_RESULT_FAILED = 2

K4A_IMAGE_FORMAT_COLOR_MJPG = 0
K4A_IMAGE_FORMAT_COLOR_NV12 = 1
K4A_IMAGE_FORMAT_COLOR_YUY2 = 2
K4A_IMAGE_FORMAT_COLOR_BGRA32 = 3
K4A_IMAGE_FORMAT_DEPTH16 = 4
K4A_IMAGE_FORMAT_IR16 = 5
K4A_IMAGE_FORMAT_CUSTOM8 = 6
K4A_IMAGE_FORMAT_CUSTOM16 = 7
K4A_IMAGE_FORMAT_CUSTOM = 8  # 포인트 클라우드(XYZ int16 ×3)를 담는 형식

# 바디 인덱스 맵에서 이 값은 '사람이 아닌 픽셀'
K4ABT_BODY_INDEX_MAP_BACKGROUND = 255

K4A_COLOR_RESOLUTION_OFF = 0
K4A_COLOR_RESOLUTION_720P = 1
K4A_COLOR_RESOLUTION_1080P = 2

K4A_DEPTH_MODE_OFF = 0
K4A_DEPTH_MODE_NFOV_2X2BINNED = 1
K4A_DEPTH_MODE_NFOV_UNBINNED = 2
K4A_DEPTH_MODE_WFOV_2X2BINNED = 3
K4A_DEPTH_MODE_WFOV_UNBINNED = 4
K4A_DEPTH_MODE_PASSIVE_IR = 5

K4A_FRAMES_PER_SECOND_5 = 0
K4A_FRAMES_PER_SECOND_15 = 1
K4A_FRAMES_PER_SECOND_30 = 2

K4A_WIRED_SYNC_MODE_STANDALONE = 0

# k4a_calibration_type_t — extrinsics 인덱싱에 쓴다 (UNKNOWN=-1은 배열 밖)
K4A_CALIBRATION_TYPE_DEPTH = 0
K4A_CALIBRATION_TYPE_COLOR = 1
K4A_CALIBRATION_TYPE_GYRO = 2
K4A_CALIBRATION_TYPE_ACCEL = 3
K4A_CALIBRATION_TYPE_NUM = 4

K4ABT_SENSOR_ORIENTATION_DEFAULT = 0
K4ABT_SENSOR_ORIENTATION_CLOCKWISE90 = 1
K4ABT_SENSOR_ORIENTATION_COUNTERCLOCKWISE90 = 2
K4ABT_SENSOR_ORIENTATION_FLIP180 = 3

K4ABT_TRACKER_PROCESSING_MODE_GPU = 0
K4ABT_TRACKER_PROCESSING_MODE_CPU = 1
K4ABT_TRACKER_PROCESSING_MODE_GPU_CUDA = 2
K4ABT_TRACKER_PROCESSING_MODE_GPU_TENSORRT = 3
K4ABT_TRACKER_PROCESSING_MODE_GPU_DIRECTML = 4

# k4abt_joint_confidence_level_t — 현 SDK는 MEDIUM까지만 반환한다(HIGH는 예약).
# 따라서 실질 게이트는 >= MEDIUM 이다. LOW는 '가려져서 예측만 한 관절'이라
# 지표에 넣으면 안 된다 — 이 게이트를 빼먹는 것이 가장 흔한 통합 실패다.
K4ABT_JOINT_CONFIDENCE_NONE = 0
K4ABT_JOINT_CONFIDENCE_LOW = 1
K4ABT_JOINT_CONFIDENCE_MEDIUM = 2
K4ABT_JOINT_CONFIDENCE_HIGH = 3

K4ABT_JOINT_COUNT = 32
K4A_WAIT_INFINITE = -1

# 관절 인덱스 (k4abt_joint_id_t 순서 그대로)
JOINT_NAMES = (
    "PELVIS", "SPINE_NAVEL", "SPINE_CHEST", "NECK",
    "CLAVICLE_LEFT", "SHOULDER_LEFT", "ELBOW_LEFT", "WRIST_LEFT",
    "HAND_LEFT", "HANDTIP_LEFT", "THUMB_LEFT",
    "CLAVICLE_RIGHT", "SHOULDER_RIGHT", "ELBOW_RIGHT", "WRIST_RIGHT",
    "HAND_RIGHT", "HANDTIP_RIGHT", "THUMB_RIGHT",
    "HIP_LEFT", "KNEE_LEFT", "ANKLE_LEFT", "FOOT_LEFT",
    "HIP_RIGHT", "KNEE_RIGHT", "ANKLE_RIGHT", "FOOT_RIGHT",
    "HEAD", "NOSE", "EYE_LEFT", "EAR_LEFT", "EYE_RIGHT", "EAR_RIGHT",
)
JOINT = {name: idx for idx, name in enumerate(JOINT_NAMES)}


# ---------------------------------------------------------------------------
# 구조체 (헤더와 필드 순서 동일 — 어긋나면 조용히 쓰레기 값이 나온다)
# ---------------------------------------------------------------------------


class _Xyz(Structure):
    _fields_ = [("x", c_float), ("y", c_float), ("z", c_float)]


class k4a_float3_t(Union):
    _fields_ = [("xyz", _Xyz), ("v", c_float * 3)]


class _Xy(Structure):
    _fields_ = [("x", c_float), ("y", c_float)]


class k4a_float2_t(Union):
    _fields_ = [("xy", _Xy), ("v", c_float * 2)]


class _Wxyz(Structure):
    _fields_ = [("w", c_float), ("x", c_float), ("y", c_float), ("z", c_float)]


class k4a_quaternion_t(Union):
    _fields_ = [("wxyz", _Wxyz), ("v", c_float * 4)]


class k4a_calibration_extrinsics_t(Structure):
    _fields_ = [("rotation", c_float * 9), ("translation", c_float * 3)]


class _IntrinsicParam(Structure):
    # Brown Conrady 15개 파라미터 (cx, cy, fx, fy, k1..k6, codx, cody, p2, p1, metric_radius)
    _fields_ = [(n, c_float) for n in (
        "cx", "cy", "fx", "fy", "k1", "k2", "k3", "k4", "k5", "k6",
        "codx", "cody", "p2", "p1", "metric_radius",
    )]


class k4a_calibration_intrinsic_parameters_t(Union):
    _fields_ = [("param", _IntrinsicParam), ("v", c_float * 15)]


class k4a_calibration_intrinsics_t(Structure):
    _fields_ = [
        ("type", c_int),
        ("parameter_count", c_uint32),
        ("parameters", k4a_calibration_intrinsic_parameters_t),
    ]


class k4a_calibration_camera_t(Structure):
    _fields_ = [
        ("extrinsics", k4a_calibration_extrinsics_t),
        ("intrinsics", k4a_calibration_intrinsics_t),
        ("resolution_width", c_int),
        ("resolution_height", c_int),
        ("metric_radius", c_float),
    ]


class k4a_calibration_t(Structure):
    _fields_ = [
        ("depth_camera_calibration", k4a_calibration_camera_t),
        ("color_camera_calibration", k4a_calibration_camera_t),
        ("extrinsics",
         (k4a_calibration_extrinsics_t * K4A_CALIBRATION_TYPE_NUM) * K4A_CALIBRATION_TYPE_NUM),
        ("depth_mode", c_int),
        ("color_resolution", c_int),
    ]


class k4a_device_configuration_t(Structure):
    _fields_ = [
        ("color_format", c_int),
        ("color_resolution", c_int),
        ("depth_mode", c_int),
        ("camera_fps", c_int),
        ("synchronized_images_only", c_bool),
        ("depth_delay_off_color_usec", c_int32),
        ("wired_sync_mode", c_int),
        ("subordinate_delay_off_master_usec", c_uint32),
        ("disable_streaming_indicator", c_bool),
    ]


class k4a_imu_sample_t(Structure):
    _fields_ = [
        ("temperature", c_float),
        ("acc_sample", k4a_float3_t),
        ("acc_timestamp_usec", c_uint64),
        ("gyro_sample", k4a_float3_t),
        ("gyro_timestamp_usec", c_uint64),
    ]


class k4abt_tracker_configuration_t(Structure):
    _fields_ = [
        ("sensor_orientation", c_int),
        ("processing_mode", c_int),
        ("gpu_device_id", c_int32),
        ("model_path", c_char_p),
    ]


class k4abt_joint_t(Structure):
    _fields_ = [
        ("position", k4a_float3_t),      # mm, 뎁스 카메라 좌표계
        ("orientation", k4a_quaternion_t),
        ("confidence_level", c_int),
    ]


class k4abt_skeleton_t(Structure):
    _fields_ = [("joints", k4abt_joint_t * K4ABT_JOINT_COUNT)]


class k4abt_body_t(Structure):
    _fields_ = [("id", c_uint32), ("skeleton", k4abt_skeleton_t)]


# ---------------------------------------------------------------------------
# DLL 로딩
# ---------------------------------------------------------------------------

_SENSOR_SDK_DIRS = (
    r"C:\Program Files\Azure Kinect SDK v1.4.1\sdk\windows-desktop\amd64\release\bin",
    r"C:\Program Files\Azure Kinect SDK v1.4.1\tools",
)
# tools 디렉터리에 런타임 의존(onnxruntime·cuDNN·depthengine)과 ONNX 모델이 함께 있다
_BT_SDK_DIRS = (
    r"C:\Program Files\Azure Kinect Body Tracking SDK\tools",
    r"C:\Program Files\Azure Kinect Body Tracking SDK\sdk\windows-desktop\amd64\release\bin",
)
_MODEL_NAME = "dnn_model_2_0_op11.onnx"

# onnxruntime의 CUDA 프로바이더가 의존하는 런타임. Body Tracking SDK는 이것들을
# tools 디렉터리에만 넣어두는데, 프로바이더 DLL 자체는 sdk\...\bin 에도 있다.
# 그래서 bin 쪽 프로바이더를 열면 의존성을 못 찾아 error 126으로 죽는다.
_GPU_RUNTIME_DLLS = (
    "cudart64_110.dll",
    "cublasLt64_11.dll",
    "cublas64_11.dll",
    "cufft64_10.dll",
    "cudnn_ops_infer64_8.dll",
    "cudnn_cnn_infer64_8.dll",
    "cudnn64_8.dll",
    "nvrtc-builtins64_114.dll",
    "nvrtc64_112_0.dll",
)

_dll_dir_handles: list = []  # add_dll_directory 핸들은 살려둬야 탐색 경로가 유지된다
_preloaded: list = []        # 선적재한 GPU 런타임 핸들 (수집되면 언로드된다)
k4a: ctypes.CDLL | None = None
k4abt: ctypes.CDLL | None = None
k4arecord: ctypes.CDLL | None = None  # 녹화 재생 (선택 — 없으면 라이브만 가능)
gpu_runtime_ready = False    # CUDA 런타임 선적재 성공 여부 (폴백 판단 근거)


class KinectUnavailable(RuntimeError):
    """SDK나 장치를 쓸 수 없음 — 호출부가 MediaPipe 폴백으로 내려갈 근거."""


def _candidate_dirs(env_name: str, defaults: tuple[str, ...]) -> list[Path]:
    override = os.environ.get(env_name)
    raw = [override] if override else list(defaults)
    return [Path(p) for p in raw if p and Path(p).is_dir()]


def model_path() -> Path | None:
    """바디 트래킹 ONNX 모델 경로 — 명시 전달해 CWD 의존을 없앤다."""
    override = os.environ.get("MIRROR_TING_KINECT_BT_MODEL")
    if override:
        return Path(override) if Path(override).is_file() else None
    for directory in _candidate_dirs("MIRROR_TING_KINECT_BT_DIR", _BT_SDK_DIRS):
        candidate = directory / _MODEL_NAME
        if candidate.is_file():
            return candidate
    return None


def load() -> None:
    """k4a.dll / k4abt.dll 적재. 이미 적재됐으면 아무 것도 하지 않는다."""
    global k4a, k4abt, k4arecord
    if k4a is not None and k4abt is not None:
        return
    if sys.platform != "win32":
        raise KinectUnavailable(
            "Azure Kinect 바인딩은 Windows 전용입니다 (전시 PC 기준). "
            "macOS 개발기에서는 MediaPipe 경로를 사용하세요."
        )

    sensor_dirs = _candidate_dirs("MIRROR_TING_KINECT_SDK_DIR", _SENSOR_SDK_DIRS)
    bt_dirs = _candidate_dirs("MIRROR_TING_KINECT_BT_DIR", _BT_SDK_DIRS)
    if not sensor_dirs or not bt_dirs:
        raise KinectUnavailable(
            "Azure Kinect SDK를 찾지 못했습니다. Sensor SDK v1.4.x와 "
            "Body Tracking SDK 1.1.x를 설치하거나 MIRROR_TING_KINECT_SDK_DIR / "
            "MIRROR_TING_KINECT_BT_DIR로 경로를 지정하세요."
        )
    # BT tools를 먼저 등록 — k4abt.dll의 런타임 의존이 전부 그 안에 있다
    for directory in bt_dirs + sensor_dirs:
        _dll_dir_handles.append(os.add_dll_directory(str(directory)))

    _preload_gpu_runtime(bt_dirs)

    # 이름이 아니라 절대경로로 연다. 이름으로 열면 onnxruntime이 자기 모듈 위치를
    # 기준으로 CUDA 프로바이더 경로를 계산하는데, 그 위치가 런타임(cuDNN 등)이 없는
    # sdk\...\bin 이면 프로바이더 적재가 실패한다.
    k4a_path = _find_dll("k4a.dll", sensor_dirs + bt_dirs)
    k4abt_path = _find_dll("k4abt.dll", bt_dirs)
    if k4a_path is None or k4abt_path is None:
        raise KinectUnavailable("k4a.dll / k4abt.dll을 SDK 디렉터리에서 찾지 못했습니다.")
    try:
        k4a = ctypes.CDLL(str(k4a_path))
        k4abt = ctypes.CDLL(str(k4abt_path))
    except OSError as exc:  # pragma: no cover - 설치 환경 의존
        raise KinectUnavailable(f"Kinect DLL 적재 실패: {exc}") from exc

    # 녹화 재생은 선택 기능 — 없어도 라이브 캡처는 동작해야 한다
    record_path = _find_dll("k4arecord.dll", sensor_dirs + bt_dirs)
    if record_path is not None:
        try:
            k4arecord = ctypes.CDLL(str(record_path))
        except OSError:
            k4arecord = None

    _bind()


def _find_dll(name: str, dirs: list[Path]) -> Path | None:
    for directory in dirs:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return None


def _preload_gpu_runtime(bt_dirs: list[Path]) -> None:
    """cuDNN·cuBLAS를 프로세스에 미리 적재해 CUDA 프로바이더가 열리게 한다.

    onnxruntime은 실행 프로바이더를 런타임에 LoadLibrary로 여는데, 그 호출은
    os.add_dll_directory가 등록한 사용자 디렉터리를 탐색하지 않는다. 의존
    라이브러리를 절대경로로 먼저 올려두면 이후 이름 기반 해석이 이미 적재된
    모듈에 붙는다. 실패해도 예외를 올리지 않는다 — DirectML/CPU 폴백이 있다.
    """
    global gpu_runtime_ready
    loaded = 0
    for name in _GPU_RUNTIME_DLLS:
        path = _find_dll(name, bt_dirs)
        if path is None:
            continue
        try:
            _preloaded.append(ctypes.CDLL(str(path)))
            loaded += 1
        except OSError:
            pass  # 드라이버·아키텍처 불일치 — 폴백 경로가 처리한다
    gpu_runtime_ready = loaded >= 5  # cudart+cublas(2)+cudnn(3) 최소 조합


def _bind() -> None:
    """함수 시그니처 선언 — restype을 지정하지 않으면 반환값이 int로 잘린다."""
    assert k4a is not None and k4abt is not None

    k4a.k4a_device_get_installed_count.restype = c_uint32
    k4a.k4a_device_get_installed_count.argtypes = []

    k4a.k4a_device_open.restype = c_int
    k4a.k4a_device_open.argtypes = [c_uint32, POINTER(c_void_p)]

    k4a.k4a_device_close.restype = None
    k4a.k4a_device_close.argtypes = [c_void_p]

    k4a.k4a_device_get_serialnum.restype = c_int
    k4a.k4a_device_get_serialnum.argtypes = [c_void_p, POINTER(c_uint8), POINTER(c_size_t)]

    k4a.k4a_device_get_calibration.restype = c_int
    k4a.k4a_device_get_calibration.argtypes = [c_void_p, c_int, c_int, POINTER(k4a_calibration_t)]

    k4a.k4a_device_start_cameras.restype = c_int
    k4a.k4a_device_start_cameras.argtypes = [c_void_p, POINTER(k4a_device_configuration_t)]

    k4a.k4a_device_stop_cameras.restype = None
    k4a.k4a_device_stop_cameras.argtypes = [c_void_p]

    k4a.k4a_device_start_imu.restype = c_int
    k4a.k4a_device_start_imu.argtypes = [c_void_p]

    k4a.k4a_device_stop_imu.restype = None
    k4a.k4a_device_stop_imu.argtypes = [c_void_p]

    k4a.k4a_device_get_capture.restype = c_int
    k4a.k4a_device_get_capture.argtypes = [c_void_p, POINTER(c_void_p), c_int32]

    k4a.k4a_device_get_imu_sample.restype = c_int
    k4a.k4a_device_get_imu_sample.argtypes = [c_void_p, POINTER(k4a_imu_sample_t), c_int32]

    k4a.k4a_capture_release.restype = None
    k4a.k4a_capture_release.argtypes = [c_void_p]

    # 이미지 접근 — 라이브 뷰어와 S2(컬러+MediaPipe 융합)가 함께 쓴다
    for getter in ("k4a_capture_get_depth_image", "k4a_capture_get_ir_image",
                   "k4a_capture_get_color_image"):
        fn = getattr(k4a, getter)
        fn.restype = c_void_p
        fn.argtypes = [c_void_p]

    k4a.k4a_image_get_buffer.restype = POINTER(c_uint8)
    k4a.k4a_image_get_buffer.argtypes = [c_void_p]

    k4a.k4a_image_get_size.restype = c_size_t
    k4a.k4a_image_get_size.argtypes = [c_void_p]

    for prop in ("k4a_image_get_width_pixels", "k4a_image_get_height_pixels",
                 "k4a_image_get_stride_bytes"):
        fn = getattr(k4a, prop)
        fn.restype = c_int
        fn.argtypes = [c_void_p]

    k4a.k4a_image_release.restype = None
    k4a.k4a_image_release.argtypes = [c_void_p]

    k4a.k4a_image_create.restype = c_int
    k4a.k4a_image_create.argtypes = [c_int, c_int, c_int, c_int, POINTER(c_void_p)]

    # 좌표 변환 — 뎁스 이미지를 26만 개의 3D 점으로 펼친다.
    # 관절 32개는 k4abt가 요약해 준 값이고, 이쪽이 실제 측정 원본이다.
    k4a.k4a_transformation_create.restype = c_void_p
    k4a.k4a_transformation_create.argtypes = [POINTER(k4a_calibration_t)]

    k4a.k4a_transformation_destroy.restype = None
    k4a.k4a_transformation_destroy.argtypes = [c_void_p]

    k4a.k4a_transformation_depth_image_to_point_cloud.restype = c_int
    k4a.k4a_transformation_depth_image_to_point_cloud.argtypes = [
        c_void_p, c_void_p, c_int, c_void_p,
    ]

    # 픽셀 단위 인체 분할 — 벽이 아니라 사람의 점만 골라내는 데 필수
    k4abt.k4abt_frame_get_body_index_map.restype = c_void_p
    k4abt.k4abt_frame_get_body_index_map.argtypes = [c_void_p]

    # 3D 관절 → 뎁스 이미지 픽셀 (오버레이 렌더링용)
    k4a.k4a_calibration_3d_to_2d.restype = c_int
    k4a.k4a_calibration_3d_to_2d.argtypes = [
        POINTER(k4a_calibration_t), POINTER(k4a_float3_t), c_int, c_int,
        POINTER(k4a_float2_t), POINTER(c_int),
    ]

    # k4abt_tracker_create는 calibration을 포인터로, config를 값으로 받는다
    k4abt.k4abt_tracker_create.restype = c_int
    k4abt.k4abt_tracker_create.argtypes = [
        POINTER(k4a_calibration_t), k4abt_tracker_configuration_t, POINTER(c_void_p),
    ]

    k4abt.k4abt_tracker_destroy.restype = None
    k4abt.k4abt_tracker_destroy.argtypes = [c_void_p]

    k4abt.k4abt_tracker_shutdown.restype = None
    k4abt.k4abt_tracker_shutdown.argtypes = [c_void_p]

    k4abt.k4abt_tracker_enqueue_capture.restype = c_int
    k4abt.k4abt_tracker_enqueue_capture.argtypes = [c_void_p, c_void_p, c_int32]

    k4abt.k4abt_tracker_pop_result.restype = c_int
    k4abt.k4abt_tracker_pop_result.argtypes = [c_void_p, POINTER(c_void_p), c_int32]

    k4abt.k4abt_frame_get_num_bodies.restype = c_size_t
    k4abt.k4abt_frame_get_num_bodies.argtypes = [c_void_p]

    k4abt.k4abt_frame_get_body_skeleton.restype = c_int
    k4abt.k4abt_frame_get_body_skeleton.argtypes = [c_void_p, c_uint32, POINTER(k4abt_skeleton_t)]

    k4abt.k4abt_frame_get_body_id.restype = c_uint32
    k4abt.k4abt_frame_get_body_id.argtypes = [c_void_p, c_uint32]

    k4abt.k4abt_frame_release.restype = None
    k4abt.k4abt_frame_release.argtypes = [c_void_p]

    if k4arecord is None:
        return
    # 녹화 재생 — 사람을 다시 세우지 않고 같은 입력으로 반복 검증하기 위한 경로
    k4arecord.k4a_playback_open.restype = c_int
    k4arecord.k4a_playback_open.argtypes = [c_char_p, POINTER(c_void_p)]

    k4arecord.k4a_playback_close.restype = None
    k4arecord.k4a_playback_close.argtypes = [c_void_p]

    k4arecord.k4a_playback_get_calibration.restype = c_int
    k4arecord.k4a_playback_get_calibration.argtypes = [c_void_p, POINTER(k4a_calibration_t)]

    k4arecord.k4a_playback_get_next_capture.restype = c_int
    k4arecord.k4a_playback_get_next_capture.argtypes = [c_void_p, POINTER(c_void_p)]

    k4arecord.k4a_playback_get_next_imu_sample.restype = c_int
    k4arecord.k4a_playback_get_next_imu_sample.argtypes = [c_void_p, POINTER(k4a_imu_sample_t)]

    k4arecord.k4a_playback_seek_timestamp.restype = c_int
    k4arecord.k4a_playback_seek_timestamp.argtypes = [c_void_p, c_int64, c_int]


def installed_count() -> int:
    load()
    assert k4a is not None
    return int(k4a.k4a_device_get_installed_count())
