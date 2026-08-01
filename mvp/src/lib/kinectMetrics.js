/** Kinect 뎁스 자세 지표의 턴 집계 — 순수 로직 (S6 통합, docs/kinect/04 설계 준수).
 *
 * 생산자 교체의 원칙 (docs/kinect/04-integration-s6-design.md):
 *   - Posture-Fit 채점 입력(어깨 기울기·흔들림·유지력)만 뎁스 실측으로 교체한다.
 *   - 표정(점수 축)·시선(관찰)은 계속 MediaPipe가 채운다 — k4abt에는 홍채·blendshape가 없다.
 *   - head_down_ratio는 교체하지 않는다: 기존 밴드는 '프레임 비율', 키넥트는
 *     '실제 각도'라 단위가 다르다. 근거 있는 임계(θ)가 나오기 전에는 환산하지
 *     않고, 각도는 관찰 지표(kinect.head_pitch_delta_deg)로만 내보낸다.
 *   - 신규 지표(몸통 회전·상체 기울기·등 굽음)는 밴드를 발명하지 않는다 —
 *     점수 없이 관찰 문장 재료로만 서버에 전달한다.
 *
 * 개인 기준 보정은 브라우저(MediaPipe) 경로와 **같은 규칙**을 쓴다:
 * 중앙값 · 최소 표본 4개 · max(0, 현재 − 기준). 두 경로의 규칙이 다르면
 * 키넥트⇄MediaPipe 폴백 전환 때 점수가 튄다 (04 설계 §2.3).
 *
 * 이 파일에는 WebSocket·React가 없다. useKinectTracking 훅이 프레임을 넣고,
 * 턴 종료 시 finalizeKinectTurn() 결과를 mergeKinectNonverbal()로
 * NonverbalIn 페이로드에 병합한다. node --test 대상.
 */
import { mean, median, stdDev } from "./nonverbalMetrics.js";

// 캘리브레이션 최소 표본 — 브라우저의 "표본 4개 미만이면 기준 없이 절대 판정" 규칙과 동일
export const KINECT_CALIB_MIN_SAMPLES = 4;
// 턴 집계 최소 창 — MediaPipe와 같은 1초 게이트 (finalizeTurnMetrics의 framesFor(1000))
export const KINECT_MIN_TURN_MS = 1000;
// 서버 채점 게이트(nonverbal.MIN_FRAMES)와 동일 — 이 미만이면 병합하지 않는다
export const KINECT_MIN_FRAMES = 5;
// 자세 유지력(전·후반 드리프트) 판정 최소 창 — nonverbalMetrics.DRIFT_MIN_MS와 동일 기준
export const KINECT_DRIFT_MIN_MS = 2000;
// 몸통 회전 우세 방향 표기 임계 — 평균 |회전|이 이보다 작으면 방향을 말하지 않는다
export const KINECT_YAW_DIR_MIN_DEG = 5;

export const makeKinectCalib = () => ({ tilt: [], yaw: [], pitch: [], dist: [] });

/** 브리핑 동안 모은 표본으로 개인 기준을 확정한다. 표본 부족 축은 null(절대 판정 유지). */
export function finalizeKinectCalib(calib) {
  const pick = (samples) => (samples.length >= KINECT_CALIB_MIN_SAMPLES ? median(samples) : null);
  return {
    tilt: pick(calib.tilt), // 상시 어깨 비대칭(체형·거치)의 개인 기준 — |기울기| 중앙값
    yaw: pick(calib.yaw), // 습관적 서기 각도 (부호 유지)
    pitch: pick(calib.pitch), // 평소 고개 각도 (부호 유지)
    dist: pick(calib.dist),
  };
}

export const makeKinectAcc = () => ({
  frames: 0,
  firstAt: 0, // performance.now() ms — 시간 게이트는 프레임 수가 아니라 벽시계로 잰다
  lastAt: 0, //  (fps가 15~30으로 흔들려도 게이트 의미가 변하지 않게)
  fpsSum: 0,
  tiltSamples: [], // 기준 보정 후 max(0, |tilt| − base) — 채점 반영값
  yawSamples: [], // 기준 보정 후 부호 있는 회전 (관찰)
  pitchSamples: [], // 기준 보정 후 부호 있는 고개 각도 변화 (관찰, + = 숙임)
  swaySamples: [], // 서버 롤링 창 sway_norm (어깨너비 정규화 — SWAY_BANDS 입력 단위)
  swayCmSamples: [],
  leanSamples: [], // 표면 지표 — 어깨가 안 잡혀도 나올 수 있어 별도 표본
  bendSamples: [],
  distSamples: [],
});

/** WS 프레임 하나를 누적한다. gate!=="ok"(무인식·거리 이탈)면 표본을 만들지 않는다.
 *
 * @param acc   makeKinectAcc()
 * @param frame 서비스 페이로드 {gate, fps, metrics:{...}}
 * @param base  finalizeKinectCalib() 결과 (없으면 null → 절대 판정)
 * @param nowMs performance.now() (테스트 주입용)
 */
export function accumulateKinectFrame(acc, frame, base, nowMs) {
  if (!frame || frame.gate !== "ok" || !frame.metrics) return;
  const m = frame.metrics;
  acc.frames += 1;
  if (!acc.firstAt) acc.firstAt = nowMs;
  acc.lastAt = nowMs;
  acc.fpsSum += frame.fps || 0;

  if (m.shoulder_tilt_deg !== null && m.shoulder_tilt_deg !== undefined) {
    // 브라우저와 동일: |기울기|에서 개인 기준을 빼고 음수는 0 (개선을 감점하지 않음)
    const raw = Math.abs(m.shoulder_tilt_deg);
    acc.tiltSamples.push(Math.max(0, raw - (base?.tilt ?? 0)));
  }
  if (m.torso_yaw_deg !== null && m.torso_yaw_deg !== undefined) {
    acc.yawSamples.push(m.torso_yaw_deg - (base?.yaw ?? 0));
  }
  if (m.head_pitch_deg !== null && m.head_pitch_deg !== undefined) {
    acc.pitchSamples.push(m.head_pitch_deg - (base?.pitch ?? 0));
  }
  if (m.sway_norm !== null && m.sway_norm !== undefined) acc.swaySamples.push(m.sway_norm);
  if (m.sway_cm !== null && m.sway_cm !== undefined) acc.swayCmSamples.push(m.sway_cm);
  if (m.torso_lean_deg !== null && m.torso_lean_deg !== undefined) acc.leanSamples.push(m.torso_lean_deg);
  if (m.spine_bend_mm !== null && m.spine_bend_mm !== undefined) acc.bendSamples.push(m.spine_bend_mm);
  if (m.dist_cm !== null && m.dist_cm !== undefined) acc.distSamples.push(m.dist_cm);
}

const round1 = (v) => Math.round(v * 10) / 10;
const round4 = (v) => Math.round(v * 10000) / 10000;

/** 턴 누적치 → 서버 NonverbalIn.kinect 페이로드. 표본이 1초 미만이면 null(측정 보류). */
export function finalizeKinectTurn(acc, { calibrated = false, mode = "" } = {}) {
  const durationMs = acc.firstAt ? acc.lastAt - acc.firstAt : 0;
  if (acc.frames < KINECT_MIN_FRAMES || durationMs < KINECT_MIN_TURN_MS) return null;

  // 자세 유지력 — MediaPipe와 같은 정의: 후반 평균 − 전반 평균 (+가 붕괴)
  let tiltDrift = 0;
  if (durationMs >= KINECT_DRIFT_MIN_MS && acc.tiltSamples.length >= 10) {
    const half = Math.floor(acc.tiltSamples.length / 2);
    tiltDrift = mean(acc.tiltSamples.slice(half)) - mean(acc.tiltSamples.slice(0, half));
  }

  const yawMean = acc.yawSamples.length ? mean(acc.yawSamples) : null;
  const distDrift = acc.distSamples.length >= 10
    ? (() => {
        const half = Math.floor(acc.distSamples.length / 2);
        return mean(acc.distSamples.slice(half)) - mean(acc.distSamples.slice(0, half));
      })()
    : null;

  return {
    frames: acc.frames,
    duration_sec: Math.round(durationMs / 100) / 10,
    fps: round1(acc.fpsSum / acc.frames),
    calibrated,
    mode, // 바디트래킹 처리 모드(CUDA·DirectML…) — 리포트 측정 출처 표기용
    // ---- Posture-Fit 채점으로 들어가는 값 (기존 밴드 단위 그대로) ----
    tilt_deg: acc.tiltSamples.length ? round1(mean(acc.tiltSamples)) : null,
    tilt_drift_deg: round1(tiltDrift),
    sway_norm: acc.swaySamples.length > 2 ? round4(mean(acc.swaySamples)) : null,
    // ---- 관찰 지표 (밴드 없음 — 리포트 관찰 문장·교차 분석 전용) ----
    sway_cm: acc.swayCmSamples.length ? round1(mean(acc.swayCmSamples)) : null,
    torso_yaw_deg: acc.yawSamples.length ? round1(mean(acc.yawSamples.map(Math.abs))) : null,
    // 부호 → 우세 방향. 세계 +X는 "카메라를 마주 본 사람의 오른쪽"(geometry.world_frame)
    // 이고 yaw = atan2(v_z, v_x)이므로, 양수 = 오른어깨가 뒤로 = 몸이 오른쪽으로 돌아감.
    torso_yaw_dir: yawMean !== null && Math.abs(yawMean) >= KINECT_YAW_DIR_MIN_DEG
      ? (yawMean > 0 ? "right" : "left")
      : null,
    head_pitch_delta_deg: acc.pitchSamples.length ? round1(mean(acc.pitchSamples)) : null,
    torso_lean_deg: acc.leanSamples.length ? round1(mean(acc.leanSamples)) : null,
    spine_bend_mm: acc.bendSamples.length ? round1(mean(acc.bendSamples)) : null,
    dist_cm: acc.distSamples.length ? round1(mean(acc.distSamples)) : null,
    dist_drift_cm: distDrift === null ? null : round1(distDrift),
    dist_sway_cm: acc.distSamples.length > 2 ? round1(stdDev(acc.distSamples)) : null,
  };
}

/** 키넥트 턴 페이로드를 NonverbalIn에 병합 — 생산자 교체의 실제 이음새.
 *
 * 정책 (04 설계 §2.2):
 *   avg_shoulder_tilt_deg · posture_sway · tilt_drift_deg → 키넥트 값으로 교체
 *   head_down_ratio·시선·표정 계열 → MediaPipe 유지
 *   나머지 키넥트 실측은 kinect 중첩 객체로 동봉 (관찰 문장 재료)
 *
 * MediaPipe가 통째로 죽은 턴(mp === null)에도 키넥트만으로 자세 페이로드를
 * 만든다 — 서버 score_posture가 kinect.frames를 게이트로 인정한다.
 */
export function mergeKinectNonverbal(mp, kinect) {
  if (!kinect) return mp;
  const out = mp ? { ...mp } : { frames: 0, sample_ms: 200, calibrated: false };
  out.kinect = kinect;
  const scorable = kinect.tilt_deg !== null || kinect.sway_norm !== null;
  if (scorable) {
    out.posture_source = "kinect";
    if (kinect.tilt_deg !== null) out.avg_shoulder_tilt_deg = kinect.tilt_deg;
    if (kinect.sway_norm !== null) out.posture_sway = kinect.sway_norm;
    out.tilt_drift_deg = kinect.tilt_drift_deg;
  }
  return out;
}
