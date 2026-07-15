/** 비언어 측정(Eye-Fit / Posture-Fit) — 브라우저 온디바이스 MediaPipe.
 *
 * PoC의 검증된 기하·임계와 동일한 정의로 turn별 집계치를 만든다. 백엔드
 * nonverbal.py의 밴드가 이 스케일에 맞춰 보정돼 있으므로 정의를 그대로 따른다:
 *   front_gaze_ratio     정면 응시 프레임 비율 (머리 요 |asym| < 0.3)
 *   gaze_off_count       정면→이탈 전환 횟수
 *   avg_shoulder_tilt_deg 좌우 어깨 높이차 각도(도)
 *   head_down_ratio      고개 숙임 프레임 비율 (코-어깨 거리/너비 < 0.3)
 *   posture_sway         어깨중심 x(어깨너비 정규화) 표준편차
 *   frames               유효 표본 수 (백엔드 MIN_FRAMES=5 게이트)
 *
 * 캘리브레이션 단계가 없어 PoC의 절대 임계 폴백(base.set=false)을 사용한다.
 * 오프라인 전시 대비 로컬 자산(public/) 우선, 없으면 CDN 폴백.
 */
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const SAMPLE_MS = 200;            // 5Hz — PoC와 동일(밴드 스케일 일치)
const YAW_ABS_THRESHOLD = 0.3;    // |signedAsym| 이 이상이면 시선 이탈
const HEAD_DOWN_ABS_THRESHOLD = 0.3; // 코-어깨 거리/어깨너비 이 미만이면 고개 숙임
const MIN_FRAMES = 5;

const LOCAL_WASM = '/mediapipe-wasm';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MODEL = {
  local: '/models/face_landmarker.task',
  cdn: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};
const POSE_MODEL = {
  local: '/models/pose_landmarker_lite.task',
  cdn: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

async function localAvailable(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

/** 정면·이탈·고개숙임·기울기·흔들림 프레임 집계 → NonverbalIn 페이로드 산출. */
export function aggregate(acc) {
  if (!acc || acc.frames < MIN_FRAMES) return { frames: acc ? acc.frames : 0 };
  const xs = acc.shoulderXs;
  let sway = 0;
  if (xs.length > 2) {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    sway = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  }
  const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  return {
    front_gaze_ratio: acc.frontFrames / acc.frames,
    gaze_off_count: acc.gazeOff,
    avg_shoulder_tilt_deg: mean(acc.tilts),
    head_down_ratio: acc.headDown / acc.frames,
    posture_sway: sway,
    frames: acc.frames,
  };
}

/** 한 프레임의 face/pose 랜드마크에서 집계치를 갱신(순수 함수, 테스트 용이). */
export function accumulateFrame(acc, faceLm, poseLm) {
  let sampled = false;
  if (faceLm && faceLm[1] && faceLm[234] && faceLm[454]) {
    const nose = faceLm[1], left = faceLm[234], right = faceLm[454];
    const dl = Math.abs(nose.x - left.x);
    const dr = Math.abs(right.x - nose.x);
    const asym = (dl - dr) / Math.max(dl + dr, 1e-6);
    const front = Math.abs(asym) < YAW_ABS_THRESHOLD;
    if (front) acc.frontFrames += 1;
    if (acc.prevFront && !front) acc.gazeOff += 1;
    acc.prevFront = front;
    sampled = true;
  }
  if (poseLm && poseLm[11] && poseLm[12] && poseLm[0]) {
    const ls = poseLm[11], rs = poseLm[12], nP = poseLm[0];
    const width = Math.abs(ls.x - rs.x) || 1e-6;
    acc.tilts.push((Math.atan2(Math.abs(ls.y - rs.y), width) * 180) / Math.PI);
    const headGap = ((ls.y + rs.y) / 2 - nP.y) / width;
    if (headGap < HEAD_DOWN_ABS_THRESHOLD) acc.headDown += 1;
    acc.shoulderXs.push(((ls.x + rs.x) / 2) / width);
    sampled = true;
  }
  if (sampled) acc.frames += 1;
  return acc;
}

export function emptyAcc() {
  return { frames: 0, frontFrames: 0, gazeOff: 0, prevFront: true, headDown: 0, tilts: [], shoulderXs: [] };
}

export class NonverbalTracker {
  constructor() {
    this.face = null; this.pose = null; this.timer = null; this.acc = null;
    this.video = null; this.ready = false; this._loading = null;
  }

  async load() {
    if (this.ready) return true;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const wasm = (await localAvailable(`${LOCAL_WASM}/vision_wasm_internal.wasm`)) ? LOCAL_WASM : CDN_WASM;
        const fileset = await FilesetResolver.forVisionTasks(wasm);
        const faceModel = (await localAvailable(FACE_MODEL.local)) ? FACE_MODEL.local : FACE_MODEL.cdn;
        const poseModel = (await localAvailable(POSE_MODEL.local)) ? POSE_MODEL.local : POSE_MODEL.cdn;
        this.face = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModel }, runningMode: 'VIDEO', numFaces: 1,
        });
        this.pose = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: poseModel }, runningMode: 'VIDEO', numPoses: 1,
        });
        this.ready = true;
        return true;
      } catch {
        this.ready = false; // 모델 로드 실패 → 측정 없이 흐름은 계속(측정 제외)
        return false;
      }
    })();
    return this._loading;
  }

  start(video) {
    if (!this.ready || !video) return;
    this.video = video;
    this.acc = emptyAcc();
    this.timer = setInterval(() => this._sample(), SAMPLE_MS);
  }

  _sample() {
    const v = this.video;
    if (!v || v.readyState < 2 || !this.acc) return;
    const ts = performance.now();
    let faceLm = null;
    let poseLm = null;
    try { faceLm = this.face.detectForVideo(v, ts).faceLandmarks?.[0] || null; } catch { /* 프레임 실패 무시 */ }
    try { poseLm = this.pose.detectForVideo(v, ts + 0.5).landmarks?.[0] || null; } catch { /* 프레임 실패 무시 */ }
    accumulateFrame(this.acc, faceLm, poseLm);
  }

  /** 측정 종료 → NonverbalIn 페이로드 반환(표본 부족이면 {frames} 만). */
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const payload = aggregate(this.acc);
    this.acc = null;
    return payload;
  }

  close() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.face?.close(); } catch { /* noop */ }
    try { this.pose?.close(); } catch { /* noop */ }
    this.face = null; this.pose = null; this.ready = false; this._loading = null;
  }
}
