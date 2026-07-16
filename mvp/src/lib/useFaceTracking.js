/** MediaPipe Face/Pose 기반 실시간 트래킹 훅 (poc useNonverbal의 경량 JS 이식).
 *
 * 원본 영상은 어디에도 저장·전송하지 않고, 브라우저 안에서 프레임을 분석해
 * 오버레이(얼굴 메시·상체 스켈레톤)와 라이브 신호(시선·자세·추론 시간)만 만든다.
 *
 * 반환 live: { status, tracking, eyeFront, tiltDeg, postureLevel, poseTracked, inferMs }
 * status: idle(카메라 없음) | loading | ready | failed
 */
import { useEffect, useRef, useState } from "react";
import { resolveModel, resolveWasmUrl } from "./visionAssets";

const SAMPLE_MS = 80;
const LIVE_PUSH_MS = 300;

// 얼굴 메시 표시용 랜드마크 (Face Mesh 468점 중 표정을 잘 드러내는 서브셋)
const FACE_DOTS = [
  10, 338, 297, 67, 109, // 이마 라인
  234, 454, 93, 323, 132, 361, 58, 288, 172, 397, // 볼·턱 옆 라인
  152, 148, 377, // 턱 끝
  33, 133, 159, 145, 362, 263, 386, 374, // 눈 둘레
  70, 105, 107, 336, 334, 300, // 눈썹
  1, 4, 168, 197, // 콧대·코끝
  61, 291, 13, 14, 78, 308, // 입술
];
// 얼굴 연결선 (안정적인 쌍만 — 과밀하지 않게)
const FACE_LINKS = [
  [10, 338], [10, 67], [338, 297], [67, 109], // 이마
  [234, 132], [132, 58], [58, 172], [172, 152], // 왼 턱 라인
  [454, 361], [361, 288], [288, 397], [397, 152], // 오른 턱 라인
  [70, 105], [105, 107], [336, 334], [334, 300], // 눈썹
  [33, 159], [159, 133], [133, 145], [145, 33], // 왼눈 다이아
  [362, 386], [386, 263], [263, 374], [374, 362], // 오른눈 다이아
  [168, 197], [197, 4], // 콧대
  [4, 61], [4, 291], // 코→입꼬리
  [61, 13], [13, 291], [61, 14], [14, 291], // 입술
  [107, 168], [336, 168], // 미간
  [234, 70], [454, 300], // 볼→눈썹
];
// 상체 포즈 연결선 (BlazePose): 어깨-팔꿈치-몸통
const POSE_LINKS = [
  [11, 12], [11, 13], [12, 14], [11, 23], [12, 24], [23, 24],
];

export function useFaceTracking(mediaStream, videoRef, canvasRef) {
  const [live, setLive] = useState({ status: "idle", tracking: false, eyeFront: false, tiltDeg: 0, postureLevel: false, poseTracked: false, inferMs: 0 });
  const liveRef = useRef(live);

  useEffect(() => {
    const hasVideo = Boolean(mediaStream?.getVideoTracks?.().some((track) => track.readyState === "live"));
    if (!hasVideo) { setLive((prev) => ({ ...prev, status: "idle", tracking: false, poseTracked: false })); return undefined; }

    let cancelled = false;
    let face = null;
    let pose = null;
    let timer = 0;
    let lastPush = 0;
    let inferAvg = 0;
    setLive((prev) => ({ ...prev, status: "loading" }));

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const [wasmUrl, faceModel, poseModel] = await Promise.all([resolveWasmUrl(), resolveModel("face"), resolveModel("pose")]);
        const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        face = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModel },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: poseModel },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) { face.close(); pose.close(); face = null; pose = null; return; }
        const faceLm = face;
        const poseLm = pose;

        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          const ts = performance.now();
          try {
            const faceResult = faceLm.detectForVideo(video, ts);
            const poseResult = poseLm.detectForVideo(video, ts + 0.001);
            const took = performance.now() - ts;
            inferAvg = inferAvg === 0 ? took : inferAvg * 0.85 + took * 0.15;
            const lm = faceResult.faceLandmarks?.[0];
            const plm = poseResult.landmarks?.[0];

            drawOverlay(canvasRef.current, video, lm, plm);

            // ---- 라이브 신호 (기하 근사 — 관찰 전용, poc 정밀 판정의 경량판) ----
            let eyeFront = false;
            let tiltDeg = 0;
            if (lm) {
              const nose = lm[1];
              const cheekL = lm[234];
              const cheekR = lm[454];
              const eyeL = lm[33];
              const eyeR = lm[263];
              const faceWidth = Math.abs(cheekR.x - cheekL.x) || 1e-6;
              const yaw = Math.abs(nose.x - (cheekL.x + cheekR.x) / 2) / faceWidth;
              tiltDeg = Math.abs((Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180) / Math.PI);
              const blink = (faceResult.faceBlendshapes?.[0]?.categories ?? [])
                .filter((c) => c.categoryName === "eyeBlinkLeft" || c.categoryName === "eyeBlinkRight")
                .reduce((sum, c) => sum + c.score, 0) / 2 > 0.5;
              eyeFront = yaw < 0.09 && !blink;
            }
            let postureLevel = false;
            let poseTracked = false;
            if (plm) {
              const shoulderL = plm[11];
              const shoulderR = plm[12];
              poseTracked = (shoulderL?.visibility ?? 1) > 0.5 && (shoulderR?.visibility ?? 1) > 0.5;
              if (poseTracked) {
                const shoulderDeg = Math.abs((Math.atan2(shoulderR.y - shoulderL.y, shoulderR.x - shoulderL.x) * 180) / Math.PI);
                postureLevel = Math.abs(shoulderDeg - 180) < 7 || shoulderDeg < 7;
              }
            }

            if (ts - lastPush > LIVE_PUSH_MS) {
              lastPush = ts;
              const next = { status: "ready", tracking: Boolean(lm), eyeFront, tiltDeg: Math.round(tiltDeg), postureLevel, poseTracked, inferMs: Math.max(1, Math.round(inferAvg)) };
              const prev = liveRef.current;
              if (next.status !== prev.status || next.tracking !== prev.tracking || next.eyeFront !== prev.eyeFront || next.postureLevel !== prev.postureLevel || next.poseTracked !== prev.poseTracked || Math.abs(next.inferMs - prev.inferMs) > 4) {
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
      face?.close();
      pose?.close();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [mediaStream, videoRef, canvasRef]);

  return live;
}

/** 분석 시각화 오버레이 — 영상은 canvas에 그리지 않고 랜드마크만 그린다.
 *  비디오가 object-fit: cover로 크롭되므로 같은 크롭 좌표계로 사상한다.
 *  좌우 반전은 canvas 자체를 CSS로 미러링해 비디오와 정확히 일치시킨다. */
function drawOverlay(canvas, video, faceLm, poseLm) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  const { width: cw, height: ch } = canvas;
  ctx.clearRect(0, 0, cw, ch);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(cw / vw, ch / vh);
  const dx = (cw - vw * scale) / 2;
  const dy = (ch - vh * scale) / 2;
  const px = (p) => [p.x * vw * scale + dx, p.y * vh * scale + dy];

  // 상체 스켈레톤 (흰 선) + 가슴 곡선 (파란색) — 디자인 시안의 표현
  if (poseLm) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const [a, b] of POSE_LINKS) {
      const pa = poseLm[a];
      const pb = poseLm[b];
      if (!pa || !pb || (pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    const sl = poseLm[11];
    const sr = poseLm[12];
    if (sl && sr && (sl.visibility ?? 1) > 0.4 && (sr.visibility ?? 1) > 0.4) {
      const [lx, ly] = px(sl);
      const [rx, ry] = px(sr);
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(96, 165, 250, 0.6)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo((lx + rx) / 2, Math.max(ly, ry) + Math.abs(rx - lx) * 0.22, rx, ry);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      for (const [x, y] of [[lx, ly], [rx, ry]]) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 얼굴 메시 (초록) + 얼굴 영역 코너 브래킷
  if (faceLm) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of faceLm) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    ctx.strokeStyle = "rgba(94, 234, 148, 0.35)";
    ctx.lineWidth = 1;
    for (const [a, b] of FACE_LINKS) {
      const pa = faceLm[a];
      const pb = faceLm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(134, 245, 182, 0.95)";
    ctx.shadowColor = "rgba(94, 234, 148, 0.8)";
    ctx.shadowBlur = 4;
    for (const idx of FACE_DOTS) {
      const p = faceLm[idx];
      if (!p) continue;
      const [x, y] = px(p);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 코너 브래킷 — 얼굴 바운딩 박스에서 약간 여유를 두고 그린다
    const pad = 0.06;
    const [bx1, by1] = px({ x: minX - pad, y: minY - pad * 1.4 });
    const [bx2, by2] = px({ x: maxX + pad, y: maxY + pad * 0.8 });
    const arm = Math.min(26, (bx2 - bx1) * 0.18);
    ctx.strokeStyle = "rgba(94, 234, 148, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(94, 234, 148, 0.5)";
    ctx.shadowBlur = 6;
    const corners = [
      [bx1, by1, arm, 0, 0, arm], [bx2, by1, -arm, 0, 0, arm],
      [bx1, by2, arm, 0, 0, -arm], [bx2, by2, -arm, 0, 0, -arm],
    ];
    for (const [x, y, ax, ay, bxo, byo] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + ax, y + ay);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bxo, y + byo);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}
