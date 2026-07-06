/** 다가가면 깨어나는 거울 — 대기 화면용 저빈도 얼굴 감지 (기획서 §4.0).
 *
 * MediaPipe Face Landmarker를 2.5fps로 돌려 "충분히 가까운 얼굴"이 잡히면 awake.
 * 사람이 떠나고 몇 초가 지나면 다시 잠든다. 전부 온디바이스 — 어떤 프레임·지표도
 * 서버로 나가지 않는다. 카메라 거부·모델 실패 시엔 조용히 꺼지고(touch로 시작),
 * 체험 흐름을 막지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { resolveModel, resolveWasmUrl } from './visionAssets';

const SAMPLE_MS = 400; // ~2.5fps — 대기 화면에서 GPU를 아낀다
const NEAR_FACE_WIDTH = 0.16; // 얼굴 폭(프레임 비율)이 이 이상이면 "다가왔다"
const SLEEP_AFTER_MS = 6000; // 미감지 지속 시 다시 잠드는 시간

export function useFaceWake(enabled: boolean): { awake: boolean; watching: boolean } {
  const [awake, setAwake] = useState(false);
  const [watching, setWatching] = useState(false);
  const lastSeenRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let landmarker: { detectForVideo: Function; close: () => void } | null = null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
      } catch {
        return; // 카메라 거부 → 터치 시작 폴백
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(await resolveWasmUrl());
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: await resolveModel('face') },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      } catch {
        return; // 모델 로드 실패 → 터치 시작 폴백
      }
      if (cancelled) return;
      setWatching(true);

      timer = setInterval(() => {
        if (!landmarker || video.readyState < 2) return;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          const lm = result.faceLandmarks?.[0];
          if (lm) {
            // 얼굴 폭 = 좌우 볼(234, 454) x 간격 — 가까울수록 크다
            const width = Math.abs((lm[234]?.x ?? 0) - (lm[454]?.x ?? 0));
            if (width >= NEAR_FACE_WIDTH) {
              lastSeenRef.current = Date.now();
              setAwake(true);
              return;
            }
          }
          if (Date.now() - lastSeenRef.current > SLEEP_AFTER_MS) setAwake(false);
        } catch {
          /* 개별 프레임 실패는 무시 */
        }
      }, SAMPLE_MS);
    }

    void init();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      landmarker?.close();
      stream?.getTracks().forEach((t) => t.stop());
      setWatching(false);
      setAwake(false);
    };
  }, [enabled]);

  return { awake, watching };
}
