import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_IDLE_GRACE_MS, PRACTICE_IDLE_WARN_MS, practiceIdlePhase } from "./practiceIdle.js";

test("경고 임계값 전에는 active, 넘으면 warn, 유예까지 지나면 reset", () => {
  assert.equal(practiceIdlePhase(0), "active");
  assert.equal(practiceIdlePhase(PRACTICE_IDLE_WARN_MS - 1), "active");
  assert.equal(practiceIdlePhase(PRACTICE_IDLE_WARN_MS), "warn");
  assert.equal(practiceIdlePhase(PRACTICE_IDLE_WARN_MS + PRACTICE_IDLE_GRACE_MS - 1), "warn");
  assert.equal(practiceIdlePhase(PRACTICE_IDLE_WARN_MS + PRACTICE_IDLE_GRACE_MS), "reset");
});

test("리허설용 짧은 임계값 오버라이드를 그대로 따른다 (?abandon=<초> 경로)", () => {
  const opts = { warnMs: 6_000, graceMs: 8_000 };
  assert.equal(practiceIdlePhase(5_999, opts), "active");
  assert.equal(practiceIdlePhase(6_000, opts), "warn");
  assert.equal(practiceIdlePhase(13_999, opts), "warn");
  assert.equal(practiceIdlePhase(14_000, opts), "reset");
});

test("비정상 입력(NaN·음수)은 리셋을 일으키지 않는다", () => {
  assert.equal(practiceIdlePhase(Number.NaN), "active");
  assert.equal(practiceIdlePhase(-1), "active");
});
