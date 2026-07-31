"""Kinect 라이브 지표 서비스 — WebSocket으로 실측값을 내보낸다.

    .venv/Scripts/python -m app.kinect.service      →  http://127.0.0.1:8002

기존 PoC 서버(:8001)와 **별도 프로세스**다. app/main.py는 이 모듈을 import하지
않으므로 전시 데모 경로에 영향이 없다.

이 구조가 S6(NonverbalIn 생산자 교체)의 실제 배선과 같다 — 지금은 디버그·발표용
화면이 붙어 있고, S6에서는 같은 생산자가 턴 집계를 채운다. 버려지는 코드가 아니다.

내보내는 값은 전부 실측이다. 표본이 부족하거나 게이트를 벗어나면 숫자를 만들지
않고 null로 보낸다 — 화면에서 '측정 보류'로 표시된다.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai.nonverbal import SHOULDER_TILT_BANDS, SWAY_BANDS
from app.ai.scoring import band_score, clamp, weighted_mean
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
STATIC = Path(__file__).parent / "static"

# 얼굴 메쉬 페이지가 쓰는 MediaPipe 에셋 — MVP가 이미 로컬에 받아둔 것을 재사용한다
# (npm run setup-offline이 준비함). CDN 의존을 만들지 않는다: 전시 PC는 오프라인이다.
_REPO = Path(__file__).parents[4]
MP_BUNDLE = _REPO / "mvp" / "node_modules" / "@mediapipe" / "tasks-vision" / "vision_bundle.mjs"
MP_WASM = _REPO / "mvp" / "public" / "mediapipe-wasm"
MP_MODELS = _REPO / "mvp" / "public" / "models"

# 뼈대 (viewer와 동일 정의 — 클라이언트가 선을 그릴 때 쓴다)
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

SWAY_WINDOW = 90  # 약 3초 (30fps) — 좌우 흔들림 표준편차 창


class _Shared:
    """캡처 스레드가 쓰고 WebSocket이 읽는 최신 프레임 한 칸."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.payload: dict | None = None
        self.status = "starting"
        self.error: str | None = None
        self.serial = ""
        self.mode = ""


shared = _Shared()
_stop = threading.Event()


def _round(value, digits=1):
    return None if value is None else round(float(value), digits)


def _gauge(key, label, value, unit, bands=None, digits=1, note=None) -> dict:
    """계기 한 칸. bands가 있으면 **실제 채점 함수**로 점수까지 낸다.

    화면이 밴드를 다시 구현하지 않게 서버에서 계산해 내려보낸다 — 발표 화면의
    숫자가 리포트의 숫자와 다르면 그 자체가 신뢰를 깎는다(단일 출처 원칙).
    bands=None은 '아직 채점 밴드가 없는 신규 관찰 지표'라는 뜻이고, 화면이
    그렇게 표시한다. 근거 없는 밴드를 발명하지 않는다.
    """
    out = {"key": key, "label": label, "unit": unit, "note": note,
           "value": _round(value, digits), "bands": None, "score": None}
    if bands is not None and value is not None:
        out["bands"] = list(bands)
        out["score"] = round(band_score(abs(float(value)), *bands), 1)
    return out


def _build_payload(dev, frame, fps, chest_history) -> dict:
    depth_shape = frame.depth_mm.shape if frame.depth_mm is not None else (512, 512)
    body = nearest_body(frame.bodies)
    rotation = frame.world_rotation

    # 유효 거리 밖이면 '왜'를 함께 보낸다 — 화면이 조용히 비면 원인을 알 수 없다
    gate = "ok"
    if body is None:
        near = [b.distance_mm / 10 for b in frame.bodies if b.observed(J["SPINE_CHEST"])]
        if not frame.bodies:
            gate = "no_body"
        elif near and min(near) * 10 < KIOSK_NEAR_MM:
            gate = "too_close"
        elif near:
            gate = "too_far"
        else:
            gate = "unstable"

    out: dict = {
        "fps": _round(fps),
        "bodies": len(frame.bodies),
        "gate": gate,
        "range_cm": [KIOSK_NEAR_MM / 10, KIOSK_FAR_MM / 10],
        "joints": None,
        "metrics": {},
        "quality": {},
    }
    if body is None or rotation is None:
        return out

    # ---- 스켈레톤 (뎁스 이미지 정규화 좌표) ----
    joints = []
    for idx in range(_k.K4ABT_JOINT_COUNT):
        projected = project_to_depth_2d(dev.calibration, body.joints_mm[idx])
        if projected is None:
            joints.append(None)
        else:
            joints.append([round(projected[0] / depth_shape[1], 4),
                           round(projected[1] / depth_shape[0], 4),
                           int(body.confidence[idx])])
    out["joints"] = joints

    # ---- 관절 기반 지표 ----
    world = geometry.to_world(body.joints_mm, rotation)
    sl, sr = world[J["SHOULDER_LEFT"]], world[J["SHOULDER_RIGHT"]]
    metrics: dict = {"dist_cm": _round(body.distance_mm / 10)}
    if body.all_observed(J["SHOULDER_LEFT"], J["SHOULDER_RIGHT"]):
        metrics["shoulder_tilt_deg"] = _round(geometry.shoulder_tilt_deg(sl, sr))
        metrics["torso_yaw_deg"] = _round(geometry.torso_yaw_deg(sl, sr))
    if body.all_observed(J["NECK"], J["HEAD"]):
        metrics["head_pitch_deg"] = _round(geometry.head_pitch_deg(world[J["NECK"]],
                                                                  world[J["HEAD"]]))
    # 좌우 흔들림 — cm(해석용)과 어깨너비 정규화값(채점용)을 함께 낸다.
    # SWAY_BANDS가 정규화 기준이라 cm를 그 밴드에 넣으면 안 된다.
    span_mm = geometry.shoulder_span_mm(sl, sr) if "torso_yaw_deg" in metrics else None
    if body.observed(J["SPINE_CHEST"]):
        chest_history.append(float(world[J["SPINE_CHEST"]][0]))
        if len(chest_history) >= 20:
            sway_mm = float(np.std(chest_history))
            metrics["sway_cm"] = _round(sway_mm / 10.0, 2)
            if span_mm and span_mm > 1.0:
                metrics["sway_norm"] = _round(sway_mm / span_mm, 4)

    # ---- 표면(포인트 클라우드) 지표 ----
    if frame.xyz_mm is not None and frame.body_index_map is not None:
        points = surface.person_points(frame.xyz_mm, frame.body_index_map, body.index)
        metrics["surface_points"] = int(points.shape[0])
        if points.shape[0] >= surface.MIN_PLANE_POINTS:
            pw = geometry.to_world(points, rotation)
            span = geometry.shoulder_span_mm(sl, sr)
            torso = surface.torso_points(pw, world[J["SPINE_CHEST"]], world[J["NECK"]],
                                        world[J["PELVIS"]], span)
            metrics["torso_points"] = int(torso.shape[0])
            metrics["surface_yaw_deg"] = _round(
                surface.torso_yaw_from_slab(torso, float(world[J["SPINE_CHEST"]][1])))
            curve = surface.spine_curve(torso)
            metrics["torso_lean_deg"] = _round(surface.torso_lean_from_curve(curve))
            metrics["spine_bend_mm"] = _round(surface.spine_sagittal_offset_mm(curve))
            metrics["shoulder_width_mm"] = _round(
                surface.surface_width_mm(pw, float(sl[1])), 0)

    out["metrics"] = metrics
    # 채점 밴드가 있는 지표와 신규 관찰 지표를 구분해 내려보낸다
    out["gauges"] = [
        _gauge("shoulder_tilt", "어깨 기울기", metrics.get("shoulder_tilt_deg"), "°",
               SHOULDER_TILT_BANDS, note="Posture-Fit 채점 · 좌우 어깨 높이차"),
        _gauge("sway", "상체 흔들림", metrics.get("sway_norm"), "",
               SWAY_BANDS, digits=4, note="Posture-Fit 채점 · 어깨너비로 정규화"),
        _gauge("torso_yaw", "몸통 회전", metrics.get("torso_yaw_deg"), "°",
               note="신규 · 뎁스로만 가능 (2D로는 거리와 구분 불가)"),
        _gauge("head_pitch", "고개 각도", metrics.get("head_pitch_deg"), "°",
               note="신규 · 실제 목→머리 각도"),
        _gauge("torso_lean", "상체 기울기", metrics.get("torso_lean_deg"), "°",
               note="표면 · 척추선 전체 기울기"),
        _gauge("spine_bend", "등 굽음", metrics.get("spine_bend_mm"), "mm",
               note="표면 · 검증 진행 중 (해석 확정 전)"),
    ]
    out["posture_live"] = _posture_live(metrics)
    out["quality"] = {
        "joints_observed": int(np.count_nonzero(
            body.confidence >= _k.K4ABT_JOINT_CONFIDENCE_MEDIUM)),
        "joints_total": _k.K4ABT_JOINT_COUNT,
    }
    return out


def _posture_live(metrics: dict) -> dict:
    """실시간 Posture-Fit 근사 — 가중치는 score_posture()의 실제 값을 쓴다.

    정식 Posture-Fit은 턴 전체를 집계해 계산한다(고개 숙임 '비율'·자세 유지력은
    시간 축이 필요하다). 여기서는 순간값으로 낼 수 있는 두 성분만 쓰고, 빠진
    성분을 숨기지 않고 함께 내려보낸다:

      어깨 기울기 0.40 · 상체 흔들림 0.25  → 사용 (가중치 재정규화)
      고개 숙임   0.35 · 자세 유지력 0.15  → 미포함 (순간값으로 정의되지 않음)

    고개 각도(도)를 head_down_ratio 밴드에 넣지 않는 이유: 그 밴드는 '프레임
    비율' 기준이라 단위가 다르다. 근거 없는 환산을 만들지 않는다.
    """
    parts: list[tuple[float, float]] = []
    used: list[str] = []
    tilt = metrics.get("shoulder_tilt_deg")
    if tilt is not None:
        parts.append((band_score(abs(tilt), *SHOULDER_TILT_BANDS), 0.40))
        used.append("어깨 기울기")
    sway = metrics.get("sway_norm")
    if sway is not None:
        parts.append((band_score(sway, *SWAY_BANDS), 0.25))
        used.append("상체 흔들림")
    if not parts:
        return {"score": None, "used": [], "missing": ["고개 숙임", "자세 유지력"]}
    return {
        "score": round(clamp(weighted_mean(parts)), 1),
        "used": used,
        "missing": ["고개 숙임", "자세 유지력"],
    }


def _capture_once(chest_history: deque[float]) -> None:
    with KinectDevice(capture_images=True) as dev:
        shared.serial, shared.mode = dev.serial, dev.processing_mode
        shared.status = "warming"
        shared.error = None
        last = time.perf_counter()
        fps = 0.0
        while not _stop.is_set():
            frame = dev.poll(timeout_ms=1000)
            if frame is None:
                continue
            now = time.perf_counter()
            fps = fps * 0.9 + (1.0 / max(now - last, 1e-6)) * 0.1 if fps else 30.0
            last = now
            payload = _build_payload(dev, frame, fps, chest_history)
            with shared.lock:
                shared.payload = payload
                shared.status = "live"


def _capture_loop() -> None:
    """장치가 실패해도 재시도한다.

    USB 장치는 앞 프로세스가 놓는 데 몇 초 걸리고, 케이블이 한 번 흔들려도
    카메라 시작이 실패한다. 한 번 실패로 영구히 'unavailable'에 머물면 발표 중
    화면이 죽는다 — 재시도로 스스로 회복하게 한다.
    """
    chest_history: deque[float] = deque(maxlen=SWAY_WINDOW)
    delay = 2.0
    while not _stop.is_set():
        try:
            _capture_once(chest_history)
            return  # 정상 종료 (_stop)
        except _k.KinectUnavailable as exc:
            shared.status, shared.error = "retrying", f"{exc} · {delay:.0f}초 후 재시도"
        except Exception as exc:  # pragma: no cover - 하드웨어 의존
            shared.status = "retrying"
            shared.error = f"{type(exc).__name__}: {exc} · {delay:.0f}초 후 재시도"
        if _stop.wait(delay):
            return
        delay = min(delay * 1.5, 15.0)  # 백오프 상한 — 무한히 늘어나면 회복이 늦다


app = FastAPI(title="Mirror-ting Kinect Live")


@app.on_event("startup")
def _start() -> None:
    threading.Thread(target=_capture_loop, name="kinect-capture", daemon=True).start()


@app.on_event("shutdown")
def _shutdown() -> None:
    _stop.set()


if MP_WASM.is_dir():
    app.mount("/vendor/wasm", StaticFiles(directory=MP_WASM), name="mp-wasm")
if MP_MODELS.is_dir():
    app.mount("/vendor/models", StaticFiles(directory=MP_MODELS), name="mp-models")


@app.get("/vendor/tasks-vision.mjs")
def tasks_vision() -> FileResponse:
    """MediaPipe Tasks Vision 번들 — MVP node_modules의 것을 그대로 제공."""
    return FileResponse(MP_BUNDLE, media_type="text/javascript")


# 개발 중에는 브라우저 캐시가 독이다 — 고친 판정 로직이 반영 안 된 화면을 보고
# "아직도 안 고쳐졌다"고 오진하게 된다. 실제로 그 일이 있었다.
_NO_CACHE = {"Cache-Control": "no-store, must-revalidate", "Pragma": "no-cache"}


def _page(name: str) -> HTMLResponse:
    return HTMLResponse((STATIC / name).read_text(encoding="utf-8"), headers=_NO_CACHE)


@app.get("/")
def index() -> HTMLResponse:
    return _page("live.html")


@app.get("/face")
def face() -> HTMLResponse:
    return _page("face.html")


@app.get("/practice")
def practice() -> HTMLResponse:
    """체험자 시점 — 미러 존 레이아웃. 실시간 게이지는 숨기고 글로우·토스트만."""
    return _page("practice.html")


@app.get("/api/health")
def health() -> JSONResponse:
    with shared.lock:
        return JSONResponse({
            "status": shared.status, "error": shared.error,
            "serial": shared.serial, "mode": shared.mode,
            "has_frame": shared.payload is not None,
            # 얼굴 메쉬 페이지가 뜨려면 이 셋이 다 있어야 한다
            "mediapipe": {
                "bundle": MP_BUNDLE.is_file(),
                "wasm": MP_WASM.is_dir(),
                "models": (MP_MODELS / "face_landmarker.task").is_file(),
            },
        })


@app.get("/api/bones")
def bones() -> JSONResponse:
    return JSONResponse({"bones": BONES, "names": list(_k.JOINT_NAMES)})


_face_diag: dict = {}


@app.post("/api/face-diag")
async def face_diag_post(payload: dict) -> JSONResponse:
    """표정 화면이 보내는 진단 수치를 받아둔다 (개발용, 루프백 전용).

    브라우저 카메라 권한은 사용자만 줄 수 있어서, 개발자가 다른 창에서 값을
    확인할 방법이 필요하다. 숫자만 오간다 — 영상·랜드마크는 보내지 않는다.
    """
    _face_diag.clear()
    _face_diag.update(payload)
    return JSONResponse({"ok": True})


@app.get("/api/face-diag")
def face_diag_get() -> JSONResponse:
    return JSONResponse(_face_diag or {"empty": True})


@app.post("/api/stop")
def stop() -> JSONResponse:
    """정상 종료 — 반드시 이 경로로 서비스를 멈춘다.

    프로세스를 강제 종료(taskkill/Stop-Process -Force)하면 KinectDevice.close()가
    돌지 않아 장치가 물린다. 실제로 그렇게 죽였다가 컬러 MCU의 USB 명령 채널이
    막혀 k4a_device_start_cameras가 계속 실패했고, 전원 재연결로만 복구됐다
    (SDK 자체 도구 k4arecorder도 동일하게 실패했으므로 장치 상태 문제였다).

        curl -X POST http://127.0.0.1:8002/api/stop
    """
    _stop.set()
    threading.Timer(0.6, lambda: os._exit(0)).start()  # 응답을 보낸 뒤 종료
    return JSONResponse({"stopping": True})


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    import asyncio

    await ws.accept()
    try:
        while True:
            with shared.lock:
                payload = shared.payload
                status, error = shared.status, shared.error
            await ws.send_json({"status": status, "error": error, "frame": payload})
            await asyncio.sleep(1 / 30)
    except WebSocketDisconnect:
        pass


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")


if __name__ == "__main__":
    main()
