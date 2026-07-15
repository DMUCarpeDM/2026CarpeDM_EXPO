/** MediaPipe 자산 경로 공용 모듈 — 역할극 측정 훅과 대기 화면 웨이크가 공유한다.
 *
 * 오프라인 전시 대비: `npm run setup-offline`으로 wasm/모델을 public/에 받아두면
 * 로컬 자산을 우선 사용하고, 없으면 CDN에서 로드한다.
 */

export const LOCAL_WASM = '/mediapipe-wasm';
export const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

export const MODELS = {
  face: {
    local: '/models/face_landmarker.task',
    cdn: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  pose: {
    local: '/models/pose_landmarker_lite.task',
    cdn: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
};

export async function checkLocal(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveWasmUrl(): Promise<string> {
  return (await checkLocal(`${LOCAL_WASM}/vision_wasm_internal.wasm`)) ? LOCAL_WASM : CDN_WASM;
}

export async function resolveModel(kind: keyof typeof MODELS): Promise<string> {
  const m = MODELS[kind];
  return (await checkLocal(m.local)) ? m.local : m.cdn;
}
