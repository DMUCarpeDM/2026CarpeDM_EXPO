import test from "node:test";
import assert from "node:assert/strict";
import { mirrorReport, mirrorScore } from "./mirrorReport.js";

test("missing or invalid scores stay unmeasured; zero is a measured score", () => {
  for (const value of [null, undefined, "", false, "invalid", Infinity]) assert.equal(mirrorScore(value), null);
  assert.equal(mirrorScore(0), 0);
  assert.equal(mirrorScore("79.5"), 80);
  assert.equal(mirrorScore(110), 100);
  const report = mirrorReport({ fit_scores: { response: 0 } });
  assert.equal(report.total, null);
  assert.equal(report.fits[0].score, 0);
  assert.equal(report.fits[1].score, null);
  assert.equal(report.strength, null);
  assert.equal(report.after, null);
});

test("voice measurement does not become an unsupported score; coaching uses report data", () => {
  const report = mirrorReport({ total_score: 72, fit_scores: { voice: 90, expression: { score: 60, provisional: true } }, speech_stats: { voice_analysis: {}, turns: 3 }, coaching: [{ quote: "원문", suggestion: "제안" }], strengths: ["근거"], improvements: ["개선"] });
  assert.equal(report.fits[1].score, null);
  assert.equal(report.fits[1].status, "점수 보류");
  assert.equal(report.fits[2].status, "참고 지표");
  assert.equal(report.before, "원문");
  assert.equal(report.after, "제안");
  assert.equal(report.turns, 3);
});
