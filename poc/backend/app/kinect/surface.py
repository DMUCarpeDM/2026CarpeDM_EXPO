"""포인트 클라우드 기반 표면 측정 — 관절 32개가 아니라 몸 표면 수만 점을 쓴다.

왜 필요한가 — 실측으로 확인된 범위 안에서만 주장한다.

❌ '더 조용해서'가 아니다. 실측(2026-07-27, 정면 정지 150프레임)에서 표면 yaw
   지터는 0.223도, 관절 yaw 지터는 0.202도로 **표면이 오히려 약간 시끄러웠다.**
   k4abt 관절은 이미 DNN이 실루엣 전체를 소비해 만든 값이라 충분히 평활하고,
   ToF 노이즈는 공간 상관이 있어 점을 늘려도 √N으로 줄지 않는다.

✅ 두 가지 때문에 필요하다:
   1. **교차검증** — 관절과 완전히 독립된 경로다. 같은 정면 자세에서 두 방식의
      계통 차이가 0.7도였다. 서로가 서로의 검산이 되므로 "왜 이 숫자를 믿는가"에
      답할 근거가 된다.
   2. **관절로는 아예 낼 수 없는 양**을 준다 (아래).

관절로 불가능한 양:
  - 등이 굽은 정도(척추 시상면 편차) — 관절 3개로는 곡선을 못 만든다
  - 몸통 평면 법선 — 회전과 전후 기울기를 한 번에, 수천 점에서
  - 면적 가중 중심 — PELVIS 관절보다 훨씬 안정적인 흔들림 기준

모든 함수는 **중력 정렬된 세계 좌표계(mm)** 를 받는다. geometry.to_world()로 변환한
뒤 넘길 것 — 카메라 거치 각도가 섞인 좌표로는 '앞으로 굽음'이 정의되지 않는다.
"""
from __future__ import annotations

import math

import numpy as np

# 평면·곡선 추정에 필요한 최소 점 수 — 이보다 적으면 측정 보류(None)
MIN_PLANE_POINTS = 200
MIN_BAND_POINTS = 30
MIN_CURVE_BANDS = 4
# 평면성 판정: 두께/폭 비가 이보다 크면 평면으로 보기 어렵다(팔이 섞인 경우 등)
MAX_PLANARITY = 0.45
# 몸통으로 인정할 좌우 폭 — 어깨너비 대비 비율. 팔을 배제하는 값이다
TORSO_WIDTH_FRACTION = 0.7
# 몸통 상단을 골반→목 구간의 몇 %에서 끊을지. 목까지 올리면 승모근이 섞인다
TORSO_TOP_FRACTION = 0.75
# 수평 띠의 2D 주축이 방향으로 인정될 최대 종횡비. 1에 가까우면 원형이라
# 어깨선 방향이 정의되지 않는다 (옆모습·추적 실패 등)
MAX_SLAB_ASPECT = 0.6


def person_points(xyz_mm: np.ndarray, body_index_map: np.ndarray,
                  body_index: int) -> np.ndarray:
    """해당 바디에 속하는 유효 3D 점만 (N,3)으로 뽑는다.

    배경을 걸러야 한다 — 안 그러면 벽과 책상에 평면을 맞추게 된다.
    뎁스 미획득 픽셀은 (0,0,0)으로 들어오므로 함께 제외한다.
    """
    mask = (body_index_map == body_index) & (xyz_mm[:, :, 2] > 0)
    return xyz_mm[mask].astype(np.float64)


def band(points: np.ndarray, y_low: float, y_high: float) -> np.ndarray:
    """세계 Y(높이) 구간으로 점을 자른다."""
    ys = points[:, 1]
    return points[(ys >= y_low) & (ys <= y_high)]


def torso_points(points: np.ndarray, chest: np.ndarray, neck: np.ndarray,
                 pelvis: np.ndarray, shoulder_span_mm: float) -> np.ndarray:
    """몸통 점만 남긴다 — 팔과 목을 함께 배제하는 것이 핵심.

    좌우: 높이만으로 자르면 옆으로 내린 팔이 같은 띠에 들어온다. 척추 중심에서
    어깨너비의 일정 비율 안쪽만 남긴다.

    상단: 목 높이까지 올리면 안 된다. 실측(2026-07-27, 700프레임, 91~206cm)에서
    목·승모근이 가슴보다 **약 38mm 뒤**에 있어 척추 곡선의 위쪽 끝을 뒤로
    끌어당겼다. 그 결과 두 가지 오류가 났다:
      - lean이 −2.5~−5.5도(뒤로 젖힘)로 나왔다. 상단을 끊으면 +2.4~+6.3도로
        부호가 뒤집히며 자연스러운 직립이 된다.
      - 척추 편차가 거리에 따라 변했다 (거리상관 r=−0.86). 상단을 끊으면
        r=−0.05로 거리 의존이 사라진다.
    목 픽셀이 띠에서 차지하는 비율이 해상도(=거리)에 따라 달라지는 것이 원인이다.
    """
    y_pelvis, y_neck = float(pelvis[1]), float(neck[1])
    y_low = min(y_pelvis, y_neck)
    y_high = y_low + abs(y_neck - y_pelvis) * TORSO_TOP_FRACTION
    slab = band(points, y_low, y_high)
    if slab.shape[0] == 0:
        return slab
    half_width = max(shoulder_span_mm, 1.0) * TORSO_WIDTH_FRACTION / 2.0
    return slab[np.abs(slab[:, 0] - float(chest[0])) <= half_width]


def fit_plane(points: np.ndarray) -> tuple[np.ndarray, float] | None:
    """(단위 법선, 평면성) 반환. 점이 부족하거나 직선에 가까우면 None.

    법선은 카메라를 향하는 쪽으로 부호를 통일한다(세계 +Z가 카메라에서 멀어지는
    방향이므로 normal.z < 0). SVD의 마지막 우특이벡터가 분산 최소 방향 = 법선.

    평면성 = 세 번째/두 번째 특이값. 0에 가까우면 평평하고, 크면 평면 가정이
    약하다는 뜻이라 호출부가 지표를 버릴 근거가 된다.
    """
    if points.shape[0] < MIN_PLANE_POINTS:
        return None
    centered = points - points.mean(axis=0)
    _, singular, vh = np.linalg.svd(centered, full_matrices=False)
    if singular[1] < 1e-6:
        return None
    normal = vh[-1]
    if normal[2] > 0:
        normal = -normal
    planarity = float(singular[2] / singular[1])
    return normal / np.linalg.norm(normal), planarity


def plane_yaw_deg(normal: np.ndarray) -> float:
    """평면 법선 → 좌우 회전각(도). 0 = 카메라를 정면으로 마주봄.

    몸통에는 쓰지 않는다(곡률로 평면 가정이 깨진다 — torso_yaw_from_slab 참고).
    얼굴처럼 실제로 평면에 가까운 표면에 쓴다.
    """
    return math.degrees(math.atan2(float(normal[0]), -float(normal[2])))


def plane_pitch_deg(normal: np.ndarray) -> float:
    """평면 법선 → 전후 기울기(도). 양수 = 앞으로(카메라 쪽) 기울임.

    표면이 똑바로 서 있으면 법선은 수평이다. 앞으로 기울면 법선이 아래를 향해
    normal.y가 음수가 되므로 부호를 뒤집어 '숙임 = 양수'로 맞춘다.
    """
    return -math.degrees(math.asin(float(np.clip(normal[1], -1.0, 1.0))))


def torso_yaw_from_slab(points: np.ndarray, y_center: float,
                        half_band_mm: float = 60.0) -> float | None:
    """가슴 높이 수평 띠의 2D 주축에서 몸통 회전을 낸다(도). 0 = 정면.

    평면 적합을 쓰지 않는 이유(실측으로 확인): 몸통은 평면이 아니다. 수직 중심띠는
    흉골~복부의 시상면 곡률이 가장 큰 구간이라 평면 가정이 깨진다 —
    실기기에서 planarity 0.63으로 임계(0.45)를 넘어 각도가 100% 억제됐다.
    수평 띠를 위에서 내려다본 (x, z) 산포의 주축은 곧 어깨선 방향이므로,
    곡률에 영향받지 않고 안정적으로 회전을 준다.
    """
    slab = band(points, y_center - half_band_mm, y_center + half_band_mm)
    if slab.shape[0] < MIN_PLANE_POINTS:
        return None
    xz = slab[:, [0, 2]]
    xz = xz - xz.mean(axis=0)
    _, singular, vh = np.linalg.svd(xz, full_matrices=False)
    if singular[0] < 1e-6 or singular[1] / singular[0] > MAX_SLAB_ASPECT:
        return None  # 거의 원형 — 어깨선 방향이 정의되지 않는다
    direction = vh[0]
    yaw = math.degrees(math.atan2(float(direction[1]), float(direction[0])))
    # 주축은 부호가 모호하다(±180 동일) → (-90, 90] 구간으로 접는다.
    # 키오스크에서 90도 넘게 돌아선 사람은 애초에 측정 대상이 아니다.
    if yaw > 90.0:
        yaw -= 180.0
    elif yaw <= -90.0:
        yaw += 180.0
    return yaw


def torso_lean_from_curve(curve: np.ndarray | None) -> float | None:
    """척추 곡선 전체의 전후 기울기(도). 양수 = 앞으로(카메라 쪽) 기울임.

    가슴 평면 법선 대신 척추선의 시작→끝 벡터를 쓴다. 곡률이 있어도 전체 기울기는
    잘 정의되고, geometry.head_pitch_deg와 부호 규약이 같다.
    """
    if curve is None or curve.shape[0] < 3:
        return None
    v = curve[-1] - curve[0]
    if abs(float(v[1])) < 1e-6:
        return None
    return math.degrees(math.atan2(-float(v[2]), float(v[1])))


def spine_curve(points: np.ndarray, bands: int = 8) -> np.ndarray | None:
    """높이를 여러 층으로 잘라 각 층의 중심을 이은 3D 곡선 (아래→위).

    관절 3개(PELVIS·SPINE_NAVEL·SPINE_CHEST)로는 직선밖에 안 나온다.
    표면 점을 층으로 자르면 실제 등의 곡선이 나온다.
    """
    if points.shape[0] < MIN_PLANE_POINTS:
        return None
    ys = points[:, 1]
    low, high = np.percentile(ys, [5, 95])  # 양 끝 이상치 제거
    if high - low < 100.0:  # 10cm 미만 — 층을 나눌 높이가 아니다
        return None
    edges = np.linspace(low, high, bands + 1)
    centroids = []
    for i in range(bands):
        slab = points[(ys >= edges[i]) & (ys < edges[i + 1])]
        if slab.shape[0] >= MIN_BAND_POINTS:
            centroids.append(slab.mean(axis=0))
    if len(centroids) < MIN_CURVE_BANDS:
        return None
    return np.array(centroids)


def spine_sagittal_offset_mm(curve: np.ndarray | None) -> float | None:
    """척추선이 양 끝을 이은 직선에서 벗어난 최대 전후 편차(mm).

    양수 = 앞으로 굽음(카메라 쪽). 임상에서 시상면 정렬을 볼 때 쓰는 방식과
    같은 발상이고, "등이 3.2cm 굽었다"처럼 해석 가능한 단위로 나온다.
    2차 계수를 그대로 쓰지 않는 이유는 단위가 직관적이지 않기 때문이다.
    """
    if curve is None or curve.shape[0] < 3:
        return None
    start, end = curve[0], curve[-1]
    axis = end - start
    length = float(np.linalg.norm(axis))
    if length < 1e-6:
        return None
    axis = axis / length
    rel = curve - start
    perpendicular = rel - np.outer(rel @ axis, axis)
    worst = int(np.argmax(np.abs(perpendicular[:, 2])))
    return float(-perpendicular[worst, 2])  # -Z가 카메라 쪽 = 앞


def surface_centroid(points: np.ndarray) -> np.ndarray | None:
    """표면 점의 중심(mm). 흔들림 기준으로 PELVIS 관절보다 안정적이다.

    엄밀한 질량중심은 아니지만(보이는 면만 반영), 프레임 간 재현성이 훨씬 높아
    좌우 흔들림의 기준선으로 적합하다.
    """
    if points.shape[0] < MIN_BAND_POINTS:
        return None
    return points.mean(axis=0)


def surface_width_mm(points: np.ndarray, y_center: float,
                     half_band_mm: float = 40.0) -> float | None:
    """지정 높이 띠에서의 좌우 폭(mm). 관절이 아니라 실제 표면 범위.

    어깨 관절은 모델이 몸 안쪽에 놓는 값이라 실제 어깨 너비보다 좁다.
    표면 폭은 리포트에 그대로 쓸 수 있는 물리량이다.
    """
    slab = band(points, y_center - half_band_mm, y_center + half_band_mm)
    if slab.shape[0] < MIN_BAND_POINTS:
        return None
    low, high = np.percentile(slab[:, 0], [2, 98])  # 이상치 제거
    return float(high - low)


def chest_depth_mm(points: np.ndarray, y_center: float,
                   half_band_mm: float = 40.0) -> float | None:
    """가슴 띠의 전후 최전면 거리(mm) — 호흡·기울임 추적의 원재료.

    시간축으로 모아 0.2~0.5Hz 대역을 보면 호흡이 나온다(긴장 지표와 연결).
    여기서는 프레임 값만 내고, 시계열 처리는 호출부가 한다.
    """
    slab = band(points, y_center - half_band_mm, y_center + half_band_mm)
    if slab.shape[0] < MIN_BAND_POINTS:
        return None
    return float(np.percentile(slab[:, 2], 2))  # 가장 카메라에 가까운 쪽
