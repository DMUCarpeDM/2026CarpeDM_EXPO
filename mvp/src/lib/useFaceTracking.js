/** MediaPipe Face/Pose 기반 실시간 트래킹 훅 (poc useNonverbal의 경량 JS 이식).
 *
 * 원본 영상은 어디에도 저장·전송하지 않고, 브라우저 안에서 프레임을 분석해
 * 오버레이(얼굴 메시·상체 스켈레톤)와 라이브 신호(시선·자세·추론 시간)만 만든다.
 *
 * 턴 집계·직렬화는 nonverbalMetrics.js(순수 모듈, node --test 대상)가 담당하고,
 * 이 훅은 MediaPipe 결과에서 프레임 사실만 뽑아 넘긴다.
 *
 * 반환 live: { status, tracking, eyeFront, tiltDeg, postureLevel, poseTracked, inferMs }
 *   + collectTurnStats(): 턴 집계를 NonverbalIn 페이로드로 회수하고 리셋
 *   + setGazePhase('listening' | 'answering' | null): 듣기/말하기 응시 분리용
 * status: idle(카메라 없음) | loading | ready | failed
 */
import { useEffect, useRef, useState } from "react";
import { resolveModel, resolveWasmUrl } from "./visionAssets.js";
import {
  SAMPLE_MS,
  accumulateSample,
  finalizeTurnMetrics,
  makeTurnAcc,
  median,
  resolveHeadDown,
} from "./nonverbalMetrics.js";

const LIVE_PUSH_MS = 300;

// ---- 홍채 기반 시선 (poc nonverbalCore의 무보정 절대 임계 버전) ----
// 시선 = 머리 자세 + 눈-머리(eye-in-head). 고개를 돌려도 눈이 카메라를 보면
// 정면이고, 머리는 정면인데 눈동자만 옆·아래를 봐도 이탈이다.
const IRIS_R = 468; // Face Landmarker 478점 중 홍채 중심
const IRIS_L = 473;
const EYE_R = { inner: 133, outer: 33 };
const EYE_L = { inner: 362, outer: 263 };
const YAW_DELTA_THRESHOLD = 0.22; // 개인 기준 대비 변화량 임계 (poc YAW_DELTA_THRESHOLD)
const EYE_COMP_GAIN = 0.8; // 홍채가 머리 회전을 상쇄하는 보상 이득
const EYE_COMP_CLAMP = 0.18; // 보상 상한 — 보상이 판정을 뒤집는 폭주 방지
const EYE_ONLY_THRESHOLD = 0.25; // 머리는 정면인데 눈만 옆을 보는 이탈
const EYE_VERT_DELTA = 0.3; // 보정 후: 홍채 상·하 위치의 개인 기준 대비 변화 임계
const OFF_STREAK = 5; // 이탈 판정 히스테리시스 (5샘플 ≈ 400ms — 짧은 곁눈질은 봐준다)
const FRONT_STREAK = 2;

// ---- 자동 캘리브레이션 ----
// 카메라 각도·앉은 키는 사람마다 달라 절대 임계는 상시 오판을 만든다 (poc 교훈).
// 얼굴이 잡힌 첫 ~2초의 중앙값을 개인 기준으로 삼고, 이후 "기준 대비 변화량"으로만
// 판정한다. 얼굴을 오래 놓치면(관람객 교대) 기준을 다시 수집한다.
const CALIB_SAMPLES = 24; // 80ms × 24 ≈ 2초
const CALIB_YAW_GATE = 0.45; // 기준 수집 중 옆모습 수준의 샘플은 배제
const TRACK_LOST_RESET_MS = 3000;

// 어깨너비가 이보다 좁으면(멀리 있거나 옆모습) 정규화 분모가 불안정해 표본을 버린다
const MIN_SHOULDER_WIDTH = 0.05;
// 어깨 기울기 라이브 게이지의 '수평' 판정 임계(도)
const POSTURE_LEVEL_DEG = 7;
const LEAN_DELTA_THRESHOLD = 0.16;
const HAND_FACE_THRESHOLD = 0.55;

// 개인 기준으로 삼을 캘리브레이션 표본 — 시선(asym·홍채)과 자세(어깨·고개·몸통)를
// 같은 창에서 함께 모은다. 표정 blendshape는 수집하지 않는다.
const emptyCalib = () => ({
  asym: [], eyeX: [], eyeY: [], tilt: [], headGap: [], torsoZ: [],
});

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

// 손목부터 손가락 끝까지의 Hand Landmarker 21점 연결선
const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function useFaceTracking(mediaStream, videoRef, canvasRef) {
  const [live, setLive] = useState({ status: "idle", tracking: false, calibrating: false, eyeFront: false, tiltDeg: 0, postureLevel: false, poseTracked: false, inferMs: 0 });
  const liveRef = useRef(live);
  const turnAccRef = useRef(makeTurnAcc());
  // 대화 페이즈 — 듣기(상대 TTS 중) vs 말하기(내 답변 중). 두 응시는 커뮤니케이션에서
  // 다른 역량이라 서버가 분리 채점한다(LISTEN_GAZE_BANDS vs FRONT_GAZE_BANDS).
  // ref로 두어 페이즈가 바뀌어도 MediaPipe 파이프라인이 재시작되지 않게 한다.
  const phaseRef = useRef(null);
  const calibratedRef = useRef(false);
  const setGazePhase = useRef((phase) => { phaseRef.current = phase; }).current;
  // 지난 수집 시점 이후의 집계를 NonverbalIn 모양으로 돌려주고 리셋 (턴 제출 시 호출)
  const collectTurnStats = useRef(() => {
    const acc = turnAccRef.current;
    turnAccRef.current = makeTurnAcc();
    return finalizeTurnMetrics(acc, calibratedRef.current);
  }).current;

  useEffect(() => {
    const hasVideo = Boolean(mediaStream?.getVideoTracks?.().some((track) => track.readyState === "live"));
    if (!hasVideo) { setLive((prev) => ({ ...prev, status: "idle", tracking: false, poseTracked: false })); return undefined; }

    let cancelled = false;
    let face = null;
    let pose = null;
    let hand = null;
    let timer = 0;
    let lastPush = 0;
    let inferAvg = 0;
    // 시선 히스테리시스 상태 — 단일 프레임 흔들림으로 게이지가 깜빡이지 않게
    let offStreak = 0;
    let frontStreak = 0;
    let eyeFrontState = true;
    // 개인 기준(캘리브레이션) 상태
    let base = null; // { asym, eyeX, eyeY, tilt, headGap, torsoZ }
    let calib = emptyCalib();
    let lastFaceAt = 0;
    setLive((prev) => ({ ...prev, status: "loading" }));

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const [wasmUrl, faceModel, poseModel, handModel] = await Promise.all([resolveWasmUrl(), resolveModel("face"), resolveModel("pose"), resolveModel("hand")]);
        const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        face = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModel },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
        });
        pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: poseModel },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        hand = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: handModel },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        if (cancelled) { face.close(); pose.close(); hand.close(); face = null; pose = null; hand = null; return; }
        const faceLm = face;
        const poseLm = pose;
        const handLm = hand;

        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          const ts = performance.now();
          try {
            const faceResult = faceLm.detectForVideo(video, ts);
            const poseResult = poseLm.detectForVideo(video, ts + 0.001);
            const handResult = handLm.detectForVideo(video, ts + 0.002);
            const took = performance.now() - ts;
            inferAvg = inferAvg === 0 ? took : inferAvg * 0.85 + took * 0.15;
            const lm = faceResult.faceLandmarks?.[0];
            const plm = poseResult.landmarks?.[0];
            const handLandmarks = handResult.landmarks || [];

            drawOverlay(canvasRef.current, video, lm, plm, handLandmarks);

            // ---- 포즈 기하: 어깨 기울기 · 어깨중심(흔들림) · 코-어깨 거리(고개 숙임) ----
            // 시선 판정보다 먼저 낸다 — 캘리브레이션이 자세 기준도 함께 모으기 때문.
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

            // ---- 라이브 신호 (관찰 전용): 홍채 기반 시선 + 눈선 기울기 ----
            let tiltDeg = 0;
            let sampleFront = null; // null = 이 샘플은 판정 불가(깜빡임 등) → 이전 상태 유지
            let sampleMeta = null; // 턴 집계용 표정·시선 부가 신호 (얼굴이 잡힌 샘플만)
            if (lm) {
              const nose = lm[1];
              const cheekL = lm[234];
              const cheekR = lm[454];
              const eyeL = lm[33];
              const eyeR = lm[263];
              tiltDeg = Math.abs((Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180) / Math.PI);

              // 얼굴을 한동안 놓쳤다 다시 잡으면 다른 관람객일 수 있다 — 기준 재수집
              if (lastFaceAt && ts - lastFaceAt > TRACK_LOST_RESET_MS) {
                base = null;
                calib = emptyCalib();
                eyeFrontState = true;
                offStreak = 0;
                frontStreak = 0;
              }
              lastFaceAt = ts;

              // 표정 분석은 사용하지 않는다. Face Landmarker는 홍채·얼굴 기하로
              // 시선만 추적하며 blendshape 결과를 요청하거나 저장하지 않는다.
              sampleMeta = { iris: false, offDir: null };
              const dl = Math.abs(nose.x - cheekL.x);
              const dr = Math.abs(cheekR.x - nose.x);
              const asym = (dl - dr) / Math.max(dl + dr, 1e-6);
              let eyeX = null;
              let eyeY = null;
              if (lm.length > 477) {
                const horizontal = (iris, inner, outer) => (iris.x - inner.x) / ((outer.x - inner.x) || 1e-6);
                const vertical = (iris, upper, lower) => (iris.y - upper.y) / ((lower.y - upper.y) || 1e-6);
                const rX = horizontal(lm[IRIS_R], lm[EYE_R.inner], lm[EYE_R.outer]);
                const lX = horizontal(lm[IRIS_L], lm[EYE_L.inner], lm[EYE_L.outer]);
                const rY = vertical(lm[IRIS_R], lm[159], lm[145]);
                const lY = vertical(lm[IRIS_L], lm[386], lm[374]);
                if (rX > -0.5 && rX < 1.5 && lX > -0.5 && lX < 1.5) eyeX = (rX - lX) / 2;
                if (rY > -0.5 && rY < 1.5 && lY > -0.5 && lY < 1.5) eyeY = (rY + lY) / 2;
              }
              sampleMeta.iris = eyeX !== null || eyeY !== null;

              if (base === null) {
                if (Math.abs(asym) < CALIB_YAW_GATE) {
                  calib.asym.push(asym);
                  calib.eyeX.push(eyeX ?? 0);
                  calib.eyeY.push(eyeY ?? 0.5);
                  if (tiltRaw !== null) calib.tilt.push(tiltRaw);
                  if (headGap !== null) calib.headGap.push(headGap);
                  if (torsoZ !== null) calib.torsoZ.push(torsoZ);
                  if (calib.asym.length >= CALIB_SAMPLES) {
                    base = {
                      asym: median(calib.asym),
                      eyeX: median(calib.eyeX),
                      eyeY: median(calib.eyeY),
                      tilt: calib.tilt.length >= 4 ? median(calib.tilt) : 0,
                      headGap: calib.headGap.length >= 4 ? median(calib.headGap) : null,
                      torsoZ: calib.torsoZ.length >= 4 ? median(calib.torsoZ) : null,
                    };
                  }
                }
                sampleFront = true;
              } else {
                let off = false;
                const asymDelta = asym - base.asym;
                let gazeX = asymDelta;
                if (eyeX !== null) {
                  const eyeDelta = eyeX - base.eyeX;
                  const comp = Math.max(-EYE_COMP_CLAMP, Math.min(EYE_COMP_CLAMP, eyeDelta * EYE_COMP_GAIN));
                  const compensated = asymDelta - comp;
                  if (Math.abs(compensated) < Math.abs(asymDelta)) gazeX = compensated;
                  if (Math.abs(asymDelta) < YAW_DELTA_THRESHOLD && Math.abs(eyeDelta) >= EYE_ONLY_THRESHOLD) { off = true; sampleMeta.offDir = eyeDelta > 0 ? "left" : "right"; }
                }
                if (Math.abs(gazeX) >= YAW_DELTA_THRESHOLD) { off = true; sampleMeta.offDir = sampleMeta.offDir || (gazeX > 0 ? "right" : "left"); }
                if (!off && eyeY !== null && Math.abs(eyeY - base.eyeY) >= EYE_VERT_DELTA) {
                  off = true;
                  sampleMeta.offDir = eyeY > base.eyeY ? "down" : "up";
                }
                sampleFront = !off;
              }
            }
            if (sampleFront === false) { offStreak += 1; frontStreak = 0; }
            else if (sampleFront === true) { frontStreak += 1; offStreak = 0; }
            if (offStreak >= OFF_STREAK) eyeFrontState = false;
            if (frontStreak >= FRONT_STREAK) eyeFrontState = true;
            const eyeFront = eyeFrontState;
            // 기준 보정 어깨 기울기 — 거치 각도·체형에서 오는 상시 기울기를 빼고 '무너짐'만 남긴다
            const tiltAdj = tiltRaw !== null ? Math.max(0, tiltRaw - (base ? base.tilt : 0)) : null;
            const postureLevel = tiltAdj !== null && tiltAdj < POSTURE_LEVEL_DEG;
            // 고개 숙임은 코-어깨 거리로 잰다. 이전에는 eyeLookDown blendshape(눈동자 하향)을
            // 썼는데, 고개 각도와 안구 방향은 다른 물리량이라 Posture-Fit이 오측정하고 있었다.
            const headDown = resolveHeadDown(headGap, base ? base.headGap : null);
            const torsoDelta = torsoZ !== null && base?.torsoZ !== null
              ? torsoZ - base.torsoZ
              : 0;
            // 어깨 중심이 골반보다 카메라 쪽으로 크게 나오면 숙이거나 앞으로 기운 자세,
            // 반대쪽이면 등받이에 기대는 자세다. 둘 다 개인 기준 대비 변화량으로 판정한다.
            const hunched = headDown || torsoDelta < -LEAN_DELTA_THRESHOLD;
            const leanBack = torsoDelta > LEAN_DELTA_THRESHOLD;
            calibratedRef.current = base !== null;

            // ---- 턴 단위 집계 (얼굴이 잡힌 샘플만) — 제출 시 collectTurnStats()로 회수 ----
            if (sampleMeta) {
              accumulateSample(turnAccRef.current, {
                front: eyeFront,
                offDir: sampleMeta.offDir,
                phase: phaseRef.current,
                iris: sampleMeta.iris,
                rollDeg: tiltDeg,
                tiltAdj,
                shoulderX,
                headDown,
                hunched,
                leanBack,
                handTracked: handLandmarks.length > 0,
                handNearFace,
                worldUsed,
              });
            }

            if (ts - lastPush > LIVE_PUSH_MS) {
              lastPush = ts;
              const next = { status: "ready", tracking: Boolean(lm || plm || handLandmarks.length), calibrating: base === null, eyeFront, tiltDeg: Math.round(tiltDeg), postureLevel, poseTracked, inferMs: Math.max(1, Math.round(inferAvg)) };
              const prev = liveRef.current;
              if (next.status !== prev.status || next.tracking !== prev.tracking || next.calibrating !== prev.calibrating || next.eyeFront !== prev.eyeFront || next.postureLevel !== prev.postureLevel || next.poseTracked !== prev.poseTracked || Math.abs(next.inferMs - prev.inferMs) > 4) {
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
      hand?.close();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [mediaStream, videoRef, canvasRef]);

  return { ...live, collectTurnStats, setGazePhase };
}

/** 분석 시각화 오버레이 — 영상은 canvas에 그리지 않고 상반신·손 랜드마크만 그린다.
 *  비디오가 object-fit: cover로 크롭되므로 같은 크롭 좌표계로 사상한다.
 *  좌우 반전은 canvas 자체를 CSS로 미러링해 비디오와 정확히 일치시킨다. */
export function drawOverlay(canvas, video, faceLm, poseLm, handLm = []) {
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
    ctx.strokeStyle = "rgba(183, 224, 255, 0.96)";
    ctx.lineWidth = 2.8;
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
      ctx.fillStyle = "#e8f6ff";
      for (const index of new Set(POSE_LINKS.flat())) {
        const point = poseLm[index];
        if (!point || (point.visibility ?? 1) < 0.4) continue;
        const [x, y] = px(point);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 손 관절 21점과 연결선 — 손동작은 자세 분석에 쓰되, 하체 포즈는 표시하지 않는다.
  for (const hand of handLm) {
    ctx.strokeStyle = "rgba(94, 234, 212, 1)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const [a, b] of HAND_LINKS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    ctx.fillStyle = "#effffc";
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(...px(point), 4, 0, Math.PI * 2);
      ctx.fill();
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
