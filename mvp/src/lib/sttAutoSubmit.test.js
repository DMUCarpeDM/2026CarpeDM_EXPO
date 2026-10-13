import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SUBMIT_SILENCE_MS, shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

test("submits after one second without new final or interim speech input", () => {
  assert.equal(AUTO_SUBMIT_SILENCE_MS, 1000);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "" }), true);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "계속 말하는 중" }), true);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: false, interimText: "말하는 중" }), true);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: false, interimText: "  " }), false);
});
