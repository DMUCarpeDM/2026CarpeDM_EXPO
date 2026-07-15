import test from "node:test";
import assert from "node:assert/strict";
import { accumulateFrame, aggregate, emptyAcc } from "./nonverbal.js";

// 합성 랜드마크: face는 [1]=코, [234]=왼볼, [454]=오른볼 / pose는 [0]=코, [11]=왼어깨, [12]=오른어깨
function face(noseX) {
  const f = [];
  f[1] = { x: noseX, y: 0.4 };
  f[234] = { x: 0.4, y: 0.4 };
  f[454] = { x: 0.6, y: 0.4 };
  return f;
}
function pose(shoulderDy = 0, headY = 0.3, centerX = 0.5) {
  const p = [];
  p[0] = { x: 0.5, y: headY };
  p[11] = { x: centerX - 0.1, y: 0.6 };
  p[12] = { x: centerX + 0.1, y: 0.6 + shoulderDy };
  return p;
}

test("aggregate: 정면 응시 + 수평 어깨 + 고개 듦 → 이상적 지표", () => {
  const acc = emptyAcc();
  for (let i = 0; i < 10; i++) accumulateFrame(acc, face(0.5), pose(0, 0.3, 0.5));
  const m = aggregate(acc);
  assert.equal(m.frames, 10);
  assert.equal(m.front_gaze_ratio, 1); // 코가 두 볼 중앙 → asym 0 → 전부 정면
  assert.equal(m.gaze_off_count, 0);
  assert.ok(m.avg_shoulder_tilt_deg < 1); // 수평 어깨
  assert.equal(m.head_down_ratio, 0); // 코가 어깨보다 훨씬 위
  assert.ok(m.posture_sway < 0.001); // 고정 위치 → 흔들림 없음
});

test("aggregate: 시선 이탈 프레임 → front_ratio 하락 + gaze_off_count 전환 카운트", () => {
  const acc = emptyAcc();
  // 정면 4 → 이탈 3 → 정면 3 : 이탈 진입 전환 1회
  for (let i = 0; i < 4; i++) accumulateFrame(acc, face(0.5), pose());
  for (let i = 0; i < 3; i++) accumulateFrame(acc, face(0.42), pose()); // 코가 왼볼에 근접 → |asym|>0.3
  for (let i = 0; i < 3; i++) accumulateFrame(acc, face(0.5), pose());
  const m = aggregate(acc);
  assert.equal(m.frames, 10);
  assert.equal(m.front_gaze_ratio, 0.7); // 7/10 정면
  assert.equal(m.gaze_off_count, 1); // 정면→이탈 전환 1회
});

test("aggregate: 기운 어깨 + 고개 숙임 감지", () => {
  const acc = emptyAcc();
  // 어깨 높이차 0.1(너비 0.2) → tilt ≈ 26.5° / 코 y=0.62가 어깨중심 y=0.65에 근접(headGap=0.15<0.3) → 고개 숙임
  for (let i = 0; i < 8; i++) accumulateFrame(acc, face(0.5), pose(0.1, 0.62, 0.5));
  const m = aggregate(acc);
  assert.ok(m.avg_shoulder_tilt_deg > 20, `tilt=${m.avg_shoulder_tilt_deg}`);
  assert.equal(m.head_down_ratio, 1); // 전 프레임 고개 숙임
});

test("aggregate: 좌우 흔들림 → posture_sway 증가", () => {
  const acc = emptyAcc();
  for (let i = 0; i < 12; i++) accumulateFrame(acc, face(0.5), pose(0, 0.3, i % 2 ? 0.42 : 0.58));
  const m = aggregate(acc);
  assert.ok(m.posture_sway > 0.1, `sway=${m.posture_sway}`);
});

test("aggregate: 표본 5프레임 미만 → 측정 제외(frames만)", () => {
  const acc = emptyAcc();
  for (let i = 0; i < 3; i++) accumulateFrame(acc, face(0.5), pose());
  const m = aggregate(acc);
  assert.deepEqual(Object.keys(m), ["frames"]);
  assert.equal(m.frames, 3);
});

test("accumulateFrame: 얼굴만 있고 포즈 없으면 시선만 집계", () => {
  const acc = emptyAcc();
  for (let i = 0; i < 6; i++) accumulateFrame(acc, face(0.5), null);
  const m = aggregate(acc);
  assert.equal(m.frames, 6);
  assert.equal(m.front_gaze_ratio, 1);
  assert.equal(m.avg_shoulder_tilt_deg, 0); // 포즈 표본 없음 → 0
  assert.equal(m.posture_sway, 0);
});
