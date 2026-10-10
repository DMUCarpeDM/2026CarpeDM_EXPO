import {useExpressionTracking} from "./useExpressionTracking.js";
import { postureFeatures } from "./postureEnsemble.js";
/** MediaPipe Pose/Hand 기반 실시간 트래킹 훅 (poc useNonverbal의 경량 JS 이식).
 *
 * 원본 영상은 어디에도 저장·전송하지 않고, 브라우저 안에서 프레임을 분석해
 *
 * 턴 집계·직렬화는 nonverbalMetrics.js(순수 모듈, node --test 대상)가 담당하고,
 * 이 훅은 MediaPipe 결과에서 프레임 사실만 뽑아 넘긴다.
 *
 * 반환 live: { status, tracking, tiltDeg, postureLevel, poseTracked, inferMs }
 *   + collectTurnStats(): 턴 집계를 NonverbalIn 페이로드로 회수하고 리셋
 * status: idle(카메라 없음) | loading | ready | failed
 */
import { useEffect, useRef, useState } from "react";
import { resolveModel, resolveWasmUrl } from "./visionAssets.js";
import { drawOverlay } from "./faceTrackingOverlay.js";
import {
  SAMPLE_MS,
  accumulateSample,
  finalizeTurnMetrics,
  makeTurnAcc,
  median,
  resolveHeadDown,
} from "./nonverbalMetrics.js";

const LIVE_PUSH_MS = 300;

// 어깨너비가 이보다 좁으면(멀리 있거나 옆모습) 정규화 분모가 불안정해 표본을 버린다
const MIN_SHOULDER_WIDTH = 0.05;
// 어깨 기울기 라이브 게이지의 '수평' 판정 임계(도)
const POSTURE_LEVEL_DEG = 7;
const LEAN_DELTA_THRESHOLD = 0.16;
const HAND_FACE_THRESHOLD = 0.55;

// 자세 기준값을 첫 24개 유효 표본에서 모은다.
const CALIB_SAMPLES = 24;
const TRACK_LOST_RESET_MS = 3000;
const emptyCalib = () => ({ tilt: [], headGap: [], torsoZ: [] });

export function useFaceTracking(mediaStream, videoRef, canvasRef) {
  const [live, setLive] = useState({ status: "idle", tracking: false, calibrating: false, tiltDeg: 0, postureLevel: false, poseTracked: false, inferMs: 0 });
  const liveRef = useRef(live);
  const turnAccRef = useRef(makeTurnAcc());
  const calibratedRef = useRef(false);
  const expressionStatus = useExpressionTracking(mediaStream, videoRef, turnAccRef);
  // 지난 수집 시점 이후의 집계를 NonverbalIn 모양으로 돌려주고 리셋 (턴 제출 시 호출)
  const collectTurnStats = useRef(() => {
    const acc = turnAccRef.current;
    turnAccRef.current = makeTurnAcc();
    return finalizeTurnMetrics(acc, calibratedRef.current);
  }).current;

  const peekTurnStats = useRef(() => finalizeTurnMetrics(turnAccRef.current, calibratedRef.current)).current;

  useEffect(() => {
    const hasVideo = Boolean(mediaStream?.getVideoTracks?.().some((track) => track.readyState === "live"));
    if (!hasVideo) { setLive((prev) => ({ ...prev, status: "idle", tracking: false, poseTracked: false })); return undefined; }

    let cancelled = false;
    let pose = null;
    let hand = null;
    let timer = 0;
    let lastPush = 0;
    let inferAvg = 0;
    // 개인 기준(캘리브레이션) 상태
    let base = null; // 자세 기준값
    let calib = emptyCalib();
    let lastPoseAt = 0;
    setLive((prev) => ({ ...prev, status: "loading" }));

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const [wasmUrl, poseModel, handModel] = await Promise.all([resolveWasmUrl(), resolveModel("pose"), resolveModel("hand")]);
        const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: poseModel },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: .4,
          minPosePresenceConfidence: .4,
          minTrackingConfidence: .4,
        });
        hand = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: handModel },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        if (cancelled) { pose.close(); hand.close(); pose = null; hand = null; return; }
        const poseLm = pose;
        const handLm = hand;

        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          const ts = performance.now();
          try {
            const poseResult = poseLm.detectForVideo(video, ts + 0.001);
            const handResult = handLm.detectForVideo(video, ts + 0.002);
            const took = performance.now() - ts;
            inferAvg = inferAvg === 0 ? took : inferAvg * 0.85 + took * 0.15;
            const plm = poseResult.landmarks?.[0];
            const features = postureFeatures(plm);
            if (features && turnAccRef.current.poseFeatures.length < 1500) turnAccRef.current.poseFeatures.push(features);
            const handLandmarks = handResult.landmarks || [];

            drawOverlay(canvasRef.current, video, null, plm, handLandmarks);

            // ---- 포즈 기하: 어깨 기울기 · 어깨중심(흔들림) · 코-어깨 거리(고개 숙임) ----
            let tiltRaw = null;
            let shoulderX = null;
            let headGap = null;
            let torsoZ = null;
            let handNearFace = false;
            let worldUsed = false;
            let poseTracked = false;
            if (plm) {
              const ls = plm[11];
              const rs = plm[12];
              const noseP = plm[0];
              poseTracked = (ls?.visibility ?? 1) > 0.5 && (rs?.visibility ?? 1) > 0.5;
              const width = ls && rs ? Math.abs(ls.x - rs.x) : 0;
              if (poseTracked && width > MIN_SHOULDER_WIDTH) {
                // 3D 월드 랜드마크(미터·골반 원점)를 쓰면 몸이 비스듬히 서도(yaw)
                // 어깨선 기울기가 왜곡되지 않는다 — 2D 투영의 고질적 오차. 없으면 폴백.
                const wlm = poseResult.worldLandmarks?.[0];
                const wls = wlm?.[11];
                const wrs = wlm?.[12];
                const wlh = wlm?.[23];
                const wrh = wlm?.[24];
                const visible = (p) => !!p && (p.visibility ?? 1) > 0.5;
                if (visible(wls) && visible(wrs)) {
                  tiltRaw = (Math.atan2(Math.abs(wls.y - wrs.y), Math.hypot(wls.x - wrs.x, wls.z - wrs.z) + 1e-6) * 180) / Math.PI;
                  if (visible(wlh) && visible(wrh)) {
                    const shoulderWidth = Math.hypot(wls.x - wrs.x, wls.y - wrs.y, wls.z - wrs.z);
                    torsoZ = (((wls.z + wrs.z) / 2) - ((wlh.z + wrh.z) / 2)) / Math.max(shoulderWidth, 1e-6);
                  }
                  worldUsed = true;
                } else {
                  tiltRaw = (Math.atan2(Math.abs(ls.y - rs.y), width) * 180) / Math.PI;
                }
                // 어깨너비로 정규화 — 관람객이 앞뒤로 움직여도 스케일이 변하지 않는다
                shoulderX = ((ls.x + rs.x) / 2) / width;
                if (noseP) headGap = ((ls.y + rs.y) / 2 - noseP.y) / width;
                if (noseP && handLandmarks.length) {
                  const fingerTips = [4, 8, 12, 16, 20];
                  handNearFace = handLandmarks.some((points) => fingerTips.some((index) => {
                    const point = points[index];
                    return point && Math.hypot(point.x - noseP.x, point.y - noseP.y) / width < HAND_FACE_THRESHOLD;
                  }));
                }
              }
            }

            if (poseTracked) {
              if (lastPoseAt && ts - lastPoseAt > TRACK_LOST_RESET_MS) {
                base = null;
                calib = emptyCalib();
              }
              lastPoseAt = ts;
              if (base === null && tiltRaw !== null) {
                calib.tilt.push(tiltRaw);
                if (headGap !== null) calib.headGap.push(headGap);
                if (torsoZ !== null) calib.torsoZ.push(torsoZ);
                if (calib.tilt.length >= CALIB_SAMPLES) {
                  base = {
                    tilt: median(calib.tilt),
                    headGap: calib.headGap.length >= 4 ? median(calib.headGap) : null,
                    torsoZ: calib.torsoZ.length >= 4 ? median(calib.torsoZ) : null,
                  };
                }
              }
            }
            const tiltDeg = tiltRaw ?? 0;
            // 기준 보정 어깨 기울기 — 거치 각도·체형에서 오는 상시 기울기를 빼고 '무너짐'만 남긴다
            const tiltAdj = tiltRaw !== null ? Math.max(0, tiltRaw - (base ? base.tilt : 0)) : null;
            const postureLevel = tiltAdj !== null && tiltAdj < POSTURE_LEVEL_DEG;
            // 고개 숙임은 코-어깨 거리의 기준 대비 변화로 판정한다.
            const headDown = resolveHeadDown(headGap, base ? base.headGap : null);
            const torsoDelta = torsoZ !== null && base?.torsoZ != null
              ? torsoZ - base.torsoZ
              : 0;
            // 어깨 중심이 골반보다 카메라 쪽으로 크게 나오면 숙이거나 앞으로 기운 자세,
            // 반대쪽이면 등받이에 기대는 자세다. 둘 다 개인 기준 대비 변화량으로 판정한다.
            const hunched = headDown || torsoDelta < -LEAN_DELTA_THRESHOLD;
            const leanBack = torsoDelta > LEAN_DELTA_THRESHOLD;
            calibratedRef.current = base !== null;

            // ---- 턴 단위 집계 (어깨가 잡힌 샘플만) — 제출 시 collectTurnStats()로 회수 ----
            if (poseTracked) {
              accumulateSample(turnAccRef.current, {
                tiltAdj,
                shoulderX,
                headDown,
                headTracked: headGap !== null,
                torsoTracked: headGap !== null && torsoZ !== null && base?.torsoZ != null,
                handFaceTracked: headGap !== null && handLandmarks.length > 0,
                hunched,
                leanBack,
                handTracked: handLandmarks.length > 0,
                handNearFace,
                worldUsed,
              });
            }

            if (ts - lastPush > LIVE_PUSH_MS) {
              lastPush = ts;
              const next = { status: "ready", tracking: Boolean(plm || handLandmarks.length), calibrating: base === null, tiltDeg: Math.round(tiltDeg), postureLevel, poseTracked, inferMs: Math.max(1, Math.round(inferAvg)) };
              const prev = liveRef.current;
              if (next.status !== prev.status || next.tracking !== prev.tracking || next.calibrating !== prev.calibrating || next.postureLevel !== prev.postureLevel || next.poseTracked !== prev.poseTracked || Math.abs(next.inferMs - prev.inferMs) > 4) {
                liveRef.current = next;
                setLive(next);
              }
            }
          } catch {
            // 프레임 단위 추론 실패는 조용히 건너뛴다 (다음 프레임에서 회복)
          }
        }, SAMPLE_MS);
      } catch {
        if (!cancelled) setLive((prev) => ({ ...prev, status: "failed" }));
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      pose?.close();
      hand?.close();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [mediaStream, videoRef, canvasRef]);

  return { ...live, expressionStatus, collectTurnStats, peekTurnStats };
}
