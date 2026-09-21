import assert from "node:assert/strict";
import test from "node:test";
import { pickWorkplaceEmotion, pickWorkplaceLineEmotion } from "./workplaceEmotion.js";

test("line emotion maps joy / disappointment / irritation / anger keywords", () => {
  assert.equal(pickWorkplaceLineEmotion("오, 그래도 방향은 잡았네요."), "joy");
  assert.equal(pickWorkplaceLineEmotion("결과가 아쉽네요."), "disappointment");
  assert.equal(pickWorkplaceLineEmotion("왜 그래요, 자꾸 미루면 답답해요."), "irritation");
  assert.equal(pickWorkplaceLineEmotion("지금 그 말투는 좀 아니지 않아요?"), "irritation");
  assert.equal(pickWorkplaceLineEmotion("장난해요? 일로 이야기합시다."), "anger");
  assert.equal(pickWorkplaceLineEmotion("오늘 일정 공유해 주세요."), "");
});

test("turnSignals case overrides line text", () => {
  assert.equal(pickWorkplaceEmotion({ text: "오늘 일정 공유해 주세요.", turnSignals: { case: "excellent" } }), "joy");
  assert.equal(pickWorkplaceEmotion({ text: "잘 됐네요.", turnSignals: { case: "risky" } }), "anger");
  assert.equal(pickWorkplaceEmotion({ text: "", turnSignals: { case: "missing" } }), "disappointment");
  assert.equal(pickWorkplaceEmotion({ text: "", turnSignals: { case: "short" } }), "irritation");
});

test("emotion.state fills when case is absent", () => {
  assert.equal(pickWorkplaceEmotion({ turnSignals: { emotion: { state: "agitated" } } }), "anger");
  assert.equal(pickWorkplaceEmotion({ turnSignals: { emotion: { state: "displeased" } } }), "irritation");
  assert.equal(pickWorkplaceEmotion({ turnSignals: { emotion: { state: "calm" } } }), "");
});
