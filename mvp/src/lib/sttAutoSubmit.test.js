import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SUBMIT_DELAY_MS, shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

test("schedules only when the STT result ends with a final transcript", () => {
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "" }), true);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: true, interimText: "계속 말하는 중" }), false);
  assert.equal(shouldScheduleAutoSubmit({ receivedFinal: false, interimText: "말하는 중" }), false);
});

test("waits for two seconds of silence before automatic submission", () => {
  assert.equal(AUTO_SUBMIT_DELAY_MS, 2000);
});
