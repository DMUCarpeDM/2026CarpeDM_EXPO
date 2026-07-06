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

const SAMPLE_MS = 200;
// 기준 대비 허용 편차 (캘리브레이션 후 상대 판정)
const YAW_DELTA_THRESHOLD = 0.22; // 시선 좌우: 비대칭 변화량
const HEAD_DROP_THRESHOLD = 0.1; // 고개 숙임: 코-어깨 거리(어깨너비 정규화) 감소량
// 캘리브레이션이 없을 때(직접 URL 진입 등) 쓰는 절대 폴백 임계값
const YAW_ABS_THRESHOLD = 0.3;
const HEAD_DOWN_ABS_THRESHOLD = 0.3;

// ---- 홍채 기반 시선 (Face Landmarker 478 랜드마크 중 468~477) ----
// 시선 = 머리 자세 + 눈-머리(eye-in-head). 고개를 돌려도 눈이 카메라를 보면
// 정면이다 — 머리 비대칭만 보던 v1의 구조적 오판을 홍채 추적으로 보상한다.
const IRIS_R = 468; // 홍채 중심 (영상 좌표 기준 각 눈의 5점 중 중심)
const IRIS_L = 473;
const EYE_R = { inner: 133, outer: 33 }; // 오른눈 안/바깥 꼬리
const EYE_L = { inner: 362, outer: 263 };
// 눈-머리 편향을 머리 비대칭 스케일로 환산하는 계수 (홍채 가동폭 ~±0.35)
const EYE_COMP_GAIN = 0.8;
const EYE_COMP_CLAMP = 0.18; // 보상 상한 — 보상이 판정을 뒤집는 폭주 방지
const EYE_ONLY_THRESHOLD = 0.25; // 머리는 정면인데 눈만 옆을 보는 이탈 감지
// 자연스러운 응시 리듬: 답변 개시 직후의 짧은 시선 회피(생각 정리)는 정상 행동
const ONSET_GRACE_MS = 2500;

// 얼굴 윤곽 표시용 랜드마크 (Face Mesh 인덱스 서브셋)
const FACE_POINTS = [10, 152, 234, 454, 1, 33, 263, 61, 291, 199];
// 상체 포즈 연결선 (BlazePose 인덱스)
const POSE_LINKS: [number, number][] = [
  [11, 12], [11, 13], [12, 14], [11, 23], [12, 24], [23, 24],
];

interface Accumulator {
  frames: number;
  frontFrames: number;
  gazeOffCount: number;
  lastFront: boolean;
  tiltSamples: number[]; // 전/후반 추세 분석용 시계열 (보정값)
  headDownFrames: number;
  shoulderXs: number[];
  frontFlags: boolean[]; // 전/후반 정면 비율 비교용
  offDirs: Record<'down' | 'up' | 'left' | 'right', number>; // 이탈 방향 분포
  curOffStreak: number;
  maxOffStreak: number; // 최장 연속 이탈 (프레임)
  blinkCount: number;
  blinkActive: boolean;
  smileFrames: number; // 미소 표현 프레임
  rollSamples: number[]; // 고개 갸웃 각도 (보정값)
  // 지각 확장 — 이미 로드된 모델의 미사용 출력 (새 모델 없음)
  mouthPressFrames: number; // 입술 압축 = 긴장 신호 (blendshape)
  browDownFrames: number; // 찡그림 (blendshape)
  handFaceFrames: number; // 손-얼굴 터치 (무의식 습관, pose 손목)
  armCrossFrames: number; // 팔짱 근사 (pose 손목 교차)
  asymSamples: number[]; // 시선 미세 안정성용 좌우 비대칭 시계열 (보정값)
  offStreaks: number[]; // 완료된 이탈 스트릭 길이들 — 회복 시간 분석
  shoulderWidths: number[]; // 어깨 픽셀 폭 시계열 — 앞/뒤 리닝 추세
  // ---- Eye-Fit 심화 ----
  irisFrames: number; // 홍채 추적이 실제로 쓰인 프레임 (능력 플래그)
  contactBouts: number[]; // 완료된 연속 응시 구간 길이들 (응시 리듬)
  curContactStreak: number;
  listenFrames: number; // 상대가 말하는 동안(듣기)의 프레임/정면
  listenFront: number;
  answerFrames: number; // 내가 답하는 동안(말하기)의 프레임/정면
  answerFront: number;
  answerStartedAt: number; // 답변 페이즈 시작 시각 — 개시 회피 관용 측정
  onsetOffFrames: number; // 답변 개시 직후 유예 구간의 이탈 프레임
  gazeZones: number[]; // 3×3 시선 존 (행: 위/중/아래 × 열: 좌/중/우)
  tips: string[]; // 이 턴에서 발생한 실시간 코칭 (리포트 연동, S-JKEYHS)
}

const emptyAcc = (): Accumulator => ({
  frames: 0,
  frontFrames: 0,
  gazeOffCount: 0,
  lastFront: true,
  tiltSamples: [],
  headDownFrames: 0,
  shoulderXs: [],
  frontFlags: [],
  offDirs: { down: 0, up: 0, left: 0, right: 0 },
  curOffStreak: 0,
  maxOffStreak: 0,
  blinkCount: 0,
  blinkActive: false,
  smileFrames: 0,
  rollSamples: [],
  mouthPressFrames: 0,
  browDownFrames: 0,
  handFaceFrames: 0,
  armCrossFrames: 0,
  asymSamples: [],
  offStreaks: [],
  shoulderWidths: [],
  irisFrames: 0,
  contactBouts: [],
  curContactStreak: 0,
  listenFrames: 0,
  listenFront: 0,
  answerFrames: 0,
  answerFront: 0,
  answerStartedAt: 0,
  onsetOffFrames: 0,
  gazeZones: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  tips: [],
});

interface Baseline {
  set: boolean;
  asym: number; // 정면일 때 코-볼 비대칭 (카메라 좌우 오프셋 보정)
  tilt: number; // 평상시 어깨 기울기 (카메라 기울기·체형 보정)
  headGap: number | null; // 코-어깨 수직 거리 / 어깨너비
  roll: number; // 평상시 눈선 각도
  eyeX: number | null; // 정면 응시 때의 홍채 수평 편향 (개인별 눈 정렬 보정)
}

const emptyBaseline = (): Baseline => ({
  set: false, asym: 0, tilt: 0, headGap: null, roll: 0, eyeX: null,
});

export interface CoachingTip {
  id: number;
  text: string;
}

export type VisionStatus = 'idle' | 'loading' | 'ready' | 'no-camera' | 'failed';

/** 라이브 게이지용 실시간 상태 (매 샘플 갱신) */
export interface LiveState {
  tracking: boolean;
  front: boolean;
  offDir: 'down' | 'up' | 'left' | 'right' | null;
  tiltDeg: number; // 기준 보정된 기울기
  headDown: boolean;
  micLevel: number; // 0~1
  calibrated: boolean;
}

const idleLive: LiveState = {
  tracking: false, front: true, offDir: null, tiltDeg: 0, headDown: false, micLevel: 0, calibrated: false,
};

function stdDev(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}


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
  const calibSamplesRef = useRef<{
    asym: number[]; tilt: number[]; headGap: number[]; roll: number[]; eyeX: number[];
  }>({ asym: [], tilt: [], headGap: [], roll: [], eyeX: [] });
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

            // ---- 얼굴 기하: 좌우 비대칭(요), 눈선 각도(갸웃) ----
            let signedAsym: number | null = null;
            let rollDeg: number | null = null;
            let eyeInHeadX: number | null = null; // 홍채 수평 편향 (0=정중앙)
            if (lm) {
              const nose = lm[1];
              const left = lm[234];
              const right = lm[454];
              const dl = Math.abs(nose.x - left.x);
              const dr = Math.abs(right.x - nose.x);
              signedAsym = (dl - dr) / Math.max(dl + dr, 1e-6);
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
              }
            }

            // ---- 포즈 기하: 어깨 기울기, 코-어깨 거리(고개 숙임) ----
            let tiltRaw: number | null = null;
            let headGap: number | null = null;
            let shoulderX: number | null = null;
            let shoulderWidth: number | null = null;
            let handFace = false;
            let armCross = false;
            if (plm) {
              const ls = plm[11];
              const rs = plm[12];
              const noseP = plm[0];
              const width = Math.abs(ls.x - rs.x);
              if (width > 0.05) {
                shoulderWidth = width; // 앞/뒤 리닝 추세용 (커지면 몸이 카메라 쪽으로)
                tiltRaw = (Math.atan2(Math.abs(ls.y - rs.y), width) * 180) / Math.PI;
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
            }

            // ---- 기준 대비 판정: 시선 = 머리 자세 + 홍채 보상 ----
            let front = true;
            let offDir: 'down' | 'up' | 'left' | 'right' | null = null;
            let gazeX: number | null = null; // 존 분포용 최종 수평 시선 추정
            let irisUsed = false;
            if (signedAsym !== null) {
              const asymDelta = base.set ? signedAsym - base.asym : signedAsym;
              const yawThreshold = base.set ? YAW_DELTA_THRESHOLD : YAW_ABS_THRESHOLD;
              gazeX = asymDelta;

              // 홍채 보상 — "구제 전용" 보수 설계: 보상은 이탈 판정을 완화하는
              // 방향으로만 적용한다. 부호 추정이 틀려도 v1보다 나빠질 수 없다
              // (고개를 돌린 채 눈으로 카메라를 보는 경우의 오판만 구제).
              if (eyeInHeadX !== null && base.eyeX !== null) {
                const eyeDelta = eyeInHeadX - base.eyeX;
                const comp = Math.max(-EYE_COMP_CLAMP,
                  Math.min(EYE_COMP_CLAMP, eyeDelta * EYE_COMP_GAIN));
                const compensated = asymDelta - comp;
                if (Math.abs(compensated) < Math.abs(asymDelta)) {
                  gazeX = compensated;
                  irisUsed = true;
                }
                // 머리는 정면인데 눈만 옆을 보는 이탈 (v1이 놓치던 축)
                if (Math.abs(asymDelta) < yawThreshold
                    && Math.abs(eyeDelta) >= EYE_ONLY_THRESHOLD) {
                  offDir = eyeDelta > 0 ? 'left' : 'right';
                  irisUsed = true;
                }
              }

              if (offDir === null) {
                if (Math.abs(gazeX) >= yawThreshold) {
                  offDir = gazeX > 0 ? 'right' : 'left';
                } else if (eyeDown > 0.55) {
                  offDir = 'down'; // 머리는 정면, 눈동자만 아래 (대본 읽기 패턴)
                } else if (eyeUp > 0.55) {
                  offDir = 'up';
                }
              }
              front = offDir === null;
            }
            const tiltAdj = tiltRaw !== null
              ? Math.max(0, tiltRaw - (base.set ? base.tilt : 0))
              : null;
            const rollAdj = rollDeg !== null && base.set ? rollDeg - base.roll : rollDeg;
            const headDown = headGap !== null && (
              base.set && base.headGap !== null
                ? base.headGap - headGap > HEAD_DROP_THRESHOLD
                : headGap < HEAD_DOWN_ABS_THRESHOLD
            );

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

            // 턴 진행 중일 때만 집계
            if (runningRef.current && (lm || plm)) {
              acc.frames += 1;
              acc.frontFlags.push(front);
              if (irisUsed) acc.irisFrames += 1;
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
              } else if (phase === 'answering') {
                acc.answerFrames += 1;
                if (front) acc.answerFront += 1;
                if (!front && acc.answerStartedAt
                    && Date.now() - acc.answerStartedAt < ONSET_GRACE_MS) {
                  acc.onsetOffFrames += 1;
                }
              }

              // 3×3 시선 존 (행: 위/중/아래 × 열: 좌/중/우) — 시선 분포 지도
              {
                const col = gazeX === null ? 1 : gazeX < -0.15 ? 0 : gazeX > 0.15 ? 2 : 1;
                const row = eyeUp > 0.45 ? 0 : eyeDown > 0.45 || headDown ? 2 : 1;
                acc.gazeZones[row * 3 + col] += 1;
              }

              if (signedAsym !== null) {
                acc.asymSamples.push(base.set ? signedAsym - base.asym : signedAsym);
              }
              if (shoulderWidth !== null) acc.shoulderWidths.push(shoulderWidth);
              acc.lastFront = front;
              if (blink && !acc.blinkActive) acc.blinkCount += 1;
              acc.blinkActive = blink;
              if (smile) acc.smileFrames += 1;
              if (mouthPress) acc.mouthPressFrames += 1;
              if (browDown) acc.browDownFrames += 1;
              if (handFace) acc.handFaceFrames += 1;
              if (armCross) acc.armCrossFrames += 1;
              if (rollAdj !== null) acc.rollSamples.push(rollAdj);
              if (tiltAdj !== null && shoulderX !== null) {
                acc.tiltSamples.push(tiltAdj);
                acc.shoulderXs.push(shoulderX);
                if (headDown) acc.headDownFrames += 1;
                if (tiltAdj > 8) maybeCoach('어깨를 수평으로 펴보세요');
              }
              const recent = recentOffRef.current;
              recent.push(!front);
              if (recent.length > 15) recent.shift();
              if (recent.length >= 10 && recent.filter(Boolean).length >= 7) {
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
    calibSamplesRef.current = { asym: [], tilt: [], headGap: [], roll: [], eyeX: [] };
    calibratingRef.current = true;
  }, []);

  /** 브리핑 종료 시 호출 — 중앙값으로 기준 확정 (표본 4개 미만이면 절대 판정 유지) */
  const finishCalibration = useCallback(() => {
    calibratingRef.current = false;
    const cal = calibSamplesRef.current;
    if (cal.asym.length >= 4) {
      baselineRef.current = {
        set: true,
        asym: median(cal.asym),
        tilt: cal.tilt.length >= 4 ? median(cal.tilt) : 0,
        headGap: cal.headGap.length >= 4 ? median(cal.headGap) : null,
        roll: cal.roll.length >= 4 ? median(cal.roll) : 0,
        // 홍채 기준은 표본 분산까지 확인 — 흔들리는 표본으로 보상하면 오판을 만든다
        eyeX: cal.eyeX.length >= 4 && stdDev(cal.eyeX) < 0.08 ? median(cal.eyeX) : null,
      };
    }
  }, []);

  const startTurn = useCallback(() => {
    accRef.current = emptyAcc();
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
    const acc = accRef.current;
    if (acc.frames < 5) return null;
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const xs = acc.shoulderXs;
    let sway = 0;
    if (xs.length > 2) {
      const m = mean(xs);
      sway = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    }

    // 전/후반 추세: 후반부 자세 붕괴·시선 저하 감지
    let tiltDrift = 0;
    if (acc.tiltSamples.length >= 10) {
      const h = Math.floor(acc.tiltSamples.length / 2);
      tiltDrift = mean(acc.tiltSamples.slice(h)) - mean(acc.tiltSamples.slice(0, h));
    }
    let frontDrift = 0;
    if (acc.frontFlags.length >= 10) {
      const h = Math.floor(acc.frontFlags.length / 2);
      const ratio = (flags: boolean[]) => flags.filter(Boolean).length / flags.length;
      frontDrift = Math.round(
        (ratio(acc.frontFlags.slice(h)) - ratio(acc.frontFlags.slice(0, h))) * 100,
      );
    }

    // 이탈 방향 분포에서 지배 방향 (표본 3프레임 이상일 때만)
    const dirEntries = Object.entries(acc.offDirs) as ['down' | 'up' | 'left' | 'right', number][];
    const [domDir, domCount] = dirEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const minutes = (acc.frames * SAMPLE_MS) / 60000;

    return {
      front_gaze_ratio: acc.frontFrames / acc.frames,
      gaze_off_count: acc.gazeOffCount,
      avg_shoulder_tilt_deg: acc.tiltSamples.length ? mean(acc.tiltSamples) : 0,
      head_down_ratio: acc.headDownFrames / acc.frames,
      posture_sway: sway,
      frames: acc.frames,
      longest_off_sec: Math.round((acc.maxOffStreak * SAMPLE_MS) / 100) / 10,
      blink_per_min: minutes > 0.05 ? Math.round(acc.blinkCount / minutes) : 0,
      gaze_off_dir: domCount >= 3 ? domDir : null,
      tilt_drift_deg: Math.round(tiltDrift * 10) / 10,
      front_drift_pct: frontDrift,
      smile_ratio: Math.round((acc.smileFrames / acc.frames) * 100) / 100,
      head_roll_deg: acc.rollSamples.length
        ? Math.round(mean(acc.rollSamples.map(Math.abs)) * 10) / 10
        : 0,
      mouth_press_ratio: Math.round((acc.mouthPressFrames / acc.frames) * 100) / 100,
      brow_down_ratio: Math.round((acc.browDownFrames / acc.frames) * 100) / 100,
      hand_face_sec: Math.round((acc.handFaceFrames * SAMPLE_MS) / 100) / 10,
      arm_cross_ratio: Math.round((acc.armCrossFrames / acc.frames) * 100) / 100,
      gaze_dirs: { ...acc.offDirs },
      // ---- Eye-Fit 심화 ----
      // 홍채 추적 가동률 — 리포트가 "머리 추적"인지 "시선 추적"인지 밝힐 근거
      iris_ratio: Math.round((acc.irisFrames / acc.frames) * 100) / 100,
      // 듣기/말하기 응시 분리 (표본 2초 미만이면 판정 보류 = null)
      listening_front_ratio: acc.listenFrames >= 10
        ? Math.round((acc.listenFront / acc.listenFrames) * 100) / 100
        : null,
      answering_front_ratio: acc.answerFrames >= 10
        ? Math.round((acc.answerFront / acc.answerFrames) * 100) / 100
        : null,
      // 응시 리듬: 연속 응시 구간(바우트)의 평균 길이 — 3~7초가 자연스러운 대화 리듬
      contact_bout_mean_sec: (() => {
        const bouts = [...acc.contactBouts];
        if (acc.curContactStreak > 0) bouts.push(acc.curContactStreak);
        return bouts.length
          ? Math.round((mean(bouts) * SAMPLE_MS) / 100) / 10
          : 0;
      })(),
      // 답변 개시 직후(2.5초 유예)의 시선 회피 — 생각 정리 행동, 감점에서 제외할 근거
      onset_aversion_sec: Math.round((acc.onsetOffFrames * SAMPLE_MS) / 100) / 10,
      // 3×3 시선 존 분포 (위/중/아래 × 좌/중/우) — 시선 지도
      gaze_zones: [...acc.gazeZones],
      // 시선 미세 안정성: 정면 판정 내에서의 흔들림 (표준편차) — 스캐닝 습관 감지
      gaze_stability: acc.asymSamples.length > 5
        ? Math.round(stdDev(acc.asymSamples) * 1000) / 1000
        : 0,
      // 이탈 후 정면 복귀까지 평균 시간 — 회복 탄력
      gaze_recover_sec: acc.offStreaks.length
        ? Math.round((mean(acc.offStreaks) * SAMPLE_MS) / 100) / 10
        : 0,
      // 앞/뒤 리닝 추세: 후반 어깨폭 / 전반 대비 (%) — +는 카메라 쪽으로 다가옴
      lean_drift_pct: (() => {
        const w = acc.shoulderWidths;
        if (w.length < 10) return 0;
        const h = Math.floor(w.length / 2);
        return Math.round((mean(w.slice(h)) / mean(w.slice(0, h)) - 1) * 100);
      })(),
      calibrated: baselineRef.current.set,
      tips: acc.tips,
    };
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
