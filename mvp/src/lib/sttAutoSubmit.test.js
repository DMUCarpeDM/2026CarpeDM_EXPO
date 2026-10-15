import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SUBMIT_DELAY_MS, shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

test("schedules only when the STT result ends with a final transcript", () => {
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "" }), true);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "계속 말하는 중" }), false);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: false, interimText: "말하는 중" }), false);
});

test("does not add a silence or post-final waiting period", () => {
  assert.equal(AUTO_SUBMIT_DELAY_MS, 0);
});
