/** 비언어 측정(Eye-Fit / Posture-Fit)의 순수 집계 로직 — 백엔드 계약과 동일한 정의.
 *
 * 원본(claude/carpe-dm-expo-analysis-89b3f4)의 검증된 기하·임계를 그대로 유지하되,
 * MediaPipe 추론은 이 파일에서 하지 않는다. 연습 화면의 단일 추적 파이프라인
 * (lib/liveTracking.js)이 매 프레임의 face/pose 랜드마크로 accumulateFrame을 5Hz로
 * 호출하고, 제출 시 aggregate로 페이로드를 만든다. 이렇게 하면 시각 오버레이와
 * 지표 측정이 모델을 두 벌 로딩하지 않고 하나의 파이프라인을 공유한다.
 *
 * 산출 지표 (PoC nonverbal.py의 밴드 스케일과 일치):
 *   front_gaze_ratio      정면 응시 프레임 비율 (머리 요 |asym| < 0.3)
 *   gaze_off_count        정면→이탈 전환 횟수
 *   avg_shoulder_tilt_deg 좌우 어깨 높이차 각도(도)
 *   head_down_ratio       고개 숙임 프레임 비율 (코-어깨 거리/너비 < 0.3)
 *   posture_sway          어깨중심 x(어깨너비 정규화) 표준편차
 *   frames                유효 표본 수 (백엔드 MIN_FRAMES=5 게이트)
 */

export const SAMPLE_MS = 200;               // 5Hz — PoC와 동일(밴드 스케일 일치)
const YAW_ABS_THRESHOLD = 0.3;              // |signedAsym| 이 이상이면 시선 이탈
const HEAD_DOWN_ABS_THRESHOLD = 0.3;        // 코-어깨 거리/어깨너비 이 미만이면 고개 숙임
const MIN_FRAMES = 5;

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
