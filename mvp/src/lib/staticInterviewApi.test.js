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
  assert.ok(report.total_score >= 70);
});

test("static interview catalog exposes only interview roles", async () => {
  const request = createStaticInterviewApi(memoryStorage());
  const scenarios = await request("/scenarios");
  assert.deepEqual(scenarios.map((item) => item.job_role), ["fullstack", "marketing", "sales"]);
  assert.ok(scenarios.every((item) => item.world_setting.service_modes.includes("interview")));
});
