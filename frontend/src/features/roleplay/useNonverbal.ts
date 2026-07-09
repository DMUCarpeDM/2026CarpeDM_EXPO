/** MediaPipe Face/Pose 기반 실시간 시선·자세 측정 훅.
 *
 * 원본 영상은 어디에도 저장·전송하지 않고, 브라우저 안에서 프레임을 분석해
 * 턴 단위 집계 지표만 서버로 보낸다 (개인정보 최소화 — 기본 미저장 원칙).
 *
 * ── 캘리브레이션 ──────────────────────────────────────────────
 * 카메라 각도·앉은 자세는 사람/기기마다 달라 절대 임계값은 오판을 만든다.
 * 상황 브리핑 동안 정면 기준값(시선 비대칭·어깨 기울기·코-어깨 거리·눈선 각도)을
 * 수집하고, 이후 모든 판정은 "기준 대비 변화량"으로 수행한다.
 *
 * 오프라인 전시 대비: `npm run setup-offline`으로 wasm/모델을 public/에 받아두면
 * 로컬 자산을 우선 사용하고, 없으면 CDN에서 로드한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NonverbalMetrics } from '../../api/types';
import { resolveModel, resolveWasmUrl } from '../../lib/visionAssets';
import {
  type Accumulator,
  type Baseline,
  type OffDir,
  emptyAcc,
  emptyBaseline,
  emptyCalibration,
  finalizeCalibration,
  finalizeTurnMetrics,
  framesFor,
  gazeZoneIndex,
  resolveGaze,
  resolveHeadDown,
  SAMPLE_MS,
  TIMELINE_BIN_MS,
  TIMELINE_MAX_BINS,
  trackerJumped,
  updateNod,
  verticalIrisRatio,
} from './nonverbalCore';

// ---- 홍채 기반 시선 (Face Landmarker 478 랜드마크 중 468~477) ----
// 시선 = 머리 자세 + 눈-머리(eye-in-head). 고개를 돌려도 눈이 카메라를 보면
// 정면이다 — 머리 비대칭만 보던 v1의 구조적 오판을 홍채 추적으로 보상한다.
// 판정 로직과 임계값은 nonverbalCore.resolveGaze에 있고, 여기는 랜드마크
// 인덱스에서 기하값을 뽑는 추출부만 남는다.
const IRIS_R = 468; // 홍채 중심 (영상 좌표 기준 각 눈의 5점 중 중심)
const IRIS_L = 473;
const EYE_R = { inner: 133, outer: 33 }; // 오른눈 안/바깥 꼬리
const EYE_L = { inner: 362, outer: 263 };
// ---- 수직 홍채: 눈꺼풀 사이 홍채 상하 위치 (0=위 눈꺼풀, 1=아래 눈꺼풀) ----
// 수평과 달리 이미지 y축은 아래가 +라 부호가 기하적으로 명확하다. 깜빡임·실눈
// 중에는 분모(눈 열림)가 무너지므로 열림 게이트를 통과한 프레임만 표본으로 쓴다.
const EYE_LIDS_R = { upper: 159, lower: 145 };
const EYE_LIDS_L = { upper: 386, lower: 374 };
const EYE_OPEN_MIN = 0.15; // 눈 열림/눈 너비 최소 비 — 깜빡임·실눈 배제
// 자연스러운 응시 리듬: 답변 개시 직후의 짧은 시선 회피(생각 정리)는 정상 행동
const ONSET_GRACE_MS = 2500;

// 얼굴 윤곽 표시용 랜드마크 (Face Mesh 인덱스 서브셋)
const FACE_POINTS = [10, 152, 234, 454, 1, 33, 263, 61, 291, 199];
// 상체 포즈 연결선 (BlazePose 인덱스)
const POSE_LINKS: [number, number][] = [
  [11, 12], [11, 13], [12, 14], [11, 23], [12, 24], [23, 24],
];

export interface CoachingTip {
  id: number;
  text: string;
}

export type VisionStatus = 'idle' | 'loading' | 'ready' | 'no-camera' | 'failed';

/** 라이브 게이지용 실시간 상태 (매 샘플 갱신) */
export interface LiveState {
  tracking: boolean;
  front: boolean;
  offDir: OffDir | null;
  tiltDeg: number; // 기준 보정된 기울기
  headDown: boolean;
  micLevel: number; // 0~1
  calibrated: boolean;
}

const idleLive: LiveState = {
  tracking: false, front: true, offDir: null, tiltDeg: 0, headDown: false, micLevel: 0, calibrated: false,
};

export function useNonverbal(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  overlayRef?: React.RefObject<HTMLCanvasElement | null>,
) {
  const [visionStatus, setVisionStatus] = useState<VisionStatus>('idle');
  const [tip, setTip] = useState<CoachingTip | null>(null);
  const [live, setLive] = useState<LiveState>(idleLive);
  const accRef = useRef<Accumulator>(emptyAcc());
  const recentOffRef = useRef<boolean[]>([]);
  const tipCountRef = useRef(0);
  const lastTipAtRef = useRef(0);
  const runningRef = useRef(false);
  const baselineRef = useRef<Baseline>(emptyBaseline());
  const calibratingRef = useRef(false);
  const calibSamplesRef = useRef(emptyCalibration());
  // 대화 페이즈 — 듣기(상대 TTS) vs 말하기(답변). 듣기 시선과 말하기 시선은
  // 커뮤니케이션에서 다른 역량이므로 분리 측정한다.
  const gazePhaseRef = useRef<'listening' | 'answering' | null>(null);

  // 실시간 코칭 오버레이 (F-KYJJQW) — 세션당 3회, 20초 쿨다운
  const maybeCoach = useCallback((text: string) => {
    const now = Date.now();
    if (tipCountRef.current >= 3 || now - lastTipAtRef.current < 20000) return;
    tipCountRef.current += 1;
    lastTipAtRef.current = now;
    accRef.current.tips.push(text); // 발생 턴에 기록 → 리포트 근거 구간에 표시
    const id = now;
    setTip({ id, text });
    setTimeout(() => setTip((t) => (t?.id === id ? null : t)), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let audioCtx: AudioContext | null = null;

    async function init() {
      setVisionStatus('loading');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true, // 오디오 트랙은 녹음기·음량 미터에서 재사용
        });
      } catch {
        setVisionStatus('no-camera');
        return; // 카메라/마이크 거부 → 비언어 미측정으로 진행
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop()); // StrictMode 이중 실행 누수 방지
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      // 마이크 레벨 미터 (Web Audio — 시각화 전용, 저장 안 함)
      let analyser: AnalyserNode | null = null;
      let levelBuf: Uint8Array<ArrayBuffer> | null = null;
      try {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        levelBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      } catch {
        /* 음량 미터 없이 진행 */
      }

      try {
        const vision = await import('@mediapipe/tasks-vision');
        const wasmUrl = await resolveWasmUrl();
        const faceModel = await resolveModel('face');
        const poseModel = await resolveModel('pose');

        const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        const face = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModel },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true, // 시선 상하·깜빡임·미소 측정용
        });
        const pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: poseModel },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) return;
        setVisionStatus('ready');

        // 프레임 간 연속 추적 상태 (턴과 무관): 제스처 변위·다인 가드용
        const prevWrists: Record<'l' | 'r', [number, number, number] | null> = { l: null, r: null };
        let prevPerson: { x: number; w: number } | null = null;
        let prevFace: { x: number; w: number } | null = null;

        timer = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          const ts = performance.now();
          const acc = accRef.current;
          const base = baselineRef.current;

          // 음량 (측정 여부와 무관하게 항상 표시)
          let micLevel = 0;
          if (analyser && levelBuf) {
            analyser.getByteTimeDomainData(levelBuf);
            let sum = 0;
            for (let i = 0; i < levelBuf.length; i++) {
              const v = (levelBuf[i] - 128) / 128;
              sum += v * v;
            }
            micLevel = Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
          }

          try {
            const faceResult = face.detectForVideo(video, ts);
            const poseResult = pose.detectForVideo(video, ts + 0.001);
            const lm = faceResult.faceLandmarks?.[0];
            const plm = poseResult.landmarks?.[0];

            // 블렌드셰이프: 안구 상하 시선 + 깜빡임 + 미소
            const shapes: Record<string, number> = {};
            for (const c of faceResult.faceBlendshapes?.[0]?.categories ?? []) {
              shapes[c.categoryName] = c.score;
            }
            const eyeDown = ((shapes.eyeLookDownLeft ?? 0) + (shapes.eyeLookDownRight ?? 0)) / 2;
            const eyeUp = ((shapes.eyeLookUpLeft ?? 0) + (shapes.eyeLookUpRight ?? 0)) / 2;
            const blink = ((shapes.eyeBlinkLeft ?? 0) + (shapes.eyeBlinkRight ?? 0)) / 2 > 0.5;
            const smile = ((shapes.mouthSmileLeft ?? 0) + (shapes.mouthSmileRight ?? 0)) / 2 > 0.35;
            // 긴장 신호 (관찰 지표 — 감점 아님): 입술 압축·찡그림. 보수적 임계값
            const mouthPress = ((shapes.mouthPressLeft ?? 0) + (shapes.mouthPressRight ?? 0)) / 2 > 0.45;
            const browDown = ((shapes.browDownLeft ?? 0) + (shapes.browDownRight ?? 0)) / 2 > 0.5;
            const tension = mouthPress || browDown; // 긴장 표정 에피소드 판정용
            // 진정성 미소 근사(Duchenne proxy): 입꼬리(mouthSmile)와 눈둘레근(eyeSquint)이
            // 동시에 움직여야 눈까지 웃는 미소다. 깜빡임 중에는 eyeSquint가 함께 올라가
            // 오판을 만들므로 제외한다 — 임계값은 실기기 검증 항목(demo-checklist §2.5).
            const eyeSquint = ((shapes.eyeSquintLeft ?? 0) + (shapes.eyeSquintRight ?? 0)) / 2;
            const duchenne = smile && !blink && eyeSquint > 0.35;

            // ---- 얼굴 기하: 좌우 비대칭(요), 눈선 각도(갸웃) ----
            let signedAsym: number | null = null;
            let rollDeg: number | null = null;
            let eyeInHeadX: number | null = null; // 홍채 수평 편향 (0=정중앙)
            let eyeInHeadY: number | null = null; // 홍채 수직 위치 (0=위 눈꺼풀, 1=아래)
            let faceUnstable = false;
            if (lm) {
              const nose = lm[1];
              const left = lm[234];
              const right = lm[454];
              const dl = Math.abs(nose.x - left.x);
              const dr = Math.abs(right.x - nose.x);
              signedAsym = (dl - dr) / Math.max(dl + dr, 1e-6);

              // 얼굴 다인 가드: 얼굴 중심·크기가 한 샘플(200ms)에 급변하면 추적
              // 얼굴이 바뀐 것(관람객 끼어듦) → 이 프레임의 시선·표정 집계 폐기
              const faceW = Math.abs(right.x - left.x);
              if (trackerJumped(prevFace, nose.x, faceW, 0.15, 1.6)) {
                faceUnstable = true;
              }
              prevFace = { x: nose.x, w: faceW };
              const le = lm[33];
              const re = lm[263];
              rollDeg = (Math.atan2(re.y - le.y, Math.abs(re.x - le.x) + 1e-6) * 180) / Math.PI;

              // ---- 홍채: 눈-머리(eye-in-head) 수평 시선 ----
              // 각 눈에서 홍채 중심이 안쪽↔바깥쪽 꼬리 사이 어디에 있는지(0~1)를
              // 양안 대칭 결합해 부호 있는 편향으로 만든다. 두 비율의 차는 머리
              // 회전에 둔감하고 안구 회전에 민감하다.
              if (lm.length > 477) {
                const ratio = (
                  iris: { x: number }, inner: { x: number }, outer: { x: number },
                ) => (iris.x - inner.x) / ((outer.x - inner.x) || 1e-6);
                const rX = ratio(lm[IRIS_R], lm[EYE_R.inner], lm[EYE_R.outer]);
                const lX = ratio(lm[IRIS_L], lm[EYE_L.inner], lm[EYE_L.outer]);
                if (rX > -0.5 && rX < 1.5 && lX > -0.5 && lX < 1.5) {
                  eyeInHeadX = (rX - lX) / 2;
                }

                // ---- 수직 홍채: 눈꺼풀 사이 상하 위치 (열림 게이트 통과 시만) ----
                const rY = verticalIrisRatio(lm[IRIS_R], lm[EYE_LIDS_R.upper],
                  lm[EYE_LIDS_R.lower], lm[EYE_R.inner], lm[EYE_R.outer], EYE_OPEN_MIN);
                const lY = verticalIrisRatio(lm[IRIS_L], lm[EYE_LIDS_L.upper],
                  lm[EYE_LIDS_L.lower], lm[EYE_L.inner], lm[EYE_L.outer], EYE_OPEN_MIN);
                if (rY !== null && lY !== null && rY > -0.5 && rY < 1.5 && lY > -0.5 && lY < 1.5) {
                  eyeInHeadY = (rY + lY) / 2;
                }
              }
            }

            // ---- 포즈 기하: 어깨 기울기, 코-어깨 거리(고개 숙임) ----
            let tiltRaw: number | null = null;
            let headGap: number | null = null;
            let shoulderX: number | null = null;
            let shoulderWidth: number | null = null;
            let handFace = false;
            let armCross = false;
            let worldUsed = false; // 3D 월드 기울기 사용 여부 (능력 플래그)
            let handSeen = false;
            let lowerVisible = false;
            let hipX: number | null = null;
            let personUnstable = false;
            const wlm = poseResult.worldLandmarks?.[0];
            // 가시성 신뢰 게이트: 미러 환경에서 하반신·가려진 관절의 추정 잡음 차단
            const vis = (p?: { visibility?: number }) => !!p && (p.visibility ?? 1) > 0.5;
            if (plm) {
              const ls = plm[11];
              const rs = plm[12];
              const noseP = plm[0];
              const width = Math.abs(ls.x - rs.x);

              // 다인 가드: 어깨 중심·폭이 한 샘플(200ms) 만에 급변하면 추적 대상이
              // 바뀐 것(관람객 난입·스침)일 수 있다 → 이 프레임의 자세 집계를 폐기
              const centerRaw = (ls.x + rs.x) / 2;
              if (trackerJumped(prevPerson, centerRaw, width, 0.18, 1.6)) {
                personUnstable = true;
                prevWrists.l = null;
                prevWrists.r = null;
                if (runningRef.current) acc.guardFrames += 1;
              }
              prevPerson = { x: centerRaw, w: width };

              if (width > 0.05 && !personUnstable) {
                shoulderWidth = width; // 앞/뒤 리닝 추세용 (커지면 몸이 카메라 쪽으로)
                // 3D 월드 랜드마크(미터·골반 원점): 거리 불변 + 몸이 비스듬히 서도(yaw)
                // 어깨선 기울기가 왜곡되지 않게 수평 성분에 z를 포함. 없으면 2D 폴백
                const wls = wlm?.[11];
                const wrs = wlm?.[12];
                if (wls && wrs && vis(wls) && vis(wrs)) {
                  tiltRaw = (Math.atan2(Math.abs(wls.y - wrs.y),
                    Math.hypot(wls.x - wrs.x, wls.z - wrs.z) + 1e-6) * 180) / Math.PI;
                  worldUsed = true;
                } else {
                  tiltRaw = (Math.atan2(Math.abs(ls.y - rs.y), width) * 180) / Math.PI;
                }
                headGap = ((ls.y + rs.y) / 2 - noseP.y) / width;
                shoulderX = ((ls.x + rs.x) / 2) / width;

                // ---- 무의식 습관 (BlazePose 손목 15/16 재사용, 보수적 판정) ----
                const lw = plm[15];
                const rw = plm[16];
                const nearFace = (w: { x: number; y: number }) =>
                  Math.hypot(w.x - noseP.x, w.y - noseP.y) < width * 0.6 && w.y < (ls.y + rs.y) / 2;
                if (lw && rw) {
                  handFace = nearFace(lw) || nearFace(rw);
                  // 팔짱: 각 손목이 반대쪽 어깨에 더 가깝고(교차), 어깨 아래 비슷한 높이
                  const shoulderY = (ls.y + rs.y) / 2;
                  const crossedL = Math.abs(lw.x - rs.x) < Math.abs(lw.x - ls.x);
                  const crossedR = Math.abs(rw.x - ls.x) < Math.abs(rw.x - rs.x);
                  armCross = crossedL && crossedR
                    && lw.y > shoulderY && rw.y > shoulderY
                    && Math.abs(lw.y - rw.y) < width * 0.4;
                }

                // ---- 제스처 에너지 (월드 좌표 손목, m/s): 경직↔과다의 양끝 관찰 ----
                // 월드 좌표는 골반 원점이라 몸 전체의 이동·카메라 흔들림과 무관하게
                // '몸에 대한 손의 움직임'만 잰다. 월드가 없으면 보류(null 페이로드)
                for (const [side, wi] of [['l', 15], ['r', 16]] as const) {
                  const w = wlm?.[wi];
                  if (w && vis(w)) {
                    handSeen = true;
                    const prevW = prevWrists[side];
                    if (prevW && runningRef.current) {
                      const d = Math.hypot(w.x - prevW[0], w.y - prevW[1], w.z - prevW[2]);
                      if (d < 0.5) { // 0.5m/샘플(2.5m/s) 초과 변위는 추적 글리치 → 폐기
                        acc.gestureDistSum += d;
                        acc.gestureSamples += 1;
                        if (d > 0.02) acc.gestureActive += 1; // 0.1 m/s 초과 = 활동
                      }
                    }
                    prevWrists[side] = [w.x, w.y, w.z];
                  } else {
                    prevWrists[side] = null; // 가림 후 재등장 시 점프 변위 방지
                  }
                }

                // ---- 전신: 골반 스웨이(체중 이동 습관)·하체 가시성 ----
                const lh = plm[23];
                const rh = plm[24];
                if (vis(lh) && vis(rh)) {
                  hipX = ((lh.x + rh.x) / 2) / width;
                }
                lowerVisible = vis(plm[25]) && vis(plm[26]); // 무릎 — 서 있는 미러 감지
              }
            }

            // ---- 캘리브레이션 수집 (브리핑 동안: 정면·평상 자세 기준값) ----
            if (calibratingRef.current) {
              const cal = calibSamplesRef.current;
              if (signedAsym !== null) cal.asym.push(signedAsym);
              if (tiltRaw !== null) cal.tilt.push(tiltRaw);
              if (headGap !== null) cal.headGap.push(headGap);
              if (rollDeg !== null) cal.roll.push(rollDeg);
              if (eyeInHeadX !== null) cal.eyeX.push(eyeInHeadX);
              if (eyeInHeadY !== null) cal.eyeY.push(eyeInHeadY);
              if (shoulderWidth !== null) cal.width.push(shoulderWidth);
              // 깜빡임 기저선(동역학): 얼굴이 추적된 프레임에서만 세어 비율 왜곡 방지
              if (lm) {
                cal.blinkFrames += 1;
                if (blink && !cal.blinkOn) cal.blinks += 1;
                cal.blinkOn = blink;
              }
            }

            // ---- 기준 대비 판정: 시선 = 머리 자세 + 홍채 보상 (nonverbalCore) ----
            const gaze = resolveGaze(
              { signedAsym, eyeInHeadX, eyeInHeadY, eyeDown, eyeUp }, base,
            );
            const { front, offDir, gazeX, eyeYDelta } = gaze;
            if (runningRef.current && gaze.irisVUsed) acc.irisVFrames += 1;
            const tiltAdj = tiltRaw !== null
              ? Math.max(0, tiltRaw - (base.set ? base.tilt : 0))
              : null;
            const rollAdj = rollDeg !== null && base.set ? rollDeg - base.roll : rollDeg;
            const headDown = resolveHeadDown(headGap, base);

            drawOverlay(overlayRef?.current, lm, plm);
            setLive({
              tracking: !!(lm || plm),
              front,
              offDir,
              tiltDeg: tiltAdj ?? 0,
              headDown,
              micLevel,
              calibrated: base.set,
            });

            // 턴 진행 중일 때만 집계. 얼굴 가드가 발동한 프레임은 시선·표정이
            // 다른 사람의 것일 수 있으므로 통째로 폐기한다 (드문 이벤트 — 보수적)
            if (runningRef.current && faceUnstable) acc.guardFrames += 1;
            if (runningRef.current && (lm || plm) && !faceUnstable) {
              acc.frames += 1;
              acc.frontFlags.push(front);
              if (gaze.irisUsed) acc.irisFrames += 1;
              if (front) {
                acc.frontFrames += 1;
                if (acc.curOffStreak > 0) acc.offStreaks.push(acc.curOffStreak); // 회복 완료
                acc.curOffStreak = 0;
                acc.curContactStreak += 1;
              } else {
                if (acc.lastFront) acc.gazeOffCount += 1;
                if (offDir) acc.offDirs[offDir] += 1;
                acc.curOffStreak += 1;
                acc.maxOffStreak = Math.max(acc.maxOffStreak, acc.curOffStreak);
                if (acc.curContactStreak > 0) acc.contactBouts.push(acc.curContactStreak);
                acc.curContactStreak = 0;
              }

              // 듣기/말하기 분리 집계 + 답변 개시 직후의 시선 회피(생각 정리 — 정상 행동)
              const phase = gazePhaseRef.current;
              if (phase === 'listening') {
                acc.listenFrames += 1;
                if (front) acc.listenFront += 1;
                // 듣기 리닝: 상대가 말하는 동안의 어깨폭 — 기준 대비 전진(관심)/후퇴(거리두기)
                if (shoulderWidth !== null) acc.listenWidths.push(shoulderWidth);
                // 끄덕임 근사 (nonverbalCore.updateNod) — 긍정 신호 전용
                if (headGap !== null) updateNod(acc, headGap);
              } else if (phase === 'answering') {
                acc.answerFrames += 1;
                if (front) acc.answerFront += 1;
                if (!front && acc.answerStartedAt
                    && Date.now() - acc.answerStartedAt < ONSET_GRACE_MS) {
                  acc.onsetOffFrames += 1;
                }
              }

              // 3×3 시선 존 (행: 위/중/아래 × 열: 좌/중/우) — 시선 분포 지도
              acc.gazeZones[gazeZoneIndex(gazeX, eyeYDelta, eyeUp, eyeDown, headDown)] += 1;

              // 교차 분석 타임라인 — 2초 빈당 집계 3개 (영상·좌표는 전송하지 않는다)
              if (acc.turnStartedAt) {
                const binIdx = Math.min(
                  TIMELINE_MAX_BINS - 1,
                  Math.floor((Date.now() - acc.turnStartedAt) / TIMELINE_BIN_MS),
                );
                while (acc.bins.length <= binIdx) {
                  acc.bins.push({ frames: 0, front: 0, press: 0, tiltSum: 0 });
                }
                const bin = acc.bins[binIdx];
                bin.frames += 1;
                if (front) bin.front += 1;
                // 긴장 = 입술 압축 ∥ 찡그림 — moments의 '긴장 표정' 순간 감지 재료
                if (tension) bin.press += 1;
                if (tiltAdj !== null) bin.tiltSum += tiltAdj;
              }

              if (signedAsym !== null) {
                acc.asymSamples.push(base.set ? signedAsym - base.asym : signedAsym);
              }
              if (shoulderWidth !== null) acc.shoulderWidths.push(shoulderWidth);
              if (worldUsed) acc.worldFrames += 1;
              if (handSeen) acc.handSeenFrames += 1;
              if (lowerVisible) acc.lowerVisFrames += 1;
              if (hipX !== null) acc.hipXs.push(hipX);
              acc.lastFront = front;
              if (blink && !acc.blinkActive) acc.blinkCount += 1;
              acc.blinkActive = blink;
              if (smile) {
                acc.smileFrames += 1;
                if (duchenne) acc.duchenneFrames += 1;
              }
              if (mouthPress) acc.mouthPressFrames += 1;
              if (browDown) acc.browDownFrames += 1;
              // 긴장 표정 에피소드: 시작~풀림까지의 연속 구간 (표정 복구 시간 재료).
              // 0.4초 미만의 단발 깜빡임 잡음은 에피소드로 세지 않는다.
              if (tension) {
                acc.curTensionStreak += 1;
              } else {
                if (acc.curTensionStreak >= framesFor(400)) {
                  acc.tensionStreaks.push(acc.curTensionStreak);
                }
                acc.curTensionStreak = 0;
              }
              if (handFace) acc.handFaceFrames += 1;
              if (armCross) acc.armCrossFrames += 1;
              if (rollAdj !== null) acc.rollSamples.push(rollAdj);
              if (tiltAdj !== null && shoulderX !== null) {
                acc.tiltSamples.push(tiltAdj);
                acc.shoulderXs.push(shoulderX);
                if (headDown) acc.headDownFrames += 1;
                if (tiltAdj > 8) maybeCoach('어깨를 수평으로 펴보세요');
              }
              // 실시간 코칭: 최근 3초 창에서 이탈이 70% 이상이면 안내 (시간 기준)
              const recent = recentOffRef.current;
              recent.push(!front);
              const coachWindow = framesFor(3000);
              if (recent.length > coachWindow) recent.shift();
              if (recent.length >= framesFor(2000)
                  && recent.filter(Boolean).length >= recent.length * 0.7) {
                maybeCoach('화면 정면을 바라봐주세요');
                recentOffRef.current = [];
              }
            }
          } catch {
            setLive((prev) => ({ ...prev, micLevel, tracking: false }));
          }
        }, SAMPLE_MS);
      } catch {
        // MediaPipe 로드 실패(오프라인·차단 등) → 사유를 화면에 표시
        if (!cancelled) setVisionStatus('failed');
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void audioCtx?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 브리핑 표시 중 호출 — 정면 기준값 수집 시작 */
  const startCalibration = useCallback(() => {
    calibSamplesRef.current = emptyCalibration();
    calibratingRef.current = true;
  }, []);

  /** 브리핑 종료 시 호출 — 중앙값으로 기준 확정 (표본 4개 미만이면 절대 판정 유지) */
  const finishCalibration = useCallback(() => {
    calibratingRef.current = false;
    const baseline = finalizeCalibration(calibSamplesRef.current);
    if (baseline.set) baselineRef.current = baseline;
  }, []);

  const startTurn = useCallback(() => {
    accRef.current = emptyAcc();
    accRef.current.turnStartedAt = Date.now();
    runningRef.current = true;
    gazePhaseRef.current = null;
  }, []);

  /** 대화 페이즈 전환 — 듣기(상대 TTS)/말하기(답변) 시선을 분리 측정한다 */
  const setGazePhase = useCallback((phase: 'listening' | 'answering' | null) => {
    if (phase === 'answering' && gazePhaseRef.current !== 'answering') {
      accRef.current.answerStartedAt = Date.now(); // 개시 회피 유예 구간의 기점
    }
    gazePhaseRef.current = phase;
  }, []);

  const endTurn = useCallback((): NonverbalMetrics | null => {
    runningRef.current = false;
    return finalizeTurnMetrics(accRef.current, baselineRef.current);
  }, []);

  return {
    cameraReady: visionStatus === 'ready',
    visionStatus,
    tip,
    live,
    startTurn,
    endTurn,
    setGazePhase,
    startCalibration,
    finishCalibration,
  };
}

interface Landmark {
  x: number;
  y: number;
}

/** 분석 중임을 보여주는 스켈레톤 오버레이 — 시각화 전용 (영상 미전송 원칙 유지) */
function drawOverlay(
  canvas: HTMLCanvasElement | null | undefined,
  faceLm: Landmark[] | undefined,
  poseLm: Landmark[] | undefined,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  if (poseLm) {
    ctx.strokeStyle = 'rgba(91, 124, 250, 0.9)';
    ctx.lineWidth = 3;
    for (const [a, b] of POSE_LINKS) {
      const pa = poseLm[a];
      const pb = poseLm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = '#5b7cfa';
    for (const idx of [0, 11, 12]) {
      const p = poseLm[idx];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (faceLm) {
    ctx.fillStyle = 'rgba(62, 207, 142, 0.9)';
    for (const idx of FACE_POINTS) {
      const p = faceLm[idx];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
