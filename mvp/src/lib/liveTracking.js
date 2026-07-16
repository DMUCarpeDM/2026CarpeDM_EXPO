import { useCallback, useEffect, useRef, useState } from "react";
import { accumulateFrame, aggregate, emptyAcc, SAMPLE_MS } from "./nonverbal.js";

// MediaPipe Tasks Vision으로 실제 얼굴 메시와 상체 자세를 추적해 캔버스에 그려요.
// 모델과 WASM은 오프라인 전시를 위해 public/mediapipe/ 아래에 로컬로 번들되어 있어요.
const WASM_PATH = "/mediapipe/wasm";
const FACE_MODEL = "/mediapipe/face_landmarker.task";
const POSE_MODEL = "/mediapipe/pose_landmarker_lite.task";

const COLOR_MESH = "rgba(74, 233, 168, 0.28)";
const COLOR_CONTOUR = "rgba(74, 233, 168, 0.65)";
const COLOR_DOT = "rgba(150, 248, 205, 0.95)";
const COLOR_BRACKET = "rgba(74, 233, 168, 0.95)";
const COLOR_SKELETON = "rgba(52, 227, 154, 0.9)";
const COLOR_CHEST = "rgba(90, 168, 255, 0.9)";

let trackersPromise = null;

// FaceLandmarker/PoseLandmarker를 지연 로딩해요 (한 번 로드하면 재사용).
// GPU 델리게이트가 실패하는 기기에서는 CPU로 폴백해요.
export function loadTrackers() {
  if (!trackersPromise) {
    trackersPromise = (async () => {
      const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const makeFace = (delegate) => FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      const makePose = (delegate) => PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      let face;
      try { face = await makeFace("GPU"); } catch { face = await makeFace("CPU"); }
      let pose = null;
      try { pose = await makePose("GPU"); } catch { try { pose = await makePose("CPU"); } catch { pose = null; } }
      return {
        face,
        pose,
        connections: {
          tesselation: FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          contours: [
            ...FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
            ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
            ...FaceLandmarker.FACE_LANDMARKS_LIPS,
          ],
        },
      };
    })().catch((error) => {
      trackersPromise = null; // 다음 시도에서 다시 로드할 수 있게 해요.
      throw error;
    });
  }
  return trackersPromise;
}

// object-fit: cover 로 표시되는 비디오의 정규화 좌표(0..1)를 화면 좌표로 바꾸는 매퍼를 만들어요.
function coverMapper(video, width, height) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(width / vw, height / vh);
  const offsetX = (width - vw * scale) / 2;
  const offsetY = (height - vh * scale) / 2;
  return (point) => [point.x * vw * scale + offsetX, point.y * vh * scale + offsetY];
}

function drawFace(ctx, landmarks, connections, map) {
  // 삼각 메시 (성능을 위해 3개 중 1개만 그려도 충분히 촘촘해 보여요)
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOR_MESH;
  ctx.beginPath();
  for (let i = 0; i < connections.tesselation.length; i += 3) {
    const { start, end } = connections.tesselation[i];
    ctx.moveTo(...map(landmarks[start]));
    ctx.lineTo(...map(landmarks[end]));
  }
  ctx.stroke();

  // 윤곽(얼굴형·눈·눈썹·입)은 진하게
  ctx.strokeStyle = COLOR_CONTOUR;
  ctx.beginPath();
  for (const { start, end } of connections.contours) {
    ctx.moveTo(...map(landmarks[start]));
    ctx.lineTo(...map(landmarks[end]));
  }
  ctx.stroke();

  // 포인트 클라우드 느낌의 도트
  ctx.fillStyle = COLOR_DOT;
  for (let i = 0; i < landmarks.length; i += 14) {
    const [x, y] = map(landmarks[i]);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 얼굴 인식 모서리 브래킷
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of landmarks) {
    const [x, y] = map(point);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = 18;
  const arm = Math.min(26, (maxX - minX) * 0.2);
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  ctx.strokeStyle = COLOR_BRACKET;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(minX, minY + arm); ctx.lineTo(minX, minY); ctx.lineTo(minX + arm, minY);
  ctx.moveTo(maxX - arm, minY); ctx.lineTo(maxX, minY); ctx.lineTo(maxX, minY + arm);
  ctx.moveTo(maxX, maxY - arm); ctx.lineTo(maxX, maxY); ctx.lineTo(maxX - arm, maxY);
  ctx.moveTo(minX + arm, maxY); ctx.lineTo(minX, maxY); ctx.lineTo(minX, maxY - arm);
  ctx.stroke();

  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function drawJoint(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();
}

function drawPose(ctx, landmarks, map) {
  const nose = landmarks[0];
  const shoulderL = landmarks[11];
  const shoulderR = landmarks[12];
  const elbowL = landmarks[13];
  const elbowR = landmarks[14];
  const visible = (point) => point && (point.visibility === undefined || point.visibility > 0.5);
  if (!visible(shoulderL) || !visible(shoulderR)) return;

  const [slx, sly] = map(shoulderL);
  const [srx, sry] = map(shoulderR);
  const midX = (slx + srx) / 2;
  const midY = (sly + sry) / 2;

  // 어깨·팔 라인
  ctx.strokeStyle = COLOR_SKELETON;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(slx, sly); ctx.lineTo(srx, sry);
  if (visible(nose)) { const [nx, ny] = map(nose); ctx.moveTo(midX, midY); ctx.lineTo(nx, ny + 24); }
  if (visible(elbowL)) { const [ex, ey] = map(elbowL); ctx.moveTo(slx, sly); ctx.lineTo(ex, ey); }
  if (visible(elbowR)) { const [ex, ey] = map(elbowR); ctx.moveTo(srx, sry); ctx.lineTo(ex, ey); }
  ctx.stroke();

  // 관절 도트 (흰 원 + 초록 테두리)
  ctx.lineWidth = 2;
  drawJoint(ctx, slx, sly, 6);
  drawJoint(ctx, srx, sry, 6);
  drawJoint(ctx, midX, midY, 4.5);
  if (visible(elbowL)) drawJoint(ctx, ...map(elbowL), 5);
  if (visible(elbowR)) drawJoint(ctx, ...map(elbowR), 5);

  // 가슴 라인 (파랑) — 상체 기울기를 보여줘요
  const dropY = Math.abs(srx - slx) * 0.16;
  ctx.strokeStyle = COLOR_CHEST;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(slx, sly + 14);
  ctx.quadraticCurveTo(midX, midY + 14 + dropY * 2, srx, sry + 14);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let t = 0.1; t <= 0.9; t += 0.2) {
    const x = (1 - t) * (1 - t) * slx + 2 * (1 - t) * t * midX + t * t * srx;
    const y = (1 - t) * (1 - t) * (sly + 14) + 2 * (1 - t) * t * (midY + 14 + dropY * 2) + t * t * (sry + 14);
    drawJoint(ctx, x, y, 3);
  }
}

// 연습 화면에서 쓰는 실시간 추적 훅.
// enabled(카메라 스트림 존재)일 때 모델을 로드하고, 매 프레임 캔버스에 얼굴 메시·자세를 그려요.
// 같은 파이프라인이 5Hz로 비언어 지표(Eye/Posture)도 누적해 제출 시 백엔드로 보낼 수 있어요.
// 반환: active(추적 동작 중) / faceVisible(얼굴 감지) / centered(중앙 근처) / startMetrics·stopMetrics.
export function useLiveTracking({ videoRef, canvasRef, enabled }) {
  const [status, setStatus] = useState({ active: false, faceVisible: false, centered: true });
  const activeRef = useRef(false);
  const accRef = useRef(null);          // 현재 턴의 지표 누적기 (측정 중일 때만 채워짐)
  const lastSampleRef = useRef(0);      // 5Hz 샘플링 타임스탬프

  // 턴 시작 시 호출 — 지표 누적을 초기화하고 켜요.
  const startMetrics = useCallback(() => { accRef.current = emptyAcc(); lastSampleRef.current = 0; }, []);
  // 제출 시 호출 — 누적 결과를 NonverbalIn 페이로드로 반환하고 끕니다. (미측정이면 null)
  const stopMetrics = useCallback(() => {
    const acc = accRef.current;
    accRef.current = null;
    if (!activeRef.current || !acc) return null;
    return aggregate(acc);
  }, []);

  useEffect(() => {
    activeRef.current = false;
    if (!enabled) { setStatus({ active: false, faceVisible: false, centered: true }); return undefined; }
    let cancelled = false;
    let rafId = 0;
    let last = "";

    const report = (next) => {
      const key = `${next.active}|${next.faceVisible}|${next.centered}`;
      if (key !== last) { last = key; setStatus(next); }
    };

    (async () => {
      let trackers;
      try { trackers = await loadTrackers(); } catch { return; } // 로드 실패 시 정적 오버레이가 유지돼요.
      if (cancelled) return;

      const loop = () => {
        if (cancelled) return;
        rafId = requestAnimationFrame(loop);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const map = coverMapper(video, width, height);
        const now = performance.now();
        let faceVisible = false;
        let centered = true;
        let faceLm = null;
        let poseLm = null;

        try {
          const faceResult = trackers.face.detectForVideo(video, now);
          faceLm = faceResult?.faceLandmarks?.[0] || null;
          if (faceLm?.length) {
            faceVisible = true;
            const { centerX, centerY } = drawFace(ctx, faceLm, trackers.connections, map);
            centered = centerX > width * 0.24 && centerX < width * 0.76 && centerY > height * 0.14 && centerY < height * 0.8;
          }
          const poseResult = trackers.pose?.detectForVideo(video, now);
          poseLm = poseResult?.landmarks?.[0] || null;
          if (poseLm?.length) drawPose(ctx, poseLm, map);
        } catch { /* 일시적 추론 오류는 다음 프레임에서 회복돼요. */ }

        // 측정 중이면 같은 랜드마크로 5Hz 지표 누적 (재추론 없음).
        if (accRef.current && now - lastSampleRef.current >= SAMPLE_MS) {
          lastSampleRef.current = now;
          accumulateFrame(accRef.current, faceLm, poseLm);
        }

        activeRef.current = true;
        report({ active: true, faceVisible, centered });
      };
      loop();
    })();

    return () => { cancelled = true; cancelAnimationFrame(rafId); activeRef.current = false; };
  }, [enabled, videoRef, canvasRef]);

  return { ...status, startMetrics, stopMetrics };
}

// 마이크 입력의 실제 주파수 에너지로 음성 레벨 이퀄라이저 막대를 움직여요.
export function useVoiceLevel({ stream, barsRef, enabled }) {
  useEffect(() => {
    if (!enabled || !stream || stream.getAudioTracks().length === 0) return undefined;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return undefined;

    const audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    let source;
    try {
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      audioContext.close();
      return undefined;
    }

    const element = barsRef.current;
    element?.classList.add("is-live");
    const bars = element ? Array.from(element.children) : [];
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;
      rafId = requestAnimationFrame(loop);
      analyser.getByteFrequencyData(data);
      bars.forEach((bar, index) => {
        const value = data[Math.min(index + 2, data.length - 1)] / 255;
        bar.style.height = `${4 + Math.round(value * 22)}px`;
      });
    };
    loop();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      element?.classList.remove("is-live");
      bars.forEach((bar) => { bar.style.height = ""; });
      try { source.disconnect(); audioContext.close(); } catch { /* 이미 닫힘 */ }
    };
  }, [stream, enabled, barsRef]);
}
