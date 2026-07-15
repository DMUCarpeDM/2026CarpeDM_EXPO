import test from "node:test";
import assert from "node:assert/strict";
import { reportFits, scoreFromFit } from "./reportFits.js";

test("reportFits reads backend four-Fit top-level scores", () => {
  const fits = reportFits({
    response: { score: 91, summary: "clear response" },
    voice: { score: 82, summary: "steady voice" },
    eye: { score: 73, summary: "camera engagement" },
    posture: { score: 64, summary: "upright posture" },
  });

  assert.deepEqual(fits.map((fit) => [fit.label, fit.score, fit.measured]), [
    ["Response", 91, true],
    ["Voice", 82, true],
    ["Eye", 73, true],
    ["Posture", 64, true],
  ]);
});

test("reportFits reads fit_scores without fabricating missing values", () => {
  const fits = reportFits({
    fit_scores: {
      "Response-Fit": { score: "88", summary: "specific answer" },
      voice: { score: 79, feedback: "audible pace" },
    },
  });

  assert.equal(fits[0].score, 88);
  assert.equal(fits[1].score, 79);
  assert.equal(fits[2].measured, false);
  assert.equal(fits[3].measured, false);
});

test("scoreFromFit normalizes previous comparison score shapes", () => {
  assert.equal(scoreFromFit({ score: "72" }), 72);
  assert.equal(scoreFromFit(68.4), 68);
  assert.equal(scoreFromFit(undefined), 0);
});
