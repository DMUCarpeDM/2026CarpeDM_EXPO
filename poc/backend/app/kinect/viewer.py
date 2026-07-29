"""실시간 뷰어 — 뎁스 영상 위에 스켈레톤과 자세 지표를 그린다.

    .venv/Scripts/python -m app.kinect.viewer

키: [d] 뎁스 / [i] IR 전환 · [s] 스켈레톤 · [b] 인체 분할 마스크 · [q]/ESC 종료

개발용 도구다(전시 런타임에는 쓰지 않는다). 숫자만 보는 것과 달리, 이 창은
숫자가 왜 그렇게 나왔는지를 보여준다:

  - 뎁스 미획득 픽셀이 **검은 구멍**으로 보인다. 어두운 옷은 850nm IR을 흡수해
    상체에 구멍을 만드는데, 그게 그대로 눈에 띈다 (거치·조명·복장 결정 근거).
  - 관절이 **신뢰도별로 색이 다르다.** 회색(LOW)은 '가려져서 예측만 한' 값이라
    지표에 쓰면 안 되는 관절이다.
  - 유효 거리 밖의 사람은 흐리게 그려진다 — 관람객 분리가 실제로 작동하는지 확인.

라벨이 영문인 이유: OpenCV putText가 한글 글리프를 렌더링하지 못한다.
한글이 필요해지면 Pillow 의존을 추가해야 하는데, 개발 도구라 그러지 않았다.
"""
from __future__ import annotations

import sys
import time

import cv2
import numpy as np

from app.kinect import geometry
from app.kinect import k4a as _k
from app.kinect import surface
from app.kinect.device import (
    KIOSK_FAR_MM,
    KIOSK_NEAR_MM,
    KinectDevice,
    nearest_body,
    project_to_depth_2d,
)

J = _k.JOINT

# k4abt 32관절 계층 — 그리기용 뼈대
BONES = [
    (J["PELVIS"], J["SPINE_NAVEL"]), (J["SPINE_NAVEL"], J["SPINE_CHEST"]),
    (J["SPINE_CHEST"], J["NECK"]), (J["NECK"], J["HEAD"]), (J["HEAD"], J["NOSE"]),
    (J["HEAD"], J["EYE_LEFT"]), (J["EYE_LEFT"], J["EAR_LEFT"]),
    (J["HEAD"], J["EYE_RIGHT"]), (J["EYE_RIGHT"], J["EAR_RIGHT"]),
    (J["SPINE_CHEST"], J["CLAVICLE_LEFT"]), (J["CLAVICLE_LEFT"], J["SHOULDER_LEFT"]),
    (J["SHOULDER_LEFT"], J["ELBOW_LEFT"]), (J["ELBOW_LEFT"], J["WRIST_LEFT"]),
    (J["WRIST_LEFT"], J["HAND_LEFT"]), (J["HAND_LEFT"], J["HANDTIP_LEFT"]),
    (J["WRIST_LEFT"], J["THUMB_LEFT"]),
    (J["SPINE_CHEST"], J["CLAVICLE_RIGHT"]), (J["CLAVICLE_RIGHT"], J["SHOULDER_RIGHT"]),
    (J["SHOULDER_RIGHT"], J["ELBOW_RIGHT"]), (J["ELBOW_RIGHT"], J["WRIST_RIGHT"]),
    (J["WRIST_RIGHT"], J["HAND_RIGHT"]), (J["HAND_RIGHT"], J["HANDTIP_RIGHT"]),
    (J["WRIST_RIGHT"], J["THUMB_RIGHT"]),
    (J["PELVIS"], J["HIP_LEFT"]), (J["HIP_LEFT"], J["KNEE_LEFT"]),
    (J["KNEE_LEFT"], J["ANKLE_LEFT"]), (J["ANKLE_LEFT"], J["FOOT_LEFT"]),
    (J["PELVIS"], J["HIP_RIGHT"]), (J["HIP_RIGHT"], J["KNEE_RIGHT"]),
    (J["KNEE_RIGHT"], J["ANKLE_RIGHT"]), (J["ANKLE_RIGHT"], J["FOOT_RIGHT"]),
]

# 신뢰도별 색 — NONE도 그린다. 안 그리면 '관절이 없다'와 '관절이 안 보인다'가
# 화면에서 구분되지 않아, 스켈레톤이 비어 보이는데 이유를 알 수 없다.
CONF_OBSERVED = (90, 240, 90)     # MEDIUM 이상 — 실제 관측 (현 SDK 최고 등급)
CONF_PREDICTED = (170, 170, 170)  # LOW — 가려져서 예측만 한 값. 지표에 쓰면 안 됨
CONF_NONE = (70, 70, 210)         # NONE — 범위 밖. 붉게 표시
DISPLAY_SIZE = 760
NEAR_MM, FAR_MM = 400, 3000


def colorize_depth(depth_mm: np.ndarray) -> np.ndarray:
    """뎁스 → 컬러맵. 미획득(0) 픽셀은 검정으로 남겨 구멍이 보이게 한다."""
    valid = depth_mm > 0
    clipped = np.clip(depth_mm.astype(np.float32), NEAR_MM, FAR_MM)
    norm = ((clipped - NEAR_MM) / (FAR_MM - NEAR_MM) * 255).astype(np.uint8)
    colored = cv2.applyColorMap(255 - norm, cv2.COLORMAP_JET)  # 가까울수록 붉게
    colored[~valid] = (0, 0, 0)
    return colored


def colorize_ir(ir: np.ndarray) -> np.ndarray:
    """능동 IR → 그레이스케일. 동적 범위가 넓어 제곱근으로 압축한다."""
    v = np.clip(ir.astype(np.float32), 0, 2500)
    v = (np.sqrt(v / 2500.0) * 255).astype(np.uint8)
    return cv2.cvtColor(v, cv2.COLOR_GRAY2BGR)


def depth_fill_ratio(depth_mm: np.ndarray, points: list[tuple[float, float]]) -> float | None:
    """관절 경계상자 안에서 뎁스가 잡힌 픽셀 비율.

    어두운 옷의 IR 흡수를 정량화한다. 이 값이 낮으면 k4abt가 부족한 실루엣으로
    추정하는 중이라 지표를 믿기 어렵다.
    """
    if not points:
        return None
    height, width = depth_mm.shape
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = max(0, int(min(xs))), min(width, int(max(xs)) + 1)
    y0, y1 = max(0, int(min(ys))), min(height, int(max(ys)) + 1)
    if x1 <= x0 or y1 <= y0:
        return None
    box = depth_mm[y0:y1, x0:x1]
    return float(np.count_nonzero(box) / box.size)


def joint_color(level: int) -> tuple[int, int, int]:
    if level >= _k.K4ABT_JOINT_CONFIDENCE_MEDIUM:
        return CONF_OBSERVED
    return CONF_PREDICTED if level == _k.K4ABT_JOINT_CONFIDENCE_LOW else CONF_NONE


def draw_body(canvas, calibration, body, is_target: bool):
    """스켈레톤을 그리고 (투영된 관절 픽셀들, 신뢰도 집계)를 돌려준다.

    NONE 관절도 그린다 — 안 그리면 화면에서 사라져 '스켈레톤이 비었다'로만
    보이고, 왜 비었는지(범위 밖인지 가려진 건지)를 알 수 없다.
    """
    pts: dict[int, tuple[float, float]] = {}
    for idx in range(_k.K4ABT_JOINT_COUNT):
        projected = project_to_depth_2d(calibration, body.joints_mm[idx])
        if projected is not None:
            pts[idx] = projected

    dim = 1.0 if is_target else 0.3  # 유효 거리 밖 사람 = 흐리게
    thick = 3 if is_target else 1
    radius = 5 if is_target else 2

    for a, b in BONES:
        if a not in pts or b not in pts:
            continue
        # 뼈 색은 두 끝점 중 더 약한 쪽을 따른다 (낙관적으로 보이지 않게)
        base = joint_color(min(int(body.confidence[a]), int(body.confidence[b])))
        cv2.line(canvas, tuple(map(int, pts[a])), tuple(map(int, pts[b])),
                 tuple(int(c * dim) for c in base), thick, cv2.LINE_AA)
    for idx, (x, y) in pts.items():
        base = joint_color(int(body.confidence[idx]))
        cv2.circle(canvas, (int(x), int(y)), radius,
                   tuple(int(c * dim) for c in base), -1, cv2.LINE_AA)

    levels = body.confidence
    counts = (
        int(np.count_nonzero(levels >= _k.K4ABT_JOINT_CONFIDENCE_MEDIUM)),
        int(np.count_nonzero(levels == _k.K4ABT_JOINT_CONFIDENCE_LOW)),
        int(np.count_nonzero(levels == _k.K4ABT_JOINT_CONFIDENCE_NONE)),
    )
    return list(pts.values()), counts


def draw_panel(canvas, lines: list[tuple[str, tuple[int, int, int]]]) -> None:
    """좌상단 반투명 정보판."""
    pad, line_h = 10, 22
    box = canvas[0:pad * 2 + line_h * len(lines), 0:435]
    cv2.addWeighted(box, 0.25, np.zeros_like(box), 0.75, 0, box)
    for i, (text, color) in enumerate(lines):
        cv2.putText(canvas, text, (pad, pad + line_h * (i + 1) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 1, cv2.LINE_AA)


def surface_metrics(frame, body, rotation) -> dict:
    """포인트 클라우드 기반 지표 — 관절 32개가 아니라 표면 수만 점에서 낸다."""
    out: dict = {}
    if frame.xyz_mm is None or frame.body_index_map is None:
        return out
    points = surface.person_points(frame.xyz_mm, frame.body_index_map, body.index)
    out["points"] = int(points.shape[0])
    if points.shape[0] < surface.MIN_PLANE_POINTS:
        return out

    world = geometry.to_world(points, rotation)
    joints = geometry.to_world(body.joints_mm, rotation)
    chest, neck, pelvis = joints[J["SPINE_CHEST"]], joints[J["NECK"]], joints[J["PELVIS"]]
    span = geometry.shoulder_span_mm(joints[J["SHOULDER_LEFT"]], joints[J["SHOULDER_RIGHT"]])

    torso = surface.torso_points(world, chest, neck, pelvis, span)
    out["torso_points"] = int(torso.shape[0])
    # 회전은 가슴 높이 수평 띠의 주축에서 (평면 적합은 몸통 곡률에 깨진다)
    out["yaw"] = surface.torso_yaw_from_slab(torso, float(chest[1]))
    curve = surface.spine_curve(torso)
    out["lean"] = surface.torso_lean_from_curve(curve)
    out["spine"] = surface.spine_sagittal_offset_mm(curve)
    out["width"] = surface.surface_width_mm(world, float(joints[J["SHOULDER_LEFT"]][1]))
    return out


def main() -> int:
    try:
        _k.load()
    except _k.KinectUnavailable as exc:
        print(f"[불가] {exc}")
        return 2

    show_ir = False
    show_skeleton = True
    show_mask = False
    fps_ema = None
    last = time.perf_counter()

    try:
        with KinectDevice(capture_images=True) as dev:
            print(f"S/N {dev.serial} · {dev.processing_mode} · 창이 뜨면 [q]로 종료")
            while True:
                frame = dev.poll(timeout_ms=1000)
                if frame is None:
                    continue

                now = time.perf_counter()
                inst = 1.0 / max(now - last, 1e-6)
                last = now
                fps_ema = inst if fps_ema is None else fps_ema * 0.9 + inst * 0.1

                source = frame.ir if show_ir else frame.depth_mm
                if source is None:
                    continue
                canvas = colorize_ir(source) if show_ir else colorize_depth(source)

                if show_mask and frame.body_index_map is not None:
                    # 픽셀 단위 인체 분할 — 표면 지표가 어느 점들을 쓰는지 보여준다
                    person = frame.body_index_map != _k.K4ABT_BODY_INDEX_MAP_BACKGROUND
                    canvas[person] = (canvas[person] * 0.45
                                      + np.array([70, 200, 255]) * 0.55).astype(np.uint8)

                target = nearest_body(frame.bodies)
                rotation = frame.world_rotation
                fill = None
                counts = None
                if show_skeleton:
                    for body in frame.bodies:
                        is_target = target is not None and body.id == target.id
                        pts, body_counts = draw_body(canvas, dev.calibration, body, is_target)
                        if is_target:
                            counts = body_counts
                            if frame.depth_mm is not None:
                                fill = depth_fill_ratio(frame.depth_mm, pts)

                lines = [
                    (f"{'IR' if show_ir else 'DEPTH'}  {fps_ema:4.1f} fps  "
                     f"bodies={len(frame.bodies)}", (235, 235, 235)),
                    ("green=observed  gray=predicted  red=out-of-range", (170, 170, 170)),
                ]
                if target is not None and rotation is not None:
                    world = geometry.to_world(target.joints_mm, rotation)
                    tilt = yaw = pitch = None
                    if target.all_observed(J["SHOULDER_LEFT"], J["SHOULDER_RIGHT"]):
                        tilt = geometry.shoulder_tilt_deg(world[J["SHOULDER_LEFT"]],
                                                          world[J["SHOULDER_RIGHT"]])
                        yaw = geometry.torso_yaw_deg(world[J["SHOULDER_LEFT"]],
                                                     world[J["SHOULDER_RIGHT"]])
                    if target.all_observed(J["NECK"], J["HEAD"]):
                        pitch = geometry.head_pitch_deg(world[J["NECK"]], world[J["HEAD"]])
                    fmt = lambda v, u="deg": f"{v:+6.1f} {u}" if v is not None else "     -"  # noqa: E731

                    lines += [
                        (f"dist        {target.distance_mm / 10:6.1f} cm", (235, 235, 235)),
                        ("-- joints (32 pts) " + "-" * 12, (170, 170, 170)),
                        (f"shoulder    {fmt(tilt)}", (120, 220, 255)),
                        (f"torso yaw   {fmt(yaw)}", (120, 220, 255)),
                        (f"head pitch  {fmt(pitch)}", (120, 220, 255)),
                    ]
                    if counts is not None:
                        observed, predicted, none = counts
                        # 관측/예측/범위밖을 숫자로 — '스켈레톤이 적어 보인다'의 원인을
                        # 눈대중이 아니라 수치로 가른다
                        lines.append((
                            f"joints      {observed} obs / {predicted} pred / {none} none",
                            CONF_OBSERVED if observed >= 20 else (80, 160, 255)))
                    if fill is not None:
                        # 낮으면 어두운 옷이 IR을 먹고 있다는 뜻
                        color = CONF_OBSERVED if fill > 0.6 else (80, 160, 255)
                        lines.append((f"depth fill  {fill * 100:5.1f} %", color))

                    # ---- 표면(포인트 클라우드) 지표 ----
                    surf = surface_metrics(frame, target, rotation)
                    total = surf.get("points")
                    if total:
                        lines.append((f"-- surface ({total:,} pts) " + "-" * 6,
                                      (170, 170, 170)))
                        torso_n = surf.get("torso_points")
                        if torso_n:
                            lines.append((f"torso pts   {torso_n:,} (arms excluded)",
                                          (170, 170, 170)))
                        lines += [
                            (f"torso yaw   {fmt(surf.get('yaw'))}", (140, 255, 190)),
                            (f"torso lean  {fmt(surf.get('lean'))}", (140, 255, 190)),
                            (f"spine bend  {fmt(surf.get('spine'), 'mm')}", (140, 255, 190)),
                            (f"shoulder w  {fmt(surf.get('width'), 'mm')}", (140, 255, 190)),
                        ]
                    elif frame.xyz_mm is None:
                        lines.append(("surface: point cloud unavailable", (80, 160, 255)))
                elif frame.bodies:
                    # 사람은 잡혔는데 대상이 아니면 '왜'를 보여준다 — 조용히 비어 있으면
                    # 필터가 거른 건지 추적이 실패한 건지 구분할 수 없다
                    seen = [b.distance_mm / 10 for b in frame.bodies
                            if b.observed(J["SPINE_CHEST"])]
                    if seen:
                        lines.append((
                            f"out of range  {min(seen):5.1f} cm  "
                            f"(kiosk {KIOSK_NEAR_MM / 10:.0f}-{KIOSK_FAR_MM / 10:.0f} cm)",
                            (80, 160, 255)))
                    else:
                        lines.append(("chest not observed", (150, 150, 150)))
                else:
                    lines.append(("no body detected", (150, 150, 150)))

                draw_panel(canvas, lines)
                canvas = cv2.resize(canvas, (DISPLAY_SIZE, DISPLAY_SIZE),
                                    interpolation=cv2.INTER_NEAREST)
                cv2.imshow("Mirror-ting / Kinect live", canvas)

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("i"):
                    show_ir = True
                elif key == ord("d"):
                    show_ir = False
                elif key == ord("s"):
                    show_skeleton = not show_skeleton
                elif key == ord("b"):
                    show_mask = not show_mask
    except _k.KinectUnavailable as exc:
        print(f"[불가] {exc}")
        return 2
    except KeyboardInterrupt:
        pass
    finally:
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    sys.exit(main())
