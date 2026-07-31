import test from "node:test";
import assert from "node:assert/strict";
import { emotionVisual } from "./emotionGauge.js";

test("emotionVisual hides the gauge for scenarios without an emotion profile", () => {
  // 기존 클라우드밋 시나리오는 emotion이 {}로 온다 — 게이지를 렌더하지 않는다(하위 호환).
  assert.equal(emotionVisual({}), null);
  assert.equal(emotionVisual(null), null);
  assert.equal(emotionVisual(undefined), null);
  assert.equal(emotionVisual({ state: "unknown", temperature: 50 }), null);
});

test("emotionVisual maps each state to its gauge color", () => {
  assert.equal(emotionVisual({ state: "calm", temperature: 20 }).color, "#2f9e63");
  assert.equal(emotionVisual({ state: "displeased", temperature: 50 }).color, "#e8833a");
  assert.equal(emotionVisual({ state: "agitated", temperature: 90 }).color, "#e0442e");
});

test("emotionVisual clamps temperature into the 0-100 gauge range", () => {
  assert.equal(emotionVisual({ state: "calm", temperature: -10 }).pct, 0);
  assert.equal(emotionVisual({ state: "agitated", temperature: 130 }).pct, 100);
  assert.equal(emotionVisual({ state: "displeased", temperature: 42.5 }).pct, 42.5);
  assert.equal(emotionVisual({ state: "calm" }).pct, 0); // 온도 누락 방어
});

test("emotionVisual keeps the server label and falls back to Korean state names", () => {
  assert.equal(emotionVisual({ state: "agitated", label: "격앙", temperature: 80 }).label, "격앙");
  assert.equal(emotionVisual({ state: "calm", temperature: 10 }).label, "평온");
});

test("emotionVisual surfaces the eased flag for the cooling animation", () => {
  assert.equal(emotionVisual({ state: "displeased", temperature: 50, eased: true }).eased, true);
  assert.equal(emotionVisual({ state: "displeased", temperature: 50 }).eased, false);
});
