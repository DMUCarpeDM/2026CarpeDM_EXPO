"""포인트 클라우드 표면 측정 — 합성 점군으로 검증한다(하드웨어 불필요).

합성 점군을 쓰는 이유: 정답 각도·편차를 우리가 정하고 넣으므로, 추정값이 그
정답으로 돌아오는지 물리적으로 확인할 수 있다. 실측 영상으로는 정답이 없다.
"""
import math

import numpy as np
import pytest

from app.kinect import surface

RNG = np.random.default_rng(20260727)


def torso_slab(yaw_deg: float = 0.0, lean_deg: float = 0.0, n: int = 3000,
               width: float = 340.0, height: float = 500.0,
               noise_mm: float = 2.0) -> np.ndarray:
    """가슴 표면을 흉내낸 평면 점군 (세계 좌표계 mm).

    정면일 때 법선은 카메라 쪽(-Z)을 향한다.

    부호 규약 (geometry의 관절 기반 지표와 동일하게 맞춘다):
      yaw_deg  > 0 → 어깨선이 +X에서 +Z 쪽으로 돌아간 상태
      lean_deg > 0 → 상체 위쪽이 카메라 쪽(-Z)으로 숙여진 상태
    두 경우 모두 축 회전을 **음의 방향**으로 걸어야 이 의미가 된다.
    """
    u = RNG.uniform(-width / 2, width / 2, n)     # 좌우
    v = RNG.uniform(-height / 2, height / 2, n)   # 상하
    pts = np.stack([u, v, np.zeros(n)], axis=1)

    lean = math.radians(-lean_deg)  # 앞으로 숙임 = 상단이 -Z로
    rot_x = np.array([[1, 0, 0],
                      [0, math.cos(lean), -math.sin(lean)],
                      [0, math.sin(lean), math.cos(lean)]])
    yaw = math.radians(-yaw_deg)    # 어깨선이 +Z 쪽으로
    rot_y = np.array([[math.cos(yaw), 0, math.sin(yaw)],
                      [0, 1, 0],
                      [-math.sin(yaw), 0, math.cos(yaw)]])
    pts = pts @ rot_x.T @ rot_y.T
    pts += RNG.normal(0, noise_mm, pts.shape)     # ToF 노이즈
    pts += np.array([0.0, 1400.0, 1000.0])        # 세계 위치로 이동
    return pts


# ---- 사람 점 선별 -----------------------------------------------------------


def test_바디_인덱스로_사람_점만_고른다():
    xyz = np.zeros((4, 4, 3), dtype=np.int16)
    xyz[..., 2] = 1000  # 전부 유효 깊이
    index_map = np.full((4, 4), 255, dtype=np.uint8)  # 배경
    index_map[1, 1] = 0   # 첫 번째 사람
    index_map[2, 2] = 1   # 두 번째 사람

    assert surface.person_points(xyz, index_map, 0).shape == (1, 3)
    assert surface.person_points(xyz, index_map, 1).shape == (1, 3)
    assert surface.person_points(xyz, index_map, 7).shape == (0, 3)


def test_깊이_미획득_픽셀은_제외한다():
    xyz = np.zeros((2, 2, 3), dtype=np.int16)
    xyz[0, 0, 2] = 1200          # 유효
    xyz[0, 1, 2] = 0             # 뎁스 미획득 (어두운 옷 등)
    index_map = np.zeros((2, 2), dtype=np.uint8)
    index_map[1, :] = 255
    assert surface.person_points(xyz, index_map, 0).shape == (1, 3)


# ---- 몸통 선별 (팔 배제) ----------------------------------------------------


def test_몸통_선별이_옆으로_내린_팔을_배제한다():
    """높이만으로 자르면 팔이 섞여 평면 적합이 망가진다."""
    torso = torso_slab(width=340.0, height=500.0, n=2000)
    # 몸통 좌우로 30cm 떨어진 팔 — 높이 띠는 몸통과 같다
    arm_y = RNG.uniform(1150.0, 1650.0, 600)
    left_arm = np.stack([np.full(600, -300.0), arm_y, np.full(600, 1050.0)], axis=1)
    right_arm = left_arm.copy()
    right_arm[:, 0] = 300.0
    everything = np.vstack([torso, left_arm, right_arm])

    chest = np.array([0.0, 1400.0, 1000.0])
    neck = np.array([0.0, 1650.0, 1000.0])
    pelvis = np.array([0.0, 1150.0, 1000.0])
    kept = surface.torso_points(everything, chest, neck, pelvis, shoulder_span_mm=340.0)

    assert kept.shape[0] > 0
    assert np.abs(kept[:, 0]).max() < 300.0  # 팔이 하나도 남지 않았다
    # 상단도 끊긴다 — 목 높이(1650)까지 올라가면 승모근이 섞인다
    top = 1150.0 + (1650.0 - 1150.0) * surface.TORSO_TOP_FRACTION
    assert kept[:, 1].max() <= top + 1e-6
    assert surface.torso_yaw_from_slab(kept, y_center=1350.0) == pytest.approx(0.0, abs=2.5)


def test_몸통_상단이_목_아래에서_끊긴다():
    """목·승모근은 가슴보다 약 38mm 뒤에 있어 척추 곡선 끝을 뒤로 끌어당긴다.

    실측에서 이 때문에 lean 부호가 뒤집히고 척추 편차가 거리 의존(r=-0.86)을
    보였다. 합성으로도 '목이 섞이면 lean이 음수로 뒤집힌다'를 고정한다.
    """
    n = 4000
    v = RNG.uniform(0.0, 500.0, n)          # 골반(0) → 목(500)
    z = np.where(v > 500.0 * surface.TORSO_TOP_FRACTION, 1038.0, 1000.0)  # 목만 38mm 뒤
    pts = np.stack([RNG.uniform(-105, 105, n), v + 1150.0, z], axis=1)

    chest = np.array([0.0, 1400.0, 1000.0])
    neck = np.array([0.0, 1650.0, 1038.0])
    pelvis = np.array([0.0, 1150.0, 1000.0])

    # 상단을 끊지 않으면 목이 섞여 뒤로 젖혀진 것으로 나온다
    naive = surface.band(pts, 1150.0, 1650.0)
    naive_lean = surface.torso_lean_from_curve(surface.spine_curve(naive))
    assert naive_lean is not None and naive_lean < -1.0

    # 끊으면 목이 빠지고 기울기가 사라진다
    kept = surface.torso_points(pts, chest, neck, pelvis, shoulder_span_mm=300.0)
    fixed_lean = surface.torso_lean_from_curve(surface.spine_curve(kept))
    assert fixed_lean is not None
    assert abs(fixed_lean) < abs(naive_lean)


# ---- 평면 적합 -------------------------------------------------------------


def test_평면_법선은_카메라를_향하도록_부호가_통일된다():
    normal, planarity = surface.fit_plane(torso_slab())
    assert normal[2] < 0          # 세계 +Z는 카메라에서 멀어지는 방향
    assert planarity < surface.MAX_PLANARITY


def test_점이_부족하면_측정_보류():
    assert surface.fit_plane(torso_slab(n=surface.MIN_PLANE_POINTS - 1)) is None


def test_직선에_가까운_점군은_평면을_만들지_않는다():
    line = np.stack([np.linspace(0, 300, 500), np.zeros(500), np.zeros(500)], axis=1)
    assert surface.fit_plane(line) is None


@pytest.mark.parametrize("yaw", [0, 10, 25, -20, 40])
def test_몸통_회전을_수천_점에서_되찾는다(yaw):
    normal, _ = surface.fit_plane(torso_slab(yaw_deg=yaw))
    assert surface.plane_yaw_deg(normal) == pytest.approx(yaw, abs=1.5)


@pytest.mark.parametrize("lean", [0, 8, 20, -10])
def test_평면_전후_기울기를_되찾는다_숙이면_양수(lean):
    normal, _ = surface.fit_plane(torso_slab(lean_deg=lean))
    assert surface.plane_pitch_deg(normal) == pytest.approx(lean, abs=1.5)


# ---- 수평 띠 주축 기반 회전 (몸통 실전용) ------------------------------------


@pytest.mark.parametrize("yaw", [0, 12, 30, -25, 45])
def test_수평_띠_주축으로_몸통_회전을_되찾는다(yaw):
    """평면 적합이 아니라 위에서 내려다본 (x, z) 주축을 쓴다 — 곡률에 강하다."""
    pts = torso_slab(yaw_deg=yaw)
    got = surface.torso_yaw_from_slab(pts, y_center=1400.0)
    assert got is not None
    assert got == pytest.approx(yaw, abs=2.0)


def test_곡률이_큰_몸통에서도_회전이_나온다():
    """실기기에서 평면 적합이 planarity 0.63으로 억제됐던 상황의 회귀 테스트."""
    n = 5000
    u = RNG.uniform(-105, 105, n)          # 실측과 같은 폭 (어깨너비 300mm × 0.7)
    v = RNG.uniform(-250, 250, n)
    # 시상면 범위 130mm — 실기기에서 planarity 0.63을 만든 것과 같은 규모.
    # 목·어깨는 뒤로 물러나고 복부는 앞으로 나오므로 중심띠의 전후 편차가 크다.
    z = 130.0 * ((v / 250.0) ** 2 - 0.5)
    pts = np.stack([u, v + 1400.0, z + 1000.0], axis=1)

    assert surface.fit_plane(pts)[1] > surface.MAX_PLANARITY  # 평면으론 못 쓴다
    assert surface.torso_yaw_from_slab(pts, 1400.0) == pytest.approx(0.0, abs=3.0)


def test_옆모습처럼_방향이_모호하면_보류한다():
    # 위에서 본 단면이 거의 원형 — 어깨선 방향이 정의되지 않는다
    n = 1200
    theta = RNG.uniform(0, 2 * math.pi, n)
    r = RNG.uniform(90, 110, n)
    pts = np.stack([r * np.cos(theta), np.full(n, 1400.0), r * np.sin(theta) + 1000.0], axis=1)
    assert surface.torso_yaw_from_slab(pts, 1400.0) is None


@pytest.mark.parametrize("lean", [0, 10, -8])
def test_척추_곡선에서_전후_기울기를_낸다(lean):
    curve = surface.spine_curve(torso_slab(lean_deg=lean))
    got = surface.torso_lean_from_curve(curve)
    assert got is not None
    assert got == pytest.approx(lean, abs=2.5)


def test_척추_곡선이_없으면_기울기도_보류():
    assert surface.torso_lean_from_curve(None) is None


def test_다수점_적합이_2점_추정보다_조용하다_원리():
    """다수점 적합의 수학적 이점만 확인한다 — **실기기 성능 주장이 아니다.**

    ⚠️ 실측(2026-07-27, 정면 정지 150프레임)에서는 표면 yaw 지터 0.223도 vs
    관절 yaw 지터 0.202도로 **표면이 오히려 약간 시끄러웠다.** 이 테스트가 보이는
    3배 개선은 실기기에서 재현되지 않는다. 이유는 두 가지다:

      1. k4abt 관절은 '점 2개'가 아니다. DNN이 뎁스 실루엣 전체를 소비하고
         kinematic 모델을 맞춘 결과이므로 이미 수만 픽셀에 대해 평균돼 있다.
         아래의 '좌우 최극점' baseline은 부당하게 나쁜 추정기다.
      2. ToF 노이즈는 공간적으로 상관돼 있다. 이웃 픽셀이 함께 흔들리므로
         평균해도 √N으로 줄지 않는다. 아래는 독립 노이즈를 가정해 평균화에
         과도하게 유리하다.

    따라서 표면 측정의 가치는 '더 정확함'이 아니라 (a) 관절과 독립된 경로로
    교차검증이 되고 (b) 관절로는 아예 낼 수 없는 양(척추 편차·표면 폭·가슴
    깊이)을 준다는 데 있다.
    """
    plane_estimates, joint_estimates = [], []
    for _ in range(30):
        pts = torso_slab(yaw_deg=15.0, noise_mm=6.0)
        normal, _ = surface.fit_plane(pts)
        plane_estimates.append(surface.plane_yaw_deg(normal))
        # 관절 2개 흉내: 좌우 끝점 하나씩만 뽑아 각도를 낸다
        left = pts[np.argmin(pts[:, 0])]
        right = pts[np.argmax(pts[:, 0])]
        v = right - left
        joint_estimates.append(math.degrees(math.atan2(float(v[2]), float(v[0]))))

    plane_sd = float(np.std(plane_estimates))
    joint_sd = float(np.std(joint_estimates))
    assert plane_sd < joint_sd / 3, f"평면 {plane_sd:.3f}도 vs 2점 {joint_sd:.3f}도"


# ---- 척추 곡선 -------------------------------------------------------------


def test_곧은_등은_시상면_편차가_0에_가깝다():
    curve = surface.spine_curve(torso_slab())
    assert curve is not None
    assert abs(surface.spine_sagittal_offset_mm(curve)) < 6.0


def test_굽은_등은_양수_편차로_나온다():
    """중간 높이가 카메라 쪽(-Z)으로 튀어나온 곡면 = 앞으로 굽음.

    측정값은 실제 돌출(40mm)보다 작게 나온다 — spine_curve가 높이 5~95
    퍼센타일만 쓰고 층 평균을 내므로 양 끝이 안쪽으로 당겨진다. 절대값이 아니라
    곧은 등(<6mm)과의 **구분력**이 이 지표의 목적이다.
    """
    n = 4000
    u = RNG.uniform(-170, 170, n)
    v = RNG.uniform(-250, 250, n)
    z = 40.0 * ((v / 250.0) ** 2 - 1.0)  # v=0에서 40mm 돌출
    pts = np.stack([u, v + 1400.0, z + 1000.0], axis=1)

    offset = surface.spine_sagittal_offset_mm(surface.spine_curve(pts))
    assert offset is not None
    assert offset > 20.0

    straight = surface.spine_sagittal_offset_mm(surface.spine_curve(torso_slab()))
    assert offset > abs(straight) * 3  # 곧은 등과 명확히 갈린다


def test_높이가_짧으면_척추_곡선을_만들지_않는다():
    assert surface.spine_curve(torso_slab(height=50.0)) is None
    assert surface.spine_sagittal_offset_mm(None) is None


# ---- 중심·폭·가슴 깊이 ------------------------------------------------------


def test_표면_중심은_점군_평균이다():
    pts = torso_slab()
    centroid = surface.surface_centroid(pts)
    assert centroid is not None
    assert centroid[1] == pytest.approx(1400.0, abs=15.0)
    assert centroid[2] == pytest.approx(1000.0, abs=15.0)


def test_표면_폭은_실제_좌우_범위를_잰다():
    width = surface.surface_width_mm(torso_slab(width=340.0), y_center=1400.0)
    assert width == pytest.approx(340.0, abs=20.0)


def test_띠에_점이_없으면_폭을_보류한다():
    assert surface.surface_width_mm(torso_slab(), y_center=5000.0) is None


def test_가슴_깊이는_가장_가까운_면을_잡는다():
    depth = surface.chest_depth_mm(torso_slab(), y_center=1400.0)
    assert depth == pytest.approx(1000.0, abs=12.0)
