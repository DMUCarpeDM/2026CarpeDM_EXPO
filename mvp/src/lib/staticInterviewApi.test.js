import assert from "node:assert/strict";
import test from "node:test";
import { createStaticInterviewApi, STATIC_INTERVIEW_SCENARIOS } from "./staticInterviewApi.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("static interview API completes a six-question browser session", async () => {
  const request = createStaticInterviewApi(memoryStorage());
  const scenario = STATIC_INTERVIEW_SCENARIOS[0];
  const session = await request("/sessions", {
    method: "POST",
    body: JSON.stringify({ scenario_slug: scenario.slug, selected_episode_id: scenario.episodes[0].id }),
  });
  assert.equal(session.current_turn.question_text, "자기소개를 해 주세요.");

  let result;
  for (let index = 0; index < 6; index += 1) {
    result = await request(`/sessions/${session.id}/turns/local-turn-${index + 1}/response`, {
      method: "POST",
      body: JSON.stringify({ text: "결론부터 말씀드리면 팀 과제에서 맡은 기능을 끝까지 구현했고 협업의 중요성을 배웠습니다.", stt_source: "webspeech" }),
    });
  }
  assert.equal(result.finished, true);
  await request(`/sessions/${session.id}/finish`, { method: "POST" });
  const report = await request(`/sessions/${session.id}/report`);
  assert.equal(report.speech_stats.turns, 6);
  assert.equal(report.source, "static-demo");
  assert.equal(report.total_score, null);
  assert.equal(report.percentile_top, null);
  assert.ok(Object.values(report.fit_scores).every((fit) => fit.score === null));
  assert.equal(report.coaching[0].quote, "결론부터 말씀드리면 팀 과제에서 맡은 기능을 끝까지 구현했고 협업의 중요성을 배웠습니다.");
  assert.match(report.coaching[0].issue, /예시/);
  assert.equal(report.speech_stats.formal_pct, undefined);
  assert.equal(report.speech_stats.paralinguistics, undefined);
});

test("empty static completion never fabricates scores, a quote or measurements", async () => {
  const storage = memoryStorage();
  const request = createStaticInterviewApi(storage);
  const session = await request("/sessions", { method: "POST" });
  const answerPath = `/sessions/${session.id}/turns/${session.current_turn.id}/response`;
  await assert.rejects(request(answerPath, { method: "POST", body: JSON.stringify({ text: "  " }) }), /답변을 입력/);
  await request(`/sessions/${session.id}/finish`, { method: "POST" });
  await request(`/sessions/${session.id}/finish`, { method: "POST" });
  const report = await request(`/sessions/${session.id}/report`);
  assert.equal(report.total_score, null);
  assert.equal(report.percentile_top, null);
  assert.ok(Object.values(report.fit_scores).every((fit) => fit.score === null));
  assert.deepEqual(report.coaching, []);
  assert.deepEqual(report.speech_stats, { turns: 0 });
  assert.match(report.strengths[0], /판단하지 않았/);
  assert.equal((await request(`/sessions/${session.id}`)).current_turn, null);
  await assert.rejects(request(answerPath, { method: "POST", body: JSON.stringify({ text: "네" }) }), /현재 답변할 질문/);
  await request(`/sessions/${session.id}/report`);
  assert.equal((await request("/history")).items.length, 1);
});

test("static repeat submission cannot answer the next question or score stale history", async () => {
  const storage = memoryStorage();
  storage.setItem("mirror-ting-static-interview-history", JSON.stringify([{ session_id: "old", total_score: 74, fit_scores: { "Voice-Fit": { score: 79 } } }]));
  const request = createStaticInterviewApi(storage);
  const session = await request("/sessions", { method: "POST" });
  const path = `/sessions/${session.id}/turns/${session.current_turn.id}/response`;
  const options = { method: "POST", body: JSON.stringify({ text: "제가 맡은 역할을 설명하겠습니다.", nonverbal: { posture: 0.8 } }) };
  await request(path, options);
  await assert.rejects(request(path, options), /현재 답변할 질문/);
  assert.equal((await request(`/sessions/${session.id}`)).history.length, 1);
  const history = (await request("/history")).items[0];
  assert.equal(history.total_score, null);
  assert.equal(history.fit_scores["Voice-Fit"].score, null);
  await request(`/sessions/${session.id}/finish`, { method: "POST" });
  const report = await request(`/sessions/${session.id}/report`);
  assert.ok(Object.values(report.fit_scores).every((fit) => fit.score === null));
});

test("static interview catalog exposes only interview roles", async () => {
  const request = createStaticInterviewApi(memoryStorage());
  const scenarios = await request("/scenarios");
  assert.deepEqual(scenarios.map((item) => item.job_role), ["fullstack", "marketing", "sales"]);
  assert.ok(scenarios.every((item) => item.world_setting.service_modes.includes("interview")));
});
