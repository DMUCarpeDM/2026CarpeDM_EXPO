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
  assert.equal(report.fits[1].status, "점수 없이 기록만 제공");
  assert.equal(report.fits[2].status, "참고용 결과");
  assert.equal(report.before, "원문");
  assert.equal(report.after, "제안");
  assert.equal(report.turns, 3);
});

test("expression output collection is visible without inventing a score", () => {
  const report = mirrorReport({fit_scores:{expression:{score:null,summary:"검증 전 참고값"}},speech_stats:{expression_analysis:{samples:3,status:"unvalidated"}}});
  assert.equal(report.fits[2].score,null);
  assert.equal(report.fits[2].status,"표정 기록 확인 중");
  assert.equal(report.fits[2].text,"검증 전 참고값");
});


test("measured response and posture scores pass through to the mirror report", () => {
  const report = mirrorReport({ total_score: 81.5, fit_scores: {
    response: { score: 88, summary: "목표를 확인했어요." },
    posture: { score: 75, summary: "유효 자세 표본으로 계산했어요." },
    voice: { score: null }, expression: { score: null },
  }, speech_stats: { turns: 3 } });
  assert.equal(report.total, 82);
  assert.equal(report.fits[0].score, 88);
  assert.equal(report.fits[0].status, "측정 완료");
  assert.equal(report.fits[3].score, 75);
  assert.equal(report.fits[3].status, "측정 완료");
  assert.equal(report.fits[1].score, null);
  assert.equal(report.fits[2].score, null);
});

test("feedback preserves every grounded item and never substitutes the headline", () => {
  const report = mirrorReport({ strengths: ["일정을 확인했어요.", "역할을 확인했어요."], improvements: ["이유를 설명해 주세요.", "기한을 덧붙여 주세요."], headline: { sentence: "일반 요약" } });
  assert.deepEqual(report.strengths, ["일정을 확인했어요.", "역할을 확인했어요."]);
  assert.deepEqual(report.improvements, ["이유를 설명해 주세요.", "기한을 덧붙여 주세요."]);
  assert.equal(report.improvement, "이유를 설명해 주세요.");
  assert.equal(mirrorReport({ headline: { sentence: "일반 요약" } }).improvement, null);
});

test("all four axes preserve measured, provisional and withheld states", () => {
  const report = mirrorReport({ fit_scores: {
    response: { score: 77 }, posture: { score: 73.8 },
    expression: { score: 73.7, provisional: true }, voice: { score: null },
  }, speech_stats: { expression_analysis: { samples: 4 }, voice_analysis: { engine_version: "voice-measure-v2", turns: [] } } });
  assert.deepEqual(report.fits.map(f => f.score), [77, null, 74, 74]);
  assert.deepEqual(report.fits.map(f => f.status), ["측정 완료", "점수 없이 기록만 제공", "참고용 결과", "측정 완료"]);
  assert.equal(report.voiceAnalysis.engine_version, "voice-measure-v2");
});

test("context summary uses observed areas without inventing unmeasured voice suitability", () => {
  const report = mirrorReport({speech_stats:{context_assessments:[{context:{kind:'serious',status:'classified'},areas:{response:{status:'observed'},voice:{status:'unmeasured'}}}]}});
  assert.match(report.fits.find(f=>f.key==='Response-Fit').contextSummary,/갈등·오류 대응/);
  assert.equal(report.fits.find(f=>f.key==='Voice-Fit').contextSummary,'');
});

test("context volume score is visible only as an explicitly provisional measurement", () => {
  const input = { fit_scores: { voice: { score: 73, provisional: true } }, speech_stats: { voice_analysis: { score_status: "context_provisional", score_scope: "relative_volume" } } };
  assert.equal(mirrorReport(input).fits[1].score, 73);
  assert.equal(mirrorReport(input).fits[1].status, "참고용 결과");
  input.fit_scores.voice.provisional = false;
  assert.equal(mirrorReport(input).fits[1].score, null);
  assert.equal(mirrorReport(input).fits[1].status, "점수 없이 기록만 제공");
  input.fit_scores.voice = { score: null, provisional: true };
  assert.equal(mirrorReport(input).fits[1].score, null);
  assert.equal(mirrorReport(input).fits[1].status, "점수 없이 기록만 제공");
});
