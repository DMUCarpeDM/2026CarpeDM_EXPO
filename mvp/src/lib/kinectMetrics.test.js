import test from "node:test";
import assert from "node:assert/strict";
import {
  KINECT_CALIB_MIN_SAMPLES,
  KINECT_MIN_FRAMES,
  KINECT_MIN_TURN_MS,
  accumulateKinectFrame,
  finalizeKinectCalib,
  finalizeKinectTurn,
  makeKinectAcc,
  makeKinectCalib,
  mergeKinectNonverbal,
} from "./kinectMetrics.js";

/** gate=ok 프레임 헬퍼 — 33ms 간격(30fps 근사)으로 n개 누적 */
const feed = (acc, n, metrics, base = null, startMs = 1000) => {
  for (let i = 0; i < n; i += 1) {
    accumulateKinectFrame(acc, { gate: "ok", fps: 30, metrics }, base, startMs + i * 33);
  }
};

const BASIC = { shoulder_tilt_deg: 3.0, torso_yaw_deg: 2.0, head_pitch_deg: 5.0, sway_norm: 0.02, sway_cm: 1.1, dist_cm: 120 };

test("게이트 이탈(no_body·too_far) 프레임은 표본을 만들지 않는다", () => {
  const acc = makeKinectAcc();
  accumulateKinectFrame(acc, { gate: "no_body", fps: 30, metrics: BASIC }, null, 0);
  accumulateKinectFrame(acc, { gate: "too_far", fps: 30, metrics: BASIC }, null, 33);
  accumulateKinectFrame(acc, null, null, 66);
  assert.equal(acc.frames, 0);
});

test("표본 1초 미만 또는 프레임 부족이면 측정 보류(null)", () => {
  // 프레임은 충분하지만 벽시계 창이 1초 미만 — fps가 높아도 게이트를 못 넘는다
  const acc = makeKinectAcc();
  for (let i = 0; i < 20; i += 1) accumulateKinectFrame(acc, { gate: "ok", fps: 30, metrics: BASIC }, null, 1000 + i * 10);
  assert.equal(finalizeKinectTurn(acc), null);

  // 창은 넘지만 프레임이 서버 게이트(MIN_FRAMES) 미만
  const sparse = makeKinectAcc();
  for (let i = 0; i < KINECT_MIN_FRAMES - 1; i += 1) accumulateKinectFrame(sparse, { gate: "ok", fps: 2, metrics: BASIC }, null, 1000 + i * 500);
  assert.equal(finalizeKinectTurn(sparse), null);

  const ok = makeKinectAcc();
  feed(ok, Math.ceil(KINECT_MIN_TURN_MS / 33) + 2, BASIC);
  assert.notEqual(finalizeKinectTurn(ok), null);
});

test("캘리브레이션: 중앙값 · 최소 표본 4개 미만이면 null(절대 판정 유지)", () => {
  const calib = makeKinectCalib();
  calib.tilt.push(2, 3, 4); // 3개 — 부족
  calib.yaw.push(1, 1, 2, 30); // 4개 — 성립, 중앙값이 아웃라이어(30)에 안 끌린다
  const base = finalizeKinectCalib(calib);
  assert.equal(base.tilt, null);
  assert.equal(base.yaw, 2);
  assert.equal(KINECT_CALIB_MIN_SAMPLES, 4); // 브라우저(MediaPipe) 경로와 같은 규칙
});

test("개인 기준 보정: max(0, |기울기| − 기준) — 브라우저와 동일 규칙", () => {
  const base = { tilt: 5, yaw: -3, pitch: 10, dist: null };
  const acc = makeKinectAcc();
  feed(acc, 40, { ...BASIC, shoulder_tilt_deg: -7, torso_yaw_deg: 1, head_pitch_deg: 14 }, base);
  const out = finalizeKinectTurn(acc, { calibrated: true });
  assert.equal(out.tilt_deg, 2); // |−7| − 5
  assert.equal(out.torso_yaw_deg, 4); // |1 − (−3)|
  assert.equal(out.head_pitch_delta_deg, 4); // 14 − 10 (+ = 기준보다 숙임)
  assert.equal(out.calibrated, true);
});

test("몸통 회전 우세 방향: 평균 5° 미만이면 방향을 말하지 않는다", () => {
  const small = makeKinectAcc();
  feed(small, 40, { ...BASIC, torso_yaw_deg: 3 });
  assert.equal(finalizeKinectTurn(small).torso_yaw_dir, null);

  const right = makeKinectAcc();
  feed(right, 40, { ...BASIC, torso_yaw_deg: 9 });
  assert.equal(finalizeKinectTurn(right).torso_yaw_dir, "right");

  const left = makeKinectAcc();
  feed(left, 40, { ...BASIC, torso_yaw_deg: -9 });
  assert.equal(finalizeKinectTurn(left).torso_yaw_dir, "left");
});

test("자세 유지력 드리프트: 후반 − 전반 (+가 붕괴), 2초 미만이면 0", () => {
  const acc = makeKinectAcc();
  feed(acc, 40, { ...BASIC, shoulder_tilt_deg: 2 }, null, 1000);
  feed(acc, 40, { ...BASIC, shoulder_tilt_deg: 8 }, null, 1000 + 40 * 33);
  const out = finalizeKinectTurn(acc);
  assert.equal(out.tilt_drift_deg, 6);

  const brief = makeKinectAcc();
  feed(brief, 35, { ...BASIC, shoulder_tilt_deg: 8 }, null, 1000); // ~1.1초
  assert.equal(finalizeKinectTurn(brief).tilt_drift_deg, 0);
});

test("어깨 미검출 프레임에서도 표면·거리 지표는 따로 쌓인다", () => {
  const acc = makeKinectAcc();
  feed(acc, 40, { torso_lean_deg: 12, spine_bend_mm: 25, dist_cm: 110 });
  const out = finalizeKinectTurn(acc);
  assert.equal(out.tilt_deg, null);
  assert.equal(out.sway_norm, null);
  assert.equal(out.torso_lean_deg, 12);
  assert.equal(out.spine_bend_mm, 25);
  assert.equal(out.dist_cm, 110);
});

test("병합: 채점 3필드는 키넥트로 교체, head_down·시선은 MediaPipe 유지", () => {
  const mp = {
    frames: 100, front_gaze_ratio: 0.8, head_down_ratio: 0.1,
    avg_shoulder_tilt_deg: 9.9, posture_sway: 0.15, tilt_drift_deg: 4.4,
  };
  const kin = { frames: 60, tilt_deg: 2.1, sway_norm: 0.03, tilt_drift_deg: 0.5, torso_yaw_deg: 7 };
  const out = mergeKinectNonverbal(mp, kin);
  assert.equal(out.posture_source, "kinect");
  assert.equal(out.avg_shoulder_tilt_deg, 2.1);
  assert.equal(out.posture_sway, 0.03);
  assert.equal(out.tilt_drift_deg, 0.5);
  assert.equal(out.head_down_ratio, 0.1); // 단위가 다른 밴드 — 교체 금지 (04 설계 §2.4)
  assert.equal(out.front_gaze_ratio, 0.8);
  assert.equal(out.kinect.torso_yaw_deg, 7);
  // 원본 MediaPipe 페이로드는 변형하지 않는다 (제출 재시도 안전)
  assert.equal(mp.avg_shoulder_tilt_deg, 9.9);
  assert.equal(mp.posture_source, undefined);
});

test("병합: 키넥트 채점값이 전무하면 관찰 동봉만 하고 출처를 바꾸지 않는다", () => {
  const mp = { frames: 100, avg_shoulder_tilt_deg: 5 };
  const kin = { frames: 60, tilt_deg: null, sway_norm: null, tilt_drift_deg: 0, torso_lean_deg: 10 };
  const out = mergeKinectNonverbal(mp, kin);
  assert.equal(out.posture_source, undefined);
  assert.equal(out.avg_shoulder_tilt_deg, 5);
  assert.equal(out.kinect.torso_lean_deg, 10);
});

test("병합: MediaPipe가 통째로 죽어도 키넥트 단독 자세 페이로드를 만든다", () => {
  const kin = { frames: 60, tilt_deg: 3, sway_norm: 0.02, tilt_drift_deg: 1 };
  const out = mergeKinectNonverbal(null, kin);
  assert.equal(out.frames, 0);
  assert.equal(out.posture_source, "kinect");
  assert.equal(out.avg_shoulder_tilt_deg, 3);
  assert.equal(out.kinect.frames, 60);
});

test("병합: 키넥트가 없으면 MediaPipe 페이로드 그대로 (완전 폴백)", () => {
  const mp = { frames: 100, avg_shoulder_tilt_deg: 5 };
  assert.equal(mergeKinectNonverbal(mp, null), mp);
  assert.equal(mergeKinectNonverbal(null, null), null);
});
