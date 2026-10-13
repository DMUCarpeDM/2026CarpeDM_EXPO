import assert from "node:assert/strict";
import test from "node:test";
import { calibrationAllowsPractice, sameCapture } from "./voiceCapture.js";

test("noisy speech passes the entry gate only with explicit server confirmation", () => {
  assert.equal(calibrationAllowsPractice({ status: "measured" }), true);
  for (const reason of ["background_noise", "speech_in_noise_sample"]) {
    assert.equal(calibrationAllowsPractice({ status: "uncertain", reason, can_proceed: true }), true);
    assert.equal(calibrationAllowsPractice({ status: "uncertain", reason }), false);
  }
  for (const reason of ["insufficient_speech", "clipping", "capture_unknown", "automatic_gain_unverified"]) {
    assert.equal(calibrationAllowsPractice({ status: "uncertain", reason, can_proceed: true }), false);
  }
  assert.equal(calibrationAllowsPractice(null), false);
});

test("noise tolerance does not bypass a changed microphone", () => {
  const capture = { capture_id: "stream", device_id: "mic", noise_suppression: false };
  assert.equal(sameCapture(capture, { ...capture }), true);
  assert.equal(sameCapture(capture, { ...capture, device_id: "other" }), false);
});
