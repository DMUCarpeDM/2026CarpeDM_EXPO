/** MediaPipe Face/Pose 기반 실시간 시선·자세 측정 훅.
 *
 * 원본 영상은 어디에도 저장·전송하지 않고, 브라우저 안에서 프레임을 분석해
 * 턴 단위 집계 지표만 서버로 보낸다 (개인정보 최소화 — 기본 미저장 원칙).
 *
 * 지표 산출은 랜드마크 기하 휴리스틱:
 * - 시선(정면): 코 끝과 좌/우 볼 사이 거리 비대칭 → 고개 요(yaw) 근사
 * - 고개 숙임: 포즈의 코-어깨 중점 수직 거리 / 어깨 너비
 * - 어깨 기울기: 좌우 어깨 랜드마크 각도
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NonverbalMetrics } from '../../api/types';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const SAMPLE_MS = 250;
const YAW_ASYM_THRESHOLD = 0.3; // 이보다 크면 시선 이탈로 간주
const HEAD_DOWN_THRESHOLD = 0.3; // (어깨중점y - 코y)/어깨너비 가 이보다 작으면 고개 숙임

interface Accumulator {
  frames: number;
  frontFrames: number;
  gazeOffCount: number;
  lastFront: boolean;
  tiltSum: number;
  headDownFrames: number;
  shoulderXs: number[];
}

const emptyAcc = (): Accumulator => ({
  frames: 0,
  frontFrames: 0,
  gazeOffCount: 0,
  lastFront: true,
  tiltSum: 0,
  headDownFrames: 0,
  shoulderXs: [],
});

export interface CoachingTip {
  id: number;
  text: string;
}

export function useNonverbal(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [cameraReady, setCameraReady] = useState(false);
  const [tip, setTip] = useState<CoachingTip | null>(null);
  const accRef = useRef<Accumulator>(emptyAcc());
  const recentOffRef = useRef<boolean[]>([]);
  const tipCountRef = useRef(0);
  const lastTipAtRef = useRef(0);
  const landmarkerRef = useRef<{ face: unknown; pose: unknown } | null>(null);
  const runningRef = useRef(false);

  // 실시간 코칭 오버레이 (F-KYJJQW) — 세션당 3회, 20초 쿨다운
  const maybeCoach = useCallback((text: string) => {
    const now = Date.now();
    if (tipCountRef.current >= 3 || now - lastTipAtRef.current < 20000) return;
    tipCountRef.current += 1;
    lastTipAtRef.current = now;
    const id = now;
    setTip({ id, text });
    setTimeout(() => setTip((t) => (t?.id === id ? null : t)), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true, // 오디오 트랙은 녹음기에서 재사용
        });
      } catch {
        return; // 카메라/마이크 거부 → 비언어 미측정으로 진행
      }
      if (cancelled || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const face = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        const pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) return;
        landmarkerRef.current = { face, pose };
        setCameraReady(true);

        timer = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !runningRef.current) return;
          const ts = performance.now();
          const acc = accRef.current;

          try {
            const faceResult = face.detectForVideo(video, ts);
            const poseResult = pose.detectForVideo(video, ts + 0.001);

            const lm = faceResult.faceLandmarks?.[0];
            let front = true;
            if (lm) {
              const nose = lm[1];
              const left = lm[234];
              const right = lm[454];
              const dl = Math.abs(nose.x - left.x);
              const dr = Math.abs(right.x - nose.x);
              const asym = Math.abs(dl - dr) / Math.max(dl + dr, 1e-6);
              front = asym < YAW_ASYM_THRESHOLD;
            }

            const plm = poseResult.landmarks?.[0];
            if (plm) {
              const ls = plm[11];
              const rs = plm[12];
              const noseP = plm[0];
              const width = Math.abs(ls.x - rs.x);
              if (width > 0.05) {
                const tiltDeg =
                  (Math.atan2(Math.abs(ls.y - rs.y), width) * 180) / Math.PI;
                const midY = (ls.y + rs.y) / 2;
                const midX = (ls.x + rs.x) / 2;
                acc.tiltSum += tiltDeg;
                acc.shoulderXs.push(midX / width);
                if ((midY - noseP.y) / width < HEAD_DOWN_THRESHOLD) {
                  acc.headDownFrames += 1;
                }
                if (tiltDeg > 10) maybeCoach('어깨를 수평으로 펴보세요 🙆');
              }
            }

            acc.frames += 1;
            if (front) acc.frontFrames += 1;
            if (!front && acc.lastFront) acc.gazeOffCount += 1;
            acc.lastFront = front;

            const recent = recentOffRef.current;
            recent.push(!front);
            if (recent.length > 12) recent.shift();
            if (recent.length >= 8 && recent.filter(Boolean).length >= 6) {
              maybeCoach('화면 정면을 바라봐주세요 👀');
              recentOffRef.current = [];
            }
          } catch {
            /* 프레임 분석 실패는 건너뜀 */
          }
        }, SAMPLE_MS);
      } catch {
        // MediaPipe 로드 실패(오프라인 등) → 카메라 프리뷰만 유지
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTurn = useCallback(() => {
    accRef.current = emptyAcc();
    runningRef.current = true;
  }, []);

  const endTurn = useCallback((): NonverbalMetrics | null => {
    runningRef.current = false;
    const acc = accRef.current;
    if (acc.frames < 5) return null;
    const xs = acc.shoulderXs;
    let sway = 0;
    if (xs.length > 2) {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      sway = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    }
    return {
      front_gaze_ratio: acc.frontFrames / acc.frames,
      gaze_off_count: acc.gazeOffCount,
      avg_shoulder_tilt_deg: xs.length ? acc.tiltSum / xs.length : 0,
      head_down_ratio: acc.headDownFrames / acc.frames,
      posture_sway: sway,
      frames: acc.frames,
    };
  }, []);

  return { cameraReady, tip, startTurn, endTurn };
}
