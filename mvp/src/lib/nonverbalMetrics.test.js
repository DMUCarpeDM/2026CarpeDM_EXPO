import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_MS,
  SMILE_ABS,
  SMILE_DELTA,
  TIMELINE_BIN_MS,
  TIMELINE_MAX_BINS,
  accumulateSample,
  finalizeTurnMetrics,
  framesFor,
  makeTurnAcc,
  resolveExpression,
  resolveHeadDown,
} from "./nonverbalMetrics.js";

/** n개 샘플을 같은 값으로 누적하는 헬퍼 */
const feed = (acc, n, sample) => {
  for (let i = 0; i < n; i += 1) accumulateSample(acc, sample);
};

const FRONT = { front: true, tiltAdj: 0, shoulderX: 5, worldUsed: true };

test("표본 1초 미만이면 측정 보류(null)", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(1000) - 1, FRONT);
  assert.equal(finalizeTurnMetrics(acc), null);

  accumulateSample(acc, FRONT);
  assert.notEqual(finalizeTurnMetrics(acc), null);
});

test("서버가 채점하는 자세 지표를 빠짐없이 보낸다 (기본값 0.0 = 만점 회귀 방지)", () => {
  // 이 필드들이 페이로드에서 빠지면 Pydantic NonverbalIn이 0.0으로 채우고,
  // band_score(0.0, ...)가 만점을 준다 = 가중치 0.40이 상수 100점이 된다.
  const acc = makeTurnAcc();
  feed(acc, framesFor(5000), FRONT);
  const m = finalizeTurnMetrics(acc);

  for (const key of ["posture_sway", "tilt_drift_deg", "contact_bout_mean_sec",
    "listening_front_ratio", "answering_front_ratio", "onset_aversion_sec"]) {
    assert.ok(key in m, `${key}가 페이로드에 없다`);
  }
  assert.equal(m.sample_ms, SAMPLE_MS); // 서버가 프레임→시간 환산에 쓴다
});

test("posture_sway는 어깨 중심의 흔들림을 잡고, 정지 자세에는 0을 준다", () => {
  const still = makeTurnAcc();
  feed(still, framesFor(5000), { ...FRONT, shoulderX: 5 });
  assert.equal(finalizeTurnMetrics(still).posture_sway, 0);

  const swaying = makeTurnAcc();
  for (let i = 0; i < 60; i += 1) { // 짝수 표본 — 구형파의 평균이 정확히 5.0이 되게
    accumulateSample(swaying, { ...FRONT, shoulderX: i % 2 === 0 ? 4.9 : 5.1 });
  }
  // ±0.1 진폭의 구형파 → 표준편차 0.1
  assert.ok(Math.abs(finalizeTurnMetrics(swaying).posture_sway - 0.1) < 1e-9);
});

test("posture_sway는 표본 2개 이하에서 표준편차를 만들어내지 않는다", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(2000), { front: true }); // 어깨 미검출 — 자세 표본 없음
  const m = finalizeTurnMetrics(acc);
  assert.equal(m.posture_sway, 0);
  assert.equal(m.avg_shoulder_tilt_deg, 0);
});

test("tilt_drift_deg는 후반부 자세 붕괴를 양수로, 개선을 음수로 낸다", () => {
  const half = framesFor(3000);

  const collapsing = makeTurnAcc();
  feed(collapsing, half, { ...FRONT, tiltAdj: 2 });
  feed(collapsing, half, { ...FRONT, tiltAdj: 8 });
  assert.equal(finalizeTurnMetrics(collapsing).tilt_drift_deg, 6);

  const improving = makeTurnAcc();
  feed(improving, half, { ...FRONT, tiltAdj: 8 });
  feed(improving, half, { ...FRONT, tiltAdj: 2 });
  // 음수는 서버 score_posture가 max(0, ...)로 감점하지 않는다
  assert.equal(finalizeTurnMetrics(improving).tilt_drift_deg, -6);
});

test("tilt_drift_deg는 표본 2초 미만이면 추세를 추정하지 않는다", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(2000) - 2, { ...FRONT, tiltAdj: 1 });
  feed(acc, 1, { ...FRONT, tiltAdj: 30 }); // 표본 총합이 게이트 바로 아래
  assert.equal(finalizeTurnMetrics(acc).tilt_drift_deg, 0);
});

test("듣기/말하기 응시를 분리 집계한다", () => {
  const acc = makeTurnAcc();
  const n = framesFor(4000);
  // 듣는 중에는 계속 정면
  feed(acc, n, { ...FRONT, phase: "listening" });
  // 말하는 중에는 절반만 정면
  for (let i = 0; i < n; i += 1) {
    accumulateSample(acc, { ...FRONT, front: i % 2 === 0, offDir: "down", phase: "answering" });
  }
  const m = finalizeTurnMetrics(acc);
  assert.equal(m.listening_front_ratio, 1);
  assert.equal(m.answering_front_ratio, 0.5);
});

test("듣기/말하기 표본이 2초 미만이면 판정을 보류한다(null)", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(2000) - 1, { ...FRONT, phase: "listening" });
  feed(acc, framesFor(2000), { ...FRONT, phase: "answering" });
  const m = finalizeTurnMetrics(acc);
  // null이면 서버 score_eye가 v1(통합 응시) 경로로 하위 호환 동작한다
  assert.equal(m.listening_front_ratio, null);
  assert.equal(m.answering_front_ratio, 1);
});

test("contact_bout_mean_sec는 완료된 응시 구간과 진행 중인 구간을 함께 센다", () => {
  const acc = makeTurnAcc();
  const bout = framesFor(4000); // 4초짜리 응시 구간
  feed(acc, bout, FRONT);
  feed(acc, framesFor(1000), { ...FRONT, front: false, offDir: "left" });
  feed(acc, bout, FRONT); // 턴 종료 시점에 진행 중 — 이것도 인정돼야 한다

  const m = finalizeTurnMetrics(acc);
  assert.equal(m.contact_bout_mean_sec, 4);
  assert.equal(m.contact_streak_max_sec, 4);
  assert.equal(m.longest_off_sec, 1);
  assert.equal(m.gaze_off_count, 1); // 이탈 '횟수'는 전환 시점에만
});

test("onset_aversion_sec는 답변 개시 유예 구간의 회피만 센다", () => {
  const acc = makeTurnAcc();
  const grace = framesFor(2500);
  // 답변 시작 직후 유예 구간 내내 회피 (생각 정리 — 정상 행동)
  feed(acc, grace, { ...FRONT, front: false, offDir: "up", phase: "answering" });
  // 유예 구간을 지난 뒤의 회피는 집계 대상이 아니다
  feed(acc, framesFor(3000), { ...FRONT, front: false, offDir: "up", phase: "answering" });

  assert.equal(finalizeTurnMetrics(acc).onset_aversion_sec, 2.5);
});

test("resolveHeadDown은 기준이 있으면 코-어깨 거리 감소량으로 판정한다", () => {
  // 기준 0.5에서 0.15 줄어듦 → 숙임
  assert.equal(resolveHeadDown(0.35, 0.5), true);
  // 0.05만 줄어듦 → 자연스러운 편차
  assert.equal(resolveHeadDown(0.45, 0.5), false);
  // 기준이 없으면 절대 폴백 (0.3 미만이면 숙임)
  assert.equal(resolveHeadDown(0.25, null), true);
  assert.equal(resolveHeadDown(0.35, null), false);
  // 어깨 미검출
  assert.equal(resolveHeadDown(null, 0.5), false);
});

const smiling = (raw, base) => resolveExpression(raw, base, SMILE_ABS, SMILE_DELTA);

test("표정 판정은 기준이 없으면 절대 임계로 폴백한다", () => {
  assert.equal(smiling(0.36, null), true);
  assert.equal(smiling(0.34, null), false);
});

test("입꼬리가 올라간 사람을 상시 미소로 오판하지 않는다", () => {
  const restingSmile = 0.42; // 무표정인데 mouthSmile이 이미 0.42
  // 절대 임계(0.35)였다면 가만히 있어도 계속 '미소' 판정이었다
  assert.equal(smiling(0.45, null), true);
  assert.equal(smiling(0.45, restingSmile), false);
  // 같은 사람이 실제로 웃으면 잡힌다
  assert.equal(smiling(0.85, restingSmile), true);
});

test("무표정이 굳은 사람의 옅은 미소를 놓치지 않는다", () => {
  // 절대 임계 0.35에는 못 미치지만, 이 사람 기준으로는 확실한 표정 변화
  assert.equal(smiling(0.32, null), false);
  assert.equal(smiling(0.32, 0), true);
});

test("기저값이 높아도 판정이 도달 불가능해지지 않는다 (여지 정규화)", () => {
  const base = 0.75;
  // 단순 차이였다면 최대 raw-base = 0.25 < 0.3 이라 영영 임계에 못 닿는다
  assert.ok(1 - base < SMILE_DELTA);
  assert.equal(smiling(1.0, base), true);
});

test("smile_duchenne_ratio는 미소 프레임 중 눈둘레근 동반 비율을 낸다", () => {
  const acc = makeTurnAcc();
  const n = framesFor(4000);
  feed(acc, n, { ...FRONT, smile: true, duchenne: true }); // 눈까지 웃음
  feed(acc, n, { ...FRONT, smile: true, duchenne: false }); // 입만 웃음
  feed(acc, n, FRONT); // 무표정 — 분모에 들어가면 안 된다
  assert.equal(finalizeTurnMetrics(acc).smile_duchenne_ratio, 0.5);
});

test("미소 표본이 2초 미만이면 뒤셴 비율을 판정하지 않는다(null)", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(2000) - 1, { ...FRONT, smile: true, duchenne: true });
  feed(acc, framesFor(3000), FRONT);
  assert.equal(finalizeTurnMetrics(acc).smile_duchenne_ratio, null);
});

test("brow_raise_ratio가 눈썹 올림(경청·강조 신호) 비율을 낸다", () => {
  const acc = makeTurnAcc();
  const n = framesFor(2000);
  feed(acc, n, { ...FRONT, browRaise: true });
  feed(acc, n * 3, FRONT);
  assert.equal(finalizeTurnMetrics(acc).brow_raise_ratio, 0.25);
});

test("world_ratio가 3D 월드 기울기 가동률을 밝힌다", () => {
  const acc = makeTurnAcc();
  const n = framesFor(2000);
  feed(acc, n, { ...FRONT, worldUsed: true });
  feed(acc, n, { ...FRONT, worldUsed: false });
  assert.equal(finalizeTurnMetrics(acc).world_ratio, 0.5);
});

// ---- 교차 분석 타임라인 (서버 moments '결정적 순간'의 입력) ----

test("타임라인이 2초 빈으로 정면율·긴장율·기울기를 직렬화한다", () => {
  const acc = makeTurnAcc();
  const binN = framesFor(TIMELINE_BIN_MS);
  feed(acc, binN, FRONT); // 빈 0: 전부 정면, 긴장 없음
  feed(acc, binN, { front: false, press: true, tiltAdj: 10, shoulderX: 5 }); // 빈 1: 이탈+긴장+기울어짐
  const m = finalizeTurnMetrics(acc);
  assert.deepEqual(m.timeline[0], { t: 0, front: 1, press: 0, tilt: 0 });
  assert.deepEqual(m.timeline[1], { t: 2, front: 0, press: 1, tilt: 10 });
});

test("찡그림(brow)도 긴장율에 합산된다 — 긴장 = 입술 압축 ∥ 찡그림", () => {
  const acc = makeTurnAcc();
  const binN = framesFor(TIMELINE_BIN_MS); // 25프레임 — 홀수라 절반 대신 5개로 검증
  feed(acc, 5, { ...FRONT, brow: true });
  feed(acc, binN - 5, FRONT);
  assert.equal(finalizeTurnMetrics(acc).timeline[0].press, 5 / binN);
});

test("어깨 미검출 빈의 tilt는 null — 0(수평)으로 오인시키지 않는다", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(TIMELINE_BIN_MS), { front: true, tiltAdj: null, shoulderX: null });
  assert.equal(finalizeTurnMetrics(acc).timeline[0].tilt, null);
});

test("타임라인은 상한(TIMELINE_MAX_BINS)에서 잘린다 — 페이로드 폭주 방지", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(TIMELINE_BIN_MS) * (TIMELINE_MAX_BINS + 10), FRONT);
  const m = finalizeTurnMetrics(acc);
  assert.equal(m.timeline.length, TIMELINE_MAX_BINS);
  assert.equal(m.timeline.at(-1).t, (TIMELINE_MAX_BINS - 1) * 2);
});

test("answer_offset_sec은 0 — MVP는 녹음과 비언어 집계가 턴 시작에 함께 출발한다", () => {
  const acc = makeTurnAcc();
  feed(acc, framesFor(2000), FRONT);
  assert.equal(finalizeTurnMetrics(acc).answer_offset_sec, 0);
});
